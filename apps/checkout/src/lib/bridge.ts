import {
  PROTOCOL_VERSION,
  parseHostCommand,
  parseInitMessage,
  type CheckoutEvent,
  type InitMessage,
} from "@sdk/protocol";

/**
 * The checkout's side of the conversation with the SDK.
 *
 * Registered at module load, before React renders, so the init message
 * (sent on the iframe's load event) can never arrive before we listen.
 */

export interface Connection {
  init: InitMessage;
  /** Origin of the page embedding us, as reported by the browser — not by the page. */
  hostOrigin: string;
  send(event: CheckoutEvent): void;
  onCloseRequest(handler: () => void): void;
}

type Listener = (conn: Connection) => void;

let connection: Connection | null = null;
const waiting: Listener[] = [];

export const isEmbedded = window.parent !== window;

if (isEmbedded) {
  window.addEventListener("message", function handle(e: MessageEvent) {
    // Only our direct parent may start a session, and only once.
    if (e.source !== window.parent || connection) return;
    const init = parseInitMessage(e.data);
    const port = e.ports[0];
    if (!init || !port) return;
    window.removeEventListener("message", handle);

    let closeHandler: (() => void) | null = null;
    port.onmessage = (msg) => {
      if (parseHostCommand(msg.data)?.type === "close_request") closeHandler?.();
    };

    connection = {
      init,
      hostOrigin: e.origin,
      send: (event) => port.postMessage(event),
      onCloseRequest: (h) => {
        closeHandler = h;
      },
    };
    waiting.splice(0).forEach((fn) => fn(connection!));
  });
}

export function onConnect(fn: Listener): void {
  if (connection) fn(connection);
  else waiting.push(fn);
}

export function versionSupported(init: InitMessage): boolean {
  return init.protocol === PROTOCOL_VERSION;
}

/** "https://shop.example.com" -> "shop.example.com"; keeps the port for localhost. */
export function displayHost(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

export function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return "cs_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
