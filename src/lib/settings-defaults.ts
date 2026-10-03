/**
 * Default statutory configuration for Indian payroll.
 *
 * IMPORTANT: These values are configurable defaults for development only.
 * Statutory rates, ceilings, slabs and tax regimes change frequently and vary
 * by state. They MUST be reviewed and approved by HR and Finance (and a
 * qualified tax advisor) before processing a production payroll.
 */
export interface Slab {
  upTo: number | null; // inclusive upper bound; null = no upper bound
  rate: number; // percent
}

export interface PtSlab {
  upTo: number | null; // monthly gross upper bound
  amount: number; // monthly PT amount
}

export interface StatutoryConfig {
  pf: { enabled: boolean; employeeRate: number; employerRate: number; wageCeiling: number; applyCeiling: boolean };
  esi: { enabled: boolean; employeeRate: number; employerRate: number; grossThreshold: number };
  professionalTax: { enabled: boolean; defaultSlabs: PtSlab[]; stateSlabs: Record<string, PtSlab[]> };
  tds: {
    enabled: boolean;
    regime: "NEW";
    standardDeduction: number;
    slabs: Slab[];
    rebateLimit: number; // taxable income up to which tax is fully rebated (Sec 87A)
    cessRate: number;
  };
}

export const DEFAULT_STATUTORY_CONFIG: StatutoryConfig = {
  pf: { enabled: true, employeeRate: 12, employerRate: 12, wageCeiling: 15000, applyCeiling: true },
  esi: { enabled: true, employeeRate: 0.75, employerRate: 3.25, grossThreshold: 21000 },
  professionalTax: {
    enabled: true,
    defaultSlabs: [
      { upTo: 15000, amount: 0 },
      { upTo: null, amount: 200 },
    ],
    stateSlabs: {
      Karnataka: [
        { upTo: 24999, amount: 0 },
        { upTo: null, amount: 200 },
      ],
      Maharashtra: [
        { upTo: 7500, amount: 0 },
        { upTo: 10000, amount: 175 },
        { upTo: null, amount: 200 },
      ],
      Haryana: [{ upTo: null, amount: 0 }],
    },
  },
  tds: {
    enabled: true,
    regime: "NEW",
    standardDeduction: 75000,
    slabs: [
      { upTo: 400000, rate: 0 },
      { upTo: 800000, rate: 5 },
      { upTo: 1200000, rate: 10 },
      { upTo: 1600000, rate: 15 },
      { upTo: 2000000, rate: 20 },
      { upTo: 2400000, rate: 25 },
      { upTo: null, rate: 30 },
    ],
    rebateLimit: 1200000,
    cessRate: 4,
  },
};

export interface RetentionPolicy {
  /** Years after exit before an ex-employee's personal data is anonymised. */
  exitedEmployeeYears: number;
  /** Months after a requisition closes before rejected candidates are purged. */
  rejectedCandidateMonths: number;
  /** Days to keep read notifications. */
  notificationDays: number;
  /** Days to keep expired sessions / reset tokens / rate-limit buckets. */
  securityTokenDays: number;
  /** Audit logs are never deleted by the application (append-only). */
  auditLogYears: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  exitedEmployeeYears: 8,
  rejectedCandidateMonths: 12,
  notificationDays: 180,
  securityTokenDays: 30,
  auditLogYears: 8,
};
