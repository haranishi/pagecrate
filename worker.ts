import { launch } from "@cloudflare/playwright";
import { serveTourVideo } from "./src/lib/tour-video";
// OpenNext generates this module during build; no hand-maintained copy or runtime shim.
import nextWorker from "./.open-next/worker.js";
// Durable Object classes must be exported by the main module; only this file imports Workers-native modules.
export { BudgetGate } from "./src/lib/budget-gate-object";

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const tour = await serveTourVideo(request, assetRequest => {
      if (!env.ASSETS) throw new Error("ASSETS_UNAVAILABLE");
      return env.ASSETS.fetch(assetRequest);
    });
    if (tour) return tour;
    // A request-local factory keeps Workers-native imports out of Next's Node bundling stage.
    // It grants no additional network access: the scanner still verifies deny-all guardrails.
    const requestEnv: CloudflareEnv = {
      ...env,
      PAGECRATE_BROWSER_LAUNCH: signal => launch({
        fetch: (input, init) => env.BROWSER.fetch(input, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) }),
      }, { guardrails: { allowedDomains: [] }, keep_alive: 10000, recording: false }),
    };
    return nextWorker.fetch(request, requestEnv, ctx);
  },
} satisfies ExportedHandler<CloudflareEnv>;
