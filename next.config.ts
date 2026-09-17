import type { NextConfig } from "next";

const devOrigins = [
  "localhost:3000",
  "127.0.0.1:3000",
  "refactored-space-yodel-9v5xp6j9rrpcg66-3000.app.github.dev",
  "*.app.github.dev",
];

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
  // @napi-rs/canvas (native binding) e tesseract.js (worker/WASM) non vanno bundlati
  // dal Server Components bundler: causano "non-ecmascript placeable asset" in build.
  serverExternalPackages: ["@napi-rs/canvas", "tesseract.js", "unpdf"],
  experimental: {
    serverActions: {
      allowedOrigins: devOrigins,
    },
  },
};

export default nextConfig;
