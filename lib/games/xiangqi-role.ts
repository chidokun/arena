/**
 * Multiplayer Xiangqi: each human owns one *role* (piece kind on one side), e.g. all Red Cannons.
 * Max 10 humans; leftover roles are bots. Claim → palace assigns token; traditional move rules.
 */

export type Side = "red" | "black";
export type PieceKind = "general" | "advisor" | "elephant" | "horse" | "chariot" | "cannon" | "soldier";
/** claim = xin lượt; assign = Tướng chọn ai đi; move = đi quân. */
export type TurnPhase = "claim" | "assign" | "move" | "ended";

export const FILES = 9;
export const RANKS = 10;
export const PIECE_COUNT = 32;
export const MIN_PLAYERS = 2;
/** Humans in a room — leftover roles are bots. */
export const MAX_PLAYERS = 10;
/** Claim window options (host-configurable). */
export const CLAIM_OPTIONS = [5_000, 10_000, 15_000, 60_000] as const;
export type ClaimMs = (typeof CLAIM_OPTIONS)[number];
export const CLAIM_MS = 5_000;
export const MOVE_MS = 10_000;
export const BOT_MOVE_MS = 800;
export const AFK_LIMIT = 3;

export function claimLabel(ms: number) {
  if (ms >= 60_000) return `${ms / 60_000} phút`;
  return `${ms / 1000}s`;
}

/** Seat slots per side — palace merges Tướng+Sĩ+Tượng into one player. */
export type RoleKey = "palace" | "horse" | "chariot" | "cannon" | "soldier";

export const ROLE_SLOTS: { key: RoleKey; kinds: PieceKind[]; name: string }[] = [
  { key: "palace", kinds: ["general", "advisor", "elephant"], name: "Tướng · Sĩ · Tượng" },
  { key: "horse", kinds: ["horse"], name: "Mã" },
  { key: "chariot", kinds: ["chariot"], name: "Xe" },
  { key: "cannon", kinds: ["cannon"], name: "Pháo" },
  { key: "soldier", kinds: ["soldier"], name: "Tốt" },
];

export type RoleDef = {
  id: number;
  key: RoleKey;
  kinds: PieceKind[];
  name: string;
  side: Side;
};

/** 0–4 red, 5–9 black (10 seats total). */
export const ROLES: RoleDef[] = [
  ...ROLE_SLOTS.map((s, i) => ({ id: i, key: s.key, kinds: s.kinds, name: s.name, side: "red" as const })),
  ...ROLE_SLOTS.map((s, i) => ({ id: 5 + i, key: s.key, kinds: s.kinds, name: s.name, side: "black" as const })),
];

export const ROLE_COUNT = ROLES.length;
export const PALACE_ROLE_ID = { red: 0, black: 5 } as const;

export const KIND_NAME: Record<PieceKind, string> = {
  general: "Tướng",
  advisor: "Sĩ",
  elephant: "Tượng",
  horse: "Mã",
  chariot: "Xe",
  cannon: "Pháo",
  soldier: "Tốt",
};

export const KIND_EMOJI: Record<PieceKind, string> = {
  general: "帥",
  advisor: "仕",
  elephant: "相",
  horse: "傌",
  chariot: "俥",
  cannon: "炮",
  soldier: "兵",
};

export const BLACK_EMOJI: Record<PieceKind, string> = {
  general: "將",
  advisor: "士",
  elephant: "象",
  horse: "馬",
  chariot: "車",
  cannon: "砲",
  soldier: "卒",
};

export type PieceDef = {
  id: number;
  kind: PieceKind;
  side: Side;
  /** UI label, e.g. "left" | "right" | "1"…"5" */
  label: string;
};

