"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <AlertTriangle className="text-warning size-10" aria-hidden />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        We couldn&apos;t load this page. {error.digest ? `Reference: ${error.digest}` : null}
      </p>
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
