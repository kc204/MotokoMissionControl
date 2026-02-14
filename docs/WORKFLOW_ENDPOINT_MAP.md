# Mission Control Workflow -> Endpoint Map

This maps your intended flow (Jarvis-led, specialist execution, cross-agent collaboration) to Convex endpoints.

## 1) Idea Intake -> Task Creation

- User idea arrives (Telegram bridge or UI)
- Endpoint: `tasks.create`
- Behavior:
  - Creates task card on Kanban.
  - If no owner is provided, auto-assigns `Squad Lead` (Motoko/Jarvis equivalent).
  - Logs activity (`task_created`).
  - Creates notifications for assignees.

## 2) Squad Lead Assignment

- Lead assigns one or more specialists to execute.
- Endpoint: `tasks.assign`
- Behavior:
  - Updates `assigneeIds`.
  - Sets status to `assigned` when owners exist.
  - Logs activity (`task_updated`).
  - Notifies newly assigned agents.

## 3) Task State Progression

- Specialist moves work from `assigned -> in_progress -> review -> done`.
- Endpoint: `tasks.updateStatus`
- Behavior:
  - Updates Kanban status.
  - Sets `completedAt` when status is `done`.
  - Logs activity (`task_updated`).
- Notifies current assignees.

## 3.5) Queue-Driven Execution

- Kanban "Run / Resume" queues execution lanes and dispatcher drains them.
- Endpoints:
  - `tasks.enqueueDispatch`
  - `tasks.claimNextDispatch`
  - `tasks.completeDispatch`
  - `tasks.failDispatch`
  - `tasks.stopDispatch`
- Behavior:
  - Fans out a run across assignees (one lane per assignee when unscoped).
  - Claims pending work for one runner process.
  - Persists completion/failure and verification summaries.

## 4) Agent Collaboration (HQ + Task Threads)

- Agents and user chat globally (`hq`) and on task threads (`task:<id>`).
- Endpoints:
  - `messages.send`
  - `messages.list`
- Behavior:
  - Persists message with sender metadata.
  - Parses mentions (`@name`, `@all`).
  - Creates notifications for mentioned agents.
  - Logs activity (`message_sent`).

## 5) Notification Delivery Loop

- Daemon polls and pushes alerts to OpenClaw sessions.
- Endpoints:
  - `notifications.getUndelivered`
  - `notifications.markDelivered`
  - `notifications.getForAgent`
- Behavior:
  - Tracks pending/delivered notification state for reliable delivery.

## 6) Operational Visibility

- Dashboard feed for "who did what".
- Endpoints:
  - `activities.recent`
  - `activities.forTask`
  - `activities.forAgent`
- Behavior:
  - Unified event log across task changes, messages, agent status, and docs.

## 7) Agent Roster + Roles

- Agent identity, role specialization, session binding.
- Endpoints:
  - `agents.list`
  - `agents.getByName`
  - `agents.listByRole`
  - `agents.updateStatus`
  - `agents.updateModel`
- Behavior:
  - Enables role-based routing and monitorable heartbeat/status.

## 8) Supporting Domain Entities

- Projects: `projects.list`, `projects.create`
- Documents: `documents.byTask`, `documents.create`
- Settings: `settings.list`, `settings.get`, `settings.set`

## Schema Coverage

`schema.ts` now includes:

- `agents`
- `projects`
- `tasks`
- `messages`
- `activities`
- `documents`
- `notifications`
- `settings`

Legacy tables retained for compatibility:

- `heartbeats`
- `assignments`
