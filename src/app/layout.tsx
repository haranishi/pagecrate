import type { Metadata } from "next";
import { connection } from "next/server";
import { readPublicOriginSetting } from "@/lib/runtime-env";
import { siteMetadata } from "@/lib/site-metadata";
import "./globals.css";

/**
 * Read per request: OGP and canonical need the public origin, a runtime value of the Worker. This makes every page
 * render on demand, which is fine for a site this small.
 */
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return siteMetadata(await readPublicOriginSetting());
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
