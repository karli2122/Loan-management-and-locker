/**
 * Pulls the borrower's identity (first name, last name, address, Estonian personal ID)
 * out of bank statement text and/or the analyzer response. Everything is best effort:
 * a value that cannot be found is left empty so the admin can type it in.
 */

export interface StatementIdentity {
  firstName: string;
  lastName: string;
  address: string;
  personalId: string;
  /** which pieces were found, for the "filled from statement" hint */
  found: { name: boolean; address: boolean; personalId: boolean };
}

export interface IsikukoodCheck {
  valid: boolean;
  /** 'format' | 'date' | 'checksum' when invalid */
  reason?: 'empty' | 'format' | 'date' | 'checksum';
  birthDate?: string; // YYYY-MM-DD
  gender?: 'male' | 'female';
}

/** Estonian personal ID (isikukood): G YYMMDD SSS C. */
export function checkIsikukood(raw: string | null | undefined): IsikukoodCheck {
  const code = String(raw ?? '').replace(/\s+/g, '');
  if (!code) return { valid: false, reason: 'empty' };
  if (!/^[1-8]\d{10}$/.test(code)) return { valid: false, reason: 'format' };

  const g = Number(code[0]);
  const century = g <= 2 ? 1800 : g <= 4 ? 1900 : g <= 6 ? 2000 : 2100;
  const yy = Number(code.slice(1, 3));
  const mm = Number(code.slice(3, 5));
  const dd = Number(code.slice(5, 7));
  const year = century + yy;
  const d = new Date(Date.UTC(year, mm - 1, dd));
  const dateOk = d.getUTCFullYear() === year && d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd;
  if (!dateOk) return { valid: false, reason: 'date' };

  const digits = code.split('').map(Number);
  const sum = (weights: number[]) => weights.reduce((acc, w, i) => acc + w * digits[i], 0);
  let check = sum([1, 2, 3, 4, 5, 6, 7, 8, 9, 1]) % 11;
  if (check === 10) {
    check = sum([3, 4, 5, 6, 7, 8, 9, 1, 2, 3]) % 11;
    if (check === 10) check = 0;
  }
  if (check !== digits[10]) return { valid: false, reason: 'checksum' };

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    valid: true,
    birthDate: `${year}-${pad(mm)}-${pad(dd)}`,
    gender: g % 2 === 1 ? 'male' : 'female',
  };
}

const ID_LABEL = /(isikukood|isikukoodi|personal\s*(?:id|code|number|identification)|id[\s-]*code|national\s*id|reg(?:istri)?kood)/i;
const NAME_LABEL = /^(?:kliendi\s+nimi|konto\s+omanik|kontoomanik|omaniku\s+nimi|omanik|account\s+holder|account\s+owner|client\s+name|customer\s+name|nimi|name)\s*[:\-–]\s*(.+)$/i;
const ADDRESS_LABEL = /^(?:aadress|postiaadress|elukoha\s+aadress|elukoht|address|postal\s+address|home\s+address)\s*[:\-–]\s*(.*)$/i;

const clean = (s: string) => s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

