import * as Crypto from 'expo-crypto';

/**
 * HMAC-SHA256 implemented on top of expo-crypto's SHA-256 digest.
 *
 * expo-crypto exposes a one-shot digest but not HMAC, so we build HMAC per RFC
 * 2104: H((key ^ opad) || H((key ^ ipad) || msg)). Keys longer than the block
 * size (64 bytes for SHA-256) are first hashed. This is used to verify the
 * server's signed lock decision on-device; it is not a hot path (runs a few
 * times per minute), so the extra hashing is negligible.
 */

const BLOCK_SIZE = 64; // SHA-256 block size in bytes

function strToBytes(s: string): Uint8Array {
  // UTF-8 encode
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  // expo-crypto digest takes/returns ArrayBuffer-compatible data.
  const digest = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    data,
  );
  return new Uint8Array(digest);
}

/** Compute HMAC-SHA256(key, message) and return lowercase hex. */
export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  let keyBytes = strToBytes(key);
  if (keyBytes.length > BLOCK_SIZE) {
    keyBytes = await sha256Bytes(keyBytes);
  }
  const k = new Uint8Array(BLOCK_SIZE); // zero-padded
  k.set(keyBytes);

  const ipad = new Uint8Array(BLOCK_SIZE);
  const opad = new Uint8Array(BLOCK_SIZE);
  for (let i = 0; i < BLOCK_SIZE; i++) {
    ipad[i] = k[i] ^ 0x36;
    opad[i] = k[i] ^ 0x5c;
  }

  const msgBytes = strToBytes(message);
  const inner = new Uint8Array(ipad.length + msgBytes.length);
  inner.set(ipad);
  inner.set(msgBytes, ipad.length);
  const innerHash = await sha256Bytes(inner);

  const outer = new Uint8Array(opad.length + innerHash.length);
  outer.set(opad);
  outer.set(innerHash, opad.length);
  const mac = await sha256Bytes(outer);

  return bytesToHex(mac);
}

/** Constant-time hex-string comparison. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  const ab = hexToBytes(a);
  const bb = hexToBytes(b);
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
