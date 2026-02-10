
import { spawn } from "child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import os from "os";
import { buildTsxCommand, loadMissionControlEnv, resolveScriptPath } from "./lib/mission-control";

loadMissionControlEnv();

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .env.local");

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
    child.stdout?.on('data', (data) => (stdout += data.toString()));
    child.stderr?.on('data', (data) => (stderr += data.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  let agentId = "";
  let message = "";
  let convexAgentName = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--agent" && args[i + 1]) {
      agentId = args[i + 1];
      i++;
    } else if (args[i] === "--message" && args[i + 1]) {
      message = args[i + 1];
      i++;
    } else if (args[i] === "--convex-agent-name" && args[i + 1]) {
      convexAgentName = args[i + 1];
      i++;
    }
  }
  if (!agentId || !message) {
    throw new Error(`Usage: ${buildTsxCommand("invoke-agent.ts", ["--agent <id>", "--message <text>"])}`);
  }
  return { agentId, message, convexAgentName };
}

async function reportToHq(convexAgentId: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const normalizedTrimmed = normalize(trimmed);
  const looksMultiline = /\r?\n/.test(trimmed);
  const hasRecentSimilarMessage = async () => {
    const recent = await client.query(api.messages.list, { channel: "hq" });
    const now = Date.now();
    return recent.some((msg: any) => {
      const senderId = (msg.fromAgentId ?? msg.agentId ?? "") as string;
      const body = (msg.text ?? msg.content ?? "").trim();
      const normalizedBody = normalize(body);
      const createdAt = Number(msg.createdAt ?? 0);
      return (
        senderId === convexAgentId &&
        (
          body === trimmed ||
          normalizedBody === normalizedTrimmed ||
          normalizedBody.startsWith(normalizedTrimmed)
        ) &&
        createdAt > 0 &&
        now - createdAt <= 30000
      );
    });
  };
  if (await hasRecentSimilarMessage()) return;
  // Avoid race with agent report command writing just before fallback posts.
  await new Promise((resolve) => setTimeout(resolve, 900));
  if (await hasRecentSimilarMessage()) return;
  // If we only saw a short partial earlier (common with multiline terminal output),
  // allow posting the full fallback to avoid losing content in HQ.
  if (looksMultiline) {
    const recent = await client.query(api.messages.list, { channel: "hq" });
    const now = Date.now();
    const partialOnly = recent.some((msg: any) => {
      const senderId = (msg.fromAgentId ?? msg.agentId ?? "") as string;
      const body = (msg.text ?? msg.content ?? "").trim();
      const normalizedBody = normalize(body);
      const createdAt = Number(msg.createdAt ?? 0);
      return (
        senderId === convexAgentId &&
        createdAt > 0 &&
        now - createdAt <= 30000 &&
        normalizedTrimmed.startsWith(normalizedBody) &&
        normalizedBody.length > 0 &&
        normalizedBody.length < normalizedTrimmed.length
      );
    });
    if (!partialOnly && (await hasRecentSimilarMessage())) return;
  }

  await client.mutation(api.messages.send, {
    channel: "hq",
    text: trimmed,
    agentId: convexAgentId as any,
    fromUser: false,
  });
}

function isIgnoredTerminalOutput(text: string) {
  const normalized = text.trim();
  return normalized === "HEARTBEAT_OK" || normalized === "NO_REPLY";
}

async function main() {
  const { agentId, message, convexAgentName } = parseArgs();
  const sessionKey = `agent:${agentId}:main`;

  const convexAgent = convexAgentName
    ? await client.query(api.agents.getByName, { name: convexAgentName })
    : await client.query(api.agents.getBySessionKey, { sessionKey });
  if (!convexAgent) {
    const errorMessage = `Error: Could not find my own agent definition in Convex for sessionKey '${sessionKey}'.`;
    console.error(`[invoke] ${errorMessage}`);
    return;
  }
  
  const agentName = convexAgent.name;

  console.log(`[invoke] Invoking agent '${agentName}' (${agentId}) with message: "${message}"`);

  // Construct the prompt with explicit reporting instructions
  const reportScriptPath = resolveScriptPath("report.ts");
  const reportCommand = `npx tsx "${reportScriptPath}" chat ${agentName}`;
  const prompt = `You are the ${agentName} agent. You have been given the following task: "${message}".
  
  Response policy:
  - If this is a simple conversational/creative ask (for example: haiku, short reply, explanation), do NOT run tools, do NOT call web/browser, and do NOT touch files.
  - For those asks, produce exactly one HQ response.
  - Only use tools/commands/files when the user explicitly asks for implementation, diagnostics, or code changes.

  Approval policy:
  - Do not start or execute any task unless the user message explicitly includes a line in this format: APPROVE: <task-id-or-name>.
  - If APPROVE is missing, ask for approval in HQ chat and wait.

  Begin your work. For ALL responses, status updates, or final results, you MUST use the following command to report back to the team chat:
  
  ${reportCommand} "Your message here"
  
  Do not use any other method for communication. Do not output raw text. All output must be via the report command.`;

  const agentRun = await spawnAsync(OPENCLAW_BIN, ["agent", "--agent", agentId, "--message", prompt]);

  // The agent's stdout should be empty if it's behaving correctly.
  // We no longer pipe the response; the agent is now responsible for reporting.
  if (agentRun.code !== 0) {
    console.error(`[invoke] Agent ${agentName} process exited with code ${agentRun.code}`);
    console.error(`[invoke] stderr: ${agentRun.stderr}`);
    try {
      await reportToHq(convexAgent._id, `My process exited with a critical error: ${agentRun.stderr}`);
    } catch (error) {
      console.error(`[invoke] Failed to report failure for agent ${agentName}:`, error);
    }
    return;
  }
  
  const agentTerminalOutput = agentRun.stdout.trim();
  if (agentTerminalOutput) {
    console.log(`[invoke] Agent '${agentName}' sent unexpected output to terminal instead of chat: "${agentTerminalOutput}"`);
    if (isIgnoredTerminalOutput(agentTerminalOutput)) {
      console.log(`[invoke] Ignoring terminal sentinel output from '${agentName}': ${agentTerminalOutput}`);
      return;
    }
    try {
      await reportToHq(convexAgent._id, agentTerminalOutput);
    } catch (error) {
      console.error(`[invoke] Failed to report stray output for agent ${agentName}:`, error);
    }
  } else {
    console.log(`[invoke] Agent '${agentName}' process completed without terminal output, as expected.`);
  }
}

main().catch((error) => {
  console.error("[invoke] Fatal error:", error);
  process.exit(1);
});
