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

const checks = [
  { label: "Agents list", path: "agents:list", args: {} },
  { label: "Tasks list", path: "tasks:list", args: { limit: 250 } },
  { label: "Tasks dispatch states", path: "tasks:listDispatchStates", args: {} },
  { label: "HQ messages", path: "messages:list", args: { channel: "hq" } },
  { label: "Settings get", path: "settings:get", args: { key: "automation:config" } },
  { label: "Settings automation config", path: "settings:getAutomationConfig", args: {} },
  { label: "Documents listAll", path: "documents:listAll", args: {} },
  { label: "Activities recent", path: "activities:recent", args: { limit: 120 } },
  { label: "Ops overview", path: "ops:overview", args: {} },
];

async function runCheck(check) {
  const response = await fetch(`${baseUrl}/api/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: check.path, args: check.args }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.status !== "success") {
    throw new Error(payload.errorMessage || "query failed");
  }

  const value = payload.value;
  if (Array.isArray(value)) {
    return `${value.length} rows`;
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
}

async function main() {
  let failed = false;
  console.log(`Running Convex smoke checks against ${baseUrl}`);

  for (const check of checks) {
    try {
      const summary = await runCheck(check);
      console.log(`PASS  ${check.label} (${check.path}) -> ${summary}`);
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FAIL  ${check.label} (${check.path}) -> ${message}`);
    }
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Smoke runner crashed: ${message}`);
  process.exit(1);
});
