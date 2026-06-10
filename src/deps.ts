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

// Anchor the deps slot on `globalThis` via a namespaced+versioned Symbol so the
// activation-time registration (this connector's serverEntry `register(ctx)`)
// and runtime callers in SEPARATELY-COMPILED Next.js bundles resolve the SAME
// slot. (Same cross-compilation reason as the apify/apollo/gemini/tailscale
// deps slots + the SDK DI contracts.)
const RESEND_DEPS_KEY = Symbol.for("@cinatra-ai/resend-connector:host-deps/v1");
type DepsHolder = { [k: symbol]: ResendConnectorDeps | null | undefined };
const _holder = globalThis as unknown as DepsHolder;

export function registerResendConnector(deps: ResendConnectorDeps): void {
  _holder[RESEND_DEPS_KEY] = deps;
}

export function getResendDeps(): ResendConnectorDeps {
  const deps = _holder[RESEND_DEPS_KEY];
  if (!deps) {
    throw new Error(
      "@cinatra-ai/resend-connector: host runtime deps not registered. " +
        "The connector's serverEntry register(ctx) binds them at activation " +
        "(tests: call registerResendConnector(stubDeps) in setup).",
    );
  }
  return deps;
}

/** @internal Only for tests. */
export function _resetResendDepsForTests(): void {
  _holder[RESEND_DEPS_KEY] = null;
}
