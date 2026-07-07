/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @jbg/* 是 workspace TS package（無 build step），交給 Next 轉譯。
  transpilePackages: ["@jbg/db", "@jbg/domain", "@jbg/harness", "@jbg/persistence"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
