import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <ShieldX className="text-destructive size-10" aria-hidden />
      <h1 className="text-xl font-semibold">Access denied</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        Your role does not permit access to this page. Contact HR if you believe this is a mistake.
      </p>
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
