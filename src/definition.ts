import "server-only";
import type { EmailConnectorDefinition } from "@cinatra-ai/sdk-extensions";

// Leaf module — mirrors gmail-connector/src/definition.ts. Keep this importable
// WITHOUT pulling in the resend SDK, host DB deps, or the EmailConnector
// runtime, so /connectors/email and register-email-providers.ts can read the
// definition (id, name, settingsHref) without triggering a boot-time TDZ cycle
// between index.ts (defines the connector) and email-connector.ts (imports it).
export const RESEND_CONNECTOR_ID = "resend";

export const resendConnectorDefinition: EmailConnectorDefinition = {
  connectorId: RESEND_CONNECTOR_ID,
  name: "Resend",
  slug: "connector-resend",
  description:
    "Send transactional and platform email (password reset, verification, change-email) through Resend.",
  settingsHref: "/connectors/resend",
  supportsOAuth: false,
  supportsApiKey: true,
  // Resend can only send from a verified domain, so freeform per-message From
  // is unsafe — the configured fromEmail is always used. (See getStatus/send.)
  supportsCustomFrom: false,
  // Instance-level credentials (RESEND_API_KEY / in-app key) — no per-user
  // connection needed, so this provider is eligible for platform/system mail.
  supportsSystemEmail: true,
};
