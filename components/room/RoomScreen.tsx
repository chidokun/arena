"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { gameHref, getGame, hostTitle, roomHref } from "@/lib/games/registry";
import { useNet, useWhere } from "../NetProvider";
import { CaroTable } from "./CaroTable";
import { LotoTable } from "./LotoTable";
import { Notice } from "./RoomLayout";
import { SudokuTable } from "./SudokuTable";
import { UndercoverTable } from "./UndercoverTable";
import { WerewolfTable } from "./WerewolfTable";
import { XiangqiTable } from "./XiangqiTable";
import { useRoomSession, useRoomView } from "./useRoom";

export function RoomScreen({ slug }: { slug: string }) {
  const id = (useSearchParams().get("id") ?? "").trim().toLowerCase();
  const { uid, profile, lobby } = useNet();
  useWhere({ game: slug, room: id || undefined });
  const session = useRoomSession(slug, id, uid, profile, lobby);
  const view = useRoomView<unknown>(session);
  const game = getGame(slug)!;
  const ad = lobby?.roomAd(id);

  const back = (
    <Link href={gameHref(slug)} className="btn btn-pen mt-6 no-underline">
      Về sảnh {game.name}
    </Link>
  );

  if (!id)
    return (
      <Notice emoji="🤔" title="Thiếu mã phòng">
        Đường dẫn phòng không hợp lệ.
        {back}
      </Notice>
    );
  if (!view || view.phase === "connecting")
    return (
      <Notice emoji="📡" title={ad ? `Đang vào “${ad.name}”…` : `Đang tìm phòng #${id}…`} spin>
        Đang kết nối trực tiếp với những người trong phòng. Việc này thường mất vài giây.
      </Notice>
    );
  if (view.phase === "notfound")
    return (
      <Notice emoji="🏚️" title="Không tìm thấy phòng">
        Phòng #{id} không còn ai hoặc đã đóng. Phòng chỉ tồn tại khi còn ít nhất một người ở trong.
        <span className="flex flex-wrap justify-center gap-3">
          <button type="button" className="btn mt-6" onClick={() => location.reload()}>
            Thử lại
          </button>
          {back}
        </span>
      </Notice>
    );
  if (view.phase === "full")
    return (
      <Notice emoji="🈵" title="Phòng đã đầy">
        Phòng đã đủ {view.meta?.cap} người. Thử lại sau hoặc chọn phòng khác nhé.
        {back}
      </Notice>
    );
  if (view.phase === "kicked")
    return (
      <Notice emoji="🚪" title="Bạn đã bị mời ra khỏi phòng">
        {hostTitle(view.meta?.game)} đã mời bạn ra khỏi “{view.meta?.name}”.
        {back}
      </Notice>
    );
  if (view.phase === "elsewhere") {
    const other = getGame(view.meta?.game ?? "");
    return (
      <Notice emoji="🔀" title="Phòng này của game khác">
        Phòng #{id} đang chơi {other?.name ?? "một game khác"}.
        {other ? (
          <Link href={roomHref(other.slug, id)} className="btn btn-pen mt-6 no-underline">
            Sang phòng {other.name}
          </Link>
        ) : (
          back
        )}
      </Notice>
    );
  }
  if (view.phase === "left" || !session || !view.meta)
    return (
      <Notice emoji="👋" title="Bạn đã rời phòng">
        {back}
      </Notice>
    );
  // So theo slug thay vì instanceof: nạp lại nóng (HMR) tạo lớp mới khiến phiên cũ không còn là instanceof.
  if (session.game === "loto") return <LotoTable id={id} slug={slug} session={session} />;
  if (session.game === "werewolf") return <WerewolfTable id={id} slug={slug} session={session} />;
  if (session.game === "undercover") return <UndercoverTable id={id} slug={slug} session={session} />;
  if (session.game === "sudoku") return <SudokuTable id={id} slug={slug} session={session} />;
  if (session.game === "xiangqi") return <XiangqiTable id={id} slug={slug} session={session} />;
  return <CaroTable id={id} slug={slug} session={session} />;
}
