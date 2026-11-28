/**
 * Dependency-free text extraction for bank statement files (PDF, ASiC-E/.asice, CSV, XML).
 * Runs in Hermes (no TextDecoder / Buffer / zlib). Used only to find the borrower's identity
 * (name, address, personal ID) on the phone, so it is deliberately best effort and never throws
 * from the exported entry points.
 */

const MAX_OUT = 400000;

// ─── base64 / text decoding ────────────────────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  t['-'.charCodeAt(0)] = 62;
  t['_'.charCodeAt(0)] = 63;
  return t;
})();

export function base64ToBytes(b64: string): Uint8Array {
  const out = new Uint8Array(Math.floor((b64.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < b64.length; i++) {
    const v = B64_LOOKUP[b64.charCodeAt(i) & 255];
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 255;
    }
  }
  return out.subarray(0, o);
}

const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];

function cp1252(code: number): number {
  return code >= 0x80 && code <= 0x9f ? CP1252_HIGH[code - 0x80] : code;
}

function fromCodes(codes: number[]): string {
  let s = '';
  for (let i = 0; i < codes.length; i += 4096) s += String.fromCharCode.apply(null, codes.slice(i, i + 4096));
  return s;
}

function latin1(bytes: Uint8Array, start = 0, end = bytes.length): string {
  let s = '';
  for (let i = start; i < end; i += 8192) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(end, i + 8192)) as any);
  }
  return s;
}

/** UTF-8 (BOM stripped); falls back to windows-1252 when the bytes are not valid UTF-8. */
export function bytesToText(bytes: Uint8Array): string {
  let i = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    const codes: number[] = [];
    for (let j = 2; j + 1 < bytes.length; j += 2) codes.push(bytes[j] | (bytes[j + 1] << 8));
    return fromCodes(codes);
  }
  const codes: number[] = [];
  let valid = true;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) { codes.push(b); i++; continue; }
    let need = 0;
    let cp = 0;
    if (b >= 0xc2 && b <= 0xdf) { need = 1; cp = b & 0x1f; }
    else if (b >= 0xe0 && b <= 0xef) { need = 2; cp = b & 0x0f; }
    else if (b >= 0xf0 && b <= 0xf4) { need = 3; cp = b & 0x07; }
    else { valid = false; break; }
    if (i + need >= bytes.length) { valid = false; break; }
    for (let k = 1; k <= need; k++) {
      const c = bytes[i + k];
      if ((c & 0xc0) !== 0x80) { valid = false; break; }
      cp = (cp << 6) | (c & 0x3f);
    }
    if (!valid) break;
    if (cp > 0xffff) {
      cp -= 0x10000;
      codes.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else codes.push(cp);
    i += need + 1;
  }
  if (valid) return fromCodes(codes);
  const out: number[] = [];
  for (let j = 0; j < bytes.length; j++) out.push(cp1252(bytes[j]));
  return fromCodes(out);
}

// ─── inflate (RFC 1950/1951), port of the classic "puff" decoder ───────────

const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huff { count: Uint16Array; symbol: Uint16Array }

function buildHuff(lengths: ArrayLike<number>, n: number, off = 0): Huff {
  const count = new Uint16Array(16);
  const symbol = new Uint16Array(n);
  for (let i = 0; i < n; i++) count[lengths[off + i]]++;
  const offs = new Uint16Array(16);
  for (let l = 1; l < 15; l++) offs[l + 1] = offs[l] + count[l];
  for (let i = 0; i < n; i++) if (lengths[off + i] !== 0) symbol[offs[lengths[off + i]]++] = i;
  return { count, symbol };
}

let FIXED: { lit: Huff; dist: Huff } | null = null;
function fixedTables() {
  if (!FIXED) {
    const l = new Uint8Array(288);
    for (let i = 0; i < 144; i++) l[i] = 8;
    for (let i = 144; i < 256; i++) l[i] = 9;
    for (let i = 256; i < 280; i++) l[i] = 7;
    for (let i = 280; i < 288; i++) l[i] = 8;
    const d = new Uint8Array(30).fill(5);
    FIXED = { lit: buildHuff(l, 288), dist: buildHuff(d, 30) };
  }
  return FIXED;
}

