import {
  HEX_COLOR,
  PROTOCOL_VERSION,
  parseCheckoutEvent,
  type Appearance,
  type CheckoutEvent,
  type CloseReason,
  type ErrorCode,
  type HostCommand,
  type InitMessage,
} from "./protocol";

export type { Appearance, CloseReason, ErrorCode } from "./protocol";

export interface OpenOptions {
  /** The product to sell, e.g. "prod_123". Required. */
  productId: string;
  /** Prefills the email field. The customer can still change it. */
  customerEmail?: string;
  /** A small, deliberate set of visual controls. */
  appearance?: Appearance;
  /** Fires once, as soon as the payment succeeds — before the customer closes the confirmation. */
  onSuccess?: (result: { sessionId: string }) => void;
  /** Fires exactly once per open(), always last. */
  onClose?: (result: { reason: CloseReason }) => void;
  /** Fires at most once, for failures the integration must know about. Card declines are not errors: the customer can fix them inside the checkout. */
  onError?: (error: { code: ErrorCode; message: string }) => void;
}

export interface CheckoutHandle {
  /** Ask the checkout to close. If a payment is mid-flight, it closes as soon as the payment settles, so you still learn the outcome. */
  close(): void;
}

/** How long the checkout gets to say hello before we give up. */
const READY_TIMEOUT_MS = 10_000;
const Z_INDEX = "2147483647";

const scriptOrigin = resolveCheckoutOrigin();

function resolveCheckoutOrigin(): string | null {
  // The checkout lives wherever this script was served from (like js.stripe.com),
  // unless the tag says otherwise with data-checkout-origin.
  const script = document.currentScript as HTMLScriptElement | null;
  const override = script?.dataset.checkoutOrigin;
  try {
    if (override) return new URL(override).origin;
    if (script?.src) return new URL(script.src).origin;
  } catch {
    /* fall through */
  }
  return null;
}

let active: Session | null = null;

function open(options: OpenOptions): CheckoutHandle {
  validate(options);
  if (active) {
    // Double-clicked Buy, or a second open() while one is showing: keep the
    // one the customer is already looking at. Never stack two checkouts.
    console.warn("[DodoCheckout] A checkout is already open; ignoring this open() call.");
    active.focus();
    return active.handle;
  }
  active = new Session(options);
  return active.handle;
}

function validate(options: OpenOptions): void {
  // Integration mistakes throw immediately, in development, where someone will see them.
  if (typeof options !== "object" || options === null) {
    throw new TypeError("DodoCheckout.open() expects an options object.");
  }
  if (typeof options.productId !== "string" || options.productId.trim() === "") {
    throw new TypeError('DodoCheckout.open(): "productId" must be a non-empty string.');
  }
  for (const key of ["onSuccess", "onClose", "onError"] as const) {
    if (options[key] !== undefined && typeof options[key] !== "function") {
      throw new TypeError(`DodoCheckout.open(): "${key}" must be a function.`);
    }
  }
  const color = options.appearance?.accentColor;
  if (color !== undefined && !HEX_COLOR.test(color)) {
    throw new TypeError('DodoCheckout.open(): "appearance.accentColor" must be a hex color like "#6d28d9".');
  }
  const theme = options.appearance?.theme;
  if (theme !== undefined && !["light", "dark", "auto"].includes(theme)) {
    throw new TypeError('DodoCheckout.open(): "appearance.theme" must be "light", "dark" or "auto".');
  }
  if (!scriptOrigin) {
    throw new Error("DodoCheckout: couldn't work out where the checkout is hosted. Load the SDK with a <script src> tag.");
  }
}

class Session {
  readonly handle: CheckoutHandle;
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly iframe: HTMLIFrameElement;
  private readonly port: MessagePort;
  private readonly restoreFocusTo: Element | null;
  private readonly restoreScroll: () => void;
  private readonly readyTimer: number;
  private ready = false;
  private succeeded = false;
  private errored = false;
  private finished = false;

  constructor(private readonly options: OpenOptions) {
    this.handle = Object.freeze({ close: () => this.requestClose() });
    this.restoreFocusTo = document.activeElement;
    this.restoreScroll = lockScroll();

    // A shadow root keeps the host page's CSS off our loading/error UI, and ours off theirs.
    this.host = document.createElement("div");
    this.host.setAttribute("data-dodo-checkout", "");
    // Open, not closed: the isolation that matters is the cross-origin iframe.
    // The host page owns its own DOM either way; a closed root would only hide
    // our spinner from its devtools and tests.
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.shadow.innerHTML = OVERLAY_HTML;

    this.iframe = document.createElement("iframe");
    this.iframe.title = "Secure checkout";
    this.iframe.src = `${scriptOrigin}/?embed=${PROTOCOL_VERSION}`;
    this.iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
    this.iframe.setAttribute("allow", "payment");
    this.iframe.className = "frame";
    this.shadow.appendChild(this.iframe);
    document.body.appendChild(this.host);

    const channel = new MessageChannel();
    this.port = channel.port1;
    this.port.onmessage = (e) => this.onEvent(parseCheckoutEvent(e.data));

    this.iframe.addEventListener("load", () => {
      const init: InitMessage = {
        type: "dodo:init",
        protocol: PROTOCOL_VERSION,
        config: {
          productId: this.options.productId,
          customerEmail: this.options.customerEmail,
          appearance: this.options.appearance,
        },
      };
      // targetOrigin pins delivery to the checkout origin: if anything else
      // ended up in that frame, it gets nothing.
      this.iframe.contentWindow?.postMessage(init, scriptOrigin!, [channel.port2]);
    }, { once: true });

    this.readyTimer = window.setTimeout(() => {
      if (!this.ready) {
        this.fail("checkout_unavailable", "The checkout didn't load. Check your connection and try again.");
      }
    }, READY_TIMEOUT_MS);
  }

