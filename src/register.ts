// The resend connector's `register(ctx)` server entry.
//
// This is the extension half of the "host consumes the manifest → activates via
// register(ctx)" path: the loader dynamic-imports this module and calls
// `register(ctx)`.
//
// Transport-registration cutover: the host no longer statically wires this connector — this entry
//   1. binds the connector's host deps AT ACTIVATION by adapting the
//      per-concern host services published in the capability registry
//      (`@cinatra-ai/host:connector-config` + `@cinatra-ai/host:secrets-codec`),
//      with every adapter field resolving the service LAZILY at call time so
//      activation order against the host boot imports never matters, and
//   2. registers the `email-send` capability provider so email routing
//      resolves resend without any host import.
//
// SDK imports here are TYPE-ONLY (host-peer value-import gate): the host
// services arrive as DATA through `ctx.capabilities`.

import type {
  ExtensionHostContext,
  HostConnectorConfigService,
  HostSecretsCodecService,
} from "@cinatra-ai/sdk-extensions";
import { registerResendConnector } from "./deps";
import { resendEmailConnector } from "./email-connector";

const PACKAGE_NAME = "@cinatra-ai/resend-connector";

function hostService<T>(ctx: ExtensionHostContext, capability: string): T {
  const provider = ctx.capabilities.resolveProviders(capability)[0];
  if (!provider) {
    throw new Error(
      `${PACKAGE_NAME}: host service "${capability}" is not registered — ` +
        `the host boot wiring (register-transport-connectors) must run before connector calls.`,
    );
  }
  return provider.impl as T;
}

export function register(ctx: ExtensionHostContext): void {
  const config = () =>
    hostService<HostConnectorConfigService>(ctx, "@cinatra-ai/host:connector-config");
  const codec = () =>
    hostService<HostSecretsCodecService>(ctx, "@cinatra-ai/host:secrets-codec");

  registerResendConnector({
    readConnectorConfigFromDatabase: (connectorId, fallback) =>
      config().read(connectorId, fallback),
    writeConnectorConfigToDatabase: (connectorId, value) =>
      config().write(connectorId, value),
    encryptSecret: (plaintext, aad) => codec().encryptSecret(plaintext, aad),
    decryptSecret: (input, aad) => codec().decryptSecret(input, aad),
  });

  ctx.capabilities.registerProvider("email-send", {
    packageName: PACKAGE_NAME,
    impl: resendEmailConnector,
  });
}
