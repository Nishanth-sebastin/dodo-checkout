/**
 * A fake card processor. Everything a real one would do on a server happens
 * here, in the checkout's own origin, so card data never leaves this frame.
 */

export type PaymentResult =
  | { status: "succeeded" }
  | { status: "declined"; message: string }
  /** Something between us and the bank failed. Safe to retry: nothing was charged. */
  | { status: "retryable"; message: string }
  /** A real card in test mode. */
  | { status: "test_mode"; message: string };

export const TEST_CARDS = [
  { number: "4242424242424242", label: "Succeeds" },
  { number: "4000000000000002", label: "Declines" },
  { number: "4000000000000341", label: "Fails once, then succeeds" },
] as const;

export interface ChargeRequest {
  sessionId: string;
  cardNumber: string;
}

export interface Processor {
  charge(req: ChargeRequest, signal?: AbortSignal): Promise<PaymentResult>;
}

export function createFakeProcessor(latencyMs = 1100): Processor {
  // Keyed by session: "fails once" means once per checkout, not once per page load.
  const flakyAttempts = new Map<string, number>();
  const succeeded = new Set<string>();

  return {
    async charge({ sessionId, cardNumber }, signal) {
      await delay(latencyMs, signal);

      // Idempotency: a session that already paid never charges again, even if a
      // stray second submit gets this far.
      if (succeeded.has(sessionId)) return { status: "succeeded" };

      let result: PaymentResult;
      switch (cardNumber) {
        case "4242424242424242":
          result = { status: "succeeded" };
          break;
        case "4000000000000002":
          result = {
            status: "declined",
            message: "Your card was declined. You haven't been charged — try a different card.",
          };
          break;
        case "4000000000000341": {
          const attempts = (flakyAttempts.get(sessionId) ?? 0) + 1;
          flakyAttempts.set(sessionId, attempts);
          result =
            attempts === 1
              ? {
                  status: "retryable",
                  message: "We couldn't reach your bank. You haven't been charged.",
                }
              : { status: "succeeded" };
          break;
        }
        default:
          result = {
            status: "test_mode",
            message: "This checkout is in test mode. Use one of the test cards below.",
          };
      }
      if (result.status === "succeeded") succeeded.add(sessionId);
      return result;
    },
  };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}
