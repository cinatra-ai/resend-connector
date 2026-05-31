import "server-only";

// Public surface of @cinatra-ai/resend-connector.
export { RESEND_CONNECTOR_ID, resendConnectorDefinition } from "./definition";
export {
  registerResendConnector,
  getResendDeps,
  _resetResendDepsForTests,
  type ResendConnectorDeps,
} from "./deps";
export {
  getResendConfig,
  saveResendConfig,
  resolveResendApiKey,
  getResendStatus,
  type ResendConfig,
  type SaveResendConfigInput,
} from "./config";
export { sendViaResend, type ResendSendInput, type ResendSendResult } from "./send";
export { resendEmailConnector, buildResendFrom } from "./email-connector";
