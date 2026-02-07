---
name: mission-control
description: "Send OpenClaw lifecycle events to Mission Control webhook"
metadata:
  {
    "openclaw":
      {
        "emoji": "hq",
        "events": ["gateway:startup", "agent:bootstrap"],
        "install": [{ "id": "user", "kind": "user", "label": "User-installed hook" }],
      },
  }
---

# Mission Control Hook

Pushes OpenClaw lifecycle/progress events to:

`POST {MISSION_CONTROL_URL}/openclaw/event`

Set in hook env:

- `MISSION_CONTROL_URL`
- optional `MISSION_CONTROL_WEBHOOK_SECRET`
