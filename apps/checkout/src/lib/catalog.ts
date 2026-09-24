export interface Product {
  id: string;
  name: string;
  description: string;
  merchant: string;
  /** Minor units (cents). */
  amount: number;
  currency: "USD";
  /** Shown next to the price for subscriptions, e.g. "per month". */
  interval?: string;
}

// Stands in for the product lookup a real checkout would do server-side.
// The price always comes from here, never from the host page: a merchant's
// page can't be tricked into charging a different amount.
const PRODUCTS: Record<string, Product> = {
  prod_123: {
    id: "prod_123",
    name: "Nimbus Notes Pro",
    description: "Unlimited notebooks, offline sync, and AI summaries.",
    merchant: "Nimbus Labs",
    amount: 1200,
    currency: "USD",
    interval: "per month",
  },
  prod_456: {
    id: "prod_456",
    name: "Field Guide to Type",
    description: "A 240-page ebook on typography for product teams. PDF + EPUB.",
    merchant: "Nimbus Labs",
    amount: 2900,
    currency: "USD",
  },
};

export function findProduct(id: string): Product | null {
  return Object.prototype.hasOwnProperty.call(PRODUCTS, id) ? PRODUCTS[id]! : null;
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
}
