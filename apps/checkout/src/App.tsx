import { useCallback, useEffect, useRef, useState } from "react";
import type { CloseReason } from "@sdk/protocol";
import {
  displayHost,
  isEmbedded,
  newSessionId,
  onConnect,
  versionSupported,
  type Connection,
} from "./lib/bridge";
import { findProduct, type Product } from "./lib/catalog";
import { createFakeProcessor } from "./lib/processor";
import { applyAppearance } from "./lib/appearance";
import { useFocusTrap } from "./lib/useFocusTrap";
import { PaymentForm } from "./components/PaymentForm";
import { SuccessView } from "./components/SuccessView";
import { Shell } from "./components/Shell";

const processor = createFakeProcessor();

export type Stage =
  | { kind: "connecting" }
  | { kind: "unavailable"; title: string; body: string }
  | { kind: "paying"; product: Product }
  | { kind: "paid"; product: Product; email: string };

export function App() {
  const [conn, setConn] = useState<Connection | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "connecting" });
  const [leaving, setLeaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const sessionId = useRef(newSessionId()).current;

  // "busy" = a charge is in flight. Closing is held until it settles.
  const busy = useRef(false);
  const pendingHostClose = useRef(false);
  const closed = useRef(false);

  const close = useCallback(
    (reason: CloseReason) => {
      if (closed.current || !conn) return;
      closed.current = true;
      // Tell the host first; the exit animation plays while the SDK fades us out.
      // The merchant's onClose never waits on our motion.
      conn.send({ type: "close", reason });
      setLeaving(true);
    },
    [conn],
  );

  useEffect(() => {
    onConnect((c) => {
      applyAppearance(c.init.config.appearance);
      setConn(c);
      if (!versionSupported(c.init)) {
        c.send({ type: "error", code: "version_mismatch", message: "This version of the SDK isn't supported by the checkout." });
        setStage({ kind: "unavailable", title: "Checkout needs an update", body: "The store is using an outdated checkout. Nothing was charged." });
        return;
      }
      const product = findProduct(c.init.config.productId);
      if (!product) {
        c.send({ type: "error", code: "product_not_found", message: `No product with id "${c.init.config.productId}".` });
        setStage({ kind: "unavailable", title: "This item isn't available", body: "The store couldn't start a checkout for it. Nothing was charged." });
      } else {
        setStage({ kind: "paying", product });
      }
    });
  }, []);

  useEffect(() => {
    if (!conn) return;
    conn.onCloseRequest(() => {
      if (busy.current) pendingHostClose.current = true;
      else close("closed_by_host");
    });
  }, [conn, close]);

  const dismiss = useCallback(() => {
    if (busy.current) return;
    close(stage.kind === "paid" ? "completed" : stage.kind === "unavailable" ? "error" : "dismissed");
  }, [close, stage.kind]);

  const onSettled = useCallback(
    (outcome: { paid: true; email: string } | { paid: false }) => {
      busy.current = false;
      setProcessing(false);
      if (outcome.paid && stage.kind === "paying") {
        // Tell the merchant now, not when the customer closes the receipt —
        // they may never click Done.
        conn?.send({ type: "success", sessionId });
        setStage({ kind: "paid", product: stage.product, email: outcome.email });
      }
      if (pendingHostClose.current) close("closed_by_host");
    },
    [conn, sessionId, stage, close],
  );

  const dialogRef = useFocusTrap<HTMLDivElement>(stage.kind !== "connecting");

  // Say "ready" only once there's something on screen. The SDK focuses the
  // iframe on ready; if that happens before the form exists, Safari and
  // Firefox leave keyboard focus on <body> and the customer has to click.
  const readySent = useRef(false);
  useEffect(() => {
    if (!conn || stage.kind === "connecting" || readySent.current) return;
    readySent.current = true;
    conn.send({ type: "ready" });
  }, [conn, stage.kind]);

  if (!isEmbedded) return <Standalone />;
  if (!conn || stage.kind === "connecting") return null; // the SDK shows its own spinner

  return (
    <Shell
      ref={dialogRef}
      leaving={leaving}
      onDismiss={dismiss}
      canDismiss={() => !busy.current}
      closeDisabled={processing}
      hostLabel={displayHost(conn.hostOrigin)}
      merchant={stage.kind === "unavailable" ? null : stage.product.merchant}
    >
      {stage.kind === "unavailable" && (
        <div className="unavailable">
          <h1 id="dialog-title">{stage.title}</h1>
          <p>{stage.body}</p>
          <button type="button" className="btn secondary" onClick={dismiss} data-autofocus>
            Back to store
          </button>
        </div>
      )}
      {stage.kind === "paying" && (
        <PaymentForm
          product={stage.product}
          sessionId={sessionId}
          initialEmail={conn.init.config.customerEmail ?? ""}
          processor={processor}
          onBusy={() => {
            busy.current = true;
            setProcessing(true);
          }}
          onSettled={onSettled}
        />
      )}
      {stage.kind === "paid" && (
        <SuccessView product={stage.product} email={stage.email} sessionId={sessionId} onDone={dismiss} />
      )}
    </Shell>
  );
}

function Standalone() {
  return (
    <main className="standalone">
      <h1>Dodo embedded checkout</h1>
      <p>
        This page is meant to open inside a store, through <code>DodoCheckout.open()</code>. Load the SDK from{" "}
        <code>{location.origin}/sdk/v1.js</code> on your site to use it.
      </p>
    </main>
  );
}
