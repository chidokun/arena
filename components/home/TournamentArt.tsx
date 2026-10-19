import { StickerArt } from "@/components/room/Sticker";

export const TOURNAMENT_PERKS = [
  { icon: "🔐", title: "Đăng nhập", text: "Giữ tên, thành tích và lịch sử thi đấu của bạn." },
  { icon: "🏆", title: "Tạo giải đấu", text: "Chọn game, đặt luật, mở giải chỉ trong vài bước." },
  { icon: "👯", title: "Rủ cả hội", text: "Thêm thật nhiều bạn bè cùng tranh cúp, càng đông càng vui." },
];

const PLAYERS = [
  { emoji: "🐯", tone: "var(--coral)", soft: "var(--coral-soft)", y: 40 },
  { emoji: "🐼", tone: "var(--sky)", soft: "var(--sky-soft)", y: 100 },
  { emoji: "🦊", tone: "var(--sun)", soft: "var(--sun-soft)", y: 180 },
  { emoji: "🐸", tone: "var(--lime)", soft: "var(--lime-soft)", y: 240 },
];

export function TournamentArt() {
  const semis = [
    { y: 70, from: PLAYERS[0], won: true },
    { y: 210, from: PLAYERS[3], won: true },
  ];
  return (
    <div className="relative mx-auto w-full max-w-[460px]" aria-hidden="true">
      <div className="card -rotate-2 p-4" style={{ background: "var(--board)", boxShadow: "0 8px 0 var(--edge)" }}>
        <svg viewBox="0 0 300 280" className="block w-full">
          <g fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            {PLAYERS.map((p, i) => {
              const semi = semis[i < 2 ? 0 : 1];
              const win = semi.from === p;
              return <path key={i} d={`M52 ${p.y} H100 V${semi.y} H130`} stroke={win ? "var(--pen)" : "var(--board-line)"} />;
            })}
            {semis.map((s, i) => (
              <path key={i} d={`M172 ${s.y} H210 V140 H232`} stroke="var(--board-line)" strokeDasharray="2 9" />
            ))}
          </g>
          {PLAYERS.map((p, i) => (
            <g key={i}>
              <circle cx={32} cy={p.y} r={20} fill={p.soft} stroke="var(--edge)" strokeWidth="2.5" />
              <text x={32} y={p.y + 7} textAnchor="middle" fontSize="20">
                {p.emoji}
              </text>
            </g>
          ))}
          {semis.map((s, i) => (
            <g key={i}>
              <circle cx={151} cy={s.y} r={21} fill={s.from.soft} stroke={s.from.tone} strokeWidth="3.5" />
              <text x={151} y={s.y + 7} textAnchor="middle" fontSize="20">
                {s.from.emoji}
              </text>
            </g>
          ))}
          <rect x={232} y={108} width={60} height={64} rx={16} fill="var(--win)" stroke="var(--edge)" strokeWidth="2.5" />
          <text x={262} y={150} textAnchor="middle" fontSize="30">
            🏆
          </text>
        </svg>
      </div>
      <span className="chip absolute -top-4 right-6 rotate-3 bg-sun text-[#1d1648]" style={{ borderColor: "var(--edge)" }}>
        Sắp ra mắt
      </span>
      <span className="bob absolute -bottom-6 -left-4" style={{ ["--r" as string]: "-14deg", animationDelay: "-0.8s" }}>
        <StickerArt id="clap" size={64} />
      </span>
      <span className="bob absolute -right-4 -bottom-4" style={{ ["--r" as string]: "12deg", animationDelay: "-1.6s" }}>
        <StickerArt id="kx-vua" size={72} />
      </span>
    </div>
  );
}