/** Fixed roster: 0–15 red, 16–31 black. */
export const ROSTER: PieceDef[] = [
  { id: 0, kind: "chariot", side: "red", label: "left" },
  { id: 1, kind: "horse", side: "red", label: "left" },
  { id: 2, kind: "elephant", side: "red", label: "left" },
  { id: 3, kind: "advisor", side: "red", label: "left" },
  { id: 4, kind: "general", side: "red", label: "" },
  { id: 5, kind: "advisor", side: "red", label: "right" },
  { id: 6, kind: "elephant", side: "red", label: "right" },
  { id: 7, kind: "horse", side: "red", label: "right" },
  { id: 8, kind: "chariot", side: "red", label: "right" },
  { id: 9, kind: "cannon", side: "red", label: "left" },
  { id: 10, kind: "cannon", side: "red", label: "right" },
  { id: 11, kind: "soldier", side: "red", label: "1" },
  { id: 12, kind: "soldier", side: "red", label: "2" },
  { id: 13, kind: "soldier", side: "red", label: "3" },
  { id: 14, kind: "soldier", side: "red", label: "4" },
  { id: 15, kind: "soldier", side: "red", label: "5" },
  { id: 16, kind: "chariot", side: "black", label: "left" },
  { id: 17, kind: "horse", side: "black", label: "left" },
  { id: 18, kind: "elephant", side: "black", label: "left" },
  { id: 19, kind: "advisor", side: "black", label: "left" },
  { id: 20, kind: "general", side: "black", label: "" },
  { id: 21, kind: "advisor", side: "black", label: "right" },
  { id: 22, kind: "elephant", side: "black", label: "right" },
  { id: 23, kind: "horse", side: "black", label: "right" },
  { id: 24, kind: "chariot", side: "black", label: "right" },
  { id: 25, kind: "cannon", side: "black", label: "left" },
  { id: 26, kind: "cannon", side: "black", label: "right" },
  { id: 27, kind: "soldier", side: "black", label: "1" },
  { id: 28, kind: "soldier", side: "black", label: "2" },
  { id: 29, kind: "soldier", side: "black", label: "3" },
  { id: 30, kind: "soldier", side: "black", label: "4" },
  { id: 31, kind: "soldier", side: "black", label: "5" },
];

/** Starting square index (rank * 9 + file) per piece id. Red at bottom (rank 0). */
const START: number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, // red back
  19, 25, // cannons r2
  27, 29, 31, 33, 35, // soldiers r3
  81, 82, 83, 84, 85, 86, 87, 88, 89, // black back r9
  64, 70, // cannons r7
  54, 56, 58, 60, 62, // soldiers r6
];

export type PieceState = {
  id: number;
  kind: PieceKind;
  side: Side;
  label: string;
  file: number;
  rank: number;
  alive: boolean;
};

export type BoardState = {
  pieces: PieceState[];
  /** cell → pieceId, -1 empty */
  cells: Int8Array;
};

export type LastMove = {
  pieceId: number;
  from: number;
  to: number;
  captured?: number;
};

/** Host-written public match state. */
export type XqRolePublic = {
  side: Side;
  phase: TurnPhase;
  turn: number;
  claimDeadline: number;
  /** Deadline for palace (Tướng) to pick who moves. */
  assignDeadline: number;
  moveDeadline: number;
  /** Role holding the turn token (controls all pieces of that kind+side). */
  tokenRoleId: number | null;
  /** Roles that claimed this turn (ordered by first claim time). */
  claimants: number[];
  /** roleId → uid (human) or "" for bot */
  owners: Record<number, string>;
  /** uid → consecutive move timeouts */
  timeouts: Record<string, number>;
  pieces: PieceState[];
  check: boolean;
  winner: Side | null;
  lastMove?: LastMove;
};

export type XqRoleOptions = { claimMs: ClaimMs };
export const DEFAULT_OPTIONS: XqRoleOptions = { claimMs: CLAIM_MS };

export function normOptions(raw: unknown): XqRoleOptions {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const ms = Number(o.claimMs);
  const claimMs = (CLAIM_OPTIONS as readonly number[]).includes(ms) ? (ms as ClaimMs) : CLAIM_MS;
  return { claimMs };
}

export type XqRoleIntent =
  | { act: "claim"; turn: number; at: number }
  | { act: "assign"; turn: number; roleId: number; at: number }
  | { act: "move"; turn: number; pieceId: number; to: number; at: number };

