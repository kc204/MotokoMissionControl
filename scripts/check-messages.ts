import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function main() {
  const messages = await client.query(api.messages.list, { channel: "hq" });
  console.log("Found messages:", messages.length);
  if (messages.length > 0) {
    console.log("Most recent:", JSON.stringify(messages[0], null, 2));
    // The list query reverses them at the end, so messages[0] is actually the OLDEST in the array returned by list() because list() usually does .reverse() before returning?
    // Let's check api.messages.list implementation.
  }
}
main();
