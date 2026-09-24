import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  cardNumberError,
  cvcError,
  cvcLength,
  detectBrand,
  digitsOnly,
  emailError,
  expiryError,
  formatCardNumber,
  formatExpiry,
  isCardComplete,
  isExpiryComplete,
} from "../lib/card";
import { formatMoney, type Product } from "../lib/catalog";
import { TEST_CARDS, type Processor } from "../lib/processor";
import { useOnline } from "../lib/useOnline";
import { BrandMark } from "./BrandMark";
import { focusSoon } from "../lib/useFocusTrap";

type FieldName = "email" | "card" | "expiry" | "cvc";

type Banner =
  | { tone: "error"; text: string; retry?: boolean }
  | { tone: "info"; text: string };

interface Props {
  product: Product;
  sessionId: string;
  initialEmail: string;
  processor: Processor;
  onBusy: () => void;
  onSettled: (outcome: { paid: true; email: string } | { paid: false }) => void;
}

export function PaymentForm({ product, sessionId, initialEmail, processor, onBusy, onSettled }: Props) {
  const [values, setValues] = useState({ email: initialEmail, card: "", expiry: "", cvc: "" });
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({ email: false, card: false, expiry: false, cvc: false });
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const online = useOnline();
  const inFlight = useRef(false);
  const retryRef = useRef<HTMLButtonElement>(null);

  const refs = {
    email: useRef<HTMLInputElement>(null),
    card: useRef<HTMLInputElement>(null),
    expiry: useRef<HTMLInputElement>(null),
    cvc: useRef<HTMLInputElement>(null),
  };

  const brand = detectBrand(digitsOnly(values.card));
  const errors: Record<FieldName, string | null> = {
    email: emailError(values.email),
    card: cardNumberError(values.card),
    expiry: expiryError(values.expiry),
    cvc: cvcError(values.cvc, brand),
  };
  // Errors show once a field has been filled and left, or on Pay. Leaving an
  // empty field isn't a mistake yet — the customer may just be looking around.
  const shown = (f: FieldName) => (touched[f] ? errors[f] : null);
  const price = formatMoney(product.amount, product.currency);

  useEffect(() => {
    if (!online) setBanner({ tone: "info", text: "You're offline. Reconnect to pay — nothing has been charged." });
    else setBanner((b) => (b?.tone === "info" && b.text.startsWith("You're offline") ? null : b));
  }, [online]);

  const set = (field: FieldName, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (banner?.tone === "error" && field === "card") setBanner(null);
  };

  const pay = async (e?: FormEvent) => {
    e?.preventDefault();
    // One charge at a time, whether it's a double click, Enter + click, or Retry spam.
    if (inFlight.current || !online) return;
    setTouched({ email: true, card: true, expiry: true, cvc: true });
    const firstInvalid = (["email", "card", "expiry", "cvc"] as const).find((f) => errors[f]);
    if (firstInvalid) {
      refs[firstInvalid].current?.focus();
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setBanner(null);
    onBusy();
    let paid = false;
    try {
      const result = await processor.charge({ sessionId, cardNumber: digitsOnly(values.card) });
      switch (result.status) {
        case "succeeded":
          paid = true;
          break;
        case "declined":
          setBanner({ tone: "error", text: result.message });
          focusAndSelect(refs.card.current);
          break;
        case "retryable":
          setBanner({ tone: "error", text: result.message, retry: true });
          focusLater(() => retryRef.current);
          break;
        case "test_mode":
          setBanner({ tone: "error", text: result.message });
          focusAndSelect(refs.card.current);
          break;
      }
    } catch {
      setBanner({ tone: "error", text: "Something went wrong on our side. You haven't been charged.", retry: true });
      focusLater(() => retryRef.current);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
      onSettled(paid ? { paid: true, email: values.email.trim() } : { paid: false });
    }
  };

  const fillTestCard = (number: string) => {
    set("card", formatCardNumber(number));
    setBanner(null);
    if (!values.expiry) set("expiry", "12 / 34");
    if (!values.cvc) set("cvc", "123");
    refs.card.current?.focus();
  };

  return (
    <form className="pay" onSubmit={pay} noValidate aria-busy={submitting}>
      <section className="summary" aria-labelledby="dialog-title">
        <div>
          <h1 id="dialog-title">{product.name}</h1>
          <p className="muted">{product.description}</p>
        </div>
        <div className="price">
          <span className="amount">{price}</span>
          {product.interval && <span className="muted small">{product.interval}</span>}
        </div>
      </section>

      {/* Read-only rather than disabled while paying: disabling drops focus to
          <body>, and some browsers won't let us put it back. */}
      <fieldset className="fields" aria-disabled={submitting || undefined}>
        <Field label="Email" hint="For your receipt" error={shown("email")} id="email">
          <input
            ref={refs.email}
            id="email"
            readOnly={submitting}
            type="email"
            autoComplete="email"
            spellCheck={false}
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            onBlur={(e) => e.target.value && setTouched((t) => ({ ...t, email: true }))}
            data-autofocus={initialEmail ? undefined : ""}
            {...ariaFor("email", shown("email"))}
          />
        </Field>

        <div className="card-group" role="group" aria-labelledby="card-legend">
          <span id="card-legend" className="label">Card</span>
          <div className="card-box">
            <div className="card-number">
              <input
                ref={refs.card}
                id="card"
                readOnly={submitting}
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="1234 1234 1234 1234"
                aria-label="Card number"
                value={values.card}
                data-autofocus={initialEmail ? "" : undefined}
                onChange={(e) => {
                  const next = formatCardNumber(e.target.value);
                  set("card", next);
                  // Move on only when the number is complete *and* plausible.
                  if (isCardComplete(next) && !cardNumberError(next)) refs.expiry.current?.focus();
                }}
                onBlur={(e) => e.target.value && setTouched((t) => ({ ...t, card: true }))}
                {...ariaFor("card", shown("card"))}
              />
              <BrandMark brand={brand} />
            </div>
            <div className="card-row">
              <input
                ref={refs.expiry}
                id="expiry"
                readOnly={submitting}
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM / YY"
                aria-label="Expiry date"
                value={values.expiry}
                onChange={(e) => {
                  const next = formatExpiry(e.target.value, values.expiry);
                  set("expiry", next);
                  if (isExpiryComplete(next) && !expiryError(next)) refs.cvc.current?.focus();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && values.expiry === "") refs.card.current?.focus();
                }}
                onBlur={(e) => e.target.value && setTouched((t) => ({ ...t, expiry: true }))}
                {...ariaFor("expiry", shown("expiry"))}
              />
              <input
                ref={refs.cvc}
                id="cvc"
                readOnly={submitting}
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder={brand === "amex" ? "4 digits" : "CVC"}
                aria-label="Security code"
                maxLength={cvcLength(brand)}
                value={values.cvc}
                onChange={(e) => set("cvc", digitsOnly(e.target.value).slice(0, cvcLength(brand)))}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && values.cvc === "") refs.expiry.current?.focus();
                }}
                onBlur={(e) => e.target.value && setTouched((t) => ({ ...t, cvc: true }))}
                {...ariaFor("cvc", shown("cvc"))}
              />
            </div>
          </div>
          {(["card", "expiry", "cvc"] as const).map((f) =>
            shown(f) ? (
              <p key={f} id={`${f}-error`} className="field-error">
                {shown(f)}
              </p>
            ) : null,
          )}
        </div>
      </fieldset>

      <div aria-live="assertive" className="banner-slot">
        {banner && (
          <div className={`banner ${banner.tone}`} role={banner.tone === "error" ? "alert" : "status"}>
            <BannerIcon tone={banner.tone} />
            <span className="banner-text">{banner.text}</span>
            {banner.tone === "error" && banner.retry && (
              <button ref={retryRef} type="button" className="link-btn" onClick={() => pay()} disabled={submitting}>
                Try again
              </button>
            )}
          </div>
        )}
      </div>

      <button type="submit" className="btn primary" disabled={submitting || !online} aria-describedby="pay-note">
        {submitting ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Processing…
          </>
        ) : (
          <>Pay {price}</>
        )}
      </button>
      <p id="pay-note" className="muted small center">
        {submitting
          ? "Confirming with your bank — this takes a moment."
          : product.interval
            ? `Renews ${product.interval.replace("per ", "every ")}. Cancel anytime.`
            : "One-time payment. Taxes included."}
      </p>

      <details className="test-cards">
        <summary>
          <span className="test-pill">Test mode</span> Use a test card
        </summary>
        <ul>
          {TEST_CARDS.map((c) => (
            <li key={c.number}>
              <button type="button" className="test-card" onClick={() => fillTestCard(c.number)} disabled={submitting}>
                <code>{formatCardNumber(c.number)}</code>
                <span>{c.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </form>
  );
}

function BannerIcon({ tone }: { tone: "error" | "info" }) {
  return tone === "error" ? (
    <svg className="banner-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r="0.9" fill="currentColor" />
    </svg>
  ) : (
    <svg className="banner-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 6.5a9 9 0 0 1 12 0M4.3 8.8a5.6 5.6 0 0 1 7.4 0M6.6 11a2.3 2.3 0 0 1 2.8 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Field(props: { label: string; hint?: string; error: string | null; id: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={props.id} className="label">
        {props.label}
        {props.hint && <span className="muted"> · {props.hint}</span>}
      </label>
      {props.children}
      {props.error && (
        <p id={`${props.id}-error`} className="field-error">
          {props.error}
        </p>
      )}
    </div>
  );
}

function ariaFor(field: FieldName, error: string | null) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${field}-error` : undefined,
  } as const;
}

function focusAndSelect(el: HTMLInputElement | null) {
  focusSoon(el, { select: true });
}

/** Focus an element that doesn't exist until the next render. */
function focusLater(get: () => HTMLElement | null) {
  requestAnimationFrame(() => focusSoon(get()));
}
