import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer relies on Node.js internals and its own reconciler; keep
  // it out of the Server Components / Route Handler bundle so it loads via native
  // require at runtime. (Next already auto-externalises it, but we pin it here so
  // report PDF generation stays working regardless of that default list drifting.)
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
