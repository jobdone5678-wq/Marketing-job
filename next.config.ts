import type { NextConfig } from "next";
import * as dotenv from 'dotenv';
import * as path from 'path';

try {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });
} catch {}

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.RECRUITING_E2E === "1" ? ["127.0.0.1"] : undefined,
  distDir: process.env.RECRUITING_E2E === "1" ? ".next-e2e" : ".next",
  serverExternalPackages: ["pdfjs-dist"],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
