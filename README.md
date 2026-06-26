# Resend

Send transactional and platform email through Resend from a single verified sending domain. Once connected, password resets, email verification messages, and any agent or workflow that sends mail flow through your Resend account with a consistent From address.

**Setup:** In your Cinatra instance, go to Connectors → Resend and paste a Resend API key (starts with `re_`). The connector defaults to sending from `no-reply@mail.cinatra.ai`; set a custom From address and optional Reply-To in the same settings page. Your sending domain must be verified in Resend before messages will deliver. The API key is encrypted at rest using the instance encryption key and never stored in plaintext.

**Configuration:** Two credential sources are supported. Set `RESEND_API_KEY` in the instance environment, or paste an override key in the in-app settings page. The in-app override takes precedence; if it cannot be decrypted (for example after an encryption key rotation), the connector reports `not_connected` rather than silently falling back to the environment variable. Clear the override in settings to restore the environment variable path.

**Usage:** The connector handles all email dispatched by the Cinatra platform: authentication flows (password reset, email verification, change-email), and any agent or workflow action that sends mail. The From address is always the instance-configured address — per-message From overrides are not supported because Resend requires a verified sending domain. Up to 50 recipients (combined To, Cc, and Bcc) are allowed per message.

**Development:** `pnpm test` runs the Vitest suite. The connector exports `sendViaResend`, `getResendConfig`, `saveResendConfig`, `resolveResendApiKey`, and `getResendStatus` for direct use in tests and the host.

**Troubleshooting:** If the status shows `not_connected`, check that an API key is set and that the sending domain is verified in Resend. If the key decryption error appears, re-enter the API key in the settings page to re-encrypt it under the current encryption key.

## Works with

- Cinatra (email-connector runtime, instance-scoped credentials)

## Capabilities

- Send transactional and platform email from your workspace through Resend
- Deliver password resets, email verification, and change-email messages issued by Cinatra's sign-in flow
- Use Resend as the active provider for agents and workflows that send mail
- Set a workspace-wide From address and optional Reply-To