/** zlib stream (auto-detected header) or raw deflate. Throws on corrupt data. */
export function inflate(data: Uint8Array, maxOut = 64 * 1024 * 1024): Uint8Array {
  let pos = 0;
  if (data.length > 2 && (data[0] & 0x0f) === 8 && ((data[0] << 8) | data[1]) % 31 === 0) pos = 2;
  let bitBuf = 0;
  let bitCnt = 0;
  let out = new Uint8Array(Math.max(1024, data.length * 4));
  let op = 0;

  const bits = (need: number): number => {
    let val = bitBuf;
    while (bitCnt < need) {
      if (pos >= data.length) throw new Error('inflate: out of input');
      val |= data[pos++] << bitCnt;
      bitCnt += 8;
    }
    bitBuf = val >>> need;
    bitCnt -= need;
    return val & ((1 << need) - 1);
  };
  const ensure = (extra: number) => {
    if (op + extra > out.length) {
      if (op + extra > maxOut) throw new Error('inflate: output too large');
      const bigger = new Uint8Array(Math.min(maxOut, Math.max(out.length * 2, op + extra)));
      bigger.set(out.subarray(0, op));
      out = bigger;
    }
  };
  const decode = (h: Huff): number => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= bits(1);
      const c = h.count[len];
      if (code - c < first) return h.symbol[index + (code - first)];
      index += c;
      first += c;
      first <<= 1;
      code <<= 1;
    }
    throw new Error('inflate: bad code');
  };
  const codes = (lit: Huff, dist: Huff) => {
    for (;;) {
      let sym = decode(lit);
      if (sym < 256) { ensure(1); out[op++] = sym; }
      else if (sym === 256) return;
      else {
        sym -= 257;
        if (sym >= 29) throw new Error('inflate: bad length');
        const len = LBASE[sym] + bits(LEXT[sym]);
        const ds = decode(dist);
        if (ds >= 30) throw new Error('inflate: bad dist');
        const d = DBASE[ds] + bits(DEXT[ds]);
        if (d > op) throw new Error('inflate: dist too far');
        ensure(len);
        for (let k = 0; k < len; k++) { out[op] = out[op - d]; op++; }
      }
    }
  };

  let last = 0;
  do {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitBuf = 0; bitCnt = 0;
      if (pos + 4 > data.length) throw new Error('inflate: truncated');
      const len = data[pos] | (data[pos + 1] << 8);
      pos += 4;
      if (pos + len > data.length) throw new Error('inflate: truncated stored');
      ensure(len);
      out.set(data.subarray(pos, pos + len), op);
      op += len; pos += len;
    } else if (type === 1) {
      const t = fixedTables();
      codes(t.lit, t.dist);
    } else if (type === 2) {
      const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
      if (nlen > 286 || ndist > 30) throw new Error('inflate: bad counts');
      const lengths = new Uint8Array(320);
      for (let i = 0; i < ncode; i++) lengths[CLORD[i]] = bits(3);
      const lencode = buildHuff(lengths, 19);
      const lens = new Uint8Array(nlen + ndist);
      let idx = 0;
      while (idx < nlen + ndist) {
        let sym = decode(lencode);
        if (sym < 16) lens[idx++] = sym;
        else {
          let prev = 0, rep = 0;
          if (sym === 16) { if (idx === 0) throw new Error('inflate: no prev'); prev = lens[idx - 1]; rep = 3 + bits(2); }
          else if (sym === 17) rep = 3 + bits(3);
          else rep = 11 + bits(7);
          if (idx + rep > nlen + ndist) throw new Error('inflate: too many lengths');
          while (rep--) lens[idx++] = prev;
        }
      }
      codes(buildHuff(lens, nlen, 0), buildHuff(lens, ndist, nlen));
    } else throw new Error('inflate: bad block type');
  } while (!last);
  return out.slice(0, op);
}

// ─── ZIP ───────────────────────────────────────────────────────────────────

