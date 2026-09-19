import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the iPhone on the same Wi-Fi network to load Turbopack dev assets.
  allowedDevOrigins: ["192.168.1.14", "localhost"],
};

export default nextConfig;
