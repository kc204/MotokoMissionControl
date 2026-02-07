import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

type HookEvent = {
  type: string;
  action: string;
  sessionKey: string;
  context: Record<string, unknown>;
};

type AgentEvent = {
  runId: string;
  stream: string;
  ts: number;
  sessionKey?: string;
  data?: Record<string, unknown>;
};

type AgentEventsModule = {
  onAgentEvent: (listener: (event: AgentEvent) => void | Promise<void>) => () => void;
};

const sessionInfo = new Map<string, { agentId: string; sessionId: string }>();
let registered = false;

function resolveHookEnv(context: Record<string, unknown>) {
  const cfg = context.cfg as
    | {
        hooks?: {
          internal?: {
            entries?: Record<string, { env?: Record<string, string> }>;
          };
        };
      }
    | undefined;
  const env = cfg?.hooks?.internal?.entries?.["mission-control"]?.env ?? {};
  const url = env.MISSION_CONTROL_URL || process.env.MISSION_CONTROL_URL;
  const secret =
    env.MISSION_CONTROL_WEBHOOK_SECRET || process.env.MISSION_CONTROL_WEBHOOK_SECRET;
  return { url, secret };
}

function getSessionPath(agentId: string, sessionId: string) {
  return path.join(os.homedir(), ".openclaw", "agents", agentId, "sessions", `${sessionId}.jsonl`);
}

async function readLastMessageByRole(
  sessionPath: string,
  role: "user" | "assistant"
): Promise<string | null> {
  try {
    const text = await fs.readFile(sessionPath, "utf-8");
    const lines = text.trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      let parsed: any;
      try {
        parsed = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (parsed?.type !== "message" || parsed?.message?.role !== role) continue;
      const content = parsed.message.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        const joined = content
          .filter((part: any) => part?.type === "text")
          .map((part: any) => String(part.text || ""))
          .join("\n")
          .trim();
        if (joined) return joined;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function findAgentEventsModule(): Promise<AgentEventsModule | null> {
  const globalRef = globalThis as Record<string, unknown>;
  if (
    globalRef.__openclawAgentEvents &&
    typeof (globalRef.__openclawAgentEvents as AgentEventsModule).onAgentEvent === "function"
  ) {
    return globalRef.__openclawAgentEvents as AgentEventsModule;
  }

  const mainPath = process.argv[1] || "";
  const candidates = [
    path.join(path.dirname(mainPath), "infra", "agent-events.js"),
    path.join(path.dirname(mainPath), "..", "dist", "infra", "agent-events.js"),
    "/usr/local/lib/node_modules/openclaw/dist/infra/agent-events.js",
    "/opt/homebrew/lib/node_modules/openclaw/dist/infra/agent-events.js",
    path.join(
      process.env.APPDATA || "",
      "npm",
      "node_modules",
      "openclaw",
      "dist",
      "infra",
      "agent-events.js"
    ),
  ];

  for (const candidate of candidates) {
    try {
      const module = await import(`file://${candidate}`);
      if (typeof module.onAgentEvent === "function") {
        return module as AgentEventsModule;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function postEvent(url: string, secret: string | undefined, payload: Record<string, unknown>) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["x-mission-control-secret"] = secret;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[mission-control-hook] webhook ${res.status}`);
    }
  } catch (error) {
    console.error("[mission-control-hook] webhook failed:", error);
  }
}

function pickAgentId(sessionKey?: string | null) {
  if (!sessionKey) return undefined;
  const parts = sessionKey.split(":");
  if (parts.length >= 2 && parts[0] === "agent") return parts[1];
  return undefined;
}

const handler = async (event: HookEvent) => {
  const { url, secret } = resolveHookEnv(event.context);
  if (!url) return;

  if (event.type === "agent" && event.action === "bootstrap") {
    const agentId = (event.context.agentId as string | undefined) || pickAgentId(event.sessionKey);
    const sessionId = event.context.sessionId as string | undefined;
    if (agentId && sessionId) {
      sessionInfo.set(event.sessionKey, { agentId, sessionId });
    }
    return;
  }

  if (event.type !== "gateway" || event.action !== "startup") return;
  if (registered) return;

  const mod = await findAgentEventsModule();
  if (!mod) {
    console.warn("[hook_attach_failed_nonblocking] mission-control unable to load agent-events module");
    return;
  }

  mod.onAgentEvent(async (evt) => {
    if (!evt.sessionKey) return;
    const lifecyclePhase = evt.stream === "lifecycle" ? String(evt.data?.phase || "") : "";
    const info = sessionInfo.get(evt.sessionKey);
    const agentId = info?.agentId || pickAgentId(evt.sessionKey);

    if (evt.stream === "lifecycle" && lifecyclePhase === "start") {
      const prompt =
        info && info.sessionId
          ? await readLastMessageByRole(getSessionPath(info.agentId, info.sessionId), "user")
          : null;
      await postEvent(url, secret, {
        runId: evt.runId,
        action: "start",
        sessionKey: evt.sessionKey,
        agentId,
        timestamp: new Date(evt.ts).toISOString(),
        prompt,
        eventType: "lifecycle:start",
      });
      return;
    }

    if (evt.stream === "tool" && evt.data?.phase === "start" && evt.data?.name) {
      await postEvent(url, secret, {
        runId: evt.runId,
        action: "progress",
        sessionKey: evt.sessionKey,
        agentId,
        timestamp: new Date(evt.ts).toISOString(),
        message: `Using tool: ${String(evt.data.name)}`,
        eventType: "tool:start",
      });
      return;
    }

    if (evt.stream === "assistant" && evt.data?.type === "thinking_start") {
      await postEvent(url, secret, {
        runId: evt.runId,
        action: "progress",
        sessionKey: evt.sessionKey,
        agentId,
        timestamp: new Date(evt.ts).toISOString(),
        message: "Thinking...",
        eventType: "assistant:thinking",
      });
      return;
    }

    if (evt.stream === "lifecycle" && lifecyclePhase === "end") {
      const response =
        info && info.sessionId
          ? await readLastMessageByRole(getSessionPath(info.agentId, info.sessionId), "assistant")
          : null;
      await postEvent(url, secret, {
        runId: evt.runId,
        action: "end",
        sessionKey: evt.sessionKey,
        agentId,
        timestamp: new Date(evt.ts).toISOString(),
        response,
        eventType: "lifecycle:end",
      });
      return;
    }

    if (evt.stream === "lifecycle" && lifecyclePhase === "error") {
      await postEvent(url, secret, {
        runId: evt.runId,
        action: "error",
        sessionKey: evt.sessionKey,
        agentId,
        timestamp: new Date(evt.ts).toISOString(),
        error: String(evt.data?.error || "Unknown error"),
        eventType: "lifecycle:error",
      });
    }
  });

  registered = true;
  console.log("[mission-control-hook] listener registered");
};

export default handler;
