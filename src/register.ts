// The resend connector's `register(ctx)` server entry.
//
// This is the extension half of the "host consumes the manifest → activates via
// register(ctx)" path. The StaticBundleLoader dynamic-imports this module and
// calls `register(ctx)`; the host ctx's `capabilities` port routes the
// `email-send` capability to the email-connector facade registry. Capability-
// based: resend advertises the `email-send` capability, the host resolves which
// concrete provider serves it.
//
// ADDITIVE: the legacy host-side registration (src/lib/register-email-providers.ts
// → registerEmailConnector(resendEmailConnector)) still runs; the host loader
// dedupes by connectorId so this does not double-register.

import type { ExtensionHostContext } from "@cinatra-ai/sdk-extensions";
import { resendEmailConnector } from "./email-connector";

export function register(ctx: ExtensionHostContext): void {
  ctx.capabilities.registerProvider("email-send", {
    packageName: "@cinatra-ai/resend-connector",
    impl: resendEmailConnector,
  });
}
