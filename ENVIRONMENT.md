# Motoko Mission Control v2 - Environment

## Required Variables

### Web (`apps/web/.env.local`)

```env
NEXT_PUBLIC_CONVEX_URL=https://elegant-chipmunk-882.convex.cloud
```

### CLI / Runtime

Set one of:

```env
CONVEX_URL=https://elegant-chipmunk-882.convex.cloud
```

or pass `--url` to runtime start.

### DB Deploy (`packages/db/.env.deploy`)

```env
CONVEX_DEPLOYMENT=elegant-chipmunk-882
# optional if not already authenticated:
# CONVEX_DEPLOY_KEY=...
```

## Core Commands

```bash
pnpm openclaw:sync-agents
pnpm stack:elegant
pnpm runtime:start:elegant
pnpm smoke:elegant
pnpm smoke:dispatch:elegant
```

## End-to-End Expectation

To assign tasks and have agents execute them:

1. Web UI is running (`pnpm web:dev` or `pnpm stack:elegant`).
2. Runtime is running (`pnpm runtime:start:elegant`).
3. OpenClaw agents are synced from Convex (`pnpm openclaw:sync-agents`).
4. Task has assignees, then `Run / Resume Task` enqueues dispatch lanes.
5. Runtime claims lanes and completes/fails them in `taskDispatches`.

Note: `openclaw:sync-agents` can recreate existing agents if their configured model is not available locally.

## Quick Health Checks

```bash
openclaw --version
pnpm smoke:elegant
pnpm smoke:dispatch:elegant
```
