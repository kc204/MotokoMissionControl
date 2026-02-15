# Legacy Reference Code

This folder contains the original Mission Control v1 implementation.

## ⚠️ For AI Coding Models

**DO NOT reference this folder unless KC explicitly requests it.**

This folder is kept for reference only when KC specifically asks for a feature to be ported from legacy to v2. Do not automatically check here when building new features.

## What's Here

- `src/components/` - Legacy React components
- `convex/` - Legacy Convex queries, mutations, and schema
- `hooks/` - Legacy custom React hooks
- `docs/` - Documentation and analysis

## When to Use

**Only when KC says:**
- "Port this from legacy"
- "Check the legacy implementation"
- "Add this feature from the old version"

## V2 Differences (if porting)

- Legacy: Direct file imports (`@/components/...`)
- v2: Package imports (`@motoko/db`, `@motoko/ui`)
- Legacy: `createdByAgentId` field names
- v2: `agentId` field names (check schema.ts)

**Wait for KC's explicit instruction before using this reference.**
