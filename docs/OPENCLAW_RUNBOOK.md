# OpenClaw Wiring Runbook

This runbook is the concrete path from "UI works" to "real OpenClaw agents collaborate".

## 0) What must be running

Run these in separate terminals:

1. `npx convex dev`
2. `npm run dev`
3. `npm run daemon:notifications`

Optional local simulation loop:

4. `npm run daemon:hivemind`

`daemon:hivemind` is a local simulation brain, not your final OpenClaw workflow.

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

## 4) How to test end-to-end quickly

1. In HQ chat, send: `@Forge ping from mission control`
2. Confirm a notification row appears in Convex dashboard.
3. Confirm daemon log prints `[delivered] Forge ...`.
4. Check OpenClaw logs:
   - `openclaw logs`
5. Confirm corresponding agent session got the message:
   - `openclaw sessions --json`

## 5) Thread subscription behavior

Task-thread messages now do this automatically:

- Assignee -> subscribed
- Mentioned agent -> subscribed
- Commenting agent -> subscribed
- Subscribers receive future thread notifications without repeated mentions

This behavior is implemented in:

- `convex/messages.ts`
- `convex/tasks.ts`
- `convex/taskSubscriptions.ts`

## 6) Heartbeats (every 15 minutes)

Add OpenClaw cron per specialist (staggered):

- `openclaw cron add --name "mc-main-heartbeat" --cron "*/15 * * * *" --session "isolated" --message "You are Jarvis. Check Mission Control notifications, assigned tasks, and activity feed. If nothing, reply HEARTBEAT_OK."`

Repeat with offsets for each specialist (`2-59/15`, `4-59/15`, etc.) and domain-specific role text.

## 7) Known constraints in current repo

- `scripts/watcher.ts` still has config-sync commands commented out (model switching not active).
- `daemon:hivemind` uses Google API directly; this is separate from OpenClaw orchestration.
- Real Telegram -> Jarvis ingestion is outside this repo and must be configured in OpenClaw channel routing.

## 8) Environment variables

Required:

- `NEXT_PUBLIC_CONVEX_URL`

Recommended:

- `OPENCLAW_BIN=openclaw`
- `OPENCLAW_WORKSPACE_ROOT=<path>`
- `NOTIFICATION_POLL_MS=2000`
- `NOTIFICATION_BATCH_SIZE=50`

Optional (for local simulation only):

- `GOOGLE_API_KEY` (used by `daemon:hivemind`)
