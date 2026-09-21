import type { NextConfig } from "next";

const devOrigins = [
  "localhost:3000",
  "127.0.0.1:3000",
  "refactored-space-yodel-9v5xp6j9rrpcg66-3000.app.github.dev",
  "*.app.github.dev",
];

const nextConfig: NextConfig = {
  // Next 16 matches hostnames here; serverActions.allowedOrigins uses hosts.
  allowedDevOrigins: ["localhost", "127.0.0.1", "*.app.github.dev"],
  // @napi-rs/canvas (native binding) e tesseract.js (worker/WASM) non vanno bundlati
  // dal Server Components bundler: causano "non-ecmascript placeable asset" in build.
  serverExternalPackages: ["@napi-rs/canvas", "tesseract.js", "unpdf"],
  experimental: {
    serverActions: {
      bodySizeLimit: "11mb",
      allowedOrigins: devOrigins,
    },
  },
};

export default nextConfig;
