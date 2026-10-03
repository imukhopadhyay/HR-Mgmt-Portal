import { describe, expect, it } from "vitest";
import {
  annualIncomeTax,
  calculatePayroll,
  professionalTax,
  taxFromSlabs,
  type StructureLine,
} from "@/lib/payroll-engine";
import { DEFAULT_STATUTORY_CONFIG as cfg } from "@/lib/settings-defaults";

const lines: StructureLine[] = [
  {
    code: "BASIC",
    name: "Basic",
    type: "EARNING",
    calcType: "PERCENT_OF_CTC",
    value: 40,
    isTaxable: true,
  },
  {
    code: "HRA",
    name: "HRA",
    type: "EARNING",
    calcType: "PERCENT_OF_BASIC",
    value: 50,
    isTaxable: true,
  },
  {
    code: "SPECIAL",
    name: "Special",
    type: "EARNING",
    calcType: "FIXED",
    value: 10000,
    isTaxable: true,
  },
];

describe("tax", () => {
  it("applies progressive slabs", () => {
    expect(taxFromSlabs(1000000, cfg.tds.slabs)).toBe(20000 + 20000); // 5% of 4L + 10% of 2L
  });
  it("applies the rebate up to the limit", () => {
    expect(annualIncomeTax(1200000 + 75000, cfg.tds)).toBe(0);
  });
  it("adds cess above the rebate limit", () => {
    // taxable 15,00,000: 20k + 40k + 45k = 1,05,000 × 1.04
    expect(annualIncomeTax(1500000 + 75000, cfg.tds)).toBe(109200);
  });
});

describe("professional tax", () => {
  it("uses state slabs, then defaults", () => {
    expect(professionalTax(30000, "Karnataka", cfg.professionalTax)).toBe(200);
    expect(professionalTax(20000, "Karnataka", cfg.professionalTax)).toBe(0);
    expect(professionalTax(9000, "Maharashtra", cfg.professionalTax)).toBe(175);
    expect(professionalTax(20000, "Unknown", cfg.professionalTax)).toBe(200);
  });
});

describe("calculatePayroll", () => {
  it("computes a full month", () => {
    const r = calculatePayroll({
      annualCtc: 1200000,
      lines,
      daysInMonth: 30,
      employedDays: 30,
      lopDays: 0,
      state: "Karnataka",
      config: cfg,
    });
    // basic 40,000; HRA 20,000; special 10,000
    expect(r.gross).toBe(70000);
    expect(r.deductions.find((d) => d.code === "PF")?.amount).toBe(1800); // 12% of 15,000 ceiling
    expect(r.deductions.find((d) => d.code === "PT")?.amount).toBe(200);
    expect(r.deductions.find((d) => d.code === "ESI")).toBeUndefined();
    expect(r.net).toBe(r.gross - r.totalDeductions);
    expect(r.paidDays).toBe(30);
  });
  it("prorates for LOP", () => {
    const r = calculatePayroll({
      annualCtc: 1200000,
      lines,
      daysInMonth: 30,
      employedDays: 30,
      lopDays: 3,
      config: cfg,
    });
    expect(r.paidDays).toBe(27);
    expect(r.gross).toBe(63000);
  });
  it("applies ESI below the threshold", () => {
    const small: StructureLine[] = [
      {
        code: "BASIC",
        name: "Basic",
        type: "EARNING",
        calcType: "FIXED",
        value: 15000,
        isTaxable: true,
      },
    ];
    const r = calculatePayroll({
      annualCtc: 250000,
      lines: small,
      daysInMonth: 30,
      employedDays: 30,
      lopDays: 0,
      config: cfg,
    });
    expect(r.deductions.find((d) => d.code === "ESI")?.amount).toBe(Math.ceil(15000 * 0.0075));
    expect(r.employerContributions.find((d) => d.code === "ESI_ER")?.amount).toBe(
      Math.ceil(15000 * 0.0325),
    );
  });
  it("respects PF opt-out and disabled rules", () => {
    const r = calculatePayroll({
      annualCtc: 1200000,
      lines,
      daysInMonth: 30,
      employedDays: 30,
      lopDays: 0,
      pfOptedOut: true,
      config: { ...cfg, tds: { ...cfg.tds, enabled: false } },
    });
    expect(r.deductions.find((d) => d.code === "PF")).toBeUndefined();
    expect(r.deductions.find((d) => d.code === "TDS")).toBeUndefined();
  });
  it("never produces negative pay", () => {
    const r = calculatePayroll({
      annualCtc: 1200000,
      lines,
      daysInMonth: 30,
      employedDays: 30,
      lopDays: 40,
      config: cfg,
    });
    expect(r.gross).toBe(0);
    expect(r.net).toBe(0);
  });
});
