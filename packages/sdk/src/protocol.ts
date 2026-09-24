/**
 * The contract between the SDK (running on the merchant's page) and the
 * checkout app (running in an iframe on the checkout origin).
 *
 * One `dodo:init` message crosses via window.postMessage, carrying a
 * MessagePort. Everything after that goes over the port, so no other script
 * on the host page can listen in or inject messages.
 *
 * What never crosses the line: card number, expiry, CVC, or the customer's
 * email. The host learns outcomes, not details.
 */

export const PROTOCOL_VERSION = 1;

export type Theme = "light" | "dark" | "auto";

export interface Appearance {
  /** Light, dark, or follow the customer's OS setting. Default: "auto". */
  theme?: Theme;
  /** Brand color as #rrggbb. Used for the Pay button and focus rings only. */
  accentColor?: string;
}

export interface InitConfig {
  productId: string;
  customerEmail?: string;
  appearance?: Appearance;
}

/** Host -> checkout, the only message sent with window.postMessage. */
export interface InitMessage {
  type: "dodo:init";
  protocol: number;
  config: InitConfig;
}

export type CloseReason =
  /** Payment succeeded and the customer dismissed the confirmation. */
  | "completed"
  /** Customer closed the checkout without paying. */
  | "dismissed"
  /** The merchant called handle.close(). */
  | "closed_by_host"
  /** The checkout couldn't be used (see the preceding onError). */
  | "error";

export type ErrorCode =
  /** productId doesn't exist or isn't for sale. */
  | "product_not_found"
  /** The checkout didn't load or stopped responding. */
  | "checkout_unavailable"
  /** SDK and checkout disagree on protocol version. */
  | "version_mismatch";

/** Checkout -> host, over the MessagePort. */
export type CheckoutEvent =
  | { type: "ready" }
  | { type: "success"; sessionId: string }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "close"; reason: CloseReason };

/** Host -> checkout, over the MessagePort. */
export type HostCommand = { type: "close_request" };

const ERROR_CODES: readonly ErrorCode[] = [
  "product_not_found",
  "checkout_unavailable",
  "version_mismatch",
];
const CLOSE_REASONS: readonly CloseReason[] = [
  "completed",
  "dismissed",
  "closed_by_host",
  "error",
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Narrow untrusted port data to a CheckoutEvent, or null. */
export function parseCheckoutEvent(data: unknown): CheckoutEvent | null {
  if (!isRecord(data) || typeof data.type !== "string") return null;
  switch (data.type) {
    case "ready":
      return { type: "ready" };
    case "success":
      return typeof data.sessionId === "string"
        ? { type: "success", sessionId: data.sessionId }
        : null;
    case "error":
      return ERROR_CODES.includes(data.code as ErrorCode) &&
        typeof data.message === "string"
        ? { type: "error", code: data.code as ErrorCode, message: data.message }
        : null;
    case "close":
      return CLOSE_REASONS.includes(data.reason as CloseReason)
        ? { type: "close", reason: data.reason as CloseReason }
        : null;
    default:
      return null;
  }
}

/** Narrow untrusted window message data to an InitMessage, or null. */
export function parseInitMessage(data: unknown): InitMessage | null {
  if (!isRecord(data) || data.type !== "dodo:init") return null;
  if (typeof data.protocol !== "number" || !isRecord(data.config)) return null;
  const c = data.config;
  if (typeof c.productId !== "string") return null;
  const config: InitConfig = { productId: c.productId };
  if (typeof c.customerEmail === "string") config.customerEmail = c.customerEmail;
  if (isRecord(c.appearance)) {
    const a = c.appearance;
    config.appearance = {};
    if (a.theme === "light" || a.theme === "dark" || a.theme === "auto") {
      config.appearance.theme = a.theme;
    }
    if (typeof a.accentColor === "string" && HEX_COLOR.test(a.accentColor)) {
      config.appearance.accentColor = a.accentColor;
    }
  }
  return { type: "dodo:init", protocol: data.protocol, config };
}

export function parseHostCommand(data: unknown): HostCommand | null {
  return isRecord(data) && data.type === "close_request"
    ? { type: "close_request" }
    : null;
}

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
