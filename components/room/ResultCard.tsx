"use client";

import type { ReactNode } from "react";

/**
 * Thẻ kết quả của ván vừa xong, nằm dưới thanh trạng thái tới khi bắt đầu ván mới (cảnh diễn chỉ hiện một lúc rồi tắt,
 * thẻ này thì ở lại). Một dòng tiêu đề lớn, một dòng giải thích, rồi phần thêm của từng game (thường là `Standings`).
 * Tiêu đề / giải thích nên lấy từ cùng chỗ với cảnh chiến thắng (`WinCine`) để hai nơi nói giống nhau.
 */
export function ResultCard({ round, title, sub, note, children }: { round: number; title: ReactNode; sub?: ReactNode; note?: ReactNode; children?: ReactNode }) {
  return (
    <section className="card loto-result mt-4 p-4 sm:p-5" aria-label={`Kết quả ván ${round}`}>
      <p className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</p>
      {sub && <p className="mt-1 text-[15px] text-ink-2">{sub}</p>}
      {note && <p className="mt-1 text-[13.5px] font-semibold text-ink-3">{note}</p>}
      {children}
    </section>
  );
}

/** Ván bị chủ phòng dừng giữa chừng: không tính ai thắng. */
export function StoppedCard({ round, sub = `Ván ${round} dừng giữa chừng — không tính ai thắng.` }: { round: number; sub?: ReactNode }) {
  return <ResultCard round={round} title="⏹ Dừng ván" sub={sub} />;
}

export type Standing = { uid: string; name: ReactNode; value: ReactNode; rank?: number; mark?: ReactNode };

const MEDALS = ["🥇", "🥈", "🥉"];

/** Bảng xếp hạng trong thẻ kết quả: huy chương cho ba hạng đầu (`rank` 0 là chưa xếp hạng, hiện "–"). */
export function Standings({ rows }: { rows: Standing[] }) {
  return (
    <ol className="mt-3 grid gap-2">
      {rows.map(({ uid, name, value, rank, mark }, i) => {
        const r = rank ?? i + 1;
        return (
          <li key={uid} className="flex items-center gap-2.5 text-[14.5px]">
            <span className="w-6 text-center font-display font-extrabold">{r <= 0 ? "–" : (MEDALS[r - 1] ?? r)}</span>
            {mark}
            <b className="min-w-0 flex-1 truncate">{name}</b>
            <span className="font-semibold text-ink-2 tabular-nums">{value}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Kết quả ván đối kháng hai người, dùng chung cho cảnh hết ván (WinCine / DrawCine) và thẻ kết quả: `winner` null là
 * hoà; `title` / `sub` / `note` như trong cảnh diễn.
 */
export type DuelSummary = { winner: string | null; title: string; sub?: string; note?: string };

export function DuelResult({ round, summary: s, me }: { round: number; summary: DuelSummary; me: string }) {
  const icon = !s.winner ? "🤝" : s.winner === me ? "🏆" : s.note ? "😵" : "🏁";
  return <ResultCard round={round} title={`${icon} ${s.title}`} sub={s.sub} note={s.note} />;
}
