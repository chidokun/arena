/** Danh mục game. Slug (đường dẫn) dùng tiếng Anh, nội dung hiển thị tiếng Việt. */

export type GameDef = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** Số ghế chơi (người thi đấu) mà chủ phòng có thể chọn. */
  seats: { min: number; max: number };
  /** Số người tối đa trong phòng (người chơi + người xem) mà chủ phòng có thể đặt. */
  capacity: { min: number; max: number; default: number };
  available: boolean;
  /** Màu chủ đạo của thẻ game. */
  hue: "coral" | "sky" | "lime" | "grape" | "sun";
  emoji: string;
};

export const GAMES: GameDef[] = [
  {
    slug: "caro",
    name: "Cờ Caro",
    tagline: "Năm quân thẳng hàng là thắng",
    description:
      "Hai người lần lượt đặt X và O trên bàn 15×15. Ai xếp được 5 quân liên tiếp theo hàng ngang, dọc hoặc chéo trước thì thắng. Chủ phòng chọn có áp dụng luật chặn hai đầu hay không.",
    seats: { min: 2, max: 2 },
    capacity: { min: 2, max: 16, default: 8 },
    available: true,
    hue: "coral",
    emoji: "⭕",
  },
  {
    slug: "connect-four",
    name: "Thả Cờ 4",
    tagline: "Thả quân, nối bốn, hạ đối thủ",
    description: "Thả quân xuống cột, ai nối được bốn quân trước thì thắng.",
    seats: { min: 2, max: 2 },
    capacity: { min: 2, max: 16, default: 8 },
    available: false,
    hue: "sky",
    emoji: "🔵",
  },
  {
    slug: "battleship",
    name: "Bắn Tàu",
    tagline: "Giấu hạm đội, đoán toạ độ",
    description: "Bày tàu bí mật rồi thay phiên bắn vào hải đồ của đối phương.",
    seats: { min: 2, max: 2 },
    capacity: { min: 2, max: 16, default: 8 },
    available: false,
    hue: "lime",
    emoji: "🚢",
  },
  {
    slug: "draw-guess",
    name: "Vẽ Đoán",
    tagline: "Một người vẽ, cả phòng đoán",
    description: "Lần lượt vẽ từ khoá bí mật, người khác gõ đáp án nhanh nhất để ghi điểm.",
    seats: { min: 2, max: 8 },
    capacity: { min: 2, max: 16, default: 10 },
    available: false,
    hue: "grape",
    emoji: "🎨",
  },
];

export function getGame(slug: string) {
  return GAMES.find((g) => g.slug === slug && g.available);
}

export const gameHref = (slug: string) => `/games/${slug}/`;
export const roomHref = (slug: string, id: string) => `/games/${slug}/room/?id=${encodeURIComponent(id)}`;
