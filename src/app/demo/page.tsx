import type { Metadata } from "next";
import { connection } from "next/server";
import Workspace from "@/components/workspace";
import { readLiveFetchSetup } from "@/lib/runtime-env";

export const metadata: Metadata = {
  title: "登録なしで試す — PageCrate",
  description: "自作のデモ素材で、画像・動画の選択からZIP保存まで体験できます。",
};

/**
 * Rendered per request: while page scans are paused (a runtime value of the Worker), the line beside "自分のURLで使う"
 * says so instead of "実際のページは、URLを入れて取得できます。". The demo itself never asks for the bot check.
 */
export default async function DemoPage() {
  await connection();
  const { state } = await readLiveFetchSetup();
  return <Workspace demoOnly liveFetch={state} />;
}