  focus(): void {
    if (this.ready) this.iframe.focus();
  }

  private onEvent(event: CheckoutEvent | null): void {
    if (!event || this.finished) return;
    switch (event.type) {
      case "ready":
        this.ready = true;
        window.clearTimeout(this.readyTimer);
        this.shadow.querySelector(".loading")?.remove();
        this.iframe.classList.add("shown");
        this.iframe.focus();
        break;
      case "success":
        if (this.succeeded) return; // exactly once, whatever the frame says
        this.succeeded = true;
        safeCall(this.options.onSuccess, { sessionId: event.sessionId });
        break;
      case "error":
        this.emitError(event.code, event.message);
        break;
      case "close":
        this.finish(this.succeeded && event.reason === "dismissed" ? "completed" : event.reason);
        break;
    }
  }

  private requestClose(): void {
    if (this.finished) return;
    if (!this.ready) {
      this.finish("closed_by_host");
      return;
    }
    // Let the checkout decide when it's safe: it holds the close until any
    // payment in flight settles, so onSuccess can't be lost.
    const cmd: HostCommand = { type: "close_request" };
    this.port.postMessage(cmd);
  }

  private emitError(code: ErrorCode, message: string): void {
    if (this.errored) return;
    this.errored = true;
    safeCall(this.options.onError, { code, message });
  }

  /** The checkout never answered. Tell the customer and the merchant, then wait for the customer to dismiss. */
  private fail(code: ErrorCode, message: string): void {
    this.emitError(code, message);
    this.iframe.remove();
    const loading = this.shadow.querySelector(".loading");
    if (loading) loading.outerHTML = ERROR_HTML;
    const button = this.shadow.querySelector<HTMLButtonElement>(".dismiss");
    button?.addEventListener("click", () => this.finish("error"));
    this.shadow.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape") this.finish("error");
    });
    button?.focus();
  }

  private finish(reason: CloseReason): void {
    if (this.finished) return;
    this.finished = true;
    window.clearTimeout(this.readyTimer);
    this.port.close();
    // Callbacks and state settle now; only the pixels linger for the fade.
    this.iframe.classList.add("leaving");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => this.host.remove(), reduced || !this.ready ? 0 : 180);
    this.restoreScroll();
    if (this.restoreFocusTo instanceof HTMLElement && this.restoreFocusTo.isConnected) {
      this.restoreFocusTo.focus();
    }
    active = null;
    safeCall(this.options.onClose, { reason });
  }
}

function safeCall<T>(fn: ((arg: T) => void) | undefined, arg: T): void {
  if (!fn) return;
  try {
    fn(arg);
  } catch (err) {
    // A bug in the merchant's callback must not wedge the checkout.
    console.error("[DodoCheckout] Your callback threw:", err);
  }
}

function lockScroll(): () => void {
  const root = document.documentElement;
  const prevOverflow = root.style.overflow;
  const prevPadding = root.style.paddingRight;
  const scrollbar = window.innerWidth - root.clientWidth;
  root.style.overflow = "hidden";
  if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`;
  return () => {
    root.style.overflow = prevOverflow;
    root.style.paddingRight = prevPadding;
  };
}

const OVERLAY_CSS = `
  :host { all: initial; }
  .frame, .loading, .error {
    position: fixed; inset: 0; width: 100%; height: 100%; border: 0; z-index: ${Z_INDEX};
  }
  .frame { opacity: 0; background: transparent; color-scheme: normal; }
  .frame.shown { opacity: 1; }
  .frame.leaving { opacity: 0; transition: opacity 160ms ease-in; pointer-events: none; }
  .loading, .error {
    display: grid; place-items: center; background: rgba(12, 12, 16, 0.55);
    font: 500 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .spinner {
    width: 28px; height: 28px; border-radius: 50%;
    border: 3px solid rgba(255,255,255,0.3); border-top-color: #fff;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2.4s; } }
  .card {
    background: #fff; color: #18181b; border-radius: 14px; padding: 24px;
    width: min(360px, calc(100vw - 32px)); box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }
  .card h2 { margin: 0 0 6px; font-size: 16px; font-weight: 650; }
  .card p { margin: 0 0 18px; color: #52525b; }
  .dismiss {
    font: inherit; width: 100%; padding: 10px 14px; border-radius: 10px; cursor: pointer;
    border: 1px solid #d4d4d8; background: #fff; color: #18181b;
  }
  .dismiss:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
`;

const OVERLAY_HTML = `
  <style>${OVERLAY_CSS}</style>
  <div class="loading" role="status" aria-label="Loading secure checkout"><div class="spinner"></div></div>
`;

const ERROR_HTML = `
  <div class="error" role="alertdialog" aria-modal="true" aria-labelledby="dodo-err-title" aria-describedby="dodo-err-body">
    <div class="card">
      <h2 id="dodo-err-title">Checkout couldn't load</h2>
      <p id="dodo-err-body">Nothing was charged. Check your connection and try again.</p>
      <button class="dismiss" type="button">Close</button>
    </div>
  </div>
`;

export const DodoCheckout = Object.freeze({ open, version: PROTOCOL_VERSION });

declare global {
  interface Window {
    DodoCheckout: typeof DodoCheckout;
  }
}

if (typeof window !== "undefined" && !window.DodoCheckout) {
  Object.defineProperty(window, "DodoCheckout", { value: DodoCheckout, writable: false, configurable: false });
}
