import { query } from "convex/server";

// Hardcoded list of available AI models
// In the future, this could be fetched from a configuration or external API
const AVAILABLE_MODELS = [
  { id: "kimi-coding/kimi-for-coding", name: "Kimi K2.5" },
  { id: "anthropic/claude-3-5-sonnet", name: "Claude 3.5 Sonnet" },
  { id: "openai/gpt-4o", name: "GPT-4o" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
  { id: "anthropic/codex-cli", name: "Codex CLI" },
  { id: "openai-codex/gpt-5.2", name: "GPT-5.2 Codex" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
];

export const list = query({
  args: {},
  handler: async () => {
    return AVAILABLE_MODELS;
  },
});
