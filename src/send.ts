import "server-only";

import { Resend } from "resend";

import { resolveResendApiKey } from "./config";

// Resend caps recipients at 50 per call (per-message To/Cc/Bcc combined limit
// is documented as 50 addresses in `to`). Reject above that rather than
// silently truncating.
const RESEND_MAX_RECIPIENTS = 50;

export type ResendSendInput = {
  /** RFC 5322 From — "Display Name <user@domain>" or bare "user@domain". */
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  /**
   * Optional Resend idempotency key — dedupes retried sends within a 24h
   * window. Available for direct callers of sendViaResend. NOTE: the platform
   * auth path (sendPlatformEmail → sendEmailThroughSystem facade) does NOT
   * currently thread one through — the facade contract has no idempotency slot,
   * and Better Auth reset/verify tokens are single-use so a duplicate send is
   * low-risk. Wire it through the facade if that changes.
   */
  idempotencyKey?: string;
};

export type ResendSendResult = { id: string };

// Memoize the client by key value — the key can change via /connectors/resend
// at runtime, so we re-instantiate only when it actually differs.
let cachedClient: { key: string; client: Resend } | null = null;
function getClient(apiKey: string): Resend {
  if (cachedClient && cachedClient.key === apiKey) return cachedClient.client;
  const client = new Resend(apiKey);
  cachedClient = { key: apiKey, client };
  return client;
}

export async function sendViaResend(input: ResendSendInput): Promise<ResendSendResult> {
  const apiKey = resolveResendApiKey();
  if (!apiKey) {
    throw new Error(
      "Resend is not configured (no API key). Set RESEND_API_KEY in the instance env or paste one in /connectors/resend.",
    );
  }

  const clean = (list?: string[]) => (list ?? []).map((x) => x.trim()).filter((x) => x.length > 0);
  const recipients = clean(input.to);
  const cc = clean(input.cc);
  const bcc = clean(input.bcc);
  if (recipients.length === 0) {
    throw new Error("Resend send requires at least one recipient.");
  }
  // Resend's per-message recipient cap covers the combined to+cc+bcc set.
  const totalRecipients = recipients.length + cc.length + bcc.length;
  if (totalRecipients > RESEND_MAX_RECIPIENTS) {
    throw new Error(
      `Resend allows at most ${RESEND_MAX_RECIPIENTS} recipients per message (got ${totalRecipients} across to/cc/bcc).`,
    );
  }
  // Header-injection guard: any address carrying CR/LF could smuggle extra
  // headers. The SDK uses an API (not raw SMTP) so this is defense-in-depth,
  // but reject outright rather than rely on the provider sanitizing.
  for (const [label, value] of [
    ["from", input.from],
    ["replyTo", input.replyTo ?? ""],
    ...recipients.map((r) => ["to", r] as const),
    ...cc.map((r) => ["cc", r] as const),
    ...bcc.map((r) => ["bcc", r] as const),
  ] as const) {
    if (/[\r\n]/.test(value)) {
      throw new Error(`Resend ${label} contains a newline (possible header injection).`);
    }
  }

  const client = getClient(apiKey);
  const { data, error } = await client.emails.send(
    {
      from: input.from,
      to: recipients,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      ...(cc.length > 0 ? { cc } : {}),
      ...(bcc.length > 0 ? { bcc } : {}),
    },
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
  );

  if (error) {
    // Resend SDK returns { name, message } on error — surface the message,
    // never the API key.
    throw new Error(`Resend send failed: ${error.message ?? String(error)}`);
  }
  if (!data?.id) {
    throw new Error("Resend send returned no message id.");
  }
  return { id: data.id };
}
