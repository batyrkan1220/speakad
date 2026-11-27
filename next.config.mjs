/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
    // ffmpeg binary path must stay a real path on disk (subtitles burn-in)
    serverComponentsExternalPackages: ["ffmpeg-static"],
  },
  // admin tools now live under /admin — keep old links working
  async redirects() {
    return [
      { source: "/factory", destination: "/admin/factory", permanent: false },
      { source: "/analytics", destination: "/admin/analytics", permanent: false },
      { source: "/subtitles", destination: "/admin/subtitles", permanent: false },
    ];
  },
};
export default nextConfig;
