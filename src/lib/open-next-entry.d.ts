/** Stable handler contract for the build-generated entry, including a clean checkout before build. */
declare module "*.open-next/worker.js" {
  const handler: {
    fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response>;
  };
  export default handler;
}
