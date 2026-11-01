import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Pages are static; authenticated APIs are no-store. No user data enters a shared ISR cache.
export default defineCloudflareConfig();
