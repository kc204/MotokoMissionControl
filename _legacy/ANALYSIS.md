# Legacy Mission Control Analysis

## Architecture Overview

The legacy codebase is a **single Next.js app** with Convex backend. It orchestrates AI agents through OpenClaw integration.

### Key Components

#### 1. Database (Convex)
- **agents**: Agent registry with model config, status, session keys
- **tasks**: Kanban-style task management with planning workflow
- **messages**: Chat system with mentions parsing
- **notifications**: Delivery queue for agent alerts
- **taskDispatches**: Job queue for agent task execution
- **documents**: File attachments and deliverables
- **activities**: Audit log for all system events

#### 2. Backend Scripts (Node.js daemons)
- **watcher.ts**: Polls Convex, syncs auth/models to OpenClaw
- **orchestrator.ts**: Routes HQ messages to specialists
- **task-dispatcher.ts**: Claims queued dispatches, runs agent lanes
- **poll-notifications.ts**: Delivers notifications to agents via OpenClaw
- **heartbeat-orchestrator.ts**: Periodic check for stuck tasks
- **invoke-agent.ts**: Spawns OpenClaw agents with prompts

#### 3. Frontend (Next.js)
- **page.tsx**: Mission Control dashboard with agent cards
- **kanban/page.tsx**: Task board with drag-drop
- **hq/page.tsx**: Chat interface for agent communication
- **settings/page.tsx**: Configuration UI

## Pain Points Identified

### 1. Excessive Polling Architecture
**Problem**: Multiple scripts poll Convex independently
- watcher.ts: Polls for model/auth changes
- poll-notifications.ts: Polls for undelivered notifications every 2s
- orchestrator.ts: Polls HQ messages
- heartbeat-orchestrator.ts: Periodic heartbeats

**Impact**: High CPU/database load, latency in message delivery

**Solution (v2)**: Use Convex subscriptions (WebSockets) instead of polling

### 2. Monolithic Script Design
**Problem**: Each script is a standalone Node.js process with duplicate boilerplate
- Repeated Convex client setup
- Repeated environment loading
- Repeated OpenClaw CLI spawning logic

**Impact**: Hard to maintain, inconsistent error handling

**Solution (v2)**: Unified agent runtime package with shared abstractions

### 3. Tight Coupling to OpenClaw CLI
**Problem**: Direct `child_process.spawn()` calls to `openclaw` binary throughout codebase
- Hard to test without real OpenClaw
- No abstraction layer for agent communication
- Platform-specific logic (Windows vs Unix)

**Impact**: Vendor lock-in, difficult to mock/test

**Solution (v2)**: Abstract agent runtime interface, pluggable backends

### 4. No Squad/Multi-Agent Coordination
**Problem**: Agents are isolated; no built-in way to form teams
- No shared memory between agents
- No squad-level task assignment
- Each agent operates independently

**Impact**: Limited scalability for complex workflows

**Solution (v2)**: Squad system with shared context/memory

### 5. Missing Workflow Engine
**Problem**: Task dispatch is linear; no conditional logic or branching
- Simple queue-based dispatch
- No visual workflow builder
- Hard to model complex business processes

**Impact**: Limited automation capabilities

**Solution (v2)**: Visual workflow builder with node-based logic

### 6. Lack of Observability
**Problem**: Limited metrics and monitoring
- Activities table exists but no analytics
- No performance dashboards
- No cost tracking per agent/task

**Impact**: Can't optimize agent utilization or track ROI

**Solution (v2)**: Analytics package with metrics, telemetry, reports

### 7. Integration Silos
**Problem**: Each external service needs custom scripting
- Telegram bridge is custom
- OpenClaw integration is tightly coupled
- No generic webhook/API integration framework

**Impact**: High effort to add new integrations

**Solution (v2)**: Integration hub with connectors, webhook handlers

## Recommendations for v2

### Keep (Working Well)
1. **Convex as database**: Real-time, serverless, excellent DX
2. **Task dispatch queue**: Robust pattern for agent work distribution
3. **Notification system**: Good abstraction for agent alerts
4. **Planning workflow**: Questions → Draft → Approve pattern is solid
5. **Activity logging**: Comprehensive audit trail

### Refactor (High Priority)
1. **Unify daemon scripts**: Single agent runtime service
2. **Replace polling with subscriptions**: WebSocket-based updates
3. **Abstract OpenClaw integration**: Interface-based design
4. **Extract business logic**: Move from scripts to packages

### Add (New Capabilities)
1. **Squad system**: Agent teams with shared memory
2. **Workflow engine**: Visual builder for complex automations
3. **Analytics dashboard**: Metrics, costs, performance
4. **Integration hub**: Generic connectors for external services
5. **Knowledge base**: RAG-powered document retrieval
6. **CLI tool**: Better developer experience than npm scripts
7. **Memory system**: Long-term agent memory with semantic search

### Architecture Changes

```
Legacy:                     v2:
┌─────────────────┐        ┌─────────────────────────────┐
│ Single Next.js  │        │ Monorepo                    │
│   + Scripts     │   →    │ ├─ apps/web (Next.js 15)    │
│                 │        │ ├─ apps/cli (Commander)     │
│ Manual polling  │        │ ├─ packages/agents (runtime)│
│ Tight coupling  │        │ ├─ packages/analytics       │
│                 │        │ ├─ packages/integrations    │
│                 │        │ └─ packages/core (types)    │
└─────────────────┘        └─────────────────────────────┘
```

## Migration Strategy

1. **Phase 1**: Port Convex schema to packages/db with improvements
2. **Phase 2**: Build packages/agents runtime to replace daemon scripts
3. **Phase 3**: Rebuild UI in apps/web with new features
4. **Phase 4**: Add analytics, workflow engine, integrations
5. **Phase 5**: Deprecate legacy scripts

## Key Metrics to Track

- Message delivery latency (target: <100ms vs current 2s poll)
- Agent utilization rate
- Task completion time
- Cost per task
- System reliability (uptime, error rates)
