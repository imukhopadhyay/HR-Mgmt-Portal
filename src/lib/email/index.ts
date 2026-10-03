import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | undefined;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function renderEmailHtml(text: string) {
  return `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;
}

/** Sends email via SMTP, logs it (console driver) or drops it (disabled). Never throws. */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  const e = env();
  try {
    if (e.EMAIL_DRIVER === "disabled") return false;
    if (e.EMAIL_DRIVER === "console") {
      logger.info("email.console", { to: msg.to, subject: msg.subject, text: msg.text });
      return true;
    }
    transporter ??= nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT ?? 587,
      secure: e.SMTP_SECURE,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
    });
    await transporter.sendMail({
      from: e.EMAIL_FROM,
      to: msg.to,
      subject: msg.subject.replace(/[\r\n]/g, " "),
      text: msg.text,
      html: msg.html ?? renderEmailHtml(msg.text),
    });
    return true;
  } catch (err) {
    logger.error("email.failed", { subject: msg.subject, err });
    return false;
  }
}
