"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { verifyAuditChainAction } from "@/server/actions/admin";

export function VerifyChain() {
  const [result, setResult] = useState<string | null>(null);
  const { execute, pending } = useAction(verifyAuditChainAction, {
    refresh: false,
    successMessage: "Verification finished",
    onSuccess: (r) => setResult(r.ok ? `Integrity verified: ${r.checked} entries, hash chain intact.` : `TAMPERING DETECTED at sequence ${r.brokenAtSeq} (after ${r.checked} valid entries).`),
  });
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" onClick={() => execute(undefined)} disabled={pending}>
        <ShieldCheck /> {pending ? "Verifying…" : "Verify integrity"}
      </Button>
      {result && (
        <span role="status" className={result.startsWith("TAMPERING") ? "text-destructive text-sm font-medium" : "text-success text-sm"}>
          {result}
        </span>
      )}
    </div>
  );
}
