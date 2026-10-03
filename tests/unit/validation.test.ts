import { describe, expect, it } from "vitest";
import { employeeCreateSchema, financialInfoSchema } from "@/lib/validation/employee";
import { leaveApplySchema } from "@/lib/validation/leave";
import { statutoryConfigSchema } from "@/lib/validation/settings";
import { DEFAULT_STATUTORY_CONFIG } from "@/lib/settings-defaults";
import { safeCell, toCsv } from "@/lib/export";

describe("form schemas", () => {
  it("validates employee creation with field errors", () => {
    const r = employeeCreateSchema.safeParse({ firstName: "", lastName: "X", workEmail: "bad", dateOfJoining: "2026-13-01", phone: "abc" });
    expect(r.success).toBe(false);
    const f = r.error!.flatten().fieldErrors;
    expect(Object.keys(f)).toEqual(expect.arrayContaining(["firstName", "workEmail", "dateOfJoining", "phone"]));
  });
  it("normalises optional fields", () => {
    const r = employeeCreateSchema.parse({ firstName: " Asha ", lastName: "Rao", workEmail: "ASHA@Example.TEST", dateOfJoining: "2026-01-05", middleName: "", managerId: "" });
    expect(r.firstName).toBe("Asha");
    expect(r.workEmail).toBe("asha@example.test");
    expect(r.middleName).toBeUndefined();
    expect(r.managerId).toBeUndefined();
  });
  it("validates Indian statutory identifiers", () => {
    expect(financialInfoSchema.safeParse({ employeeId: "x", panNumber: "abcde1234f", bankIfsc: "HDFC0001234" }).success).toBe(true);
    expect(financialInfoSchema.safeParse({ employeeId: "x", panNumber: "1234" }).success).toBe(false);
    expect(financialInfoSchema.safeParse({ employeeId: "x", bankIfsc: "HDFC1001234" }).success).toBe(false);
  });
  it("validates leave applications", () => {
    expect(leaveApplySchema.safeParse({ leaveTypeId: "", startDate: "2026-01-01", endDate: "2026-01-01", reason: "" }).success).toBe(false);
    expect(leaveApplySchema.parse({ leaveTypeId: "t", startDate: "2026-01-01", endDate: "2026-01-01", reason: "x", halfDay: "" }).halfDay).toBeUndefined();
  });
  it("accepts default statutory config and rejects malformed slabs", () => {
    expect(statutoryConfigSchema.safeParse(DEFAULT_STATUTORY_CONFIG).success).toBe(true);
    const bad = structuredClone(DEFAULT_STATUTORY_CONFIG);
    bad.tds.slabs = [{ upTo: 100, rate: 5 }];
    expect(statutoryConfigSchema.safeParse(bad).success).toBe(false);
  });
});

describe("exports", () => {
  it("neutralises formula injection", () => {
    expect(safeCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(safeCell("+91 98")).toBe("'+91 98");
    expect(safeCell("normal")).toBe("normal");
  });
  it("escapes CSV", () => {
    expect(toCsv([{ a: 'x,"y"', b: 1 }])).toBe('a,b\r\n"x,""y""",1');
  });
});