export function isBotOwner(uid: string | undefined | null) {
  return !uid;
}

export function roleTitle(r: Pick<RoleDef, "name" | "side">) {
  return `${r.name} (${r.side === "red" ? "Đỏ" : "Đen"})`;
}

export function pieceTitle(p: Pick<PieceDef, "kind" | "side" | "label">) {
  const name = KIND_NAME[p.kind];
  const side = p.side === "red" ? "Đỏ" : "Đen";
  if (!p.label) return `${name} ${side}`;
  if (p.kind === "soldier") return `${name} ${p.label} (${side})`;
  const sideLabel = p.label === "left" ? "trái" : "phải";
  return `${name} ${sideLabel} (${side})`;
}

export function roleIdOf(kind: PieceKind, side: Side): number {
  const slot = ROLE_SLOTS.findIndex((s) => s.kinds.includes(kind));
  return side === "red" ? slot : 5 + slot;
}

export function roleOfPiece(p: Pick<PieceDef, "kind" | "side">) {
  return roleIdOf(p.kind, p.side);
}

export function piecesOfRole(pieces: readonly PieceState[], roleId: number): PieceState[] {
  const role = ROLES[roleId];
  if (!role) return [];
  return pieces.filter((p) => p.side === role.side && role.kinds.includes(p.kind));
}

export function glyph(p: Pick<PieceState, "kind" | "side">) {
  return p.side === "red" ? KIND_EMOJI[p.kind] : BLACK_EMOJI[p.kind];
}

export function sq(file: number, rank: number) {
  return rank * FILES + file;
}

export function fileOf(i: number) {
  return i % FILES;
}

export function rankOf(i: number) {
  return (i / FILES) | 0;
}

export function inBoard(file: number, rank: number) {
  return file >= 0 && file < FILES && rank >= 0 && rank < RANKS;
}

function inPalace(side: Side, file: number, rank: number) {
  if (file < 3 || file > 5) return false;
  return side === "red" ? rank >= 0 && rank <= 2 : rank >= 7 && rank <= 9;
}

function crossedRiver(side: Side, rank: number) {
  return side === "red" ? rank >= 5 : rank <= 4;
}

export function emptyBoard(): BoardState {
  const pieces: PieceState[] = ROSTER.map((d) => {
    const i = START[d.id];
    return { id: d.id, kind: d.kind, side: d.side, label: d.label, file: fileOf(i), rank: rankOf(i), alive: true };
  });
  return { pieces, cells: cellsOf(pieces) };
}

export function cellsOf(pieces: readonly PieceState[]): Int8Array {
  const cells = new Int8Array(FILES * RANKS).fill(-1);
  for (const p of pieces) {
    if (p.alive) cells[sq(p.file, p.rank)] = p.id;
  }
  return cells;
}

export function boardFromPieces(pieces: PieceState[]): BoardState {
  return { pieces, cells: cellsOf(pieces) };
}

function at(board: BoardState, file: number, rank: number): PieceState | null {
  if (!inBoard(file, rank)) return null;
  const id = board.cells[sq(file, rank)];
  return id < 0 ? null : board.pieces[id];
}

