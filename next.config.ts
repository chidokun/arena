import type { NextConfig } from "next";

// Site chạy ở gốc tên miền riêng arena.nguyentuan.dev; workflow có thể truyền PAGES_BASE_PATH nếu cần đường dẫn con.
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
};

export default nextConfig;
