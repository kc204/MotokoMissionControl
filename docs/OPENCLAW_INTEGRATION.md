# OpenClaw Integration Guide for Mission Control

This document defines how Mission Control (Convex + Next.js) integrates with local OpenClaw agents.

## Architecture

1. Mission Control -> OpenClaw (Watcher + Orchestrator)
- Convex is the system of record.
- `scripts/watcher.ts` polls Convex and keeps OpenClaw in sync.
- `scripts/orchestrator.ts` routes new HQ user messages to the right specialist.
- Dispatch uses `openclaw agent --agent <id> --message "<prompt>" --json`.

2. OpenClaw -> Mission Control (Event Webhook + Reporter)
- Primary path: OpenClaw lifecycle hook posts events to Convex HTTP endpoint.
- Endpoint: `POST /openclaw/event` (implemented in `convex/http.ts`).
- Mutation: `openclaw.receiveEvent` maps run lifecycle -> task/message/activity updates.

3. OpenClaw -> Mission Control (Reporter fallback)
- Agents report back by running `report.ts` through an absolute path command generated from `MISSION_CONTROL_ROOT`.
- Supported report actions:
  - `chat`
  - `heartbeat`
  - `task`

4. Convex -> OpenClaw notifications (Notification daemon)
- `scripts/poll-notifications.ts` polls undelivered Convex notifications.
- It delivers to the correct OpenClaw session/agent turn.
- Marks notifications delivered or stores retry errors.

## Data Mapping

| Concept | Mission Control | OpenClaw |
| --- | --- | --- |
| Agent | `agents` table | `openclaw agents list` |
| Identity | `name` + `sessionKey` | `agent id` + session |
| Task | `tasks` table | agent prompt/work turn |
| Chat | `messages` table | agent message input/output |
| Auth profile | `authProfiles` table | `models auth order` |
| Lifecycle | `openclaw.receiveEvent` | hook `onAgentEvent` stream |

## Bridge Scripts

1. `scripts/watcher.ts`
- Poll loop.
- Syncs model changes from Convex to OpenClaw (`openclaw models --agent <id> set <model>`).
- Syncs active auth profile from Convex to OpenClaw (`openclaw models auth order set`).
- Triggers orchestrator run.

2. `scripts/orchestrator.ts`
- Pulls HQ messages.
- Dedupes with Convex setting key `orchestrator:last_hq_message_id`.
- Routes by mention/keywords to specialist.
- Runs real OpenClaw turn for target specialist.

3. `scripts/heartbeat-orchestrator.ts`
- Entry: `--agent <openclaw-agent-id>`.
- Pulls:
  - `notifications.getForAgent`
  - `tasks.getAssigned`
  - `activities.recent`
- Builds heartbeat prompt and runs one specialist turn.
- Marks consumed notifications delivered.

4. `scripts/poll-notifications.ts`
- Delivery bridge loop.
- Supports session-aware delivery and fallback agent-targeted delivery.
- Retries + stores attempt/error metadata.

5. `scripts/openclaw-sync-agents.ts`
- Creates missing OpenClaw agent profiles from Convex `agents` roster.

6. `scripts/setup-heartbeat-crons.ts`
- Creates/updates staggered 15-minute cron jobs:
  - `main`: `*/15`
  - `developer`: `2-59/15`
  - `writer`: `4-59/15`
  - `researcher`: `8-59/15`
  - `monitor`: `12-59/15`

7. `hooks/mission-control/handler.ts`
- User-installed OpenClaw hook.
- Registers `onAgentEvent` listener on gateway startup.
- Sends lifecycle/progress events to Mission Control webhook.

8. `scripts/install-openclaw-hook.ts`
- Installs hook files into `~/.openclaw/hooks/mission-control`.

## Runbook

1. Start Convex + app:
- `npx convex dev`
- `npm run dev`

2. Sync agents:
- `npm run openclaw:sync-agents`

3. Install hook files:
- `npm run openclaw:install-hook`

4. Configure hook env in OpenClaw config:
- `MISSION_CONTROL_URL=https://<your-convex-site>/openclaw/event`
- optional `MISSION_CONTROL_WEBHOOK_SECRET=<shared-secret>`

5. Start daemons:
- `npm run daemon:watcher`
- `npm run daemon:notifications`

6. Install/update heartbeat crons:
- `npm run openclaw:setup-heartbeats`

7. Check integration probe status:
- `npm run stack:status`

8. Smoke test:
- Post in HQ: `@Forge status check`
- Confirm orchestrator routing logs.
- Confirm notification daemon delivers queue.
- Run `openclaw agent --agent main --message "test hook"` and confirm a task is created/updated by webhook ingestion.

## Environment

- `MISSION_CONTROL_ROOT` (optional): absolute path to this repository. If omitted, scripts auto-resolve the repo root from script location.

## Telegram / Channel Ingress

OpenClaw receives Telegram events directly via its channel config/routing.
Mission Control does not replace this ingress path; it complements it.

For Jarvis ingress:
- Ensure Telegram is logged in (`openclaw channels list --json`).
- Ensure default route points to main agent (`openclaw agents list --json`).
- Main session key in Convex should be `agent:main:main`.

## Agent Prompt Contract

Every orchestrated prompt instructs agents to use these commands:

- `npx tsx "<absolute-path-to-mission-control>\\scripts\\report.ts" chat <AgentName> "message"`
- `npx tsx "<absolute-path-to-mission-control>\\scripts\\report.ts" heartbeat <AgentName> active "working..."`
- `npx tsx "<absolute-path-to-mission-control>\\scripts\\report.ts" heartbeat <AgentName> idle "done"`

This keeps Mission Control as the shared communication ledger.
