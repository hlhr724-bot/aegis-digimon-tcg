import nodemailer from "nodemailer";
import type { Mailer } from "#api/email/mailer";

type Params = { env?: NodeJS.ProcessEnv };

export function createDevelopmentMailer({ env = process.env }: Params = {}): Mailer | undefined {
  if (env.NODE_ENV === "production" || !env.AEGIS_DEV_SMTP_URL) {
    return undefined;
  }
  const url = new URL(env.AEGIS_DEV_SMTP_URL);
  if (url.protocol !== "smtp:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("AEGIS_DEV_SMTP_URL must point to a local SMTP server");
  }
  const transport = nodemailer.createTransport(url.href);
  return async (message) => {
    await transport.sendMail({ ...message, from: "Aegis Local <login@aegis.test>" });
  };
}
