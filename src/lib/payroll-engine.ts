/**
 * Pure monthly payroll calculation for Indian payroll.
 *
 * All statutory parameters come from a `StatutoryConfig` (Settings → Payroll
 * statutory rules). The defaults are illustrative and MUST be validated by HR,
 * Finance and a tax advisor before production use. Simplifications (documented):
 *  - TDS is a straight-line projection of the current month's taxable pay over
 *    12 months under the configured regime; it does not handle declarations,
 *    previous-employer income, perquisites or marginal relief.
 *  - Professional Tax uses monthly slabs per state (no February adjustment).
 *  - Amounts are rounded to the nearest rupee per line.
 */
import type { PtSlab, Slab, StatutoryConfig } from "./settings-defaults";

export type CalcType = "FIXED" | "PERCENT_OF_BASIC" | "PERCENT_OF_CTC";

export interface StructureLine {
  code: string;
  name: string;
  type: "EARNING" | "DEDUCTION";
  calcType: CalcType;
  value: number;
  isTaxable: boolean;
}

export interface PayrollInput {
  annualCtc: number;
  lines: StructureLine[];
  daysInMonth: number;
  /** Days the employee was employed in the month (handles mid-month joiners / leavers). */
  employedDays: number;
  lopDays: number;
  state?: string | null;
  pfOptedOut?: boolean;
  config: StatutoryConfig;
}

export interface Amount {
  code: string;
  name: string;
  amount: number;
}

export interface PayrollResult {
  paidDays: number;
  earnings: Amount[];
  deductions: Amount[];
  employerContributions: Amount[];
  gross: number;
  totalDeductions: number;
  net: number;
  annualTaxProjection: number;
}

const r = (n: number) => Math.round(n);

/** Tax on an amount using progressive slabs (rates in %). */
export function taxFromSlabs(income: number, slabs: Slab[]): number {
  let tax = 0;
  let lower = 0;
  for (const s of slabs) {
    const upper = s.upTo ?? Infinity;
    if (income > lower) tax += ((Math.min(income, upper) - lower) * s.rate) / 100;
    lower = upper;
    if (income <= upper) break;
  }
  return tax;
}

export function annualIncomeTax(annualTaxable: number, cfg: StatutoryConfig["tds"]): number {
  const taxable = Math.max(0, annualTaxable - cfg.standardDeduction);
  if (taxable <= cfg.rebateLimit) return 0;
  const tax = taxFromSlabs(taxable, cfg.slabs);
  return r(tax * (1 + cfg.cessRate / 100));
}

export function professionalTax(
  monthlyGross: number,
  state: string | null | undefined,
  cfg: StatutoryConfig["professionalTax"],
): number {
  if (!cfg.enabled) return 0;
  const slabs: PtSlab[] = (state && cfg.stateSlabs[state]) || cfg.defaultSlabs;
  for (const s of slabs) if (s.upTo === null || monthlyGross <= s.upTo) return s.amount;
  return 0;
}

/** Full-month component amounts from the structure. */
export function monthlyComponents(annualCtc: number, lines: StructureLine[]) {
  const monthlyCtc = annualCtc / 12;
  const basicLine = lines.find((l) => l.code === "BASIC");
  const basic = basicLine
    ? basicLine.calcType === "PERCENT_OF_CTC"
      ? (monthlyCtc * basicLine.value) / 100
      : basicLine.calcType === "FIXED"
        ? basicLine.value
        : 0
    : 0;
  return lines.map((l) => {
    let amount = 0;
    if (l.code === "BASIC") amount = basic;
    else if (l.calcType === "FIXED") amount = l.value;
    else if (l.calcType === "PERCENT_OF_BASIC") amount = (basic * l.value) / 100;
    else amount = (monthlyCtc * l.value) / 100;
    return { ...l, amount };
  });
}

export function calculatePayroll(input: PayrollInput): PayrollResult {
  const { config } = input;
  const paidDays = Math.max(0, Math.min(input.employedDays, input.employedDays - input.lopDays));
  const factor = input.daysInMonth > 0 ? paidDays / input.daysInMonth : 0;
  const comps = monthlyComponents(input.annualCtc, input.lines);

  const earnings: Amount[] = comps
    .filter((c) => c.type === "EARNING")
    .map((c) => ({ code: c.code, name: c.name, amount: r(c.amount * factor) }));
  const gross = earnings.reduce((s, e) => s + e.amount, 0);
  const fullGross = comps.filter((c) => c.type === "EARNING").reduce((s, c) => s + c.amount, 0);
  const basic = earnings.find((e) => e.code === "BASIC")?.amount ?? 0;

  const deductions: Amount[] = [];
  const employer: Amount[] = [];

  if (config.pf.enabled && !input.pfOptedOut && basic > 0) {
    const wage = config.pf.applyCeiling ? Math.min(basic, config.pf.wageCeiling) : basic;
    deductions.push({
      code: "PF",
      name: "Provident Fund (employee)",
      amount: r((wage * config.pf.employeeRate) / 100),
    });
    employer.push({
      code: "PF_ER",
      name: "Provident Fund (employer)",
      amount: r((wage * config.pf.employerRate) / 100),
    });
  }
  if (config.esi.enabled && fullGross > 0 && fullGross <= config.esi.grossThreshold) {
    deductions.push({
      code: "ESI",
      name: "ESI (employee)",
      amount: Math.ceil((gross * config.esi.employeeRate) / 100),
    });
    employer.push({
      code: "ESI_ER",
      name: "ESI (employer)",
      amount: Math.ceil((gross * config.esi.employerRate) / 100),
    });
  }
  const pt = professionalTax(gross, input.state, config.professionalTax);
  if (pt > 0 && gross > 0) deductions.push({ code: "PT", name: "Professional Tax", amount: pt });

  let annualTaxProjection = 0;
  if (config.tds.enabled) {
    const taxableMonthly = comps
      .filter((c) => c.type === "EARNING" && c.isTaxable)
      .reduce((s, c) => s + c.amount, 0);
    annualTaxProjection = annualIncomeTax(taxableMonthly * 12, config.tds);
    const monthlyTds = r((annualTaxProjection / 12) * factor);
    if (monthlyTds > 0)
      deductions.push({ code: "TDS", name: "Income Tax (TDS)", amount: monthlyTds });
  }
  for (const c of comps.filter((c) => c.type === "DEDUCTION")) {
    if (c.amount > 0) deductions.push({ code: c.code, name: c.name, amount: r(c.amount) });
  }

  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  return {
    paidDays,
    earnings,
    deductions,
    employerContributions: employer,
    gross,
    totalDeductions,
    net: Math.max(0, gross - totalDeductions),
    annualTaxProjection,
  };
}
