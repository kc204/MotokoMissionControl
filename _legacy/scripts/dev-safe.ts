import { existsSync } from "fs";
import { spawn } from "child_process";
import path from "path";

const lockPath = path.join(process.cwd(), ".next", "dev", "lock");

if (existsSync(lockPath)) {
  console.log(
    "[dev-safe] Detected existing Next.js dev lock. Skipping web start (another instance is already running)."
  );
  process.exit(0);
}

const isWindows = process.platform === "win32";
const child = spawn(
  isWindows ? "cmd.exe" : "npm",
  isWindows ? ["/d", "/s", "/c", "npm", "run", "dev"] : ["run", "dev"],
  {
    stdio: "inherit",
    shell: false,
  }
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("[dev-safe] Failed to start next dev:", error);
  process.exit(1);
});
