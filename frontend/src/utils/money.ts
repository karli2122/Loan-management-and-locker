/** Parse a user-typed amount. Accepts "12,5", "1 234,56", "1,234.56", "12.5". */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = String(input).replace(/[\s\u00A0'’]/g, '').replace(/[€$£]|eur/gi, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // both present: the later one is the decimal separator, the other groups thousands
    const thousands = lastComma > lastDot ? '.' : ',';
    const dec = lastComma > lastDot ? ',' : '.';
    const [intPart, fracPart] = s.split(dec);
    if (s.split(dec).length !== 2) return null;
    if (!new RegExp(`^-?\\d{1,3}(\\${thousands}\\d{3})+$`).test(intPart)) return null;
    s = `${intPart.split(thousands).join('')}.${fracPart}`;
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = s.split(sep);
    if (parts.length === 2) {
      // one separator: decimal separator (12,5 / 12.50 / 1234,567 is rejected below by the 2-decimal rule)
      s = `${parts[0]}.${parts[1]}`;
    } else if (parts.slice(1).every((p) => p.length === 3) && /^-?\d{1,3}$/.test(parts[0])) {
      s = parts.join(''); // 1,234,567 -> thousands grouping
    } else {
      return null; // ambiguous, e.g. 1,2,3
    }
  }
  if (!/^-?\d*\.?\d+$/.test(s) && !/^-?\d+\.?$/.test(s)) return null;
  // money has at most 2 decimals; "1,234" is therefore treated as ambiguous and rejected
  const frac = s.split('.')[1];
  if (frac && frac.length > 2) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
