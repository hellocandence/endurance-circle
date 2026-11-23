/** WhatsApp number as digits with the country code first. A bare 10-digit number is taken as Indian (91). Null when it can't be one. */
export function normalizeNumber(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let d = input.replace(/[\s\-().+]/g, "");
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
