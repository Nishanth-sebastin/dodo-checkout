export type Brand = "visa" | "mastercard" | "amex" | "discover" | "unknown";

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function detectBrand(digits: string): Brand {
  if (/^4/.test(digits)) return "visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^(6011|65|64[4-9])/.test(digits)) return "discover";
  return "unknown";
}

export function cardLength(brand: Brand): number {
  return brand === "amex" ? 15 : 16;
}

export function cvcLength(brand: Brand): number {
  return brand === "amex" ? 4 : 3;
}

/** "4242424242424242" -> "4242 4242 4242 4242"; Amex groups as 4-6-5. */
export function formatCardNumber(value: string): string {
  const brand = detectBrand(digitsOnly(value));
  const digits = digitsOnly(value).slice(0, cardLength(brand));
  const groups = brand === "amex" ? [4, 6, 5] : [4, 4, 4, 4];
  const parts: string[] = [];
  let i = 0;
  for (const size of groups) {
    if (i >= digits.length) break;
    parts.push(digits.slice(i, i + size));
    i += size;
  }
  return parts.join(" ");
}

export function luhnValid(digits: string): boolean {
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function isCardComplete(value: string): boolean {
  const digits = digitsOnly(value);
  return digits.length === cardLength(detectBrand(digits));
}

export function cardNumberError(value: string): string | null {
  const digits = digitsOnly(value);
  if (digits.length === 0) return "Enter your card number.";
  if (digits.length < cardLength(detectBrand(digits)) || !luhnValid(digits)) {
    return "This card number looks incomplete or mistyped.";
  }
  return null;
}

/** Typing "1" gives "1", "12" gives "12 / ", "4" gives "04 / " (no month starts with 4). */
export function formatExpiry(value: string, previous = ""): string {
  let digits = digitsOnly(value).slice(0, 4);
  // Deleting through the separator should delete the digit before it too.
  if (previous.endsWith(" / ") && value.length < previous.length) {
    digits = digits.slice(0, 1);
  }
  if (digits.length === 1 && Number(digits) > 1) digits = `0${digits}`;
  if (digits.length >= 2) {
    const rest = digits.slice(2);
    return `${digits.slice(0, 2)} / ${rest}`;
  }
  return digits;
}

export function isExpiryComplete(value: string): boolean {
  return digitsOnly(value).length === 4;
}

export function expiryError(value: string, now = new Date()): string | null {
  const digits = digitsOnly(value);
  if (digits.length === 0) return "Enter the expiry date.";
  if (digits.length < 4) return "Use the format MM / YY.";
  const month = Number(digits.slice(0, 2));
  const year = 2000 + Number(digits.slice(2, 4));
  if (month < 1 || month > 12) return "That month doesn't exist.";
  const endOfMonth = new Date(year, month, 1);
  if (endOfMonth <= now) return "This card has expired.";
  if (year > now.getFullYear() + 20) return "Check the expiry year.";
  return null;
}

export function cvcError(value: string, brand: Brand): string | null {
  const digits = digitsOnly(value);
  if (digits.length === 0) return "Enter the security code.";
  if (digits.length !== cvcLength(brand)) {
    return `The security code is ${cvcLength(brand)} digits.`;
  }
  return null;
}

export function emailError(value: string): string | null {
  const v = value.trim();
  if (v.length === 0) return "Enter your email for the receipt.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return "That email doesn't look right.";
  return null;
}
