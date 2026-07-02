/**
 * sendViaResend — pre-flight safety guards.
 *
 * The recipient-cap and header-injection guards run BEFORE the Resend SDK
 * client is ever asked to make a network call, so most rejections here throw
 * synchronously ahead of `client.emails.send`. The "resend" package itself is
 * still mocked (never a real network call) so the one guard-passes case (at,
 * not over, the cap) can assert on what would have been sent without hitting
 * the network. `resolveResendApiKey` unconditionally reads through the
 * connector's host-deps slot (see src/config.ts `readStored`), so every test
 * registers a stub deps object — mirroring gmail-connector's
 * `registerGmailConnector(stubDeps)` pattern — even for the env-var-key path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// `vi.mock` factories are hoisted above the module's imports, so a factory
// that closes over a plain top-level `const` can run before that const is
// initialized. `vi.hoisted` runs its callback as part of that same hoist
// pass, guaranteeing `sendMock` exists by the time the factory below needs it.
const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(
    async (_message?: Record<string, unknown>, _options?: Record<string, unknown>) => ({
      data: { id: "msg_123" },
      error: null,
    }),
  ),
}));

vi.mock("resend", () => ({
  // `Resend` is invoked with `new` in send.ts (`new Resend(apiKey)`) — a
  // plain arrow-function mock implementation is not a valid constructor, so
  // this needs a real function/class shape.
  Resend: vi.fn().mockImplementation(function FakeResend() {
    return { emails: { send: sendMock } };
  }),
}));

import { sendViaResend, type ResendSendInput } from "../send";
import {
  registerResendConnector,
  _resetResendDepsForTests,
  type ResendConnectorDeps,
} from "../deps";

const readConfigMock = vi.fn();

function stubDeps(): ResendConnectorDeps {
  return {
    readConnectorConfigFromDatabase: readConfigMock as never,
    writeConnectorConfigToDatabase: vi.fn(),
    encryptSecret: vi.fn(() => ({ ciphertext: "c", iv: "i" })),
    decryptSecret: vi.fn(() => {
      throw new Error("not wired in this test");
    }),
  };
}

const baseInput = (over: Partial<ResendSendInput> = {}): ResendSendInput => ({
  from: "Cinatra <no-reply@mail.cinatra.ai>",
  to: ["alice@example.com"],
  subject: "Hi",
  text: "Hello",
  ...over,
});

const originalEnvKey = process.env.RESEND_API_KEY;

describe("sendViaResend guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockClear();
    _resetResendDepsForTests();
    registerResendConnector(stubDeps());
    // No in-app override configured — resolveResendApiKey falls back to env.
    readConfigMock.mockReturnValue({});
    process.env.RESEND_API_KEY = "test-key-not-real";
  });

  afterEach(() => {
    if (originalEnvKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalEnvKey;
  });

  it("throws when no API key is configured at all", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendViaResend(baseInput())).rejects.toThrow(
      "Resend is not configured",
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("throws when there are no recipients after trimming empties", async () => {
    await expect(
      sendViaResend(baseInput({ to: ["  ", ""] })),
    ).rejects.toThrow("requires at least one recipient");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("accepts exactly the 50-recipient cap across to/cc/bcc combined", async () => {
    // 48 `to` + 1 `cc` + 1 `bcc` = 50 total, at the cap (not over it) — the
    // guard must let this through to the client.
    const to = Array.from({ length: 48 }, (_, i) => `r${i}@example.com`);
    const result = await sendViaResend(
      baseInput({ to, cc: ["c@example.com"], bcc: ["b@example.com"] }),
    );
    expect(result).toEqual({ id: "msg_123" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [message] = sendMock.mock.calls[0];
    expect(message?.to).toHaveLength(48);
    expect(message?.cc).toEqual(["c@example.com"]);
    expect(message?.bcc).toEqual(["b@example.com"]);
  });

  it("rejects when to+cc+bcc combined exceed the 50-recipient cap", async () => {
    const to = Array.from({ length: 49 }, (_, i) => `r${i}@example.com`);
    await expect(
      sendViaResend(baseInput({ to, cc: ["c@example.com"], bcc: ["b@example.com"] })),
    ).rejects.toThrow("Resend allows at most 50 recipients per message (got 51");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a `from` header carrying a CRLF (header-injection guard)", async () => {
    await expect(
      sendViaResend(
        baseInput({ from: "Cinatra <no-reply@mail.cinatra.ai>\r\nBcc:attacker@evil.com" }),
      ),
    ).rejects.toThrow("Resend from contains a newline");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a `to` address carrying a bare LF", async () => {
    await expect(
      sendViaResend(baseInput({ to: ["alice@example.com\nBcc:attacker@evil.com"] })),
    ).rejects.toThrow("Resend to contains a newline");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a `cc` address carrying a bare CR", async () => {
    await expect(
      sendViaResend(baseInput({ cc: ["carol@example.com\rX-Injected: 1"] })),
    ).rejects.toThrow("Resend cc contains a newline");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a `bcc` address carrying a CRLF", async () => {
    await expect(
      sendViaResend(baseInput({ bcc: ["bob@example.com\r\nBcc:attacker@evil.com"] })),
    ).rejects.toThrow("Resend bcc contains a newline");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a `replyTo` header carrying a newline", async () => {
    await expect(
      sendViaResend(baseInput({ replyTo: "reply@example.com\nBcc:attacker@evil.com" })),
    ).rejects.toThrow("Resend replyTo contains a newline");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("checks the recipient cap before the header-injection guard", async () => {
    // Both a cap violation AND an injection attempt are present; the cap is
    // checked first in source order, so that error should win.
    const to = Array.from({ length: 51 }, (_, i) => `r${i}@example.com`);
    to[0] = "evil@example.com\r\nBcc:attacker@evil.com";
    await expect(sendViaResend(baseInput({ to }))).rejects.toThrow(
      "Resend allows at most 50 recipients",
    );
    expect(sendMock).not.toHaveBeenCalled();
  });
});
