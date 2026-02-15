import { spawn } from "child_process";
import os from "os";

const IS_WINDOWS = os.platform() === "win32";

export interface OpenClawOptions {
  agentId: string;
  sessionKey?: string;
  model?: string;
}

export interface OpenClawResult {
  runId?: string;
  status?: string;
  summary?: string;
  payloads?: Array<{
    text?: string | null;
  }>;
  result?: {
    payloads?: Array<{
      text?: string | null;
    }>;
  };
}

function spawnOpenClaw(args: string[]): import("child_process").ChildProcess {
  const openclawBin = process.env.OPENCLAW_BIN || (IS_WINDOWS ? "openclaw.cmd" : "openclaw");
  
  if (IS_WINDOWS) {
    return spawn("cmd.exe", ["/d", "/s", "/c", openclawBin, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
  }
  return spawn(openclawBin, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
}

function truncate(value: string, max = 500): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 3))}...`;
}

function summarizeArgs(args: string[]): string {
  return truncate(
    args
      .map((arg) => {
        if (arg.startsWith("You are ")) {
          return `${arg.slice(0, 60)}...`;
        }
        return arg.length > 120 ? `${arg.slice(0, 117)}...` : arg;
      })
      .join(" "),
    300
  );
}

function parseOpenClawJsonOutput<T>(text: string): T {
  // Try to find JSON in the output
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed) as T;
      } catch {
        // Try next line
      }
    }
  }
  // Try parsing the whole text
  return JSON.parse(text) as T;
}

export async function runOpenClaw(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawnOpenClaw(args);
    let stdout = "";
    let stderr = "";
    
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    
    child.on("error", (error) => reject(error));
    
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `openclaw exited with code ${code}; args=${summarizeArgs(args)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export async function runOpenClawJson<T>(args: string[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const child = spawnOpenClaw(args);
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    
    child.on("error", (error) => reject(error));
    
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(stderr || `openclaw exited with code ${code}; args=${summarizeArgs(args)}`)
        );
        return;
      }

      const sources = [stdout, stderr, `${stdout}\n${stderr}`];
      for (const source of sources) {
        if (!source.trim()) continue;
        try {
          resolve(parseOpenClawJsonOutput<T>(source));
          return;
        } catch {
          // Try next source variant.
        }
      }

      const fallbackText = stdout.trim() || stderr.trim();
      if (fallbackText) {
        resolve({
          status: "error",
          summary: "non_json_output",
          result: {
            payloads: [{ text: fallbackText }],
          },
        } as T);
        return;
      }

      reject(
        new Error(
          `Failed to parse JSON output for openclaw args=${summarizeArgs(args)}; stdout="${truncate(
            stdout,
            220
          )}" stderr="${truncate(stderr, 220)}"`
        )
      );
    });
  });
}

export class OpenClawTransport {
  private agentId: string;
  private sessionKey: string;
  private model?: string;

  constructor(options: OpenClawOptions) {
    // Resolve agent ID from session key (format: "agent:{agentId}:main" or just "agent:{agentId}")
    const sessionKey = options.sessionKey || `agent:${options.agentId}`;
    this.sessionKey = sessionKey;
    
    const parts = sessionKey.split(":");
    if (parts.length >= 2 && parts[0] === "agent" && parts[1]) {
      this.agentId = parts[1];
    } else {
      this.agentId = options.agentId;
    }
    
    this.model = options.model;
  }

  async setModel(model: string): Promise<void> {
    await runOpenClaw(["models", "--agent", this.agentId, "set", model]);
  }

  async sendMessage(message: string): Promise<OpenClawResult> {
    const args = ["agent", "--agent", this.agentId, "--message", message, "--json"];
    return runOpenClawJson<OpenClawResult>(args);
  }

  async sendNotification(content: string): Promise<OpenClawResult> {
    // Notifications are sent as messages with a special prefix
    const notificationMessage = `[NOTIFICATION] ${content}`;
    return this.sendMessage(notificationMessage);
  }

  async executeTaskPrompt(prompt: string): Promise<OpenClawResult> {
    if (this.model) {
      try {
        await this.setModel(this.model);
      } catch (error) {
        // Log but continue - model setting is best effort
        console.warn(`[OpenClawTransport] Failed to set model ${this.model}:`, error);
      }
    }
    return this.sendMessage(prompt);
  }
}
