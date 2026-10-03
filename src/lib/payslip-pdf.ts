import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface PayslipData {
  company: string;
  period: string;
  employee: {
    code: string;
    name: string;
    designation: string;
    department: string;
    doj: string;
    pan: string;
    uan: string;
    bank: string;
    account: string;
    location: string;
  };
  days: { working: number; paid: number; lop: number };
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  employer: { name: string; amount: number }[];
  gross: number;
  totalDeductions: number;
  net: number;
}

const inr = (n: number) =>
  `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ascii = (s: string) => s.replace(/[^\x20-\x7E]/g, "?");

function numberToWordsIndian(n: number): string {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const two = (x: number) =>
    x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ""}`;
  const three = (x: number) =>
    x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ` ${two(x % 100)}` : ""}` : two(x);
  n = Math.round(n);
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  return parts.join(" ");
}

export async function renderPayslipPdf(d: PayslipData): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Payslip ${d.period} ${d.employee.code}`);
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 40;
  let y = 800;
  const text = (
    p: PDFPage,
    s: string,
    x: number,
    yy: number,
    f: PDFFont = font,
    size = 9,
    color = rgb(0.1, 0.1, 0.1),
  ) => p.drawText(ascii(s), { x, y: yy, size, font: f, color });
  const right = (s: string, xRight: number, yy: number, f: PDFFont = font, size = 9) =>
    text(page, s, xRight - f.widthOfTextAtSize(ascii(s), size), yy, f, size);

  text(page, d.company, M, y, bold, 16);
  y -= 18;
  text(page, `Payslip for ${d.period}`, M, y, font, 11, rgb(0.35, 0.35, 0.35));
  y -= 24;
  page.drawLine({
    start: { x: M, y },
    end: { x: 595 - M, y },
    thickness: 0.8,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 18;
  const info: [string, string][] = [
    ["Employee", `${d.employee.name} (${d.employee.code})`],
    ["Designation", d.employee.designation],
    ["Department", d.employee.department],
    ["Date of joining", d.employee.doj],
    ["Location", d.employee.location],
    ["PAN", d.employee.pan],
    ["UAN", d.employee.uan],
    ["Bank", `${d.employee.bank} ${d.employee.account}`],
  ];
  info.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    text(page, k, M + col * 260, y - row * 16, font, 8, rgb(0.45, 0.45, 0.45));
    text(page, v, M + col * 260 + 85, y - row * 16, bold, 9);
  });
  y -= Math.ceil(info.length / 2) * 16 + 10;
  text(
    page,
    `Working days: ${d.days.working}   Paid days: ${d.days.paid}   LOP days: ${d.days.lop}`,
    M,
    y,
    font,
    9,
  );
  y -= 22;

  const colW = (595 - 2 * M) / 2;
  page.drawRectangle({
    x: M,
    y: y - 4,
    width: 595 - 2 * M,
    height: 18,
    color: rgb(0.93, 0.94, 0.96),
  });
  text(page, "Earnings", M + 6, y, bold);
  right("Amount", M + colW - 6, y, bold);
  text(page, "Deductions", M + colW + 6, y, bold);
  right("Amount", 595 - M - 6, y, bold);
  y -= 18;
  const rows = Math.max(d.earnings.length, d.deductions.length);
  for (let i = 0; i < rows; i++) {
    const e = d.earnings[i];
    const de = d.deductions[i];
    if (e) {
      text(page, e.name, M + 6, y);
      right(inr(e.amount), M + colW - 6, y);
    }
    if (de) {
      text(page, de.name, M + colW + 6, y);
      right(inr(de.amount), 595 - M - 6, y);
    }
    y -= 15;
  }
  page.drawLine({
    start: { x: M, y: y + 8 },
    end: { x: 595 - M, y: y + 8 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  text(page, "Gross earnings", M + 6, y - 4, bold);
  right(inr(d.gross), M + colW - 6, y - 4, bold);
  text(page, "Total deductions", M + colW + 6, y - 4, bold);
  right(inr(d.totalDeductions), 595 - M - 6, y - 4, bold);
  y -= 36;
  page.drawRectangle({ x: M, y: y - 8, width: 595 - 2 * M, height: 30, color: rgb(0.9, 0.95, 1) });
  text(page, "Net pay", M + 10, y + 2, bold, 12);
  right(inr(d.net), 595 - M - 10, y + 2, bold, 12);
  y -= 26;
  text(page, `Amount in words: Rupees ${numberToWordsIndian(d.net)} Only`, M, y, font, 9);
  y -= 26;
  if (d.employer.length) {
    text(page, "Employer contributions (not part of net pay)", M, y, bold, 9);
    y -= 14;
    for (const e of d.employer) {
      text(page, e.name, M + 6, y);
      right(inr(e.amount), M + colW - 6, y);
      y -= 14;
    }
  }
  text(
    page,
    "This is a system-generated payslip and does not require a signature. Confidential.",
    M,
    40,
    font,
    7,
    rgb(0.5, 0.5, 0.5),
  );
  text(
    page,
    "Statutory computations are based on configured rules; contact HR for queries.",
    M,
    30,
    font,
    7,
    rgb(0.5, 0.5, 0.5),
  );
  return Buffer.from(await pdf.save());
}
