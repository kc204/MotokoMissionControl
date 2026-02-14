import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function quoteArg(value: string) {
  if (/^[a-zA-Z0-9_./:\\-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function resolveMissionControlRoot() {
  const configured = process.env.MISSION_CONTROL_ROOT?.trim();
  if (configured) return path.resolve(configured);
  return path.resolve(__dirname, "..", "..");
}

export function resolveMissionControlEnvFile() {
  return path.join(resolveMissionControlRoot(), ".env.local");
}

export function loadMissionControlEnv() {
  dotenv.config({ path: resolveMissionControlEnvFile() });
}

export function resolveScriptPath(scriptFileName: string) {
  return path.join(resolveMissionControlRoot(), "scripts", scriptFileName);
}

export function buildTsxCommand(scriptFileName: string, args: string[] = []) {
  const scriptPath = resolveScriptPath(scriptFileName);
  const argText = args.map((arg) => quoteArg(arg)).join(" ");
  return `npx tsx ${quoteArg(scriptPath)}${argText ? ` ${argText}` : ""}`;
}

export function normalizeModelId(modelId?: string | null) {
  if (!modelId) return "";
  const trimmed = modelId.trim();
  if (!trimmed) return "";
  if (trimmed === "anthropic/codex-cli") return "codex-cli";
  if (trimmed === "k2p5" || trimmed === "kimi-coding/k2p5") {
    return "kimi-coding/kimi-for-coding";
  }
  return trimmed;
}

export function resolveModelFromCatalog(
  requestedModel: string,
  availableModels: Set<string>
) {
  const requested = normalizeModelId(requestedModel);
  if (!requested || availableModels.size === 0) return requested;
  if (availableModels.has(requested)) return requested;

  const suffixMatches = [...availableModels].filter((id) => id.endsWith(`/${requested}`));
  if (suffixMatches.length === 0) return requested;
  if (requested !== "codex-cli") return suffixMatches[0];

  const preferredOrder = [
    "kimi-coding/",
    "kimi-code/",
    "openai/",
    "google/",
    "anthropic/",
    "google-antigravity/",
  ];
  for (const prefix of preferredOrder) {
    const match = suffixMatches.find((id) => id.startsWith(prefix));
    if (match) return match;
  }
  return suffixMatches[0];
}

function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function tryParseJson(value: string) {
  try {
    return { ok: true as const, value: JSON.parse(value) as unknown };
  } catch {
    return { ok: false as const, value: null };
  }
}

function extractBalancedJsonBlock(text: string, start: number) {
  const first = text[start];
  if (first !== "{" && first !== "[") return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{" || ch === "[") {
      stack.push(ch);
      continue;
    }

    if (ch === "}" || ch === "]") {
      const expected = ch === "}" ? "{" : "[";
      const top = stack[stack.length - 1];
      if (top !== expected) return null;
      stack.pop();
      if (stack.length === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function isRunPayload(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.runId === "string" ||
    typeof row.status === "string" ||
    (row.result !== undefined && typeof row.result === "object")
  );
}

export function parseOpenClawJsonOutput<T>(stdout: string): T {
  const raw = stripAnsi(stdout).trim();
  if (!raw) {
    throw new Error("Empty JSON output");
  }

  const direct = tryParseJson(raw);
  if (direct.ok) return direct.value as T;

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let lastLineJson: unknown | null = null;
  for (const line of lines) {
    const parsed = tryParseJson(line);
    if (parsed.ok) {
      lastLineJson = parsed.value;
    }
  }
  if (lastLineJson !== null) return lastLineJson as T;

  const fencedMatches = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (const match of fencedMatches) {
    const inner = match[1]?.trim();
    if (!inner) continue;
    const parsed = tryParseJson(inner);
    if (parsed.ok) return parsed.value as T;
  }

  let firstParsed: unknown | null = null;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== "{" && ch !== "[") continue;
    const block = extractBalancedJsonBlock(raw, i);
    if (!block) continue;
    const parsed = tryParseJson(block);
    if (!parsed.ok) continue;
    if (isRunPayload(parsed.value)) return parsed.value as T;
    if (firstParsed === null) firstParsed = parsed.value;
  }
  if (firstParsed !== null) {
    return firstParsed as T;
  }

  throw new Error("No JSON payload found in output");
}
