import { describe, expect, it } from "vitest";
import { createFakeProcessor } from "../processor";

describe("fake processor", () => {
  it("succeeds, declines, and fails-once-then-succeeds per session", async () => {
    const p = createFakeProcessor(0);
    expect((await p.charge({ sessionId: "a", cardNumber: "4242424242424242" })).status).toBe("succeeded");
    expect((await p.charge({ sessionId: "b", cardNumber: "4000000000000002" })).status).toBe("declined");
    expect((await p.charge({ sessionId: "c", cardNumber: "4000000000000341" })).status).toBe("retryable");
    expect((await p.charge({ sessionId: "c", cardNumber: "4000000000000341" })).status).toBe("succeeded");
    // A new checkout gets its own "first failure".
    expect((await p.charge({ sessionId: "d", cardNumber: "4000000000000341" })).status).toBe("retryable");
  });
  it("never charges a paid session twice", async () => {
    const p = createFakeProcessor(0);
    await p.charge({ sessionId: "s", cardNumber: "4242424242424242" });
    // Even with a declining card, a paid session reports its real outcome.
    expect((await p.charge({ sessionId: "s", cardNumber: "4000000000000002" })).status).toBe("succeeded");
  });
  it("tells real cards it's test mode", async () => {
    const p = createFakeProcessor(0);
    expect((await p.charge({ sessionId: "x", cardNumber: "5555555555554444" })).status).toBe("test_mode");
  });
});
