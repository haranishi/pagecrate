import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";
import { privacyDocument } from "@/lib/policy-content";

const content = privacyDocument();

export const metadata: Metadata = { title: `${content.title} — PageCrate` };

export default function Privacy() {
  return <PolicyPage document={content} path="/privacy" />;
}
