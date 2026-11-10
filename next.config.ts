import type { NextConfig } from "next";
import * as dotenv from 'dotenv';
import * as path from 'path';

try {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: false });
} catch {}

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: process.env.RECRUITING_E2E === "1" ? ["127.0.0.1"] : undefined,
  distDir: process.env.RECRUITING_E2E === "1" ? ".next-e2e" : ".next",
  serverExternalPackages: ["pdfjs-dist"],
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@base-ui/react",
      "@tanstack/react-table",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
    ],
  },
  async redirects() {
    return [
      { source: '/dashboard/resumes', destination: '/dashboard', permanent: false },
    ];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
