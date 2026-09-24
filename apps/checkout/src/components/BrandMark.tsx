import type { Brand } from "../lib/card";

const LABELS: Record<Exclude<Brand, "unknown">, string> = {
  visa: "VISA",
  mastercard: "MC",
  amex: "AMEX",
  discover: "DISC",
};

/** A text badge instead of logo images: no network requests, no trademark assets. */
export function BrandMark({ brand }: { brand: Brand }) {
  if (brand === "unknown") {
    return (
      <span className="brand generic" aria-hidden="true">
        <svg width="22" height="16" viewBox="0 0 22 16">
          <rect x="0.75" y="0.75" width="20.5" height="14.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <rect x="1" y="4" width="20" height="2.5" fill="currentColor" />
        </svg>
      </span>
    );
  }
  return (
    <span className={`brand ${brand}`} aria-label={`${LABELS[brand]} card`}>
      {LABELS[brand]}
    </span>
  );
}
