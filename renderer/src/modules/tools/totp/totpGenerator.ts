import type { TotpAlgorithm } from "./totpParser";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 Base32 decode → raw secret bytes */
export function base32ToUint8Array(input: string): Uint8Array {
  const cleaned = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  if (!cleaned.length) return new Uint8Array(0);

  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]!);
    if (idx === -1) throw new Error("invalid_base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Uint8Array.from(output);
}

function bigEndianCounter8(step: number): ArrayBuffer {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  const high = Math.floor(step / 0x1_0000_0000);
  const low = step >>> 0;
  view.setUint32(0, high, false);
  view.setUint32(4, low, false);
  return buf;
}

function dynamicTruncation(hmac: ArrayBuffer, digits: number): string {
  const bytes = new Uint8Array(hmac);
  const offset = bytes[bytes.length - 1]! & 0x0f;
  const bin =
    ((bytes[offset]! & 0x7f) << 24) |
    ((bytes[offset + 1]! & 0xff) << 16) |
    ((bytes[offset + 2]! & 0xff) << 8) |
    (bytes[offset + 3]! & 0xff);
  const mod = 10 ** digits;
  const code = (bin % mod).toString(10);
  return code.padStart(digits, "0");
}

export type GenerateTOTPParams = {
  secret: string;
  /** 毫秒时间戳（已含偏移） */
  time: number;
  digits: number;
  period: number;
  algorithm: TotpAlgorithm;
};

/** RFC 6238 TOTP（Web Crypto HMAC-SHA-1/256/512） */
export async function generateTOTP(params: GenerateTOTPParams): Promise<string> {
  const { secret, time, digits, period, algorithm } = params;
  const keyBytes = base32ToUint8Array(secret);
  if (!keyBytes.length) throw new Error("empty_secret");

  const step = Math.floor(Math.floor(time / 1000) / period);
  const counter = bigEndianCounter8(step);

  const keyCopy = new Uint8Array(keyBytes);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyCopy,
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", cryptoKey, counter);
  return dynamicTruncation(sig, digits);
}
