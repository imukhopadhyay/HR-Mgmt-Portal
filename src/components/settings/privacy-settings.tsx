import { getRetentionPolicy } from "@/server/services/settings.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RetentionForm } from "./retention-form";

export async function PrivacySettings() {
  const policy = await getRetentionPolicy();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Data retention</CardTitle>
        <CardDescription>
          Retention runs daily via the scheduled job and can be previewed here. Ex-employee records
          are anonymised (payroll and attendance totals are kept for statutory purposes); rejected
          candidates, old notifications and expired security tokens are deleted. The audit trail is
          never deleted by the application. Review periods with Legal for applicable Indian
          requirements (e.g. DPDP Act 2023, labour and tax record-keeping rules).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RetentionForm initial={policy} />
      </CardContent>
    </Card>
  );
}
