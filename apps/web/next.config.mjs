/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@avidity/shared", "@avidity/ui"],
  async rewrites() {
    const internalApiOrigin = process.env.INTERNAL_API_ORIGIN ?? "http://localhost:4000";

    return [
      {
        source: "/api/:path*",
        destination: `${internalApiOrigin}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
