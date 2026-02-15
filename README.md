# Motoko Mission Control v2

Next-generation AI agent orchestration platform in a pnpm monorepo.

## Repo Layout

```text
motoko-mission-control/
|- apps/
|  |- web/            # Next.js dashboard
|  `- cli/            # mmc CLI
|- packages/
|  |- db/             # Convex schema + functions
|  |- agents/         # Unified runtime (dispatch + notifications)
|  |- core/
|  |- ui/
|  |- analytics/
|  `- integrations/
|- tooling/
`- _legacy/           # Reference implementation
```

## Prerequisites

- Node.js 20+
- pnpm (`corepack enable`)
- OpenClaw installed and available on PATH (`openclaw --version`)

## Setup

```bash
pnpm install
```

## Development

### Local Convex + Web

```bash
pnpm start
```

### Elegant Deployment + Web + Runtime

```bash
pnpm openclaw:sync-agents
pnpm stack:elegant
```

This is the easiest way to ensure queued task dispatches are actually processed by agents.
`openclaw:sync-agents` reconciles missing agents and can recreate mismatched-model agents with a valid local model.

## Runtime

The unified runtime replaces legacy watcher/dispatch/notification daemons.

```bash
pnpm runtime:start
pnpm runtime:start:elegant
```

Runtime behavior:
- Claims pending task dispatches and executes OpenClaw runs.
- Claims undelivered notifications and forwards them to agent sessions.
- Honors `settings.getAutomationConfig` flags.
- Publishes the `watcher:leader` lease heartbeat for ops health.

## Validation

```bash
pnpm --filter @motoko/web type-check
pnpm --filter @motoko/web lint
pnpm --filter @motoko/web build
pnpm smoke:elegant
pnpm smoke:dispatch:elegant
```

## Convex

```bash
pnpm db:dev
pnpm db:deploy
pnpm db:seed
```

## Useful CLI

```bash
pnpm --filter @motoko/cli build
node apps/cli/dist/index.js agent list
node apps/cli/dist/index.js task list
node apps/cli/dist/index.js runtime sync-agents --url https://elegant-chipmunk-882.convex.cloud
node apps/cli/dist/index.js runtime start --url https://elegant-chipmunk-882.convex.cloud
```
