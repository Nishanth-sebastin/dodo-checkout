import { formatMoney, type Product } from "../lib/catalog";

interface Props {
  product: Product;
  email: string;
  sessionId: string;
  onDone: () => void;
}

export function SuccessView({ product, email, sessionId, onDone }: Props) {
  return (
    <div className="success" role="status">
      <div className="check" aria-hidden="true">
        <svg viewBox="0 0 52 52" width="52" height="52">
          <circle cx="26" cy="26" r="24" />
          <path d="M15 27l7 7 15-16" />
        </svg>
      </div>
      <h1 id="dialog-title">Payment successful</h1>
      <p>
        {formatMoney(product.amount, product.currency)} paid to <strong>{product.merchant}</strong> for {product.name}.
      </p>
      <p className="muted">
        Receipt sent to <strong>{email}</strong>.
      </p>
      <p className="session muted small">
        Reference <code>{sessionId}</code>
      </p>
      <button type="button" className="btn primary" onClick={onDone} data-autofocus>
        Done
      </button>
    </div>
  );
}
