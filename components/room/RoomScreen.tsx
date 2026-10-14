"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { gameHref, getGame, hostTitle, roomHref } from "@/lib/games/registry";
import { useNet, useWhere } from "../NetProvider";
import { BattleshipTable } from "./BattleshipTable";
import { CaroTable } from "./CaroTable";
import { ChessTable } from "./ChessTable";
import { CoChepTable } from "./CoChepTable";
import { ConnectFourTable } from "./ConnectFourTable";
import { DodgeTable } from "./DodgeTable";
import { DotsBoxesTable } from "./DotsBoxesTable";
import { DrawGuessTable } from "./DrawGuessTable";
import { Joining } from "./Joining";
import { KawaiiTable } from "./KawaiiTable";
import { LotoTable } from "./LotoTable";
import { MineControlTable } from "./MineControlTable";
import { MinesweeperTable } from "./MinesweeperTable";
import { OAnQuanTable } from "./OAnQuanTable";
import { ReversiTable } from "./ReversiTable";
import { Notice } from "./RoomLayout";
import { SudokuTable } from "./SudokuTable";
import { TrucXanhTable } from "./TrucXanhTable";
import { UndercoverTable } from "./UndercoverTable";
import { WerewolfTable } from "./WerewolfTable";
import { XiangqiRoleTable } from "./XiangqiRoleTable";
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
  if (!view || view.phase === "connecting") return <Joining id={id} ad={ad} progress={view?.joining} />;
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
  if (session.game === "dodge") return <DodgeTable id={id} slug={slug} session={session} />;
  if (session.game === "xiangqi-role") return <XiangqiRoleTable id={id} slug={slug} session={session} />;
  if (session.game === "connect-four") return <ConnectFourTable id={id} slug={slug} session={session} />;
  if (session.game === "battleship") return <BattleshipTable id={id} slug={slug} session={session} />;
  if (session.game === "draw-guess") return <DrawGuessTable id={id} slug={slug} session={session} />;
  if (session.game === "oanquan") return <OAnQuanTable id={id} slug={slug} session={session} />;
  if (session.game === "chess") return <ChessTable id={id} slug={slug} session={session} />;
  if (session.game === "dots-boxes") return <DotsBoxesTable id={id} slug={slug} session={session} />;
  if (session.game === "co-chep") return <CoChepTable id={id} slug={slug} session={session} />;
  if (session.game === "mine-control") return <MineControlTable id={id} slug={slug} session={session} />;
  if (session.game === "kawaii") return <KawaiiTable id={id} slug={slug} session={session} />;
  if (session.game === "truc-xanh") return <TrucXanhTable id={id} slug={slug} session={session} />;
  if (session.game === "minesweeper") return <MinesweeperTable id={id} slug={slug} session={session} />;
  if (session.game === "reversi") return <ReversiTable id={id} slug={slug} session={session} />;
  return <CaroTable id={id} slug={slug} session={session} />;
}
