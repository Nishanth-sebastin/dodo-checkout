import { forwardRef, useEffect, type ReactNode } from "react";

interface ShellProps {
  children: ReactNode;
  leaving: boolean;
  onDismiss: () => void;
  canDismiss: () => boolean;
  /** While a charge is in flight the close button stays visible but inert, and says why. */
  closeDisabled: boolean;
  /** The embedding page, as the browser reports it. */
  hostLabel: string;
  merchant: string | null;
}

/**
 * The frame around every state: backdrop, dialog, and the two lines that
 * never change — who you're paying, and on which site.
 */
export const Shell = forwardRef<HTMLDivElement, ShellProps>(function Shell(
  { children, leaving, onDismiss, canDismiss, closeDisabled, hostLabel, merchant },
  ref,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && canDismiss()) onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss, canDismiss]);

  return (
    <div className={`backdrop${leaving ? " leaving" : ""}`} onMouseDown={(e) => {
      if (e.target === e.currentTarget && canDismiss()) onDismiss();
    }}>
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <header className="topbar">
          <div className="origin" title={`This checkout was opened by ${hostLabel}`}>
            <LockIcon />
            <span>
              {merchant ? <strong>{merchant}</strong> : "Checkout"}
              <span className="via"> · on {hostLabel}</span>
            </span>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label={closeDisabled ? "Close checkout (unavailable while your payment is processing)" : "Close checkout"}
            title={closeDisabled ? "Your payment is processing" : "Close"}
            aria-disabled={closeDisabled || undefined}
            onClick={() => canDismiss() && onDismiss()}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="body">{children}</div>
        <footer className="foot">
          <span className="foot-brand">
            <ShieldIcon />
            <span>
              Secured by <strong>Dodo Payments</strong>
            </span>
          </span>
          <span className="foot-note">{hostLabel} never sees your card details</span>
        </footer>
      </div>
    </div>
  );
});

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M8 1 2.5 3v4.3c0 3.4 2.3 6.3 5.5 7.7 3.2-1.4 5.5-4.3 5.5-7.7V3L8 1Zm-.9 9.6L4.6 8.1l1-1 1.5 1.5 3.3-3.3 1 1-4.3 4.3Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
