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
  const NPX_PATH = "C:\\\\Program Files\\\\nodejs\\\\npx.cmd";
  const scriptPath = resolveScriptPath(scriptFileName);
  const argText = args.map((arg) => quoteArg(arg)).join(" ");
  return `"${NPX_PATH}" tsx ${quoteArg(scriptPath)}${argText ? ` ${argText}` : ""}`;
}

export function normalizeModelId(modelId?: string | null) {
  if (!modelId) return "";
  const trimmed = modelId.trim();
  if (!trimmed) return "";
  if (trimmed === "anthropic/codex-cli") return "codex-cli";
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

  const preferredOrder = ["openai/", "google-antigravity/", "google/", "anthropic/"];
  for (const prefix of preferredOrder) {
    const match = suffixMatches.find((id) => id.startsWith(prefix));
    if (match) return match;
  }
  return suffixMatches[0];
}

export function parseOpenClawJsonOutput<T>(stdout: string): T {
  const raw = stdout.trim();
  if (!raw) {
    throw new Error("Empty JSON output");
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
      try {
        return JSON.parse(fencedMatch[1]) as T;
      } catch {
        // Fall through to loose extraction.
      }
    }

    const objectStart = raw.indexOf("{");
    const arrayStart = raw.indexOf("[");
    const candidates = [objectStart, arrayStart].filter((index) => index >= 0);
    if (candidates.length === 0) {
      throw new Error("No JSON payload found in output");
    }
    const start = Math.min(...candidates);
    const sliced = raw.slice(start);
    try {
      return JSON.parse(sliced) as T;
    } catch {
      const objectEnd = sliced.lastIndexOf("}");
      const arrayEnd = sliced.lastIndexOf("]");
      const ends = [objectEnd, arrayEnd].filter((index) => index >= 0);
      if (ends.length === 0) {
        throw new Error("No bounded JSON payload found in output");
      }
      const end = Math.max(...ends);
      return JSON.parse(sliced.slice(0, end + 1)) as T;
    }
  }
}
