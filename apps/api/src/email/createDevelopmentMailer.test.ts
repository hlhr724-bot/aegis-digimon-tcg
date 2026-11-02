import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDevelopmentMailer } from "#api/email/createDevelopmentMailer";

const { sendMail, createTransport } = vi.hoisted(() => {
  const send = vi.fn<(message: unknown) => Promise<void>>();
  return { sendMail: send, createTransport: vi.fn<() => { sendMail: typeof send }>(() => ({ sendMail: send })) };
});

vi.mock("nodemailer", () => ({ default: { createTransport } }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("development email delivery", () => {
  it("uses the local SMTP inbox when explicitly configured", async () => {
    const mailer = createDevelopmentMailer({ env: { AEGIS_DEV_SMTP_URL: "smtp://127.0.0.1:1025" } });
    const message = { to: "tamer@example.test", subject: "Sign in", html: "<p>Sign in</p>" };
    await mailer?.(message);
    expect(createTransport).toHaveBeenCalledWith("smtp://127.0.0.1:1025");
    expect(sendMail).toHaveBeenCalledWith({ ...message, from: "Aegis Local <login@aegis.test>" });
  });

  it("never enables the development inbox in production", () => {
    expect(
      createDevelopmentMailer({
        env: { NODE_ENV: "production", AEGIS_DEV_SMTP_URL: "smtp://127.0.0.1:1025" },
      }),
    ).toBeUndefined();
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("leaves normal delivery unchanged when not configured", () => {
    expect(createDevelopmentMailer({ env: {} })).toBeUndefined();
    expect(createTransport).not.toHaveBeenCalled();
  });

  it.each(["smtp://mail.example.com:1025", "https://localhost:1025"])(
    "refuses a nonlocal or non-SMTP inbox at %s",
    (url) => {
      expect(() => createDevelopmentMailer({ env: { AEGIS_DEV_SMTP_URL: url } })).toThrow(
        "AEGIS_DEV_SMTP_URL must point to a local SMTP server",
      );
      expect(createTransport).not.toHaveBeenCalled();
    },
  );
});