export function readZip(bytes: Uint8Array): { name: string; data: () => Uint8Array }[] {
  const out: { name: string; data: () => Uint8Array }[] = [];
  try {
    const u16 = (o: number) => bytes[o] | (bytes[o + 1] << 8);
    const u32 = (o: number) => (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0;
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (u32(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return out;
    const total = u16(eocd + 10);
    let p = u32(eocd + 16);
    for (let n = 0; n < total && p + 46 <= bytes.length && u32(p) === 0x02014b50; n++) {
      const method = u16(p + 10);
      const csize = u32(p + 20);
      const nlen = u16(p + 28), elen = u16(p + 30), clen = u16(p + 32);
      const lho = u32(p + 42);
      const name = bytesToText(bytes.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + elen + clen;
      if (name.endsWith('/')) continue;
      out.push({
        name,
        data: () => {
          const ln = u16(lho + 26), le = u16(lho + 28);
          const start = lho + 30 + ln + le;
          const raw = bytes.subarray(start, start + csize);
          if (method === 0) return raw;
          if (method === 8) return inflate(raw);
          throw new Error('zip: unsupported method');
        },
      });
    }
  } catch {
    /* ignore: return what we have */
  }
  return out;
}

// ─── PDF object model ──────────────────────────────────────────────────────

class Name { constructor(public n: string) {} }
class Ref { constructor(public num: number) {} }
class PStr { constructor(public s: string) {} }
class Dict { m: { [k: string]: any } = {}; }
interface PStream { dict: Dict; start: number; end: number; src: Uint8Array }
type Obj = any;

const WS = ' \t\r\n\f\0';
const DELIM = '()<>[]{}/%';

class Parser {
  constructor(public s: string, public i = 0) {}

  skipWs() {
    const s = this.s;
    for (;;) {
      const c = s[this.i];
      if (c === undefined) return;
      if (WS.indexOf(c) >= 0) this.i++;
      else if (c === '%') { while (this.i < s.length && s[this.i] !== '\n' && s[this.i] !== '\r') this.i++; }
      else return;
    }
  }

  value(depth = 0): Obj {
    if (depth > 40) throw new Error('pdf: too deep');
    this.skipWs();
    const s = this.s;
    const c = s[this.i];
    if (c === undefined) throw new Error('pdf: eof');
    if (c === '/') return this.name();
    if (c === '(') return this.litString();
    if (c === '<') {
      if (s[this.i + 1] === '<') return this.dict(depth);
      return this.hexString();
    }
    if (c === '[') {
      this.i++;
      const arr: Obj[] = [];
      for (;;) {
        this.skipWs();
        if (s[this.i] === ']') { this.i++; return arr; }
        if (this.i >= s.length) return arr;
        arr.push(this.value(depth + 1));
      }
    }
    // number, ref, keyword
    const m = /^[+-]?(?:\d+\.?\d*|\.\d+)/.exec(s.substr(this.i, 32));
    if (m) {
      const num = parseFloat(m[0]);
      const save = this.i;
      this.i += m[0].length;
      if (/^\d+$/.test(m[0])) {
        const r = /^\s+(\d+)\s+R(?![A-Za-z])/.exec(s.substr(this.i, 24));
        if (r) { this.i += r[0].length; return new Ref(num); }
      }
      void save;
      return num;
    }
    const kw = /^[^\s()<>[\]{}/%]+/.exec(s.substr(this.i, 64));
    if (!kw) { this.i++; return null; }
    this.i += kw[0].length;
    if (kw[0] === 'true') return true;
    if (kw[0] === 'false') return false;
    if (kw[0] === 'null') return null;
    return { kw: kw[0] };
  }

  name(): Name {
    this.i++;
    const s = this.s;
    let n = '';
    while (this.i < s.length) {
      const c = s[this.i];
      if (WS.indexOf(c) >= 0 || DELIM.indexOf(c) >= 0) break;
      if (c === '#' && /^[0-9a-fA-F]{2}$/.test(s.substr(this.i + 1, 2))) {
        n += String.fromCharCode(parseInt(s.substr(this.i + 1, 2), 16));
        this.i += 3;
      } else { n += c; this.i++; }
    }
    return new Name(n);
  }

  litString(): PStr {
    const s = this.s;
    this.i++;
    let depth = 1;
    let out = '';
    while (this.i < s.length) {
      const c = s[this.i++];
      if (c === '\\') {
        const d = s[this.i++];
        if (d === 'n') out += '\n';
        else if (d === 'r') out += '\r';
        else if (d === 't') out += '\t';
        else if (d === 'b') out += '\b';
        else if (d === 'f') out += '\f';
        else if (d >= '0' && d <= '7') {
          let oct = d;
          for (let k = 0; k < 2 && s[this.i] >= '0' && s[this.i] <= '7'; k++) oct += s[this.i++];
          out += String.fromCharCode(parseInt(oct, 8) & 255);
        } else if (d === '\r') { if (s[this.i] === '\n') this.i++; }
        else if (d === '\n') { /* line continuation */ }
        else out += d;
      } else if (c === '(') { depth++; out += c; }
      else if (c === ')') { depth--; if (depth === 0) break; out += c; }
      else out += c;
    }
    return new PStr(out);
  }

  hexString(): PStr {
    const s = this.s;
    this.i++;
    let hex = '';
    while (this.i < s.length && s[this.i] !== '>') {
      const c = s[this.i++];
      if (/[0-9a-fA-F]/.test(c)) hex += c;
    }
    this.i++;
    if (hex.length % 2) hex += '0';
    let out = '';
    for (let k = 0; k < hex.length; k += 2) out += String.fromCharCode(parseInt(hex.substr(k, 2), 16));
    return new PStr(out);
  }

  dict(depth: number): Dict {
    this.i += 2;
    const d = new Dict();
    for (;;) {
      this.skipWs();
      if (this.i >= this.s.length) return d;
      if (this.s[this.i] === '>' && this.s[this.i + 1] === '>') { this.i += 2; return d; }
      const k = this.value(depth + 1);
      if (!(k instanceof Name)) continue;
      d.m[k.n] = this.value(depth + 1);
    }
  }
}

class PdfDoc {
  objs = new Map<number, Obj>();
  constructor(public bytes: Uint8Array, public s: string) {}

  get(o: Obj, depth = 0): Obj {
    let cur = o;
    while (cur instanceof Ref && depth++ < 20) cur = this.objs.get(cur.num);
    return cur;
  }
  dict(o: Obj): Dict | null {
    const v = this.get(o);
    if (v instanceof Dict) return v;
    if (v && v.dict instanceof Dict) return v.dict;
    return null;
  }
  streamData(o: Obj): Uint8Array | null {
    const st: PStream | undefined = this.get(o);
    if (!st || !(st.dict instanceof Dict) || st.start === undefined) return null;
    let data: Uint8Array = st.src.subarray(st.start, st.end);
    const f = this.get(st.dict.m.Filter);
    const filters: Obj[] = f === undefined || f === null ? [] : Array.isArray(f) ? f.map((x) => this.get(x)) : [f];
    const parmsRaw = this.get(st.dict.m.DecodeParms);
    const parms: Obj[] = Array.isArray(parmsRaw) ? parmsRaw.map((x) => this.get(x)) : [parmsRaw];
    for (let k = 0; k < filters.length; k++) {
      const name = filters[k] instanceof Name ? (filters[k] as Name).n : '';
      if (name === 'FlateDecode' || name === 'Fl') {
        try { data = inflate(data); } catch { return null; }
        const pd = parms[k] instanceof Dict ? (parms[k] as Dict) : null;
        const pred = pd ? Number(this.get(pd.m.Predictor) || 1) : 1;
        if (pred >= 10) {
          data = pngUnpredict(data, Number(this.get(pd!.m.Columns) || 1), Number(this.get(pd!.m.Colors) || 1), Number(this.get(pd!.m.BitsPerComponent) || 8));
        }
      } else if (name === 'ASCIIHexDecode') {
        const t = latin1(data).replace(/[^0-9a-fA-F]/g, '');
        const b = new Uint8Array(t.length >> 1);
        for (let q = 0; q < b.length; q++) b[q] = parseInt(t.substr(q * 2, 2), 16);
        data = b;
      } else if (name === 'ASCII85Decode' || name === 'A85') {
        data = ascii85(latin1(data));
      } else return null;
    }
    return data;
  }
}

function ascii85(t: string): Uint8Array {
  const out: number[] = [];
  let i = t.indexOf('<~') >= 0 ? t.indexOf('<~') + 2 : 0;
  const group: number[] = [];
  const flush = (n: number) => {
    let v = 0;
    for (let k = 0; k < 5; k++) v = v * 85 + (k < n ? group[k] : 84);
    const b = [(v / 16777216) & 255, (v / 65536) & 255, (v / 256) & 255, v & 255];
    for (let k = 0; k < n - 1; k++) out.push(b[k]);
  };
  for (; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c === 126) break; // ~>
    if (c <= 32) continue;
    if (c === 122 && group.length === 0) { out.push(0, 0, 0, 0); continue; }
    if (c < 33 || c > 117) continue;
    group.push(c - 33);
    if (group.length === 5) { flush(5); group.length = 0; }
  }
  if (group.length > 1) flush(group.length);
  return Uint8Array.from(out);
}

function pngUnpredict(data: Uint8Array, columns: number, colors: number, bpc: number): Uint8Array {
  const bpp = Math.max(1, (colors * bpc) >> 3);
  const rowLen = (columns * colors * bpc + 7) >> 3;
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  for (let r = 0; r < rows; r++) {
    const ft = data[r * (rowLen + 1)];
    for (let c = 0; c < rowLen; c++) {
      const x = data[r * (rowLen + 1) + 1 + c];
      const a = c >= bpp ? out[r * rowLen + c - bpp] : 0;
      const b = r > 0 ? out[(r - 1) * rowLen + c] : 0;
      const cc = r > 0 && c >= bpp ? out[(r - 1) * rowLen + c - bpp] : 0;
      let v = x;
      if (ft === 1) v = x + a;
      else if (ft === 2) v = x + b;
      else if (ft === 3) v = x + ((a + b) >> 1);
      else if (ft === 4) {
        const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : cc);
      }
      out[r * rowLen + c] = v & 255;
    }
  }
  return out;
}

function loadObjects(bytes: Uint8Array): PdfDoc {
  const s = latin1(bytes);
  const doc = new PdfDoc(bytes, s);
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  const objStms: number[] = [];
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(s)) && guard++ < 400000) {
    const num = parseInt(m[1], 10);
    const p = new Parser(s, m.index + m[0].length);
    let v: Obj;
    try { v = p.value(); } catch { continue; }
    if (v instanceof Dict) {
      const after = /^\s*stream(\r\n|\n|\r)/.exec(s.substr(p.i, 16));
      if (after) {
        const start = p.i + after[0].length;
        let end = -1;
        const len = doc.get(v.m.Length);
        if (typeof len === 'number' && len >= 0 && start + len <= s.length) {
          const tail = s.substr(start + len, 24);
          if (/^\s*endstream/.test(tail)) end = start + len;
        }
        if (end < 0) {
          const e = s.indexOf('endstream', start);
          end = e < 0 ? s.length : e;
          if (s[end - 1] === '\n') end--;
          if (s[end - 1] === '\r') end--;
        }
        doc.objs.set(num, { dict: v, start, end, src: bytes } as PStream);
        const t = v.m.Type;
        if (t instanceof Name && t.n === 'ObjStm') objStms.push(num);
        re.lastIndex = Math.max(re.lastIndex, end);
        continue;
      }
    }
    doc.objs.set(num, v);
  }
  // expand object streams (objects inside never override direct ones with the same number set later)
  for (const sn of objStms) {
    try {
      const st = doc.objs.get(sn) as PStream;
      const data = doc.streamData(st);
      if (!data) continue;
      const text = latin1(data);
      const n = Number(doc.get(st.dict.m.N) || 0);
      const first = Number(doc.get(st.dict.m.First) || 0);
      const hp = new Parser(text, 0);
      const pairs: [number, number][] = [];
      for (let k = 0; k < n; k++) {
        const a = hp.value(), b = hp.value();
        if (typeof a === 'number' && typeof b === 'number') pairs.push([a, b]);
      }
      for (const [onum, off] of pairs) {
        if (doc.objs.has(onum) && !(doc.objs.get(onum) as any)?.__inObjStm) { /* a direct object of that number exists */ }
        try {
          const v = new Parser(text, first + off).value();
          if (!doc.objs.has(onum)) doc.objs.set(onum, v);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
  return doc;
}

// ─── fonts ─────────────────────────────────────────────────────────────────

interface FontInfo {
  codeLen: 1 | 2;
  map: Map<number, string> | null; // ToUnicode
  enc: string[] | null; // simple font encoding overrides (code -> char)
  type0: boolean;
}

const GLYPHS: { [k: string]: string } = {
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&', quotesingle: "'",
  parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',', hyphen: '-', minus: '-', period: '.', slash: '/',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  colon: ':', semicolon: ';', less: '<', equal: '=', greater: '>', question: '?', at: '@', bracketleft: '[', backslash: '\\',
  bracketright: ']', underscore: '_', grave: '`', braceleft: '{', bar: '|', braceright: '}', asciitilde: '~',
  adieresis: 'ä', odieresis: 'ö', udieresis: 'ü', otilde: 'õ', Adieresis: 'Ä', Odieresis: 'Ö', Udieresis: 'Ü', Otilde: 'Õ',
  scaron: 'š', Scaron: 'Š', zcaron: 'ž', Zcaron: 'Ž', eurosign: '€', Euro: '€', germandbls: 'ß', aring: 'å', Aring: 'Å',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', oacute: 'ó', uacute: 'ú', iacute: 'í', ccedilla: 'ç', ntilde: 'ñ',
  endash: '–', emdash: '—', quoteright: '’', quoteleft: '‘', bullet: '•', section: '§', degree: '°', copyright: '©',
  nbspace: ' ', nonbreakingspace: ' ', periodcentered: '·',
};

function glyphToChar(name: string): string | null {
  if (name.length === 1) return name;
  if (GLYPHS[name]) return GLYPHS[name];
  const u = /^uni([0-9A-Fa-f]{4})$/.exec(name);
  if (u) return String.fromCharCode(parseInt(u[1], 16));
  return null;
}

function hexToUtf16(hex: string): string {
  let out = '';
  for (let i = 0; i + 3 < hex.length + 0; i += 4) out += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
  if (hex.length === 2) return String.fromCharCode(parseInt(hex, 16));
  return out;
}

function parseCMap(text: string): { map: Map<number, string>; codeLen: 1 | 2 } {
  const map = new Map<number, string>();
  let codeLen: 1 | 2 = 1;
  const cs = /begincodespacerange([\s\S]*?)endcodespacerange/g;
  let m: RegExpExecArray | null;
  while ((m = cs.exec(text))) {
    const h = /<([0-9a-fA-F]+)>/.exec(m[1]);
    if (h && h[1].length >= 4) codeLen = 2;
  }
  const bf = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((m = bf.exec(text))) {
    const pr = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g;
    let p: RegExpExecArray | null;
    while ((p = pr.exec(m[1]))) map.set(parseInt(p[1], 16), hexToUtf16(p[2]));
  }
  const br = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = br.exec(text))) {
    const body = m[1];
    const pr = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]*>)/g;
    let p: RegExpExecArray | null;
    while ((p = pr.exec(body))) {
      const lo = parseInt(p[1], 16), hi = parseInt(p[2], 16);
      if (hi - lo > 65535) continue;
      if (p[3][0] === '[') {
        const items = p[3].match(/<([0-9a-fA-F]*)>/g) || [];
        for (let k = 0; k < items.length && lo + k <= hi; k++) map.set(lo + k, hexToUtf16(items[k].slice(1, -1)));
      } else {
        const dst = p[3].slice(1, -1);
        const base = dst.length >= 4 ? parseInt(dst.slice(-4), 16) : parseInt(dst || '0', 16);
        const prefix = dst.length > 4 ? hexToUtf16(dst.slice(0, -4)) : '';
        for (let c = lo; c <= hi; c++) map.set(c, prefix + String.fromCharCode(base + (c - lo)));
      }
    }
  }
  return { map, codeLen };
}

