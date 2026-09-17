import type { NextConfig } from "next";

const devOrigins = [
  "localhost:3000",
  "127.0.0.1:3000",
  "refactored-space-yodel-9v5xp6j9rrpcg66-3000.app.github.dev",
  "*.app.github.dev",
];

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
  experimental: {
    serverActions: {
      allowedOrigins: devOrigins,
    },
  },
};

export default nextConfig;
