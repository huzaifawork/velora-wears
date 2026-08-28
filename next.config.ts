import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Admin SDK out of any client/edge bundle.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
