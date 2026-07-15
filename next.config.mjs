/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @jbg/* 是 workspace TS package（無 build step），交給 Next 轉譯。
  transpilePackages: ["@jbg/db", "@jbg/domain", "@jbg/harness", "@jbg/persistence"],
  eslint: { ignoreDuringBuilds: true },
  // 商品照片多張上傳（server action）預設限 1MB，放寬到 30MB。
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
};

export default nextConfig;
