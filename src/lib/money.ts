export type MoneyLocale = "it" | "fr" | "en";

/** Strict monetary token parser. A lone separator followed by 3 digits requires an explicit locale. */
export function parseMonetaryAmount(input: string, locale?: MoneyLocale): number | null {
  let token = input.trim().replace(/\u2212/g, "-").replace(/[\u00a0\u202f]/g, " ");
  token = token.replace(/^(?:EUR|€)\s*/i, "").replace(/\s*(?:EUR|€)$/i, "").trim();
  // Also allow -€ 100,00, but never discard a sign or arbitrary surrounding text.
  token = token.replace(/^([+-])\s*(?:EUR|€)\s*/i, "$1");
  if (!/^[+-]?\d[\d., ]*$/.test(token)) return null;
  const sign = token.startsWith("-") ? -1 : 1;
  token = token.replace(/^[+-]/, "");
  let decimal: "." | "," | null = null;
  const dot = token.includes("."); const comma = token.includes(",");
  if (dot && comma) {
    decimal = token.lastIndexOf(".") > token.lastIndexOf(",") ? "." : ",";
    if (locale && decimal !== (locale === "en" ? "." : ",")) return null;
  } else if (dot || comma) {
    const separator = dot ? "." : ",";
    const parts = token.split(separator);
    if (parts.length === 2 && parts[1].length <= 2 && parts[1].length > 0) decimal = separator;
    else if (parts.every((p, i) => i === 0 || /^\d{3}$/.test(p))) {
      if (!locale || separator === (locale === "en" ? "." : ",")) return null;
    } else return null;
  }
  const parts = decimal ? token.split(decimal) : [token];
  if (parts.length > 2 || (decimal && !/^\d{1,2}$/.test(parts[1]))) return null;
  const integer = parts[0];
  if (!/^\d+$/.test(integer)) {
    const grouping = integer.includes(" ") ? " " : integer.includes(".") ? "." : ",";
    const chunks = integer.split(grouping);
    if (!/^\d{1,3}$/.test(chunks[0]) || !chunks.slice(1).every(p => /^\d{3}$/.test(p))) return null;
  }
  const result = sign * Number(integer.replace(/[., ]/g, "") + (decimal ? `.${parts[1]}` : ""));
  return Number.isFinite(result) && Math.abs(result) < 1e12 ? result : null;
}

// Extract exactly one complete monetary token from a labelled PDF field.
export function parsePdfAmount(raw: string | undefined, locale: MoneyLocale): number | null {
  if (!raw) return null;
  const normalized = raw.replace(/\u2212/g, "-");
  const tokens = normalized.match(/[+-]?\s*(?:EUR\s*|€\s*)?\d[\d.,\u00a0\u202f ]*(?:EUR|€)?/gi);
  if (!tokens || tokens.length !== 1) return null;
  return parseMonetaryAmount(tokens[0].trim(), locale);
}
export function cents(value: number) { return Math.round((value + Math.sign(value) * Number.EPSILON) * 100); }
export function roundMoney(value: number) { return cents(value) / 100; }
