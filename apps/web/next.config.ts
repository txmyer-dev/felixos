import type { NextConfig } from "next";

const apiOrigin = process.env.FELIXOS_API_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@felixos/shared-types"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/:path*`
      }
    ];
  }
};

export default nextConfig;
