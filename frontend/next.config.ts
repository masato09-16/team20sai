/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // ← この行を新しく追加します！
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;