function loadFont(doc: PdfDoc, fontRef: Obj): FontInfo {
  const info: FontInfo = { codeLen: 1, map: null, enc: null, type0: false };
  const fd = doc.dict(fontRef);
  if (!fd) return info;
  const sub = doc.get(fd.m.Subtype);
  info.type0 = sub instanceof Name && sub.n === 'Type0';
  if (info.type0) info.codeLen = 2;
  const tu = fd.m.ToUnicode;
  if (tu) {
    const data = doc.streamData(tu);
    if (data) {
      const cm = parseCMap(latin1(data));
      if (cm.map.size) { info.map = cm.map; info.codeLen = info.type0 ? cm.codeLen : cm.codeLen; }
    }
  }
  if (!info.type0) {
    const enc = doc.get(fd.m.Encoding);
    const diffs = enc instanceof Dict ? doc.get(enc.m.Differences) : null;
    if (Array.isArray(diffs)) {
      const table: string[] = [];
      let code = 0;
      for (const it of diffs) {
        const v = doc.get(it);
        if (typeof v === 'number') code = v;
        else if (v instanceof Name) {
          const ch = glyphToChar(v.n);
          if (ch !== null) table[code] = ch;
          code++;
        }
      }
      info.enc = table;
    }
  }
  return info;
}

