// Types only: the runtime SDK comes from the <script> tag, served by the checkout origin.
import type { OpenOptions } from "../../../packages/sdk/src/index";
import "./style.css";

const logEl = document.getElementById("log")!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function log(kind: "success" | "close" | "error" | "info", label: string, payload?: unknown) {
  const li = document.createElement("li");
  li.className = `entry ${kind}`;
  const time = new Date().toLocaleTimeString([], { hour12: false });
  li.innerHTML = `<span class="t">${time}</span><span class="k"></span><code class="p"></code>`;
  li.querySelector(".k")!.textContent = label;
  li.querySelector(".p")!.textContent = payload === undefined ? "" : JSON.stringify(payload);
  logEl.prepend(li);
}

function options(productId: string): OpenOptions {
  const email = $<HTMLInputElement>("opt-email").value.trim();
  return {
    productId,
    customerEmail: email || undefined,
    appearance: {
      theme: $<HTMLSelectElement>("opt-theme").value as "auto" | "light" | "dark",
      accentColor: $<HTMLInputElement>("opt-accent").value,
    },
    onSuccess: (r) => log("success", "onSuccess", r),
    onClose: (r) => log("close", "onClose", r),
    onError: (e) => log("error", "onError", e),
  };
}

function buy(productId: string) {
  if (!window.DodoCheckout) {
    log("error", "SDK not loaded", { hint: "Is the checkout app running on VITE_CHECKOUT_ORIGIN?" });
    return;
  }
  log("info", "DodoCheckout.open()", { productId });
  const handle = window.DodoCheckout.open(options(productId));
  (window as unknown as { __handle: typeof handle }).__handle = handle; // for the e2e suite
  return handle;
}

document.querySelectorAll<HTMLButtonElement>("button.buy").forEach((btn) => {
  btn.addEventListener("click", () => buy(btn.dataset.product!));
});

$("double-buy").addEventListener("click", () => {
  buy("prod_123");
  buy("prod_123"); // the second call is ignored; one checkout, one onClose
});

$("missing-product").addEventListener("click", () => buy("prod_does_not_exist"));

$("host-close").addEventListener("click", () => {
  const handle = buy("prod_456");
  log("info", "will call handle.close() in 4s", { tip: "Start a payment before then — the close waits for it to settle." });
  window.setTimeout(() => {
    log("info", "handle.close()");
    handle?.close();
  }, 4000);
});

$("bad-options").addEventListener("click", () => {
  try {
    // @ts-expect-error deliberately wrong
    window.DodoCheckout.open({ onSuccess: () => {} });
  } catch (err) {
    log("error", "open() threw", { message: (err as Error).message });
  }
});

$("clear-log").addEventListener("click", () => (logEl.innerHTML = ""));