const titleCase = (s: string) =>
  s
    .toLocaleLowerCase('et')
    .replace(/(^|[\s\-'’])(\p{L})/gu, (_m, sep, ch) => sep + ch.toLocaleUpperCase('et'));

/** "MARI-LIIS ÕUNAPUU" / "Õunapuu, Mari-Liis" / "Mari-Liis Õunapuu 49403136515" -> first + last */
export function splitName(rawName: string | null | undefined): { firstName: string; lastName: string } {
  let s = clean(String(rawName ?? ''));
  if (!s) return { firstName: '', lastName: '' };
  s = s.replace(/\b\d{8,}\b/g, '').replace(/[()]/g, ' ');
  s = clean(s);
  if (!s) return { firstName: '', lastName: '' };
  const looksUpper = s === s.toLocaleUpperCase('et') && s !== s.toLocaleLowerCase('et');
  if (s.includes(',')) {
    const [last, ...rest] = s.split(',');
    const fix = (x: string) => (looksUpper ? titleCase(clean(x)) : clean(x));
    return { firstName: fix(rest.join(' ')), lastName: fix(last) };
  }
  const fixed = looksUpper ? titleCase(s) : s;
  const parts = fixed.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  const lastName = parts[parts.length - 1];
  return { firstName: parts.slice(0, -1).join(' '), lastName };
}

/** Choose the personal ID: labelled + valid > any valid (strong pattern) > labelled but invalid. */
export function findPersonalId(text: string): { id: string; valid: boolean } | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const labelled: string[] = [];
  const any: string[] = [];
  const re = /(?<!\d)[1-8]\d{10}(?!\d)/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hasLabel = ID_LABEL.test(line);
    const near = hasLabel ? `${line}\n${lines[i + 1] ?? ''}` : line;
    const matches = near.match(re) || [];
    for (const m of matches) (hasLabel ? labelled : any).push(m);
    if (hasLabel && !matches.length) {
      // label and number split by spaces, e.g. "4 9403136515" is not supported on purpose
      continue;
    }
  }
  const pick = (list: string[]) => list.find((c) => checkIsikukood(c).valid);
  const l = pick(labelled);
  if (l) return { id: l, valid: true };
  const a = pick(any);
  if (a) return { id: a, valid: true };
  if (labelled.length) return { id: labelled[0], valid: false };
  return null;
}

export function extractIdentity(
  text: string | null | undefined,
  analysis?: any,
): StatementIdentity {
  const t = String(text ?? '');
  const lines = t.split(/\r?\n/).map((l) => clean(l)).filter(Boolean);

  // 1) a structured answer from the server wins (newer backend), else 2) text labels, else 3) account_holder
  const srv = analysis?.identity || analysis?.account_holder_details || null;
  let first = '';
  let last = '';
  let nameFound = false;
  if (srv && (srv.first_name || srv.last_name)) {
    first = clean(String(srv.first_name ?? ''));
    last = clean(String(srv.last_name ?? ''));
    nameFound = !!(first || last);
  }
  if (!nameFound) {
    for (const line of lines) {
      const m = line.match(NAME_LABEL);
      if (m && /\p{L}/u.test(m[1]) && m[1].length < 80) {
        const parts = splitName(m[1]);
        if (parts.firstName || parts.lastName) {
          first = parts.firstName;
          last = parts.lastName;
          nameFound = true;
          break;
        }
      }
    }
  }
  const BANKISH = /\b(seb|pank|bank|swedbank|lhv|luminor|coop)\b/i;
  if (!nameFound && analysis?.account_holder && !BANKISH.test(String(analysis.account_holder))) {
    const parts = splitName(analysis.account_holder);
    first = parts.firstName;
    last = parts.lastName;
    nameFound = !!(first || last);
  }

  let address = '';
  if (srv?.address) address = clean(String(srv.address));
  if (!address) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(ADDRESS_LABEL);
      if (!m) continue;
      let a = clean(m[1]);
      // address often continues on the next line (postcode + city)
      const next = lines[i + 1];
      if (next && /^\d{4,5}\b|^[A-ZÕÄÖÜŠŽ][\p{L}\- ]+$/u.test(next) && next.length < 50 && !ADDRESS_LABEL.test(next) && !NAME_LABEL.test(next) && !ID_LABEL.test(next)) {
        a = clean(`${a}${a ? ', ' : ''}${next}`);
      }
      if (a) { address = a; break; }
    }
  }

  let personalId = '';
  let idFound = false;
  const srvId = srv?.personal_id ?? srv?.isikukood;
  if (srvId) { personalId = String(srvId).replace(/\s+/g, ''); idFound = true; }
  else {
    const f = findPersonalId(t);
    if (f) { personalId = f.id; idFound = true; }
  }

  return {
    firstName: first,
    lastName: last,
    address,
    personalId,
    found: { name: nameFound, address: !!address, personalId: idFound },
  };
}
