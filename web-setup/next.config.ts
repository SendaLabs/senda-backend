import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Evita que Next tome el package-lock del backend en Render.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
