# Legacy Reference Code

This folder contains the original Mission Control implementation. **Use it as reference when building v2 features.**

## What's Here

- `src/components/` - Legacy React components (RightSidebar, Agent panels, Document trays, etc.)
- `convex/` - Legacy Convex queries, mutations, and schema
- `hooks/` - Legacy custom React hooks
- `docs/` - Documentation and analysis

## When to Reference

- Adding new features to v2 → Check if similar feature existed in legacy
- Porting components → Copy structure, adapt to v2 patterns (@motoko/db imports, etc.)
- Understanding schema relationships → Legacy has the full data model

## Key Patterns to Port

- Live Feed / Documents sidebar → `src/components/RightSidebar.tsx`
- Agent roster panel → `src/components/AgentsSidebarPanel.tsx`
- Document conversation tray → `src/components/DocumentConversationTray.tsx`
- Activity queries → `convex/activities.ts` (listFiltered)
- Document queries → `convex/documents.ts` (listAll, getWithContext)

## V2 Differences

- Legacy: Direct file imports (`@/components/...`)
- v2: Package imports (`@motoko/db`, `@motoko/ui`)
- Legacy: `createdByAgentId` field names
- v2: `agentId` field names (check schema.ts)

**Consult this folder before reinventing features.**
