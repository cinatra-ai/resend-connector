import "server-only";

import { RESEND_CONNECTOR_ID } from "./definition";
import { getResendDeps } from "./deps";

// AES-GCM additional-authenticated-data tag binding the ciphertext to this
// field, mirroring the registry-token pattern (encryptSecret(x, "vendor.token")).
const API_KEY_AAD = "resend.apiKey";

// Dedicated sending subdomain — isolates transactional-mail reputation from the
// cinatra.ai Google Workspace human/corporate mail, and keeps Resend's SPF/DKIM/
// DMARC independent of the Workspace records on the apex. Verify mail.cinatra.ai
// (NOT the apex) in Resend.
const DEFAULT_FROM_EMAIL = "no-reply@mail.cinatra.ai";
const DEFAULT_FROM_NAME = "Cinatra";

// Persisted shape (connector_config:resend). The API key is stored ONLY as
// ciphertext+iv (never plaintext); `resolveResendApiKey` decrypts it on demand.
type StoredResendConfig = {
  enabled?: boolean;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
  apiKeyCiphertext?: string;
  apiKeyIv?: string;
};

// Non-secret view returned to callers/UI. Never includes the key itself —
// only whether an in-app override exists.
export type ResendConfig = {
  enabled: boolean;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  hasApiKeyOverride: boolean;
};

function readStored(): StoredResendConfig {
  return getResendDeps().readConnectorConfigFromDatabase<StoredResendConfig>(
    RESEND_CONNECTOR_ID,
    {},
  );
}

export function getResendConfig(): ResendConfig {
  const stored = readStored();
  return {
    enabled: stored.enabled ?? true,
    fromEmail: (stored.fromEmail ?? DEFAULT_FROM_EMAIL).trim(),
    fromName: (stored.fromName ?? DEFAULT_FROM_NAME).trim(),
    replyTo: (stored.replyTo ?? "").trim(),
    hasApiKeyOverride: Boolean(stored.apiKeyCiphertext && stored.apiKeyIv),
  };
}

export type SaveResendConfigInput = {
  enabled?: boolean;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
  // When provided (non-empty), replaces the stored key. When the empty string
  // is passed explicitly with `clearApiKey:true`, the override is removed and
  // the env RESEND_API_KEY becomes the source again. Undefined = leave as-is.
  apiKey?: string;
  clearApiKey?: boolean;
};

export function saveResendConfig(input: SaveResendConfigInput): void {
  const deps = getResendDeps();
  const current = readStored();

  const next: StoredResendConfig = {
    enabled: input.enabled ?? current.enabled ?? true,
    fromEmail: (input.fromEmail ?? current.fromEmail ?? DEFAULT_FROM_EMAIL).trim(),
    fromName: (input.fromName ?? current.fromName ?? DEFAULT_FROM_NAME).trim(),
    replyTo: (input.replyTo ?? current.replyTo ?? "").trim(),
    apiKeyCiphertext: current.apiKeyCiphertext,
    apiKeyIv: current.apiKeyIv,
  };

  if (input.clearApiKey) {
    delete next.apiKeyCiphertext;
    delete next.apiKeyIv;
  } else if (typeof input.apiKey === "string" && input.apiKey.trim().length > 0) {
    const enc = deps.encryptSecret(input.apiKey.trim(), API_KEY_AAD);
    next.apiKeyCiphertext = enc.ciphertext;
    next.apiKeyIv = enc.iv;
  }

  deps.writeConnectorConfigToDatabase(RESEND_CONNECTOR_ID, next);
}

// API key precedence: in-app encrypted override (if set) > env RESEND_API_KEY.
// Returns undefined when neither is configured.
//
// FAIL CLOSED: if an override exists but cannot be decrypted (key rotated /
// tampered ciphertext), return undefined — do NOT silently fall back to env.
// The override is authoritative once set; falling through would mask a
// tamper/rotation failure and violate the admin's explicit precedence choice.
export function resolveResendApiKey(): string | undefined {
  const stored = readStored();
  if (stored.apiKeyCiphertext && stored.apiKeyIv) {
    try {
      const key = getResendDeps()
        .decryptSecret(
          { ciphertext: stored.apiKeyCiphertext, iv: stored.apiKeyIv },
          API_KEY_AAD,
        )
        .trim();
      return key.length > 0 ? key : undefined;
    } catch {
      return undefined;
    }
  }
  const envKey = process.env.RESEND_API_KEY?.trim();
  return envKey && envKey.length > 0 ? envKey : undefined;
}

export function getResendStatus(): {
  status: "connected" | "incomplete" | "not_connected";
  accountEmail?: string;
  detail?: string;
} {
  const config = getResendConfig();
  const hasKey = Boolean(resolveResendApiKey());

  if (!config.enabled) {
    return { status: "not_connected", detail: "Disabled in /connectors/resend." };
  }
  if (!hasKey) {
    // Distinguish "no key at all" from "stored key won't decrypt" (fail-closed
    // path in resolveResendApiKey) so the operator knows to re-enter it.
    if (config.hasApiKeyOverride) {
      return {
        status: "not_connected",
        detail:
          "Stored Resend API key could not be decrypted (was CINATRA_ENCRYPTION_KEY rotated?). Re-enter it in /connectors/resend.",
      };
    }
    return {
      status: "not_connected",
      detail: "No Resend API key. Set RESEND_API_KEY in the instance env or paste one in /connectors/resend.",
    };
  }
  if (!config.fromEmail) {
    return { status: "incomplete", detail: "No sender (From) address configured." };
  }
  return { status: "connected", accountEmail: config.fromEmail };
}
