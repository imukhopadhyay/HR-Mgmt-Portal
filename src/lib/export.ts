import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type Row = Record<string, string | number | null | undefined>;

/** Neutralise spreadsheet formula injection (OWASP CSV injection). */
export function safeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function toCsv(rows: Row[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = safeCell(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.map(esc).join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\r\n");
}

export async function toXlsx(rows: Row[], sheetName = "Report"): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "HR Portal";
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  const headers = rows.length ? Object.keys(rows[0]) : ["No data"];
  ws.columns = headers.map((h) => ({
    header: h,
    key: h,
    width: Math.min(40, Math.max(12, h.length + 4)),
  }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    const out: Record<string, string | number> = {};
    for (const h of headers) {
      const v = r[h];
      out[h] = typeof v === "number" ? v : safeCell(v);
    }
    ws.addRow(out);
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Simple paginated tabular PDF (landscape A4) using standard fonts. */
export async function toPdfTable(title: string, rows: Row[], subtitle?: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const headers = rows.length ? Object.keys(rows[0]) : ["No data"];
  const W = 842,
    H = 595,
    M = 32;
  const colW = (W - 2 * M) / headers.length;
  const size = headers.length > 8 ? 7 : 8;
  const clip = (s: string, f = font) => {
    const full = s.replace(/[^\x20-\x7E]/g, "?");
    let t = full;
    while (t.length > 1 && f.widthOfTextAtSize(t + (t === full ? "" : ".."), size) > colW - 4)
      t = t.slice(0, -1);
    return t === full ? t : t + "..";
  };
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const header = () => {
    page.drawText(clip(title, bold).slice(0, 120), { x: M, y, size: 13, font: bold });
    y -= 16;
    if (subtitle) {
      page.drawText(subtitle.replace(/[^\x20-\x7E]/g, "?").slice(0, 160), {
        x: M,
        y,
        size: 8,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      y -= 14;
    }
    page.drawRectangle({
      x: M,
      y: y - 4,
      width: W - 2 * M,
      height: 14,
      color: rgb(0.93, 0.94, 0.96),
    });
    headers.forEach((h, i) =>
      page.drawText(clip(h, bold), { x: M + i * colW + 2, y, size, font: bold }),
    );
    y -= 16;
  };
  header();
  for (const r of rows) {
    if (y < M + 10) {
      page = pdf.addPage([W, H]);
      y = H - M;
      header();
    }
    headers.forEach((h, i) =>
      page.drawText(clip(safeCell(r[h])), { x: M + i * colW + 2, y, size, font }),
    );
    y -= 12;
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) =>
    p.drawText(
      `Page ${i + 1} of ${pages.length} · Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · Confidential`,
      { x: M, y: 14, size: 7, font, color: rgb(0.5, 0.5, 0.5) },
    ),
  );
  return Buffer.from(await pdf.save());
}

export async function exportResponse(rows: Row[], format: string, baseName: string, title: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `${baseName}-${stamp}`;
  const headers = (type: string, ext: string) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${name}.${ext}"`,
    "Cache-Control": "no-store",
  });
  if (format === "xlsx") {
    const buf = await toXlsx(rows, title);
    return new Response(new Uint8Array(buf), {
      headers: headers("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
    });
  }
  if (format === "pdf") {
    const buf = await toPdfTable(title, rows);
    return new Response(new Uint8Array(buf), { headers: headers("application/pdf", "pdf") });
  }
  return new Response("﻿" + toCsv(rows), { headers: headers("text/csv; charset=utf-8", "csv") });
}
