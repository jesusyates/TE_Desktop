export type TotpAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";

export type ParsedTotpConfig = {
  secret: string;
  digits: number;
  period: number;
  algorithm: TotpAlgorithm;
  issuer?: string;
  label?: string;
};

const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD = 30;
const DEFAULT_ALGORITHM: TotpAlgorithm = "SHA-1";

function stripSpacesUpper(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

function normalizeSecretBase32(raw: string): string {
  return stripSpacesUpper(raw).replace(/=+$/, "");
}

export function isValidBase32Secret(normalized: string): boolean {
  if (!normalized || normalized.length < 8) return false;
  return /^[A-Z2-7]+$/.test(normalized);
}

function parseAlgorithm(v: string | null): TotpAlgorithm | null {
  if (!v) return null;
  const u = v.trim().toUpperCase().replace(/\s/g, "");
  if (u === "SHA1" || u === "SHA-1") return "SHA-1";
  if (u === "SHA256" || u === "SHA-256") return "SHA-256";
  if (u === "SHA512" || u === "SHA-512") return "SHA-512";
  return null;
}

function parsePositiveInt(v: string | null, fallback: number, min: number, max: number): number {
  if (v == null || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

export type TotpParseErrorKey = "empty" | "badBase32" | "missingSecret" | "badOtpauth";

export type ParseTotpInputResult =
  | { ok: true; config: ParsedTotpConfig }
  | { ok: false; errorKey: TotpParseErrorKey };

/** Trim / 去空格；otpauth URL 或纯 Base32。 */
export function parseTotpInput(input: string): ParseTotpInputResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, errorKey: "empty" };

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("otpauth://")) {
    try {
      const u = new URL(trimmed.replace(/^otpauth:/i, "http:"));
      const host = u.hostname.toLowerCase();
      if (host !== "totp") {
        return { ok: false, errorKey: "badOtpauth" };
      }
      const path = decodeURIComponent(u.pathname.replace(/^\//, ""));
      let label: string | undefined;
      let issuerFromPath: string | undefined;
      if (path.includes(":")) {
        const idx = path.indexOf(":");
        issuerFromPath = path.slice(0, idx).trim() || undefined;
        label = path.slice(idx + 1).trim() || undefined;
      } else {
        label = path || undefined;
      }
      const secretParam = u.searchParams.get("secret");
      if (!secretParam?.trim()) return { ok: false, errorKey: "missingSecret" };
      const secret = normalizeSecretBase32(secretParam);
      if (!isValidBase32Secret(secret)) return { ok: false, errorKey: "badBase32" };

      const issuerParam = u.searchParams.get("issuer")?.trim();
      const issuer = issuerParam || issuerFromPath;

      const algorithm = parseAlgorithm(u.searchParams.get("algorithm")) ?? DEFAULT_ALGORITHM;
      const digits = parsePositiveInt(u.searchParams.get("digits"), DEFAULT_DIGITS, 6, 8);
      const period = parsePositiveInt(u.searchParams.get("period"), DEFAULT_PERIOD, 5, 120);

      return {
        ok: true,
        config: {
          secret,
          digits,
          period,
          algorithm,
          issuer,
          label
        }
      };
    } catch {
      return { ok: false, errorKey: "badOtpauth" };
    }
  }

  const secret = normalizeSecretBase32(trimmed);
  if (!secret) return { ok: false, errorKey: "empty" };
  if (!isValidBase32Secret(secret)) return { ok: false, errorKey: "badBase32" };

  return {
    ok: true,
    config: {
      secret,
      digits: DEFAULT_DIGITS,
      period: DEFAULT_PERIOD,
      algorithm: DEFAULT_ALGORITHM
    }
  };
}
