import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, s-maxage=31536000, immutable" }],
      },
      {
        source: "/sounds/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, s-maxage=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
