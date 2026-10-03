"use client";

import { useRef } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { uploadPhotoAction } from "@/server/actions/documents";

export function PhotoUpload({ employeeId }: { employeeId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const { execute, pending } = useAction(uploadPhotoAction);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="Upload profile photo"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.set("employeeId", employeeId);
          fd.set("file", file);
          execute(fd);
          e.target.value = "";
        }}
      />
      <Button variant="ghost" size="sm" onClick={() => ref.current?.click()} disabled={pending}>
        <Camera /> {pending ? "Uploading…" : "Change photo"}
      </Button>
    </>
  );
}
