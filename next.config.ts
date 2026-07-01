import type { NextConfig } from "next";

// When BUILD_TARGET=electron, produce a static export in `out/` for the desktop app.
// Normal `next build` (e.g. Vercel) stays a regular Next build.
const isElectron = process.env.BUILD_TARGET === "electron";

const nextConfig: NextConfig = {
  ...(isElectron ? { output: "export", images: { unoptimized: true } } : {}),
};

export default nextConfig;