function decodeWith(font: FontInfo | null, str: string): string {
  if (!font) {
    let o = '';
    for (let i = 0; i < str.length; i++) o += String.fromCharCode(cp1252(str.charCodeAt(i)));
    return o;
  }
  let out = '';
  if (font.codeLen === 2) {
    for (let i = 0; i + 1 < str.length; i += 2) {
      const code = (str.charCodeAt(i) << 8) | str.charCodeAt(i + 1);
      const mapped = font.map ? font.map.get(code) : undefined;
      if (mapped !== undefined) out += mapped;
      else if (!font.map && code >= 0x20 && code < 0x7f) out += String.fromCharCode(code);
    }
    return out;
  }
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) & 255;
    const mapped = font.map ? font.map.get(code) : undefined;
    if (mapped !== undefined) out += mapped;
    else if (font.enc && font.enc[code] !== undefined) out += font.enc[code];
    else out += String.fromCharCode(cp1252(code));
  }
  return out;
}

// ─── content stream interpreter ────────────────────────────────────────────

interface Res { fonts: Dict | null; xobjects: Dict | null }

function resourcesOf(doc: PdfDoc, resObj: Obj, fallback: Res | null): Res {
  const rd = doc.dict(resObj);
  if (!rd) return fallback || { fonts: null, xobjects: null };
  const fonts = doc.dict(rd.m.Font) || fallback?.fonts || null;
  const xobjects = doc.dict(rd.m.XObject) || fallback?.xobjects || null;
  return { fonts, xobjects };
}

