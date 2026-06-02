import "server-only";

import type {
  EmailConnector,
  EmailConnectorStatusResult,
  EmailReplyMatch,
  EmailSendReceipt,
  EmailSystemMessage,
} from "@cinatra-ai/sdk-extensions/email-contract";

// Import the definition from the leaf module (NOT ./index) to avoid the
// index <-> email-connector TDZ cycle that bit gmail at boot.
import { RESEND_CONNECTOR_ID, resendConnectorDefinition } from "./definition";
import { getResendConfig, getResendStatus } from "./config";
import { sendViaResend } from "./send";

/** Build an RFC 5322 From header from the configured name + address.
 *  Strips CR/LF (header-injection guard) and quotes display names that contain
 *  characters with structural meaning in the address (e.g. <>"(),:;@). */
export function buildResendFrom(fromName: string, fromEmail: string): string {
  const email = fromEmail.trim().replace(/[\r\n]/g, "");
  const name = fromName.trim().replace(/[\r\n]/g, "");
  if (!name) return email;
  if (/["\\<>(),:;@[\]]/.test(name)) {
    // Quote and escape per RFC 5322 quoted-string.
    const escaped = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}" <${email}>`;
  }
  return `${name} <${email}>`;
}

async function send(
  msg: EmailSystemMessage,
  _opts?: { userId?: string },
): Promise<EmailSendReceipt> {
  const config = getResendConfig();
  if (!config.fromEmail) {
    throw new Error("Resend connector has no sender (From) address configured.");
  }

  // supportsCustomFrom is false: ignore msg.fromEmail/fromName and always send
  // from the instance's verified configured address. Resend rejects unverified
  // From domains anyway.
  const result = await sendViaResend({
    from: buildResendFrom(config.fromName, config.fromEmail),
    to: msg.to,
    cc: msg.cc,
    bcc: msg.bcc,
    subject: msg.subject,
    text: msg.textBody,
    replyTo: msg.replyTo || config.replyTo || undefined,
  });

  return {
    providerId: RESEND_CONNECTOR_ID,
    providerMessageId: result.id,
    sentAt: new Date().toISOString(),
  };
}

// Resend is send-only here (no inbound reply polling). Return null so the
// facade's reply-matching is a no-op for resend-routed threads.
async function findReply(_opts: {
  providerThreadId?: string;
  recipientEmail: string;
  sentAfter?: string;
  userId?: string;
}): Promise<EmailReplyMatch | null> {
  return null;
}

// Instance-level status — does NOT depend on userId (unlike gmail's per-user
// OAuth). This is what makes resend eligible for the platform/transactional
// purpose where there is no authenticated user at send time.
async function getStatus(_opts?: { userId?: string }): Promise<EmailConnectorStatusResult> {
  return getResendStatus();
}

export const resendEmailConnector: EmailConnector = {
  definition: resendConnectorDefinition,
  send,
  findReply,
  getStatus,
};
