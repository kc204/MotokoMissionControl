# Mission Control - Architecture Spec

## Overview
A personal AI workforce command center. Manage multiple OpenClaw agents across any project.

## Tech Stack
- **Database:** Convex (real-time, serverless)
- **Frontend:** Next.js + React
- **Styling:** Tailwind CSS
- **Hosting:** Vercel (free tier)
- **Notifications:** Daemon polling Convex → OpenClaw sessions

---

## Database Schema (Convex)

### `agents`
```typescript
{
  _id: Id<"agents">,
  name: string,              // "Motoko", "Forge", "Quill"
  role: string,              // "Squad Lead", "Developer", "Writer"
  status: "idle" | "active" | "blocked",
  currentTaskId?: Id<"tasks">,
  sessionKey: string,        // "agent:main:main"
  avatar?: string,           // URL or emoji
  
  // Model Configuration
  models: {
    thinking: string,        // "google-antigravity/claude-opus-4-5-thinking"
    execution?: string,      // "codex-cli" (for Forge)
    heartbeat: string,       // "google/gemini-2.5-flash"
    fallback: string,        // "google-antigravity/claude-sonnet-4-5"
  },
  
  createdAt: number,
  updatedAt: number,
}
```

### `projects`
```typescript
{
  _id: Id<"projects">,
  name: string,              // "TradingisEZ", "Personal", "R&D"
  color: string,             // "#3B82F6"
  icon?: string,             // "💹"
  createdAt: number,
}
```

### `tasks`
```typescript
{
  _id: Id<"tasks">,
  title: string,
  description: string,
  status: "inbox" | "assigned" | "in_progress" | "review" | "done" | "blocked",
  priority: "low" | "medium" | "high" | "urgent",
  projectId?: Id<"projects">,
  assigneeIds: Id<"agents">[],
  createdBy: string,         // "user" or agent name
  
  // Metadata
  createdAt: number,
  updatedAt: number,
  completedAt?: number,
}
```

### `messages`
```typescript
{
  _id: Id<"messages">,
  taskId: Id<"tasks">,
  fromAgentId?: Id<"agents">,  // null if from user
  fromUser?: boolean,
  content: string,
  attachments?: Id<"documents">[],
  mentions?: string[],         // ["@Forge", "@all"]
  createdAt: number,
}
```

### `activities`
```typescript
{
  _id: Id<"activities">,
  type: "task_created" | "task_updated" | "message_sent" | "agent_status_changed" | "document_created",
  agentId?: Id<"agents">,
  taskId?: Id<"tasks">,
  projectId?: Id<"projects">,
  message: string,            // Human-readable activity description
  createdAt: number,
}
```

### `documents`
```typescript
{
  _id: Id<"documents">,
  title: string,
  content: string,            // Markdown
  type: "deliverable" | "research" | "spec" | "note",
  taskId?: Id<"tasks">,
  projectId?: Id<"projects">,
  createdBy: string,
  createdAt: number,
  updatedAt: number,
}
```

### `notifications`
```typescript
{
  _id: Id<"notifications">,
  targetAgentId: Id<"agents">,
  content: string,
  sourceTaskId?: Id<"tasks">,
  sourceMessageId?: Id<"messages">,
  delivered: boolean,
  deliveredAt?: number,
  createdAt: number,
}
```

### `settings`
```typescript
{
  _id: Id<"settings">,
  key: string,                // "model_presets", "heartbeat_interval", etc.
  value: any,
  updatedAt: number,
}
```

---

## Frontend Pages

### `/` - Dashboard
- Activity feed (real-time)
- Agent status cards (who's active)
- Quick stats (tasks in progress, completed today)

### `/tasks` - Kanban Board
- Columns: Inbox → Assigned → In Progress → Review → Done
- Drag & drop
- Filter by project, assignee
- Click to expand task detail

### `/task/[id]` - Task Detail
- Full description
- Comment thread
- Attached documents
- Assignment controls

### `/agents` - Agent Management
- List all agents
- Status indicators
- Model configuration per agent
- Create/edit agents

### `/projects` - Project Management
- List projects
- Color/icon picker
- Archive projects

### `/settings` - Global Settings
- Model presets
- Heartbeat intervals
- Notification preferences

---

## Notification Daemon

Separate Node.js process (runs via pm2 or as OpenClaw cron):

```typescript
// poll-notifications.ts
while (true) {
  const undelivered = await convex.query("notifications:getUndelivered");
  
  for (const notification of undelivered) {
    const agent = await convex.query("agents:get", { id: notification.targetAgentId });
    
    try {
      // Send to OpenClaw session
      await openclawSend(agent.sessionKey, notification.content);
      await convex.mutation("notifications:markDelivered", { id: notification._id });
    } catch (e) {
      // Agent session not active, will retry next poll
    }
  }
  
  await sleep(2000);
}
```

---

## Agent Heartbeat Flow

Every 15 minutes (via OpenClaw cron):

1. Agent wakes up
2. Reads WORKING.md for current context
3. Queries Convex:
   - `notifications:getForAgent` (any @mentions?)
   - `tasks:getAssigned` (any tasks for me?)
   - `activities:getRecent` (anything I should know?)
4. If work exists → do it
5. If nothing → respond HEARTBEAT_OK
6. Update WORKING.md with current state

---

## File Structure

```
mission-control/
├── SPEC.md                 # This file
├── convex/
│   ├── schema.ts           # Database schema
│   ├── agents.ts           # Agent CRUD
│   ├── tasks.ts            # Task CRUD
│   ├── messages.ts         # Message CRUD
│   ├── activities.ts       # Activity logging
│   ├── notifications.ts    # Notification handling
│   ├── projects.ts         # Project CRUD
│   └── settings.ts         # Settings CRUD
├── src/
│   ├── app/
│   │   ├── page.tsx        # Dashboard
│   │   ├── tasks/
│   │   ├── agents/
│   │   ├── projects/
│   │   └── settings/
│   ├── components/
│   │   ├── ActivityFeed.tsx
│   │   ├── AgentCard.tsx
│   │   ├── KanbanBoard.tsx
│   │   ├── TaskCard.tsx
│   │   ├── TaskDetail.tsx
│   │   ├── ModelSelector.tsx
│   │   └── ...
│   └── lib/
│       ├── convex.ts       # Convex client setup
│       └── utils.ts
├── daemon/
│   └── poll-notifications.ts
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

---

## Implementation Order

### Phase 1: Foundation
1. Initialize Next.js + Convex project
2. Create database schema
3. Seed initial agents (Motoko, Forge, Quill, Recon, Pulse)
4. Basic dashboard layout

### Phase 2: Core Features
5. Kanban board (tasks CRUD)
6. Task detail view with comments
7. Agent status cards
8. Activity feed

### Phase 3: Coordination
9. @mention parsing in messages
10. Notification daemon
11. Agent model configuration UI

### Phase 4: Polish
12. Project management
13. Daily standup generator
14. Settings panel
15. Mobile responsiveness

---

## Notes

- Use Convex's real-time subscriptions for live updates
- Keep UI warm and editorial (not cold/corporate)
- Agents read from Convex via CLI commands in their scripts
- Notifications bridge Convex → OpenClaw sessions

---

*Spec written by Motoko. Implementation by Codex.*
