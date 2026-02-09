
import { spawn } from "child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import os from "os";
import { buildTsxCommand, loadMissionControlEnv } from "./lib/mission-control";

loadMissionControlEnv();

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .-env.local");

const IS_WINDOWS = os.platform() === "win32";
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || (IS_WINDOWS ? "openclaw.cmd" : "openclaw");
const client = new ConvexHttpClient(convexUrl);

function spawnAsync(command: string, args: string[], options: import('child_process').SpawnOptions = {}) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const isWindowsCmd = IS_WINDOWS && command.endsWith('.cmd');
    const cmd = isWindowsCmd ? 'cmd.exe' : command;
    const cmdArgs = isWindowsCmd ? ['/d', '/s', '/c', command, ...args] : args;

    const child = spawn(cmd, cmdArgs, { stdio: 'pipe', ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => (stdout += data.toString()));
    child.stderr.on('data', (data) => (stderr += data.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  let agentId = "";
  let message = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--agent" && args[i + 1]) {
      agentId = args[i + 1];
      i++;
    } else if (args[i] === "--message" && args[i + 1]) {
      message = args[i + 1];
      i++;
    }
  }
  if (!agentId || !message) {
    throw new Error(`Usage: ${buildTsxCommand("invoke-agent.ts", ["--agent <id>", "--message <text>"])}`);
  }
  return { agentId, message };
}

async function main() {
  const { agentId, message } = parseArgs();
  const sessionKey = `agent:${agentId}:main`;

  const convexAgent = await client.query(api.agents.getBySessionKey, { sessionKey });
  if (!convexAgent) {
    const errorMessage = `Error: Could not find my own agent definition in Convex for sessionKey '${sessionKey}'.`;
    console.error(`[invoke] ${errorMessage}`);
    // Fallback to trying to report the error using the raw agentId
    const reportFailure = await spawnAsync(process.execPath, [buildTsxCommand("report.ts"), "chat", agentId, errorMessage]);
    if(reportFailure.code !== 0) {
      console.error(`[invoke] Failed to report failure for agent ${agentId}: ${reportFailure.stderr}`);
    }
    return;
  }
  
  const agentName = convexAgent.name;

  console.log(`[invoke] Invoking agent '${agentName}' (${agentId}) with message: "${message}"`);

  // Construct the prompt with explicit reporting instructions
  const reportCommand = `${buildTsxCommand("report.ts")} chat ${agentName}`;
  const prompt = `You are the ${agentName} agent. You have been given the following task: "${message}".
  
  Begin your work. For ALL responses, status updates, or final results, you MUST use the following command to report back to the team chat:
  
  ${reportCommand} "Your message here"
  
  Do not use any other method for communication. Do not output raw text. All output must be via the report command.`;

  const agentRun = await spawnAsync(OPENCLAW_BIN, ["agent", "--agent", agentId, "--message", prompt]);

  // The agent's stdout should be empty if it's behaving correctly.
  // We no longer pipe the response; the agent is now responsible for reporting.
  if (agentRun.code !== 0) {
    console.error(`[invoke] Agent ${agentName} process exited with code ${agentRun.code}`);
    console.error(`[invoke] stderr: ${agentRun.stderr}`);
    const reportFailure = await spawnAsync(process.execPath, [buildTsxCommand("report.ts"), "chat", agentName, `My process exited with a critical error: ${agentRun.stderr}`]);
    if(reportFailure.code !== 0) {
      console.error(`[invoke] Failed to report failure for agent ${agentName}: ${reportFailure.stderr}`);
    }
    return;
  }
  
  const agentTerminalOutput = agentRun.stdout.trim();
  if (agentTerminalOutput) {
    console.log(`[invoke] Agent '${agentName}' sent unexpected output to terminal instead of chat: "${agentTerminalOutput}"`);
    // Forward the stray output to the chat as a fallback.
    const reportStrayOutput = await spawnAsync(process.execPath, [buildTsxCommand("report.ts"), "chat", agentName, `(I accidentally spoke to the terminal, sorry.) ${agentTerminalOutput}`]);
    if(reportStrayOutput.code !== 0) {
      console.error(`[invoke] Failed to report stray output for agent ${agentName}: ${reportStrayOutput.stderr}`);
    }
  } else {
    console.log(`[invoke] Agent '${agentName}' process completed without terminal output, as expected.`);
  }
}

main().catch((error) => {
  console.error("[invoke] Fatal error:", error);
  process.exit(1);
});