function interpret(doc: PdfDoc, data: Uint8Array, res: Res, out: string[], fontCache: Map<any, FontInfo>, depth: number, state: { y: number | null; x: number | null; len: number }) {
  const text = latin1(data);
  const p = new Parser(text, 0);
  const stack: Obj[] = [];
  let font: FontInfo | null = null;
  let leading = 0;
  let curX = 0, curY = 0, lineX = 0, lineY = 0;
  let any = false;

  const push = (t: string) => {
    if (!t) return;
    if (state.len > MAX_OUT) return;
    out.push(t);
    state.len += t.length;
  };
  const moveTo = (nx: number, ny: number) => {
    curX = nx; curY = ny;
    if (state.y !== null && Math.abs(ny - state.y) > 2) push('\n');
    else if (state.y !== null && state.x !== null && Math.abs(nx - state.x) > 0.5) push(' ');
    state.y = ny; state.x = nx;
  };

  let guard = 0;
  while (p.i < text.length && guard++ < 3000000) {
    let v: Obj;
    try { p.skipWs(); if (p.i >= text.length) break;
      // inline images: skip BI ... EI
      if (text.startsWith('BI', p.i) && /^BI[\s]/.test(text.substr(p.i, 3))) {
        const e = text.indexOf('\nEI', p.i);
        p.i = e < 0 ? text.length : e + 3;
        stack.length = 0;
        continue;
      }
      v = p.value();
    } catch { break; }
    if (v && typeof v === 'object' && 'kw' in v && !(v instanceof Name)) {
      const op = (v as any).kw as string;
      const a = stack;
      const num = (k: number) => (typeof a[k] === 'number' ? (a[k] as number) : 0);
      switch (op) {
        case 'BT': curX = curY = lineX = lineY = 0; break;
        case 'ET': push('\n'); state.y = null; state.x = null; break;
        case 'Tf': {
          const nm = a[a.length - 2];
          if (nm instanceof Name && res.fonts) {
            const ref = res.fonts.m[nm.n];
            if (ref !== undefined) {
              let fi = fontCache.get(ref instanceof Ref ? ref.num : ref);
              if (!fi) { fi = loadFont(doc, ref); fontCache.set(ref instanceof Ref ? ref.num : ref, fi); }
              font = fi;
            } else font = null;
          }
          break;
        }
        case 'TL': leading = num(0); break;
        case 'Td': lineX += num(a.length - 2); lineY += num(a.length - 1); moveTo(lineX, lineY); break;
        case 'TD': leading = -num(a.length - 1); lineX += num(a.length - 2); lineY += num(a.length - 1); moveTo(lineX, lineY); break;
        case 'Tm': lineX = num(a.length - 2); lineY = num(a.length - 1); moveTo(lineX, lineY); break;
        case 'T*': lineY -= leading; moveTo(lineX, lineY); break;
        case 'Tj': {
          const s = a[a.length - 1];
          if (s instanceof PStr) { push(decodeWith(font, s.s)); any = true; }
          break;
        }
        case "'": case '"': {
          lineY -= leading; moveTo(lineX, lineY);
          const s = a[a.length - 1];
          if (s instanceof PStr) { push(decodeWith(font, s.s)); any = true; }
          break;
        }
        case 'TJ': {
          const arr = a[a.length - 1];
          if (Array.isArray(arr)) {
            for (const el of arr) {
              if (el instanceof PStr) push(decodeWith(font, el.s));
              else if (typeof el === 'number' && el < -200) push(' ');
            }
            any = true;
          }
          break;
        }
        case 'Do': {
          const nm = a[a.length - 1];
          if (depth < 5 && nm instanceof Name && res.xobjects) {
            const xo = doc.get(res.xobjects.m[nm.n]);
            if (xo && xo.dict instanceof Dict) {
              const st = doc.get(xo.dict.m.Subtype);
              if (st instanceof Name && st.n === 'Form') {
                const xdata = doc.streamData(xo);
                if (xdata) interpret(doc, xdata, resourcesOf(doc, xo.dict.m.Resources, res), out, fontCache, depth + 1, state);
              }
            }
          }
          break;
        }
        default: break;
      }
      stack.length = 0;
    } else {
      stack.push(v);
      if (stack.length > 200) stack.shift();
    }
  }
  void any;
}

