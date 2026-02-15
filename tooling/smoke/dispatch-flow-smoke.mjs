#!/usr/bin/env node

const args = process.argv.slice(2);

function getArg(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

const deploymentUrl =
  getArg("--url") ||
  process.env.CONVEX_URL ||
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  "https://elegant-chipmunk-882.convex.cloud";

const baseUrl = deploymentUrl.replace(/\/+$/, "");
const now = Date.now();
const suffix = `${now}`;

let taskId = null;
let dispatchId = null;

async function call(path, payloadType, callArgs) {
  const response = await fetch(`${baseUrl}/api/${payloadType}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, args: callArgs }),
  });

  if (!response.ok) {
    throw new Error(`${path} -> HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.status !== "success") {
    throw new Error(`${path} -> ${payload.errorMessage || "request failed"}`);
  }

  return payload.value;
}

async function query(path, callArgs) {
  return call(path, "query", callArgs);
}

async function mutate(path, callArgs) {
  return call(path, "mutation", callArgs);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function cleanup() {
  if (dispatchId) {
    try {
      const dispatch = await query("taskDispatches:get", { dispatchId });
      if (dispatch && (dispatch.status === "pending" || dispatch.status === "running")) {
        await mutate("taskDispatches:cancel", { dispatchId });
      }
    } catch {
      // ignore cleanup errors
    }
  }

  if (taskId) {
    try {
      await mutate("tasks:update", { id: taskId, status: "archived" });
    } catch {
      // ignore cleanup errors
    }
  }
}

async function main() {
  console.log(`Running dispatch flow smoke against ${baseUrl}`);

  const agents = await query("agents:list", {});
  assert(Array.isArray(agents) && agents.length > 0, "No agents available");
  const targetAgent = agents.find((agent) => Boolean(agent.sessionKey)) || agents[0];
  console.log(`PASS  Selected agent ${targetAgent.name} (${targetAgent._id})`);

  taskId = await mutate("tasks:create", {
    title: `Smoke Dispatch ${suffix}`,
    description: "End-to-end smoke task for assignment and dispatch flow",
    priority: "medium",
    assigneeIds: [targetAgent._id],
    createdBy: "smoke:dispatch",
    tags: ["smoke", "dispatch"],
  });
  console.log(`PASS  Created task ${taskId}`);

  await mutate("tasks:update", {
    id: taskId,
    status: "assigned",
    assigneeIds: [targetAgent._id],
  });
  console.log("PASS  Assigned task to selected agent");

  dispatchId = await mutate("taskDispatches:enqueue", {
    taskId,
    targetAgentId: targetAgent._id,
    requestedBy: "smoke:dispatch",
    prompt: "Return a short execution summary.",
    idempotencyKey: `smoke-dispatch-${suffix}`,
  });
  console.log(`PASS  Enqueued dispatch ${dispatchId}`);

  const beforeClaim = await query("taskDispatches:get", { dispatchId });
  assert(beforeClaim && beforeClaim.status === "pending", "Dispatch was not pending after enqueue");
  console.log("PASS  Dispatch entered pending state");

  const claim = await mutate("taskDispatches:claimForTask", {
    taskId,
    runnerId: `smoke-runner:${suffix}`,
  });

  if (claim && claim.dispatchId === dispatchId) {
    console.log(`PASS  Claimed dispatch ${claim.dispatchId}`);

    await mutate("taskDispatches:complete", {
      dispatchId,
      runId: `smoke-run-${suffix}`,
      resultPreview: "Smoke dispatch completed successfully",
    });
    console.log("PASS  Completed claimed dispatch");
  } else {
    const observed = await query("taskDispatches:get", { dispatchId });
    const status = observed?.status;
    assert(
      status === "running" || status === "completed",
      `Dispatch was not claimable and is in unexpected state: ${String(status)}`
    );
    console.log(`PASS  Dispatch already handled by another runner (status=${status})`);
  }

  const finalDispatch = await query("taskDispatches:get", { dispatchId });
  assert(
    finalDispatch && ["completed", "running"].includes(finalDispatch.status),
    `Final dispatch status unexpected: ${String(finalDispatch?.status)}`
  );
  console.log(`PASS  Final dispatch status ${finalDispatch.status}`);

  await mutate("tasks:update", {
    id: taskId,
    status: "done",
  });
  console.log("PASS  Updated task status to done");
}

main()
  .catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL  ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });
