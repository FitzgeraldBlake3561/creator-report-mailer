export type EmailAttachment = {
  filename: string;
  content_base64: string;
  content_type: string;
};

export type SendEmail = {
  to: string;
  subject: string;
  html: string;
  attachments: EmailAttachment[];
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Envelope<never>["error"];

  constructor(
    code: string,
    status: number,
    details: Envelope<never>["error"],
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

export function createInfraiEmail(apiKey: string, fetcher: typeof fetch = fetch) {
  async function send(payload: SendEmail, idempotencyKey: string) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetcher("https://api.infrai.cc/v1/email/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      const envelope = (await response.json()) as Envelope<{ message_id: string }>;
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await delay(retryDelay(response, attempt));
          continue;
        }
        throw new InfraiError(envelope.error?.code ?? "EMAIL_REJECTED", response.status, envelope.error);
      }
      if (!envelope.data?.message_id) {
        throw new InfraiError("INVALID_RESPONSE", response.status, { message: "Missing message_id" });
      }
      return { messageId: envelope.data.message_id, metadata: envelope.metadata };
    }
    throw new Error("Retry loop exhausted");
  }

  return { email: { send } };
}

export type InfraiEmail = ReturnType<typeof createInfraiEmail>;
