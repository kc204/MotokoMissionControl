# OpenClaw Integration Guide for Mission Control

This document defines how Mission Control (Convex + Next.js) integrates with local OpenClaw agents.

## Architecture

1. Mission Control -> OpenClaw (Watcher + Orchestrator)
- Convex is the system of record.
- `scripts/watcher.ts` polls Convex and keeps OpenClaw in sync.
- `scripts/orchestrator.ts` routes new HQ user messages to the right specialist.
- Dispatch uses `openclaw agent --agent <id> --message "<prompt>" --json`.

2. OpenClaw -> Mission Control (Reporter)
- Agents report back by running `scripts/report.ts`.
- Supported report actions:
  - `chat`
  - `heartbeat`
  - `task`

3. Convex -> OpenClaw notifications (Notification daemon)
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

## Runbook

1. Start Convex + app:
- `npx convex dev`
- `npm run dev`

2. Sync agents:
- `npm run openclaw:sync-agents`

3. Start daemons:
- `npm run daemon:watcher`
- `npm run daemon:notifications`

4. Install/update heartbeat crons:
- `npm run openclaw:setup-heartbeats`

5. Smoke test:
- Post in HQ: `@Forge status check`
- Confirm orchestrator routing logs.
- Confirm notification daemon delivers queue.

## Telegram / Channel Ingress

OpenClaw receives Telegram events directly via its channel config/routing.
Mission Control does not replace this ingress path; it complements it.

For Jarvis ingress:
- Ensure Telegram is logged in (`openclaw channels list --json`).
- Ensure default route points to main agent (`openclaw agents list --json`).
- Main session key in Convex should be `agent:main:main`.

## Agent Prompt Contract

Every orchestrated prompt instructs agents to use these commands:

- `npx tsx scripts/report.ts chat <AgentName> "message"`
- `npx tsx scripts/report.ts heartbeat <AgentName> active "working..."`
- `npx tsx scripts/report.ts heartbeat <AgentName> idle "done"`

This keeps Mission Control as the shared communication ledger.
