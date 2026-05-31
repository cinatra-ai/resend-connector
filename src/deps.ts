// Host dependency-injection seam — mirrors gmail-connector/src/deps.ts.
//
// The package must NOT import `@/lib/database` or `@/lib/instance-secrets`
// directly (those `@/` aliases resolve only inside the host src/ tree and
// would anchor this extension to the host). The host injects the narrow
// surface below at boot via registerResendConnector(deps).

export interface ResendConnectorDeps {
  /** Read this connector's persisted settings (connector_config:resend). */
  readConnectorConfigFromDatabase: <T>(connectorId: string, fallback: T) => T;
  /** Write this connector's persisted settings. */
  writeConnectorConfigToDatabase: (connectorId: string, value: unknown) => void;
  /** AES-256-GCM encrypt a secret (host's CINATRA_ENCRYPTION_KEY). */
  encryptSecret: (plaintext: string, aad?: string) => { ciphertext: string; iv: string };
  /** AES-256-GCM decrypt a secret. Throws on auth-tag mismatch. */
  decryptSecret: (input: { ciphertext: string; iv: string }, aad?: string) => string;
}

let _deps: ResendConnectorDeps | null = null;

export function registerResendConnector(deps: ResendConnectorDeps): void {
  _deps = deps;
}

export function getResendDeps(): ResendConnectorDeps {
  if (!_deps) {
    throw new Error(
      "@cinatra-ai/resend-connector: host runtime deps not registered. " +
        "Call registerResendConnector(deps) at boot (src/lib/register-email-providers.ts).",
    );
  }
  return _deps;
}

/** @internal Only for tests. */
export function _resetResendDepsForTests(): void {
  _deps = null;
}
