import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function main() {
  const text = process.argv[2] || "Hello team";
  await client.mutation(api.messages.send, {
    channel: "hq",
    text: text,
    // No agentId = User message
  });
  console.log(`User sent: "${text}"`);
}
main();
