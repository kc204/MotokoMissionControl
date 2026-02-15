# Motoko Mission Control v2 - Environment Setup

## Required Environment Variables

### For CLI (`apps/cli/.env`)

```env
CONVEX_URL=https://elegant-chipmunk-882.convex.cloud
```

### For Web App (`apps/web/.env.local`)

```env
NEXT_PUBLIC_CONVEX_URL=https://elegant-chipmunk-882.convex.cloud
```

### For DB Package (`packages/db/.env.deploy`)

```env
CONVEX_DEPLOY_KEY=your_deploy_key_here
```

## Deployment

The Convex backend is already deployed to:
- **URL**: https://elegant-chipmunk-882.convex.cloud

## CLI Commands

```bash
# List all agents
mmc agent list

# Get agent details
mmc agent get <name>

# List tasks
mmc task list

# Get task details
mmc task get <id>

# Start the runtime
mmc runtime start
mmc runtime start --concurrency 5 --claim-ttl 120000
```

## Web App

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Type check
pnpm type-check
```

## Features

### Dashboard
- Real-time stats with agent/task counts
- Activity feed
- Quick actions
- System status

### Agents Page
- Agent cards with avatars and status indicators
- Search and filter by name, status, level
- Stats overview

### Tasks Page
- Kanban board with 6 columns (Inbox → Done)
- Drag-and-drop support (UI ready)
- Search and filter by priority/tags

### Workflows Page
- Visual workflow builder (preview)
- Node-based editor
- Template gallery

## Architecture

- **Convex Backend**: Real-time database with 14 function modules
- **Next.js Web App**: React + TypeScript + Tailwind CSS
- **CLI**: Node.js + Commander.js
- **Runtime**: WebSocket-based task dispatcher

## Tech Stack

- Frontend: Next.js 15, React 19, Tailwind CSS 4
- Backend: Convex (serverless functions + real-time subscriptions)
- CLI: Commander.js, Chalk, Ora
- TypeScript: Strict mode enabled
