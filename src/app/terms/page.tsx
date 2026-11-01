import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";
import { termsDocument } from "@/lib/policy-content";

const content = termsDocument();

export const metadata: Metadata = { title: `${content.title} — PageCrate` };

export default function Terms() {
  return <PolicyPage document={content} path="/terms" />;
}
