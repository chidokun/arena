/**
 * Phòng Cờ Tướng nhập vai: mỗi người một role (cung / xe / pháo / mã / tốt);
 * cung = Tướng+Sĩ+Tượng. Claim → Tướng chọn ai đi → move. Chủ phòng chốt timeout/bot.
 */
import {
  AFK_LIMIT,
  afterMove,
  applyMove,
  assignCandidates,
  assignToken,
  beginAssign,
  boardFromPieces,
  canClaim,
  fallbackToken,
  fillOwners,
  isBotOwner,
  legalMoves,
  MIN_PLAYERS,
  normOptions,
  PALACE_ROLE_ID,
  parseIntent,
  pickBotMove,
  piecesOfRole,
  reassignAfk,
  roleAlive,
  roleCanMove,
  roleOfOwner,
  roleOfPiece,
  roleTitle,
  ROLES,
  ROLE_COUNT,
  sideOfOwner,
  skipTurn,
  startMatch,
  type ClaimMs,
  type Side,
  type XqRoleIntent,
  type XqRoleOptions,
  type XqRolePublic,
} from "../games/xiangqi-role";
import { RoomSession, type ChatMsg, type Member, type Meta, type Result, type SeatView } from "./room";

export type TeamChatMsg = ChatMsg & { side: Side };

export type XqRoleMatch = {
  round: number;
  pub: XqRolePublic;
  myRoleId: number | null;
  mySide: Side | null;
  myPieceIds: number[];
  canClaim: boolean;
  /** Palace player of current side can pick who moves. */
  canAssign: boolean;
  assignPicks: number[];
  myTurn: boolean;
  /** pieceId → legal destinations (when my turn). */
  legalByPiece: Record<number, number[]>;
  dead: boolean;
  result?: Result;
};

export type XqRoleView = {
  opts: XqRoleOptions;
  /** Waiting / playing: roleId → uid */
  seats: Record<number, string>;
  match?: XqRoleMatch;
  teamChat: TeamChatMsg[];
};

export class XiangqiRoleRoom extends RoomSession<XqRoleView> {
  readonly game = "xiangqi-role";
  private teamChat: TeamChatMsg[] = [];
  private teamFns = new Set<(m: TeamChatMsg) => void>();
  private teamWired = false;

  private wireTeamChat() {
    if (this.teamWired) return;
    this.teamWired = true;
    this.gossip.onRumor((r) => {
      if (r.t !== "tchat") return;
      const msg = r.p as TeamChatMsg;
      if (!msg || (msg.side !== "red" && msg.side !== "black")) return;
      if (typeof msg.uid !== "string" || !msg.text) return;
      this.pushTeam({ ...msg, id: r.id, text: msg.text.slice(0, 300) });
    });
  }

  private pushTeam(msg: TeamChatMsg) {
    if (this.teamChat.some((c) => c.id === msg.id)) return;
    this.teamChat = [...this.teamChat, msg].sort((a, b) => a.at - b.at).slice(-80);
    for (const fn of this.teamFns) fn(msg);
    this.store.invalidate();
  }

  onTeamChat(fn: (m: TeamChatMsg) => void) {
    this.teamFns.add(fn);
    return () => this.teamFns.delete(fn);
  }

  private ownersOf(m: Meta): Record<number, string> {
    if (m.xqr?.owners) return { ...m.xqr.owners };
    return {};
  }

  private claimMsOf(m: Meta) {
    return normOptions(m.opts).claimMs;
  }

  protected applyIntent(m: Meta, p: Member) {
    if (m.status === "playing") return;
    const i = m.players.indexOf(p.uid);
    if (p.want === "watch") {
      if (i >= 0) m.players.splice(i, 1);
      const owners = this.ownersOf(m);
      for (const [id, uid] of Object.entries(owners)) {
        if (uid === p.uid) delete owners[Number(id)];
      }
      m.xqr = { ...(m.xqr ?? emptyWaiting()), owners };
      return;
    }
    if (p.want !== "play") return;
    const roleId = Array.isArray(p.pick) ? Number(p.pick[0]) : NaN;
    if (!Number.isInteger(roleId) || roleId < 0 || roleId >= ROLE_COUNT) return;
    const owners = this.ownersOf(m);
    for (const [id, uid] of Object.entries(owners)) {
      if (uid === p.uid) delete owners[Number(id)];
    }
    if (owners[roleId] && owners[roleId] !== p.uid) return;
    owners[roleId] = p.uid;
    if (i < 0 && m.players.length < m.seats) m.players.push(p.uid);
    else if (i < 0) return;
    m.xqr = { ...(m.xqr ?? emptyWaiting()), owners };
  }