/** Pseudo-legal moves (ignore check). */
export function rawMoves(board: BoardState, pieceId: number): number[] {
  const p = board.pieces[pieceId];
  if (!p?.alive) return [];
  const out: number[] = [];
  const push = (f: number, r: number) => {
    if (!inBoard(f, r)) return;
    const hit = at(board, f, r);
    if (hit && hit.side === p.side) return;
    out.push(sq(f, r));
  };

  if (p.kind === "general") {
    for (const [df, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const f = p.file + df;
      const r = p.rank + dr;
      if (inPalace(p.side, f, r)) push(f, r);
    }
    return out;
  }

  if (p.kind === "advisor") {
    for (const [df, dr] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      const f = p.file + df;
      const r = p.rank + dr;
      if (inPalace(p.side, f, r)) push(f, r);
    }
    return out;
  }

  if (p.kind === "elephant") {
    for (const [df, dr] of [
      [2, 2],
      [2, -2],
      [-2, 2],
      [-2, -2],
    ] as const) {
      const f = p.file + df;
      const r = p.rank + dr;
      const eyeF = p.file + df / 2;
      const eyeR = p.rank + dr / 2;
      if (!inBoard(f, r) || at(board, eyeF, eyeR)) continue;
      if (p.side === "red" && r > 4) continue;
      if (p.side === "black" && r < 5) continue;
      push(f, r);
    }
    return out;
  }

  if (p.kind === "horse") {
    const legs: [number, number, number, number][] = [
      [0, 1, 1, 2],
      [0, 1, -1, 2],
      [0, -1, 1, -2],
      [0, -1, -1, -2],
      [1, 0, 2, 1],
      [1, 0, 2, -1],
      [-1, 0, -2, 1],
      [-1, 0, -2, -1],
    ];
    for (const [lf, lr, df, dr] of legs) {
      if (at(board, p.file + lf, p.rank + lr)) continue;
      push(p.file + df, p.rank + dr);
    }
    return out;
  }

  if (p.kind === "chariot" || p.kind === "cannon") {
    for (const [df, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      let jumped = false;
      for (let step = 1; ; step++) {
        const f = p.file + df * step;
        const r = p.rank + dr * step;
        if (!inBoard(f, r)) break;
        const hit = at(board, f, r);
        if (p.kind === "chariot") {
          if (!hit) out.push(sq(f, r));
          else {
            if (hit.side !== p.side) out.push(sq(f, r));
            break;
          }
        } else {
          if (!jumped) {
            if (!hit) out.push(sq(f, r));
            else jumped = true;
          } else {
            if (hit) {
              if (hit.side !== p.side) out.push(sq(f, r));
              break;
            }
          }
        }
      }
    }
    return out;
  }

  // soldier
  const fwd = p.side === "red" ? 1 : -1;
  push(p.file, p.rank + fwd);
  if (crossedRiver(p.side, p.rank)) {
    push(p.file + 1, p.rank);
    push(p.file - 1, p.rank);
  }
  return out;
}

/** Generals face each other on an open file — both sides are in check-like illegal state. */
function flyingGeneral(board: BoardState): boolean {
  const a = board.pieces.find((p) => p.alive && p.kind === "general" && p.side === "red");
  const b = board.pieces.find((p) => p.alive && p.kind === "general" && p.side === "black");
  if (!a || !b || a.file !== b.file) return false;
  const lo = Math.min(a.rank, b.rank);
  const hi = Math.max(a.rank, b.rank);
  for (let r = lo + 1; r < hi; r++) if (at(board, a.file, r)) return false;
  return true;
}

export function isInCheck(board: BoardState, side: Side): boolean {
  const gen = board.pieces.find((p) => p.alive && p.kind === "general" && p.side === side);
  if (!gen) return true;
  if (flyingGeneral(board)) return true;
  const target = sq(gen.file, gen.rank);
  for (const p of board.pieces) {
    if (!p.alive || p.side === side) continue;
    if (rawMoves(board, p.id).includes(target)) return true;
  }
  return false;
}

function applyRaw(board: BoardState, pieceId: number, to: number): BoardState {
  const pieces = board.pieces.map((p) => ({ ...p }));
  const mover = pieces[pieceId];
  const capturedId = board.cells[to];
  if (capturedId >= 0) pieces[capturedId] = { ...pieces[capturedId], alive: false };
  mover.file = fileOf(to);
  mover.rank = rankOf(to);
  return boardFromPieces(pieces);
}

/** Legal destinations (not leaving own general in check). */
export function legalMoves(board: BoardState, pieceId: number): number[] {
  const p = board.pieces[pieceId];
  if (!p?.alive) return [];
  return rawMoves(board, pieceId).filter((to) => {
    const next = applyRaw(board, pieceId, to);
    return !isInCheck(next, p.side);
  });
}

export function hasAnyLegalMove(board: BoardState, side: Side): boolean {
  return board.pieces.some((p) => p.alive && p.side === side && legalMoves(board, p.id).length > 0);
}

export function applyMove(board: BoardState, pieceId: number, to: number): { board: BoardState; last: LastMove } | null {
  const legal = legalMoves(board, pieceId);
  if (!legal.includes(to)) return null;
  const from = sq(board.pieces[pieceId].file, board.pieces[pieceId].rank);
  const captured = board.cells[to] >= 0 ? board.cells[to] : undefined;
  const next = applyRaw(board, pieceId, to);
  return { board: next, last: { pieceId, from, to, captured } };
}

export function generalPieceId(side: Side) {
  return side === "red" ? 4 : 20;
}

export function sideOfOwner(owners: Record<number, string>, uid: string): Side | null {
  for (const [id, owner] of Object.entries(owners)) {
    if (owner === uid) return ROLES[Number(id)]?.side ?? null;
  }
  return null;
}

export function roleOfOwner(owners: Record<number, string>, uid: string): number | null {
  for (const [id, owner] of Object.entries(owners)) {
    if (owner === uid) return Number(id);
  }
  return null;
}

/** Role has at least one legal move on this side. */
export function roleCanMove(pub: XqRolePublic, roleId: number): boolean {
  const role = ROLES[roleId];
  if (!role || role.side !== pub.side) return false;
  const board = boardFromPieces(pub.pieces);
  return piecesOfRole(pub.pieces, roleId).some((p) => p.alive && legalMoves(board, p.id).length > 0);
}

/** Role can claim during claim phase. */
export function canClaim(pub: XqRolePublic, roleId: number): boolean {
  if (pub.phase !== "claim") return false;
  return roleCanMove(pub, roleId);
}

/**
 * Roles eligible for the token.
 * With claimants → those; else every role that can move (0-claim fallback).
 */
export function assignCandidates(pub: XqRolePublic): number[] {
  const claimed = pub.claimants.filter((id) => roleCanMove(pub, id));
  if (claimed.length) return claimed;
  return ROLES.filter((r) => r.side === pub.side && roleCanMove(pub, r.id)).map((r) => r.id);
}

export function roleAlive(pub: XqRolePublic, roleId: number): boolean {
  return piecesOfRole(pub.pieces, roleId).some((p) => p.alive);
}

function freshClaim(side: Side, turn: number, now: number, claimMs: number, pieces: PieceState[], check: boolean, extra: Partial<XqRolePublic> = {}): XqRolePublic {
  return {
    side,
    phase: "claim",
    turn,
    claimDeadline: now + claimMs,
    assignDeadline: 0,
    moveDeadline: 0,
    tokenRoleId: null,
    claimants: [],
    owners: {},
    timeouts: {},
    pieces,
    check,
    winner: null,
    ...extra,
  };
}

export function startMatch(owners: Record<number, string>, now = Date.now(), claimMs: number = CLAIM_MS): XqRolePublic {
  return freshClaim("red", 1, now, claimMs, emptyBoard().pieces, false, { owners: { ...owners } });
}

/** After a completed move: next side claim, or checkmate. */
export function afterMove(pub: XqRolePublic, board: BoardState, last: LastMove, now = Date.now(), claimMs: number = CLAIM_MS): XqRolePublic {
  const enemy: Side = pub.side === "red" ? "black" : "red";
  const check = isInCheck(board, enemy);
  const canMove = hasAnyLegalMove(board, enemy);
  if (check && !canMove) {
    return {
      ...pub,
      pieces: board.pieces,
      phase: "ended",
      winner: pub.side,
      check: true,
      lastMove: last,
      tokenRoleId: null,
      claimants: [],
    };
  }
  if (!canMove) {
    return {
      ...pub,
      pieces: board.pieces,
      phase: "ended",
      winner: pub.side,
      check,
      lastMove: last,
      tokenRoleId: null,
      claimants: [],
    };
  }
  return freshClaim(enemy, pub.turn + 1, now, claimMs, board.pieces, check, {
    owners: pub.owners,
    timeouts: pub.timeouts,
    lastMove: last,
  });
}

export function beginAssign(pub: XqRolePublic, now = Date.now(), claimMs: number = CLAIM_MS): XqRolePublic {
  return {
    ...pub,
    phase: "assign",
    assignDeadline: now + claimMs,
  };
}

export function assignToken(pub: XqRolePublic, roleId: number, now = Date.now()): XqRolePublic {
  return {
    ...pub,
    phase: "move",
    tokenRoleId: roleId,
    moveDeadline: now + (isBotOwner(pub.owners[roleId]) ? BOT_MOVE_MS : MOVE_MS),
    claimants: pub.claimants,
  };
}

/** Auto-pick when Tướng AFK / bot: first claimant, else palace, else any. */
export function fallbackToken(pub: XqRolePublic, now = Date.now()): XqRolePublic {
  const picks = assignCandidates(pub);
  if (picks.length) return assignToken(pub, picks[0], now);
  const palace = PALACE_ROLE_ID[pub.side];
  if (roleCanMove(pub, palace)) return assignToken(pub, palace, now);
  return { ...pub, phase: "ended", winner: pub.side === "red" ? "black" : "red", tokenRoleId: null, claimants: [] };
}

export function skipTurn(pub: XqRolePublic, now = Date.now(), claimMs: number = CLAIM_MS): XqRolePublic {
  const enemy: Side = pub.side === "red" ? "black" : "red";
  return freshClaim(enemy, pub.turn + 1, now, claimMs, pub.pieces, isInCheck(boardFromPieces(pub.pieces), enemy), {
    owners: pub.owners,
    timeouts: pub.timeouts,
    lastMove: pub.lastMove,
  });
}

export function pickBotMove(board: BoardState, roleId: number): { pieceId: number; to: number } | null {
  const role = ROLES[roleId];
  if (!role) return null;
  const candidates: { pieceId: number; to: number }[] = [];
  for (const p of board.pieces) {
    if (!p.alive || p.side !== role.side || !role.kinds.includes(p.kind)) continue;
    for (const to of legalMoves(board, p.id)) candidates.push({ pieceId: p.id, to });
  }
  if (!candidates.length) return null;
  return candidates[(Math.random() * candidates.length) | 0];
}

/** Reassign AFK role to a random living human teammate, else bot. */
export function reassignAfk(pub: XqRolePublic, uid: string, rng = Math.random): XqRolePublic {
  const roleId = roleOfOwner(pub.owners, uid);
  if (roleId == null) return pub;
  const side = ROLES[roleId].side;
  const teammates = Object.entries(pub.owners)
    .filter(([id, owner]) => {
      const rid = Number(id);
      return owner && owner !== uid && ROLES[rid]?.side === side && roleAlive(pub, rid);
    })
    .map(([, owner]) => owner);
  const next = teammates.length ? teammates[(rng() * teammates.length) | 0] : "";
  return { ...pub, owners: { ...pub.owners, [roleId]: next } };
}

export function fillOwners(human: Record<number, string>): Record<number, string> {
  const out: Record<number, string> = {};
  for (let i = 0; i < ROLE_COUNT; i++) out[i] = human[i] ?? "";
  return out;
}

export function parseIntent(raw: unknown): XqRoleIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const x = raw as Partial<XqRoleIntent> & { act?: string };
  if (x.act === "claim" && typeof x.turn === "number" && typeof x.at === "number") return { act: "claim", turn: x.turn, at: x.at };
  if (x.act === "assign" && typeof x.turn === "number" && typeof x.roleId === "number" && typeof x.at === "number") {
    return { act: "assign", turn: x.turn, roleId: x.roleId, at: x.at };
  }
  if (x.act === "move" && typeof x.turn === "number" && typeof x.pieceId === "number" && typeof x.to === "number" && typeof x.at === "number") {
    return { act: "move", turn: x.turn, pieceId: x.pieceId, to: x.to, at: x.at };
  }
  return null;
}
