"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action";

interface FormLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setError: (name: any, error: { message: string }) => void;
}

interface Options<T> {
  form?: FormLike;
  successMessage?: string;
  onSuccess?: (data: T) => void;
  refresh?: boolean;
}

/**
 * Runs a server action, surfaces toast feedback and maps field errors back
 * onto a react-hook-form instance.
 */
export function useAction<I, T>(
  action: (input: I) => Promise<ActionResult<T>>,
  opts: Options<T> = {},
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function execute(input: I): Promise<ActionResult<T>> {
    setError(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        let result: ActionResult<T>;
        try {
          result = await action(input);
        } catch {
          result = { ok: false, error: "Network error. Please try again." };
        }
        if (result.ok) {
          toast.success(result.message ?? opts.successMessage ?? "Saved");
          opts.onSuccess?.(result.data);
          if (opts.refresh !== false) router.refresh();
        } else {
          setError(result.error);
          toast.error(result.error);
          if (opts.form && result.fieldErrors) {
            for (const [field, messages] of Object.entries(result.fieldErrors)) {
              if (messages?.[0]) opts.form.setError(field, { message: messages[0] });
            }
          }
        }
        resolve(result);
      });
    });
  }

  return { execute, pending, error };
}