  protected begin(m: Meta) {
    const online = m.players.filter((u) => this.isOnline(u));
    if (online.length < MIN_PLAYERS) return false;
    const claimed = this.ownersOf(m);
    const humans: Record<number, string> = {};
    for (const [id, uid] of Object.entries(claimed)) {
      if (online.includes(uid)) humans[Number(id)] = uid;
    }
    for (const uid of online) {
      if (roleOfOwner(humans, uid) != null) continue;
      const free = ROLES.find((r) => !humans[r.id]);
      if (free) humans[free.id] = uid;
    }
    m.lineup = online;
    m.xqr = startMatch(fillOwners(humans), Date.now(), this.claimMsOf(m));
    return true;
  }

  protected outcome(m: Meta): Result | undefined {
    const xq = m.xqr;
    if (!xq || xq.phase !== "ended" || !xq.winner) return;
    const winners = m.lineup.filter((u) => sideOfOwner(xq.owners, u) === xq.winner);
    return { round: m.round, winner: winners[0] ?? null, winners, reason: "team" };
  }

  protected watch(_m: Meta) {
    void _m;
    this.wireTeamChat();
  }

  protected hostPlay(m: Meta) {
    this.wireTeamChat();
    const xq = m.xqr;
    if (!xq || xq.phase === "ended") return;
    const now = Date.now();
    const claimMs = this.claimMsOf(m);

    if (xq.phase === "claim") {
      const claims = this.collectClaims(m, xq);
      const claimants = claims.map((c) => c.roleId);
      const cur = claimants.join() !== xq.claimants.join() ? { ...xq, claimants } : xq;
      if (cur !== xq) m.xqr = cur;
      // 2+ claims: Tướng may pick early. 0–1: wait for claim window.
      if (claimants.length >= 2 && this.tryPalaceAssign(m, cur, now)) return;
      if (now >= xq.claimDeadline) {
        this.resolveAfterClaim(m, cur, now, claimMs);
      }
      return;
    }

    if (xq.phase === "assign") {
      if (this.tryPalaceAssign(m, xq, now)) return;
      if (now >= xq.assignDeadline) m.xqr = fallbackToken(xq, now);
      else this.autoAssignIfBot(m, xq, now);
      return;
    }

    if (xq.phase === "move" && xq.tokenRoleId != null) {
      const token = xq.tokenRoleId;
      const owner = xq.owners[token] ?? "";
      const board = boardFromPieces(xq.pieces);

      if (!owner) {
        if (now >= xq.moveDeadline) {
          const pick = pickBotMove(board, token);
          if (!pick) {
            m.xqr = skipTurn(xq, now, claimMs);
            return;
          }
          const applied = applyMove(board, pick.pieceId, pick.to);
          if (!applied) {
            m.xqr = skipTurn(xq, now, claimMs);
            return;
          }
          m.xqr = afterMove(xq, applied.board, applied.last, now, claimMs);
        }
        return;
      }

      const intent = parseIntent(this.gossip.get(`i:${owner}`));
      if (intent?.act === "move" && intent.turn === xq.turn) {
        const piece = board.pieces[intent.pieceId];
        if (piece && roleOfPiece(piece) === token) {
          const applied = applyMove(board, intent.pieceId, intent.to);
          if (applied) {
            m.xqr = afterMove(xq, applied.board, applied.last, now, claimMs);
            if (m.xqr.timeouts[owner]) {
              const timeouts = { ...m.xqr.timeouts, [owner]: 0 };
              m.xqr = { ...m.xqr, timeouts };
            }
            return;
          }
        }
      }

      if (now >= xq.moveDeadline) {
        const timeouts = { ...xq.timeouts, [owner]: (xq.timeouts[owner] ?? 0) + 1 };
        let next = skipTurn({ ...xq, timeouts }, now, claimMs);
        if (timeouts[owner] >= AFK_LIMIT) {
          next = reassignAfk(next, owner);
          this.system(`${this.nameOf(owner)} AFK — role được giao ngẫu nhiên cho đồng đội.`);
        }
        m.xqr = next;
      }
    }
  }

  private collectClaims(m: Meta, xq: XqRolePublic): { uid: string; roleId: number; at: number }[] {
    const out: { uid: string; roleId: number; at: number }[] = [];
    for (const uid of m.lineup) {
      const intent = parseIntent(this.gossip.get(`i:${uid}`));
      if (!intent || intent.act !== "claim" || intent.turn !== xq.turn) continue;
      const roleId = roleOfOwner(xq.owners, uid);
      if (roleId == null || !roleCanMove(xq, roleId)) continue;
      out.push({ uid, roleId, at: intent.at });
    }
    out.sort((a, b) => a.at - b.at || (a.uid < b.uid ? -1 : 1));
    // Dedupe role (keep earliest claim).
    const seen = new Set<number>();
    return out.filter((c) => (seen.has(c.roleId) ? false : (seen.add(c.roleId), true)));
  }