export function pdfToText(bytes: Uint8Array): string {
  try {
    if (bytes.length > 30 * 1024 * 1024) return '';
    const doc = loadObjects(bytes);
    const s = doc.s;
    if (/\/Encrypt\s+\d+\s+\d+\s+R|\/Encrypt\s*<</.test(s.slice(-4096)) || /\/Encrypt\s/.test(s.slice(-2048))) return '';

    // page list
    const pages: { dict: Dict; inheritedRes: Obj }[] = [];
    const seen = new Set<any>();
    const walk = (node: Obj, inh: Obj, depth: number) => {
      if (depth > 30 || pages.length >= 60) return;
      const d = doc.dict(node);
      if (!d || seen.has(d)) return;
      seen.add(d);
      const res = d.m.Resources !== undefined ? d.m.Resources : inh;
      const kids = doc.get(d.m.Kids);
      if (Array.isArray(kids)) { for (const k of kids) walk(k, res, depth + 1); return; }
      pages.push({ dict: d, inheritedRes: res });
    };
    const roots = [...s.matchAll(/\/Root\s+(\d+)\s+\d+\s+R/g)];
    if (roots.length) {
      const cat = doc.dict(new Ref(parseInt(roots[roots.length - 1][1], 10)));
      if (cat) walk(cat.m.Pages, undefined, 0);
    }
    if (!pages.length) {
      for (const [, o] of doc.objs) {
        const d = o instanceof Dict ? o : null;
        const t = d ? doc.get(d.m.Type) : null;
        if (d && t instanceof Name && t.n === 'Page') pages.push({ dict: d, inheritedRes: d.m.Resources });
        if (pages.length >= 60) break;
      }
    }

    const out: string[] = [];
    const fontCache = new Map<any, FontInfo>();
    const state = { y: null as number | null, x: null as number | null, len: 0 };
    for (const pg of pages) {
      const contents = doc.get(pg.dict.m.Contents);
      const list: Obj[] = Array.isArray(contents) ? contents : contents === undefined ? [] : [pg.dict.m.Contents];
      const parts: Uint8Array[] = [];
      let total = 0;
      for (const c of list) {
        const d = doc.streamData(c);
        if (d && d.length < 8 * 1024 * 1024) { parts.push(d); total += d.length + 1; }
      }
      if (!parts.length) continue;
      const joined = new Uint8Array(total);
      let o = 0;
      for (const part of parts) { joined.set(part, o); o += part.length; joined[o++] = 10; }
      interpret(doc, joined, resourcesOf(doc, pg.inheritedRes, null), out, fontCache, 0, state);
      out.push('\n');
      state.y = null; state.x = null;
      if (state.len > MAX_OUT) break;
    }
    return tidy(out.join(''));
  } catch {
    return '';
  }
}

