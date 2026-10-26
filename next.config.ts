import type { NextConfig } from "next";

// Site chạy ở gốc tên miền riêng arena.nguyentuan.dev; workflow có thể truyền PAGES_BASE_PATH nếu cần đường dẫn con.
const basePath = process.env.PAGES_BASE_PATH ?? "";
// Mã định danh bản build: nhúng vào JS và xuất ra /version.json để tab mở lâu biết đã có bản deploy mới.
const buildId = process.env.GITHUB_SHA ?? String(Date.now());

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  // <img> thường không tự thêm basePath; lộ ra cho mã client tự ghép đường dẫn file tĩnh trong public/.
  env: { BASE_PATH: basePath, BUILD_ID: buildId },
};

export default nextConfig;
