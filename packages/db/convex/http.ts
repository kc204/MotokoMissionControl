import { anyApi, httpActionGeneric as httpAction, httpRouter } from "convex/server";

const http = httpRouter();
const api = anyApi;

http.route({
  path: "/openclaw/event",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.MISSION_CONTROL_WEBHOOK_SECRET;
    if (secret) {
      const provided = request.headers.get("x-mission-control-secret");
      if (!provided || provided !== secret) {
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await ctx.runMutation(api.openclaw.receiveEvent, body as any);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;

