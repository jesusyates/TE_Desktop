/**
 * D-7-3Q / D-7-3R：浏览器 SHA-256；字段规则单源 shared/contentHashSpec.ts
 */
import {
  buildMemoryHashPayloadObject,
  buildResultHashPayloadObject,
  canonicalTaskResultForHash
} from "@shared/content-hash-spec";

export { canonicalTaskResultForHash };

export function buildResultHashPayloadJson(prompt: string, result: unknown): string {
  return JSON.stringify(buildResultHashPayloadObject(prompt, result));
}

async function sha256HexUtf8(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashResultContentAsync(prompt: string, result: unknown): Promise<string> {
  return sha256HexUtf8(buildResultHashPayloadJson(prompt, result));
}

export type MemoryHashFields = {
  prompt: string;
  requestedMode: unknown;
  resolvedMode: unknown;
  intent: unknown;
  resultKind: unknown;
  capabilityIds: string[];
  success: boolean;
  memoryType?: unknown;
  memoryKey?: unknown;
};

export function buildMemoryHashPayloadJson(fields: MemoryHashFields): string {
  return JSON.stringify(buildMemoryHashPayloadObject(fields));
}

export async function hashMemoryRecordContentAsync(fields: MemoryHashFields): Promise<string> {
  return sha256HexUtf8(buildMemoryHashPayloadJson(fields));
}
