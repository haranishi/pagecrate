import type { NextConfig } from "next";
import { securityHeaderRules } from "./src/lib/security-headers";

const config: NextConfig = {
  poweredByHeader: false,
  logging: false,
  async headers() {
    // The Content-Security-Policy is for production builds only; see src/lib/security-headers.ts.
    return securityHeaderRules(process.env.NODE_ENV === "production").map(rule => ({ source: rule.source, headers: rule.headers.map(header => ({ ...header })) }));
  },
};
export default config;
