import type { Appearance } from "@sdk/protocol";

/**
 * Hosts get two knobs: theme and one accent color. Not fonts, not copy, not
 * layout, not CSS. A checkout that any page can restyle is a checkout any page
 * can make look like something else — the amount, the merchant name and the
 * "who you're paying" line must always look the same.
 */
export function applyAppearance(appearance: Appearance | undefined): void {
  const root = document.documentElement;
  const theme = appearance?.theme ?? "auto";
  root.dataset.theme = theme;

  const accent = appearance?.accentColor;
  if (!accent) return;
  // Pick black or white text so the Pay button stays readable on any accent.
  const lum = relativeLuminance(accent);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--on-accent", lum > 0.45 ? "#111114" : "#ffffff");
}

export function relativeLuminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