function tidy(t: string): string {
  return t
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, MAX_OUT);
}

/** Flatten XML to lines; camt.053 account owner / postal address become "label: value" lines. */
function xmlToText(xml: string): string {
  const extra: string[] = [];
  const owner = /<Ownr>([\s\S]*?)<\/Ownr>/.exec(xml);
  if (owner) {
    const nm = /<Nm>([^<]+)<\/Nm>/.exec(owner[1]);
    if (nm) extra.push(`Konto omanik: ${nm[1].trim()}`);
    const lines = (owner[1].match(/<AdrLine>([^<]+)<\/AdrLine>/g) || []).map((l) => l.replace(/<[^>]+>/g, '').trim());
    const street = /<StrtNm>([^<]+)<\/StrtNm>/.exec(owner[1]);
    const bld = /<BldgNb>([^<]+)<\/BldgNb>/.exec(owner[1]);
    const post = /<PstCd>([^<]+)<\/PstCd>/.exec(owner[1]);
    const town = /<TwnNm>([^<]+)<\/TwnNm>/.exec(owner[1]);
    const addr = lines.length
      ? lines.join(', ')
      : [street && `${street[1]}${bld ? ' ' + bld[1] : ''}`, post && post[1], town && town[1]].filter(Boolean).join(', ');
    if (addr) extra.push(`Aadress: ${addr}`);
  }
  const flat = xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return tidy(`${extra.join('\n')}\n${flat}`);
}

// ─── entry point ───────────────────────────────────────────────────────────

export function statementBytesToText(bytes: Uint8Array, fileName: string): string {
  try {
    const name = (fileName || '').toLowerCase();
    const isPdf = name.endsWith('.pdf') || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
    if (isPdf) return pdfToText(bytes);
    const isZip = name.endsWith('.asice') || name.endsWith('.zip') || name.endsWith('.bdoc') || (bytes[0] === 0x50 && bytes[1] === 0x4b);
    if (isZip) {
      const files = readZip(bytes).filter((f) => !/^META-INF\//i.test(f.name) && f.name !== 'mimetype');
      const by = (re: RegExp, skip?: RegExp) => files.find((f) => re.test(f.name.toLowerCase()) && !(skip && skip.test(f.name.toLowerCase())));
      const pdf = by(/\.pdf$/);
      if (pdf) return pdfToText(pdf.data());
      const xml = by(/\.xml$/, /signature|manifest/);
      if (xml) return xmlToText(bytesToText(xml.data()));
      const csv = by(/\.(csv|txt)$/);
      if (csv) return tidy(bytesToText(csv.data()));
      const other = files[0];
      return other ? tidy(bytesToText(other.data())) : '';
    }
    const plain = bytesToText(bytes);
    if (name.endsWith('.xml') || /^\s*<\?xml/.test(plain.slice(0, 64))) return xmlToText(plain);
    return tidy(plain);
  } catch {
    return '';
  }
}
