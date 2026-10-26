"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { gameHref, getGame, hostTitle, roomHref } from "@/lib/games/registry";
import { useNet, useWhere } from "../NetProvider";
import { BattleshipTable } from "./BattleshipTable";
import { CaroTable } from "./CaroTable";
import { CheatAlert } from "./CheatAlert";
import { ChessTable } from "./ChessTable";
import { CoChepTable } from "./CoChepTable";
import { CoChoTable } from "./CoChoTable";
import { ConnectFourTable } from "./ConnectFourTable";
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
import { SystemDesignTable } from "./SystemDesignTable";
import { TamDauTable } from "./TamDauTable";
import { TrucXanhTable } from "./TrucXanhTable";
import { UndercoverTable } from "./UndercoverTable";
import { WerewolfTable } from "./WerewolfTable";
import { XiangqiRoleTable } from "./XiangqiRoleTable";
import { XiangqiTable } from "./XiangqiTable";
import type { RoomState } from "@/lib/net/room";
import { shallowEqual, useRoomSession, useStore, type GameRoom } from "./useRoom";

// Chỉ lấy bước đang ở: bàn chơi tự đăng ký phần nó cần, nên nước đi không làm cả màn vẽ lại.
const gateOf = (r: RoomState) => ({ phase: r.phase, joining: r.joining, ready: !!r.meta, cap: r.meta?.cap, name: r.meta?.name, game: r.meta?.game });

export function RoomScreen({ slug }: { slug: string }) {
  const id = (useSearchParams().get("id") ?? "").trim().toLowerCase();
  const { uid, profile, lobby } = useNet();
  useWhere({ game: slug, room: id || undefined });
  const session = useRoomSession(slug, id, uid, profile, lobby);
  const view = useStore(session?.roomStore, gateOf, shallowEqual);
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
        Phòng đã đủ {view.cap} người. Thử lại sau hoặc chọn phòng khác nhé.
        {back}
      </Notice>
    );
  if (view.phase === "kicked")
    return (
      <Notice emoji="🚪" title="Bạn đã bị mời ra khỏi phòng">
        {hostTitle(view.game)} đã mời bạn ra khỏi “{view.name}”.
        {back}
      </Notice>
    );
  if (view.phase === "elsewhere") {
    const other = getGame(view.game ?? "");
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
  if (view.phase === "left" || !session || !view.ready)
    return (
      <Notice emoji="👋" title="Bạn đã rời phòng">
        {back}
      </Notice>
    );
  return (
    <>
      <GameTable id={id} slug={slug} session={session} />
      <CheatAlert session={session} />
    </>
  );
}

function GameTable({ id, slug, session }: { id: string; slug: string; session: GameRoom }) {
  // So theo slug thay vì instanceof: nạp lại nóng (HMR) tạo lớp mới khiến phiên cũ không còn là instanceof.
  if (session.game === "loto") return <LotoTable id={id} slug={slug} session={session} />;
  if (session.game === "werewolf") return <WerewolfTable id={id} slug={slug} session={session} />;
  if (session.game === "undercover") return <UndercoverTable id={id} slug={slug} session={session} />;
  if (session.game === "sudoku") return <SudokuTable id={id} slug={slug} session={session} />;
  if (session.game === "xiangqi") return <XiangqiTable id={id} slug={slug} session={session} />;
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
  if (session.game === "co-cho") return <CoChoTable id={id} slug={slug} session={session} />;
  if (session.game === "system-design") return <SystemDesignTable id={id} slug={slug} session={session} />;
  if (session.game === "citta-challenge") return <TamDauTable id={id} slug={slug} session={session} />;
  return <CaroTable id={id} slug={slug} session={session} />;
}