  /**
   * After claim window:
   * 1 claim → that role moves; 2+ → Tướng picks; 0 → fallback.
   */
  private resolveAfterClaim(m: Meta, xq: XqRolePublic, now: number, claimMs: number) {
    const picks = xq.claimants.filter((id) => roleCanMove(xq, id));
    if (picks.length === 1) {
      m.xqr = assignToken(xq, picks[0], now);
      return;
    }
    if (picks.length === 0) {
      m.xqr = fallbackToken(xq, now);
      return;
    }
    const next = beginAssign(xq, now, claimMs);
    m.xqr = next;
    this.autoAssignIfBot(m, next, now);
  }

  /** Human Tướng picks among 2+ claimants; returns true if token assigned. */
  private tryPalaceAssign(m: Meta, xq: XqRolePublic, now: number): boolean {
    if (xq.phase !== "claim" && xq.phase !== "assign") return false;
    if (xq.claimants.filter((id) => roleCanMove(xq, id)).length < 2) return false;
    const palaceId = PALACE_ROLE_ID[xq.side];
    const palaceUid = xq.owners[palaceId] ?? "";
    if (!palaceUid || isBotOwner(palaceUid)) return false;
    const intent = parseIntent(this.gossip.get(`i:${palaceUid}`));
    if (!intent || intent.act !== "assign" || intent.turn !== xq.turn) return false;
    const picks = assignCandidates(xq);
    if (!picks.includes(intent.roleId)) return false;
    m.xqr = assignToken(xq, intent.roleId, now);
    return true;
  }

  private autoAssignIfBot(m: Meta, xq: XqRolePublic, now: number) {
    const palaceId = PALACE_ROLE_ID[xq.side];
    const palaceUid = xq.owners[palaceId] ?? "";
    if (!isBotOwner(palaceUid)) return;
    m.xqr = fallbackToken(xq, now);
  }

  protected tidy(m: Meta) {
    if (!m.xqr?.owners) return;
    if (m.status === "playing") return;
    const owners = { ...m.xqr.owners };
    for (const [id, uid] of Object.entries(owners)) {
      if (uid && !m.players.includes(uid)) delete owners[Number(id)];
    }
    m.xqr = { ...m.xqr, owners };
  }

  protected onKick(m: Meta, uid: string) {
    if (m.status === "playing" && m.xqr) {
      m.lineup = m.lineup.filter((u) => u !== uid);
      m.xqr = reassignAfk(m.xqr, uid);
      if (m.lineup.length < MIN_PLAYERS) {
        m.status = "ended";
        m.result = { round: m.round, winner: null, reason: "leave" };
      }
    }
  }

  protected gameView(m: Meta, seatOf: (uid: string) => SeatView): XqRoleView {
    void seatOf;
    const opts = normOptions(m.opts);
    const seats = this.ownersOf(m);
    const side = sideOfOwner(seats, this.me) ?? (m.xqr ? sideOfOwner(m.xqr.owners, this.me) : null);
    const teamChat = side ? this.teamChat.filter((c) => c.side === side) : [];
    if (!(m.round > 0 && m.xqr && m.lineup.length)) return { opts, seats, teamChat };

    const pub = m.xqr;
    const myRoleId = roleOfOwner(pub.owners, this.me);
    const mySide = myRoleId != null ? ROLES[myRoleId].side : null;
    const dead = myRoleId != null && !roleAlive(pub, myRoleId);
    const board = boardFromPieces(pub.pieces);
    const myTurn = pub.phase === "move" && pub.tokenRoleId === myRoleId && !dead;
    const palaceId = PALACE_ROLE_ID[pub.side];
    const liveClaimants = pub.claimants.filter((id) => roleCanMove(pub, id));
    // Tướng chỉ chọn khi ≥2 người claim.
    const canAssign =
      (pub.phase === "claim" || pub.phase === "assign") &&
      liveClaimants.length >= 2 &&
      myRoleId === palaceId &&
      !dead &&
      !!pub.owners[palaceId];
    const assignPicks = canAssign ? liveClaimants : [];
    const myPieceIds = myRoleId != null ? piecesOfRole(pub.pieces, myRoleId).map((p) => p.id) : [];
    const legalByPiece: Record<number, number[]> = {};
    if (myTurn && myRoleId != null) {
      for (const p of piecesOfRole(pub.pieces, myRoleId)) {
        if (!p.alive) continue;
        const moves = legalMoves(board, p.id);
        if (moves.length) legalByPiece[p.id] = moves;
      }
    }
    return {
      opts,
      seats: pub.owners,
      teamChat: mySide ? this.teamChat.filter((c) => c.side === mySide) : [],
      match: {
        round: m.round,
        pub,
        myRoleId,
        mySide,
        myPieceIds,
        canClaim: myRoleId != null && canClaim(pub, myRoleId),
        canAssign,
        assignPicks,
        myTurn,
        legalByPiece,
        dead,
        result: m.status === "ended" && m.result?.round === m.round ? m.result : undefined,
      },
    };
  }

