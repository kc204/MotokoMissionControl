export function truncate(text: string, maxChars: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function parseMentions(content: string): string[] {
  const matches = content.match(/@([a-zA-Z0-9_]+)/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase())));
}

export function taskIdFromChannel(channel?: string): string | undefined {
  if (!channel || !channel.startsWith("task:")) return undefined;
  return channel.slice("task:".length);
}

