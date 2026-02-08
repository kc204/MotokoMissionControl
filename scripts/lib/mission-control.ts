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
  if (trimmed === "codex-cli") return "anthropic/codex-cli";
  return trimmed;
}

export function parseOpenClawJsonOutput<T>(stdout: string): T {
  const raw = stdout.trim();
  if (!raw) {
    throw new Error("Empty JSON output");
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    const objectStart = raw.indexOf("{");
    const arrayStart = raw.indexOf("[");
    const candidates = [objectStart, arrayStart].filter((index) => index >= 0);
    if (candidates.length === 0) {
      throw new Error("No JSON payload found in output");
    }
    const start = Math.min(...candidates);
    return JSON.parse(raw.slice(start)) as T;
  }
}
