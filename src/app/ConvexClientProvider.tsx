"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  const rawConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  const convexUrl = useMemo(() => {
    if (!rawConvexUrl) return null;
    try {
      const parsed = new URL(rawConvexUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  }, [rawConvexUrl]);
  const convex = useMemo(
    () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
    [convexUrl]
  );

  if (!convex) {
    return (
      <div className="mx-auto mt-16 max-w-xl rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
        Missing <code>NEXT_PUBLIC_CONVEX_URL</code>. Set it in your Vercel project
        environment variables and redeploy.
      </div>
    );
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
