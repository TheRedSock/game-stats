import type { NextConfig } from "next";
import { resolveDatabaseEnv } from "./src/lib/env/database";

resolveDatabaseEnv();

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
