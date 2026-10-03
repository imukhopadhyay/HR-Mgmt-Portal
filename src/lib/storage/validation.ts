/**
 * Upload sanitisation: size limits, extension/MIME allow-list and magic-byte
 * sniffing so the declared type cannot be spoofed.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_TYPES = {
  "application/pdf": { ext: ["pdf"], magic: [[0x25, 0x50, 0x44, 0x46]] },
  "image/png": { ext: ["png"], magic: [[0x89, 0x50, 0x4e, 0x47]] },
  "image/jpeg": { ext: ["jpg", "jpeg"], magic: [[0xff, 0xd8, 0xff]] },
  "image/webp": { ext: ["webp"], magic: [[0x52, 0x49, 0x46, 0x46]] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    ext: ["docx"],
    magic: [[0x50, 0x4b, 0x03, 0x04]],
  },
} as const;

export type AllowedMime = keyof typeof ALLOWED_TYPES;
export const IMAGE_TYPES: AllowedMime[] = ["image/png", "image/jpeg", "image/webp"];

export function sniffMime(buf: Uint8Array): AllowedMime | null {
  for (const [mime, spec] of Object.entries(ALLOWED_TYPES) as [AllowedMime, (typeof ALLOWED_TYPES)[AllowedMime]][]) {
    for (const sig of spec.magic) {
      if (sig.every((b, i) => buf[i] === b)) {
        if (mime === "image/webp" && String.fromCharCode(...buf.slice(8, 12)) !== "WEBP") continue;
        return mime;
      }
    }
  }
  return null;
}

/** Strip path components and unsafe characters from a client filename. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .normalize("NFKC")
    .replace(/[^\w.\- ()]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || "file";
}

export type UploadCheck =
  | { ok: true; mime: AllowedMime; filename: string }
  | { ok: false; error: string };

export function validateUpload(
  file: { name: string; size: number },
  head: Uint8Array,
  allowed: readonly AllowedMime[] = Object.keys(ALLOWED_TYPES) as AllowedMime[],
): UploadCheck {
  if (file.size === 0) return { ok: false, error: "File is empty." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "File exceeds the 10 MB limit." };
  const filename = sanitizeFilename(file.name);
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mime = sniffMime(head);
  if (!mime || !allowed.includes(mime)) return { ok: false, error: "Unsupported or unrecognised file type." };
  if (!(ALLOWED_TYPES[mime].ext as readonly string[]).includes(ext)) {
    return { ok: false, error: "File extension does not match its content." };
  }
  return { ok: true, mime, filename };
}