  protected resultText(r: Result, name: (uid: string) => string) {
    if (r.reason === "team") {
      const side = this.meta()?.xqr?.winner === "black" ? "Đen" : "Đỏ";
      const who = r.winners?.length ? ` (${r.winners.map(name).join(", ")})` : "";
      return `Chiếu bí — phe ${side} thắng!${who}`;
    }
    if (r.reason === "leave" || r.reason === "kick") return `Ván ${r.round} dừng (không đủ người).`;
    return `Ván ${r.round} kết thúc.`;
  }

  /** Host: đổi thời gian claim (chỉ ngoài ván). */
  setClaimMs(ms: ClaimMs) {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      if (normOptions(m.opts).claimMs === ms) return false;
      m.opts = { ...m.opts, claimMs: ms };
    });
  }

  /** Chọn role còn trống (ngoài ván). */
  pickRole(roleId: number) {
    if (!Number.isInteger(roleId) || roleId < 0 || roleId >= ROLE_COUNT) return;
    this.intend("play", [roleId], true);
  }

  join() {
    const m = this.meta();
    const owners = m ? this.ownersOf(m) : {};
    const free = ROLES.find((r) => !owners[r.id]);
    this.intend("play", free ? [free.id] : undefined, true);
  }

  claim() {
    const m = this.meta();
    const g = this.store.get().game?.match;
    if (!m || m.status !== "playing" || !g?.canClaim || g.pub.phase !== "claim") return;
    const body: XqRoleIntent = { act: "claim", turn: g.pub.turn, at: Date.now() };
    this.gossip.set(`i:${this.me}`, body, true);
    this.react();
  }

  /** Tướng picks which claimed/eligible role gets the turn token. */
  assign(roleId: number) {
    const m = this.meta();
    const g = this.store.get().game?.match;
    if (!m || m.status !== "playing" || !g?.canAssign || !g.assignPicks.includes(roleId)) return;
    const body: XqRoleIntent = { act: "assign", turn: g.pub.turn, roleId, at: Date.now() };
    this.gossip.set(`i:${this.me}`, body, true);
    this.react();
  }

  move(pieceId: number, to: number) {
    const m = this.meta();
    const g = this.store.get().game?.match;
    if (!m || !g?.myTurn) return;
    const legal = g.legalByPiece[pieceId];
    if (!legal?.includes(to)) return;
    const body: XqRoleIntent = { act: "move", turn: g.pub.turn, pieceId, to, at: Date.now() };
    this.gossip.set(`i:${this.me}`, body, true);
    this.react();
  }

  sendTeam(text: string) {
    const m = this.meta();
    if (!m || this.store.get().phase !== "ready") return;
    const side = sideOfOwner(this.ownersOf(m), this.me);
    if (!side) return;
    const clean = text.trim().slice(0, 300);
    if (!clean) return;
    const mine = this.gossip.get<Member>(`p:${this.me}`);
    const body: TeamChatMsg = {
      id: "",
      uid: this.me,
      name: mine?.name ?? "?",
      avatar: mine?.avatar ?? "🙂",
      color: mine?.color ?? "#888",
      at: Date.now(),
      text: clean,
      side,
    };
    const r = this.gossip.broadcast("tchat", body);
    this.pushTeam({ ...body, id: r.id });
  }

  roleLabel(roleId: number) {
    return roleTitle(ROLES[roleId]);
  }
}

function emptyWaiting(): XqRolePublic {
  return {
    side: "red",
    phase: "claim",
    turn: 0,
    claimDeadline: 0,
    assignDeadline: 0,
    moveDeadline: 0,
    tokenRoleId: null,
    claimants: [],
    owners: {},
    timeouts: {},
    pieces: [],
    check: false,
    winner: null,
  };
}
