"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Download, FileText, Trash2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormField, NativeSelect } from "@/components/shared/form-field";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { useAction } from "@/hooks/use-action";
import { humanize } from "@/lib/utils";
import { deleteDocumentAction, uploadDocumentAction, verifyDocumentAction } from "@/server/actions/documents";

export const DOCUMENT_CATEGORIES = ["ID_PROOF", "ADDRESS_PROOF", "EDUCATION", "EXPERIENCE", "CONTRACT", "OFFER_LETTER", "PAYSLIP", "MEDICAL", "CERTIFICATE", "RESUME", "OTHER"] as const;

export interface DocRow {
  id: string;
  name: string;
  category: string;
  sizeBytes: number;
  verificationStatus: string;
  isConfidential: boolean;
  createdAt: string;
  canDelete: boolean;
}

function size(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
}

export function DocumentList({ ownerField, ownerId, docs, canUpload, canVerify }: { ownerField: "employeeId" | "candidateId"; ownerId: string; docs: DocRow[]; canUpload: boolean; canVerify: boolean }) {
  return (
    <div className="grid gap-3">
      {canUpload && <UploadDialog ownerField={ownerField} ownerId={ownerId} />}
      {docs.length === 0 ? (
        <EmptyState icon={FileText} title="No documents" description="Uploaded documents appear here. Files are stored privately and served only to authorised users." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="hidden sm:table-cell">Uploaded</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <div className="max-w-56 truncate font-medium" title={d.name}>
                    {d.name}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {size(d.sizeBytes)}
                    {d.isConfidential && " · Confidential"}
                  </div>
                </TableCell>
                <TableCell>{humanize(d.category)}</TableCell>
                <TableCell className="hidden sm:table-cell">{new Date(d.createdAt).toLocaleDateString("en-IN")}</TableCell>
                <TableCell>
                  <StatusBadge status={d.verificationStatus} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" asChild>
                      <a href={`/api/documents/${d.id}`} aria-label={`Download ${d.name}`}>
                        <Download />
                      </a>
                    </Button>
                    {canVerify && d.verificationStatus === "PENDING" && (
                      <>
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="icon" aria-label="Verify">
                              <CheckCircle2 className="text-success" />
                            </Button>
                          }
                          title="Mark document as verified?"
                          confirmLabel="Verify"
                          action={(note) => verifyDocumentAction({ id: d.id, status: "VERIFIED", note })}
                          withComment
                          commentLabel="Note (optional)"
                        />
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="icon" aria-label="Reject">
                              <XCircle className="text-destructive" />
                            </Button>
                          }
                          title="Reject document?"
                          destructive
                          confirmLabel="Reject"
                          withComment
                          commentRequired
                          commentLabel="Reason"
                          action={(note) => verifyDocumentAction({ id: d.id, status: "REJECTED", note })}
                        />
                      </>
                    )}
                    {d.canDelete && (
                      <ConfirmAction
                        trigger={
                          <Button variant="ghost" size="icon" aria-label={`Delete ${d.name}`}>
                            <Trash2 />
                          </Button>
                        }
                        title="Delete document?"
                        description="The document will be removed from the profile. This is recorded in the audit trail."
                        destructive
                        confirmLabel="Delete"
                        action={() => deleteDocumentAction(d.id)}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function UploadDialog({ ownerField, ownerId }: { ownerField: string; ownerId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(ownerField === "candidateId" ? "RESUME" : "ID_PROOF");
  const [confidential, setConfidential] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const { execute, pending } = useAction(uploadDocumentAction, { onSuccess: () => setOpen(false) });
  async function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a file to upload");
    if (file.size > 10 * 1024 * 1024) return setError("File exceeds the 10 MB limit");
    setError(undefined);
    const fd = new FormData();
    fd.set(ownerField, ownerId);
    fd.set("category", category);
    fd.set("isConfidential", String(confidential));
    fd.set("file", file);
    const res = await execute(fd);
    if (!res.ok) setError(res.fieldErrors?.file?.[0] ?? res.error);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="justify-self-end">
          <Upload /> Upload document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>PDF, PNG, JPEG, WEBP or DOCX up to 10 MB. File contents are validated.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField label="Category" htmlFor="doc-category">
            <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)}>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="File" htmlFor="doc-file" required error={error}>
            <Input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" />
          </FormField>
          <div className="flex items-center gap-2">
            <Checkbox id="doc-conf" checked={confidential} onCheckedChange={(v) => setConfidential(v === true)} />
            <Label htmlFor="doc-conf">Confidential (owner and HR only)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
