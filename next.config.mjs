/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
    // ffmpeg binary path must stay a real path on disk (subtitles burn-in)
    serverComponentsExternalPackages: ["ffmpeg-static"],
  },
};
export default nextConfig;
