"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
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
