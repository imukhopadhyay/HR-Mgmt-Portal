import { AlertTriangle } from "lucide-react";
import { getStatutoryConfig } from "@/server/services/settings.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatutoryEditor } from "./statutory-editor";

const money = (n: number | null) => (n === null ? "and above" : `₹${n.toLocaleString("en-IN")}`);

export async function StatutorySettings({ canEdit }: { canEdit: boolean }) {
  const cfg = await getStatutoryConfig();
  return (
    <div className="grid gap-6">
      <div role="note" className="border-warning/50 bg-warning/10 flex gap-3 rounded-lg border p-4 text-sm">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
        <p>
          These statutory rules (EPF, ESI, Professional Tax, TDS) are configurable defaults. Rates, ceilings and slabs change with legislation and vary by state.
          <strong> HR and Finance must validate them — ideally with a qualified tax advisor — before processing a production payroll.</strong>
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Provident Fund</CardTitle>
            <CardDescription>{cfg.pf.enabled ? "Enabled" : "Disabled"}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            Employee {cfg.pf.employeeRate}% · Employer {cfg.pf.employerRate}% of basic{cfg.pf.applyCeiling ? `, capped at a wage of ₹${cfg.pf.wageCeiling.toLocaleString("en-IN")}` : ""}.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>ESI</CardTitle>
            <CardDescription>{cfg.esi.enabled ? "Enabled" : "Disabled"}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            Employee {cfg.esi.employeeRate}% · Employer {cfg.esi.employerRate}% of gross, when monthly gross ≤ ₹{cfg.esi.grossThreshold.toLocaleString("en-IN")}.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Professional Tax</CardTitle>
            <CardDescription>Monthly slabs by state (work location state)</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {Object.entries({ Default: cfg.professionalTax.defaultSlabs, ...cfg.professionalTax.stateSlabs }).map(([state, slabs]) => (
              <div key={state}>
                <span className="font-medium">{state}: </span>
                {slabs.map((s) => `up to ${money(s.upTo)} → ₹${s.amount}`).join("; ")}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Income tax (TDS)</CardTitle>
            <CardDescription>{cfg.tds.regime} regime projection</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <div>Standard deduction ₹{cfg.tds.standardDeduction.toLocaleString("en-IN")} · rebate up to ₹{cfg.tds.rebateLimit.toLocaleString("en-IN")} · cess {cfg.tds.cessRate}%</div>
            <div className="text-muted-foreground">{cfg.tds.slabs.map((s) => `${s.rate}% up to ${money(s.upTo)}`).join(" · ")}</div>
          </CardContent>
        </Card>
      </div>
      {canEdit && <StatutoryEditor initial={JSON.stringify(cfg, null, 2)} />}
    </div>
  );
}
