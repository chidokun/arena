import type { Metadata } from "next";

export const SITE_URL = "https://arena.nguyentuan.dev";
export const SITE_NAME = "Arena";
export const SITE_TITLE = "Arena — Đấu trường mini game online cho hội bạn";
export const SITE_DESCRIPTION =
  "Chơi Cờ Caro, Cờ Tướng, Cờ Vua, Ma Sói, Lô Tô… cùng bạn bè ngay trên trình duyệt. Không đăng ký, không cài app — tạo phòng, gửi link là vào chơi.";

export const ogImage = (slug = "home", alt = "Arena — đấu trường mini game cho hội bạn ngay trên trình duyệt") => ({
  url: `/og/${slug}.png`,
  width: 1200,
  height: 630,
  type: "image/png",
  alt,
});

// `openGraph` / `twitter` của trang con thay hẳn bản của layout (không gộp từng trường) nên phải khai đủ ở đây. Bỏ
// `path` khi URL thật còn mang query (link phòng `?id=`): og:url / canonical thiếu id sẽ khiến Facebook dẫn người bấm về
// trang không có phòng.
export function shareMeta(m: { title: string; description: string; path?: string; image?: ReturnType<typeof ogImage> }): Metadata {
  const { title, description, path, image = ogImage() } = m;
  return {
    title,
    description,
    ...(path && { alternates: { canonical: path } }),
    openGraph: { type: "website", siteName: SITE_NAME, locale: "vi_VN", url: path, title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
