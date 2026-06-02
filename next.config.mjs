/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker 镜像只需要 standalone 产物和静态资源，减少服务器部署体积。
  output: "standalone",
  experimental: {}
};

export default nextConfig;
