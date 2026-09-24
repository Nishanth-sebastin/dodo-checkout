import { describe, expect, it } from "vitest";
import {
  cardNumberError,
  cvcError,
  detectBrand,
  expiryError,
  formatCardNumber,
  formatExpiry,
  luhnValid,
} from "../card";

describe("card number", () => {
  it("formats in groups of four, and Amex as 4-6-5", () => {
    expect(formatCardNumber("4242424242424242")).toBe("4242 4242 4242 4242");
    expect(formatCardNumber("378282246310005")).toBe("3782 822463 10005");
    expect(formatCardNumber("4242 4242 4242 4242 999")).toBe("4242 4242 4242 4242");
  });
  it("detects brands", () => {
    expect(detectBrand("4242")).toBe("visa");
    expect(detectBrand("5555")).toBe("mastercard");
    expect(detectBrand("2223")).toBe("mastercard");
    expect(detectBrand("3782")).toBe("amex");
    expect(detectBrand("6011")).toBe("discover");
    expect(detectBrand("9")).toBe("unknown");
  });
  it("checks Luhn on all three test cards", () => {
    expect(luhnValid("4242424242424242")).toBe(true);
    expect(luhnValid("4000000000000002")).toBe(true);
    expect(luhnValid("4000000000000341")).toBe(true);
    expect(luhnValid("4242424242424241")).toBe(false);
  });
  it("explains what's wrong", () => {
    expect(cardNumberError("")).toMatch(/Enter/);
    expect(cardNumberError("4242 4242")).toMatch(/incomplete/);
    expect(cardNumberError("4242 4242 4242 4242")).toBeNull();
  });
});

describe("expiry", () => {
  const now = new Date(2026, 8, 24);
  it("formats as the customer types", () => {
    expect(formatExpiry("1")).toBe("1");
    expect(formatExpiry("4")).toBe("04 / ");
    expect(formatExpiry("12")).toBe("12 / ");
    expect(formatExpiry("1234")).toBe("12 / 34");
    expect(formatExpiry("12 /", "12 / ")).toBe("1");
  });
  it("rejects past and impossible dates, accepts this month", () => {
    expect(expiryError("13 / 30", now)).toMatch(/month/);
    expect(expiryError("08 / 26", now)).toMatch(/expired/);
    expect(expiryError("09 / 26", now)).toBeNull();
    expect(expiryError("12 / 34", now)).toBeNull();
  });
});

describe("cvc", () => {
  it("wants 3 digits, or 4 for Amex", () => {
    expect(cvcError("123", "visa")).toBeNull();
    expect(cvcError("123", "amex")).toMatch(/4 digits/);
  });
});
