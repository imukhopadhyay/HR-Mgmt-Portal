"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import * as svc from "@/server/services/document.service";

const CATEGORIES = [
  "ID_PROOF",
  "ADDRESS_PROOF",
  "EDUCATION",
  "EXPERIENCE",
  "CONTRACT",
  "OFFER_LETTER",
  "PAYSLIP",
  "RESUME",
  "MEDICAL",
  "CERTIFICATE",
  "OTHER",
] as const;

const uploadSchema = z
  .object({
    employeeId: z.string().optional(),
    candidateId: z.string().optional(),
    category: z.enum(CATEGORIES),
    isConfidential: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
    file: z.instanceof(File, { message: "Choose a file to upload" }),
  })
  .refine((v) => !!v.employeeId !== !!v.candidateId, { message: "Invalid owner" });

export async function uploadDocumentAction(form: FormData) {
  const input = {
    employeeId: form.get("employeeId") || undefined,
    candidateId: form.get("candidateId") || undefined,
    category: form.get("category"),
    isConfidential: form.get("isConfidential") ?? undefined,
    file: form.get("file"),
  };
  return runAction(
    uploadSchema,
    input,
    async (d, actor) => {
      const doc = await svc.uploadDocument(actor, d);
      return { id: doc.id };
    },
    "Document uploaded",
  );
}

export async function uploadPhotoAction(form: FormData) {
  return runAction(
    z.object({ employeeId: z.string().min(1), file: z.instanceof(File) }),
    { employeeId: form.get("employeeId"), file: form.get("file") },
    (d, actor) => svc.uploadProfilePhoto(actor, d.employeeId, d.file),
    "Photo updated",
  );
}

export async function verifyDocumentAction(input: unknown) {
  return runAction(
    z.object({
      id: z.string().min(1),
      status: z.enum(["VERIFIED", "REJECTED"]),
      note: z.string().trim().max(500).optional(),
    }),
    input,
    (d, actor) => svc.verifyDocument(actor, d.id, d.status, d.note),
    "Document reviewed",
  );
}

export async function deleteDocumentAction(id: string) {
  return runAction(
    z.string().min(1),
    id,
    (d, actor) => svc.deleteDocument(actor, d),
    "Document deleted",
  );
}
