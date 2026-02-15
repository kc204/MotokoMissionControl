import { mkdirSync, copyFileSync } from "fs";
import path from "path";
import os from "os";

const repoRoot = process.cwd();
const sourceDir = path.join(repoRoot, "hooks", "mission-control");
const targetDir = path.join(os.homedir(), ".openclaw", "hooks", "mission-control");

mkdirSync(targetDir, { recursive: true });
copyFileSync(path.join(sourceDir, "HOOK.md"), path.join(targetDir, "HOOK.md"));
copyFileSync(path.join(sourceDir, "handler.ts"), path.join(targetDir, "handler.ts"));

console.log(`Installed mission-control hook to ${targetDir}`);
console.log("Next:");
console.log("1) Configure MISSION_CONTROL_URL in openclaw hook env");
console.log("2) Restart gateway: openclaw gateway restart (or openclaw gateway)");
