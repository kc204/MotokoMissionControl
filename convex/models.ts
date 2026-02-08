import { query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async () => {
    return [
      { id: "google-antigravity/claude-opus-4-5-thinking", name: "Claude Opus 4.5 (Antigravity)" },
      { id: "google-antigravity/claude-sonnet-4-5", name: "Claude Sonnet 4.5 (Antigravity)" },
      { id: "google-antigravity/gemini-3-pro-high", name: "Gemini 3 Pro High (Antigravity)" },
      { id: "google-antigravity/gemini-3-flash", name: "Gemini 3 Flash (Antigravity)" },
      { id: "google-antigravity/nano-banana-pro", name: "Nano Banana Pro (Images)" },
      { id: "codex-cli", name: "codex-cli (CLI)" },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "kimi-code/kimi-for-coding", name: "Kimi Code" },
    ];
  },
});
