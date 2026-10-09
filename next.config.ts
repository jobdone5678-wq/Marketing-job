import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.RECRUITING_E2E === "1" ? ["127.0.0.1"] : undefined,
  distDir: process.env.RECRUITING_E2E === "1" ? ".next-e2e" : ".next",
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
