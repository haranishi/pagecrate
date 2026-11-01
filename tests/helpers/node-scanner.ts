import http from "node:http";
import { chromium } from "playwright";
import type { ScanLauncher } from "../../src/lib/scanner";

// Test-only runtime: a real local sandboxed Chromium behind a bound deny-only
// proxy. Nothing in src imports this Node adapter into the Workers bundle.
export const launchTestBrowser: ScanLauncher = async signal => {
  const proxy = http.createServer((_req, res) => { res.writeHead(403); res.end(); });
  proxy.on("connect", (_req, socket) => socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"));
  await new Promise<void>((resolve, reject) => { proxy.once("error", reject); proxy.listen(0, "127.0.0.1", resolve); });
  const closeProxy = async () => { proxy.closeAllConnections(); await new Promise<void>(resolve => proxy.close(() => resolve())); };
  try {
    const address = proxy.address();
    if (!address || typeof address === "string" || signal.aborted) throw new Error("Test browser unavailable");
    const browser = await chromium.launch({ headless: true, chromiumSandbox: true, proxy: { server: `http://127.0.0.1:${address.port}`, bypass: "<-loopback>" }, args: ["--disable-quic", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp", "--disable-background-networking", "--disable-component-update"], timeout: 12000 });
    return { newContext: options => browser.newContext(options), close: async () => { try { await browser.close(); } finally { await closeProxy(); } } };
  } catch (error) { await closeProxy(); throw error; }
};
