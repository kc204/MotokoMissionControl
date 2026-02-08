import { query } from "./_generated/server";

const OPENCLAW_AVAILABLE_MODELS_KEY = "openclaw:models:available";

function parseAvailableModels(value: unknown): Array<{ id: string; name: string }> {
  if (!value || typeof value !== "object") return [];
  const raw = value as { models?: unknown };
  if (!Array.isArray(raw.models)) return [];

  const models: Array<{ id: string; name: string }> = [];
  for (const entry of raw.models) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as { id?: unknown; name?: unknown };
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    if (!id) continue;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    models.push({ id, name: name || id });
  }
  return models.sort((a, b) => a.name.localeCompare(b.name));
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", OPENCLAW_AVAILABLE_MODELS_KEY))
      .first();
    return parseAvailableModels(row?.value);
  },
});
