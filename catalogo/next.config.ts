import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Pôsteres, fundos e logos de serviço vêm todos deste host.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
};

export default nextConfig;
