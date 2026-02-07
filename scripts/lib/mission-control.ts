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
