# Motoko Mission Control v2

Next-generation AI agent orchestration platform — rebuilt as a modern monorepo.

## Architecture

```
motoko-mission-control/
├── apps/
│   ├── web/              # Next.js 15 dashboard
│   └── cli/              # Command-line tool (mmc)
├── packages/
│   ├── core/             # Shared types, utilities, constants
│   ├── db/               # Convex schema & database client
│   ├── ui/               # Design system components
│   ├── agents/           # Agent runtime, squads, dispatch
│   ├── analytics/        # Metrics, telemetry, reports
│   └── integrations/     # Webhooks, connectors
├── tooling/
│   ├── eslint-config/    # Shared ESLint config
│   └── typescript-config/# Shared TS config
└── _legacy/              # Original codebase (reference)
```

> **For AI Coding Models:** When adding features, check `_legacy/` folder first. It contains working implementations of components, Convex queries, and patterns. See `_legacy/README.md` for details on what exists and how to port it to v2.

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm (via corepack)

### Setup

```bash
# Enable pnpm
corepack enable

# Install dependencies
pnpm install

# Start development (all apps)
pnpm dev

# Or start specific apps
pnpm web dev      # Web dashboard
pnpm cli dev      # CLI build
```

### Build

```bash
# Build all packages
pnpm build

# Type check
pnpm type-check

# Lint
pnpm lint
```

## Features

### v2 Additions
- **Squad System** — Group agents with shared memory/context
- **Workflow Engine** — Visual workflow builder (planned)
- **Analytics Dashboard** — Performance metrics & reporting
- **Integration Hub** — Webhooks & service connectors
- **CLI Tool** — `mmc` command for dev workflows

### Core Capabilities
- Agent management & orchestration
- Task pipeline (kanban board)
- Real-time chat & collaboration
- Knowledge base with RAG (planned)
- OpenClaw integration

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind v4
- **Backend**: Convex (serverless database + real-time)
- **Monorepo**: pnpm workspaces, Turborepo
- **CLI**: Commander.js

## CLI Commands

```bash
mmc dev           # Start dev server
mmc build         # Build all packages
mmc agent list    # List agents
mmc deploy        # Deploy to production
```

## Development

### Adding a Package

1. Create `packages/<name>/package.json`
2. Add source files in `src/`
3. Export from `src/index.ts`
4. Add to workspace dependencies as needed

### Database Schema

Located in `packages/db/convex/schema.ts`

Run Convex dev server:
```bash
pnpm db:dev
```

## License

MIT
