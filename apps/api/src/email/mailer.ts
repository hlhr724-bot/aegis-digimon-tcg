import { ociSmtpProvider } from "#api/email/ociSmtpProvider";
import { createDevelopmentMailer } from "#api/email/createDevelopmentMailer";

const OCI_TENANCY_DAILY_LIMIT = 50_000;

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailProvider {
  name: string;
  dailyLimit: number;
  send: (message: EmailMessage) => Promise<void>;
}

// Counts sends per provider and UTC day so every API process shares one daily budget.
export interface EmailQuota {
  reserveEmail: (provider: string, day: string, limit: number) => Promise<boolean>;
  exhaustEmail: (provider: string, day: string, limit: number) => Promise<void>;
}

export type Mailer = (message: EmailMessage) => Promise<void>;

export class EmailQuotaExceededError extends Error {
  constructor() {
    super("every email provider reached its daily limit");
  }
}

// Thrown by a provider that rejects a send because its own quota ran out. Our counter can lag
// behind the provider (other senders share the key, or its day starts at a different hour), so
// the mailer marks it exhausted and moves on.
export class ProviderQuotaError extends Error {}

export function createMailer({
  providers,
  quota,
  now = Date.now,
}: {
  providers: readonly EmailProvider[];
  quota: EmailQuota;
  now?: () => number;
}): Mailer {
  return async (message) => {
    const day = new Date(now()).toISOString().slice(0, 10);
    let deliveryError: unknown;
    for (const provider of providers) {
      if (!(await quota.reserveEmail(provider.name, day, provider.dailyLimit))) continue;
      try {
        await provider.send(message);
        return;
      } catch (error) {
        if (error instanceof ProviderQuotaError) await quota.exhaustEmail(provider.name, day, provider.dailyLimit);
        else deliveryError = error;
      }
    }
    throw deliveryError ?? new EmailQuotaExceededError();
  };
}

type Fetch = typeof globalThis.fetch;

export function resendProvider({
  apiKey,
  from,
  dailyLimit,
  fetch = globalThis.fetch,
}: {
  apiKey: string;
  from: string;
  dailyLimit: number;
  fetch?: Fetch;
}): EmailProvider {
  return {
    name: "resend",
    dailyLimit,
    async send({ to, subject, html }) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, html }),
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === 429) throw new ProviderQuotaError("Resend quota reached");
      if (!response.ok) throw new Error(`Resend responded ${response.status}`);
    },
  };
}

export function brevoProvider({
  apiKey,
  from,
  dailyLimit,
  fetch = globalThis.fetch,
}: {
  apiKey: string;
  from: string;
  dailyLimit: number;
  fetch?: Fetch;
}): EmailProvider {
  const sender = parseAddress(from);
  return {
    name: "brevo",
    dailyLimit,
    async send({ to, subject, html }) {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
        signal: AbortSignal.timeout(5000),
      });
      // Brevo answers 402 when the account has no email credits left.
      if (response.status === 429 || response.status === 402) throw new ProviderQuotaError("Brevo quota reached");
      if (!response.ok) throw new Error(`Brevo responded ${response.status}`);
    },
  };
}

// Accepts the same "Name <address>" form as AEGIS_EMAIL_FROM.
export function parseAddress(value: string): { name?: string; email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (!match) return { email: value.trim() };
  const [, name, email] = match;
  return name ? { name: name.replace(/^"|"$/g, ""), email: email!.trim() } : { email: email!.trim() };
}

function parseDailyLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

// Resend's free plan allows 100 emails a day and Brevo's allows 300. Resend goes first.
export function mailerFromEnv(quota: EmailQuota, env: NodeJS.ProcessEnv = process.env): Mailer | undefined {
  const developmentMailer = createDevelopmentMailer({ env });
  if (developmentMailer) {
    return developmentMailer;
  }
  const providers: EmailProvider[] = [];
  if (env.RESEND_API_KEY && env.AEGIS_EMAIL_FROM)
    providers.push(
      resendProvider({
        apiKey: env.RESEND_API_KEY,
        from: env.AEGIS_EMAIL_FROM,
        dailyLimit: parseDailyLimit(env.RESEND_DAILY_LIMIT, 100),
      }),
    );
  if (env.BREVO_API_KEY && env.BREVO_EMAIL_FROM)
    providers.push(
      brevoProvider({
        apiKey: env.BREVO_API_KEY,
        from: env.BREVO_EMAIL_FROM,
        dailyLimit: parseDailyLimit(env.BREVO_DAILY_LIMIT, 300),
      }),
    );
  if (env.OCI_SMTP_HOST && env.OCI_SMTP_USER && env.OCI_SMTP_PASSWORD && env.OCI_EMAIL_FROM)
    providers.push(
      ociSmtpProvider({
        host: env.OCI_SMTP_HOST,
        user: env.OCI_SMTP_USER,
        password: env.OCI_SMTP_PASSWORD,
        from: env.OCI_EMAIL_FROM,
        dailyLimit: parseDailyLimit(env.OCI_DAILY_LIMIT, OCI_TENANCY_DAILY_LIMIT),
      }),
    );
  return providers.length ? createMailer({ providers, quota }) : undefined;
}
