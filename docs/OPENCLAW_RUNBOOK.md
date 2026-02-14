# OpenClaw Wiring Runbook

This runbook is the concrete path from "UI works" to "real OpenClaw agents collaborate".

## 0) What must be running

Run these in separate terminals:

1. `npx convex dev`
2. `npm run dev`
3. `npm run daemon:watcher`
4. `npm run daemon:dispatch`
5. `npm run daemon:notifications`

## 1) Verify OpenClaw is healthy

Run:

- `openclaw doctor`
- `openclaw gateway start` (if doctor says gateway is down)
- `openclaw agents list --json`

Expected:

- OpenClaw command works.
- Gateway is up.
- You can list agents.

## 2) Sync Mission Control agents into OpenClaw

Your Convex `agents.sessionKey` values are source-of-truth.  
This repo now includes:

- `npm run openclaw:sync-agents`

What it does:

- Reads Convex agents list.
- Derives OpenClaw id from session key (e.g. `agent:developer:main` -> `developer`).
- Creates missing OpenClaw agents with isolated workspaces.

After sync, verify:

- `openclaw agents list --json`

## 3) Notification bridge (Convex -> OpenClaw sessions)

`scripts/poll-notifications.ts` is the bridge daemon.

It:

- Polls `notifications.getUndelivered` every 2s.
- Resolves OpenClaw session id from `openclaw sessions --json` by `sessionKey`.
- Sends message via:
  - `openclaw agent --session-id <id> --message ...` when session exists.
  - fallback `openclaw agent --agent <id> --message ...` when it does not.
- Marks delivered or records error/attempt count in Convex.

Run:

- `npm run daemon:notifications`

## 4) Task dispatch bridge (Kanban queue -> OpenClaw lanes)

`scripts/task-dispatcher.ts` drains queued Kanban dispatch rows.

It:

- Polls `tasks.claimNextDispatch`.
- Claims lanes with configurable worker concurrency.
- Builds lane prompts using task details + thread context.
- Runs `openclaw agent --agent <id> --message ... --json`.
- Marks dispatches complete or failed via Convex mutations.

Run:

- `npm run daemon:dispatch`

## 5) How to test end-to-end quickly

1. In HQ chat, send: `@Forge ping from mission control`
2. Confirm a notification row appears in Convex dashboard.
3. Confirm daemon log prints `[delivered] Forge ...`.
4. Check OpenClaw logs:
   - `openclaw logs`
5. Confirm corresponding agent session got the message:
   - `openclaw sessions --json`

## 6) Thread subscription behavior

Task-thread messages now do this automatically:

- Assignee -> subscribed
- Mentioned agent -> subscribed
- Commenting agent -> subscribed
- Subscribers receive future thread notifications without repeated mentions

This behavior is implemented in:

- `convex/messages.ts`
- `convex/tasks.ts`
- `convex/taskSubscriptions.ts`

## 7) Heartbeats (every 15 minutes)

Install/update staggered heartbeat crons:

- `npm run openclaw:setup-heartbeats`

## 8) Known constraints in current repo

- `scripts/watcher.ts` updates model/auth settings and invokes HQ orchestrator; keep it running.
- `scripts/task-dispatcher.ts` must be running for Kanban "Run / Resume Task" queue execution.
- Real Telegram -> Jarvis ingestion is outside this repo and must be configured in OpenClaw channel routing.

## 9) Environment variables

Required:

- `NEXT_PUBLIC_CONVEX_URL`

Recommended:

- `OPENCLAW_BIN=openclaw`
- `OPENCLAW_WORKSPACE_ROOT=<path>`
- `NOTIFICATION_POLL_MS=2000`
- `NOTIFICATION_BATCH_SIZE=50`
- `NOTIFICATION_OPENCLAW_TIMEOUT_MS=45000`
- `NOTIFICATION_SESSION_LOCK_BACKOFF_BASE_MS=15000`
- `NOTIFICATION_SESSION_LOCK_BACKOFF_MAX_MS=180000`
- `DISPATCH_CONCURRENCY=2`
- `DISPATCH_MESSAGE_MAX_CHARS=3500` (Windows-safe default)
- `DISPATCH_DESCRIPTION_MAX_CHARS=1800`
- `DISPATCH_NOTE_MAX_CHARS=1200`
- `DISPATCH_RATE_LIMIT_COOLDOWN_MS=600000` (provider cooldown after 429/rate-limit)
- `DISPATCH_RATE_LIMIT_FALLBACK_MODELS=kimi-coding/kimi-for-coding` (comma-separated)
- `HEARTBEAT_AGENT_TIMEOUT_MS=120000`

Optional (for local simulation only):

- `GOOGLE_API_KEY` (only needed if you still run local simulation scripts)
