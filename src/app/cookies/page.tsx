import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";
import { cookiesDocument } from "@/lib/policy-content";

const content = cookiesDocument();

export const metadata: Metadata = { title: `${content.title} — PageCrate` };

export default function Cookies() {
  return <PolicyPage document={content} path="/cookies" />;
}
