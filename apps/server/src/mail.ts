import nodemailer from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

type MailSink = (message: MailMessage) => void;

let sink: MailSink | null = null;

export function setMailSink(next: MailSink | null): void {
  sink = next;
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (sink) {
    sink(message);
    return;
  }

  const host = process.env.MACHIA_SMTP_HOST?.trim();
  const from = process.env.MACHIA_SMTP_FROM?.trim();
  if (!host || !from) {
    console.info(
      `[machia] mail (not sent) to=${message.to} subject=${message.subject}\n${message.text}`,
    );
    return;
  }

  const port = Number(process.env.MACHIA_SMTP_PORT ?? 587);
  const user = process.env.MACHIA_SMTP_USER?.trim();
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass: process.env.MACHIA_SMTP_PASS ?? "" } : undefined,
  });
  await transporter.sendMail({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  url: string;
}): Promise<void> {
  await sendMail({
    to: opts.to,
    subject: "Reset your Machia password",
    text: `You requested a password reset for Machia.\n\n${opts.url}\n\nIf you did not request this, you can ignore this email.`,
  });
}
