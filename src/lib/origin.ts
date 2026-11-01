import { AppError } from "./errors";
import { isLocalDevOrigin, readPublicOrigin, type PublicOriginSetting } from "./ops-config";

// Next.js rewrites loopback hostnames in request.url to "localhost" (NextURL); the Host header keeps what the client sent.
const LOOPBACK_HOST = /^(?:127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}|\[::1\]|localhost)$/;

function comparableOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (LOOPBACK_HOST.test(url.hostname)) url.hostname = "localhost";
    return url.origin;
  } catch { return null; }
}

/**
 * The deployment config (PAGECRATE_PUBLIC_ORIGIN) is the authority; never trust forwarded host headers.
 * Callers that already parsed the Worker env (the guard) pass that setting; others read process.env.
 */
export function configuredOrigin(setting: PublicOriginSetting = readPublicOrigin(process.env)): string | null {
  if (setting.state === "unset") return null;
  if (setting.state === "invalid") throw new AppError("APP_NOT_CONFIGURED", "接続先の設定を確認してください。", 503);
  return setting.origin;
}

export function assertAppHost(request: Request, setting?: PublicOriginSetting): string {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  // Without configuration only an exact local dev host (127.0.0.1/localhost on 4381 or 8787) may stand in.
  const local = host === null ? null : `http://${host}`;
  const expected = configuredOrigin(setting) ?? (local !== null && isLocalDevOrigin(local) ? local : null);
  // The Host header must match exactly; only the URL comparison tolerates Next's loopback rewrite.
  const urlMatches = expected !== null && comparableOrigin(url.origin) !== null && comparableOrigin(url.origin) === comparableOrigin(expected);
  if (!expected || !urlMatches || host !== new URL(expected).host) {
    throw new AppError("FORBIDDEN", "許可されていない接続先です。", 403);
  }
  return expected;
}
