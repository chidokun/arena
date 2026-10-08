import assert from "node:assert/strict";
import { test } from "node:test";
import {
  afterMove,
  applyMove,
  assignCandidates,
  assignToken,
  beginAssign,
  boardFromPieces,
  canClaim,
  emptyBoard,
  fallbackToken,
  fillOwners,
  generalPieceId,
  isInCheck,
  legalMoves,
  PALACE_ROLE_ID,
  piecesOfRole,
  rawMoves,
  ROLE_COUNT,
  roleIdOf,
  ROLES,
  ROSTER,
  sq,
  startMatch,
  type PieceState,
} from "./xiangqi-role.ts";

function piece(id: number, file: number, rank: number, alive = true): PieceState {
  const d = ROSTER[id];
  return { id, kind: d.kind, side: d.side, label: d.label, file, rank, alive };
}

test("10 role: cung gộp tướng+sĩ+tượng", () => {
  assert.equal(ROLE_COUNT, 10);
  assert.equal(ROLES[0].key, "palace");
  assert.deepEqual(ROLES[0].kinds, ["general", "advisor", "elephant"]);
  assert.equal(roleIdOf("general", "red"), PALACE_ROLE_ID.red);
  assert.equal(roleIdOf("advisor", "red"), PALACE_ROLE_ID.red);
  assert.equal(roleIdOf("elephant", "black"), PALACE_ROLE_ID.black);
  assert.equal(piecesOfRole(emptyBoard().pieces, PALACE_ROLE_ID.red).length, 5); // 1 gen + 2 adv + 2 ele
});

test("bàn khởi tạo: 32 quân, tướng đúng chỗ", () => {
  const b = emptyBoard();
  assert.equal(b.pieces.filter((p) => p.alive).length, 32);
  assert.equal(b.pieces[generalPieceId("red")].file, 4);
  assert.equal(b.pieces[generalPieceId("red")].rank, 0);
  assert.equal(b.pieces[generalPieceId("black")].rank, 9);
});

test("xe đi ngang dọc, bị quân mình cản", () => {
  const b = emptyBoard();
  const moves = rawMoves(b, 0);
  assert.ok(moves.includes(sq(0, 1)));
  assert.ok(moves.includes(sq(0, 2)));
  assert.ok(!moves.includes(sq(0, 4)));
});

test("pháo bắt quân qua đúng một bàn đạp", () => {
  const ps = emptyBoard().pieces.map((p) => ({ ...p, alive: false }));
  ps[9] = piece(9, 1, 2);
  ps[27] = piece(27, 1, 5);
  ps[24] = piece(24, 1, 9);
  ps[4] = piece(4, 4, 0);
  ps[20] = piece(20, 4, 9);
  const moves = rawMoves(boardFromPieces(ps), 9);
  assert.ok(moves.includes(sq(1, 9)));
});

test("không được đi nước để lộ mặt tướng", () => {
  const ps = emptyBoard().pieces.map((p) => ({ ...p, alive: false }));
  ps[4] = piece(4, 4, 0);
  ps[20] = piece(20, 4, 9);
  ps[0] = piece(0, 4, 5);
  const legal = legalMoves(boardFromPieces(ps), 0);
  assert.ok(!legal.includes(sq(5, 5)));
  assert.ok(legal.some((m) => m % 9 === 4));
});

test("claim theo role: pháo đỏ claim được, pháo đen không", () => {
  const cannonRed = roleIdOf("cannon", "red");
  const cannonBlack = roleIdOf("cannon", "black");
  const pub = startMatch(fillOwners({ [PALACE_ROLE_ID.red]: "alice", [cannonRed]: "bob" }), 1000);
  assert.ok(canClaim(pub, cannonRed));
  assert.ok(!canClaim(pub, cannonBlack));
});

test("fallback không có claim → token cho cung (tướng·sĩ·tượng)", () => {
  const next = fallbackToken(startMatch(fillOwners({ [PALACE_ROLE_ID.red]: "alice" }), 1000), 2000);
  assert.equal(next.phase, "move");
  assert.equal(next.tokenRoleId, PALACE_ROLE_ID.red);
});

test("1 claim → token cho đúng role đó (không cần Tướng)", () => {
  const cannon = roleIdOf("cannon", "red");
  let pub = startMatch(fillOwners({ [PALACE_ROLE_ID.red]: "alice", [cannon]: "bob" }), 1000);
  pub = { ...pub, claimants: [cannon] };
  const next = assignToken(pub, cannon, 6000);
  assert.equal(next.phase, "move");
  assert.equal(next.tokenRoleId, cannon);
});

test("≥2 claim → Tướng chọn trong số đã claim", () => {
  const cannon = roleIdOf("cannon", "red");
  const horse = roleIdOf("horse", "red");
  let pub = startMatch(fillOwners({ [PALACE_ROLE_ID.red]: "alice", [cannon]: "bob", [horse]: "carol" }), 1000);
  pub = { ...pub, claimants: [cannon, horse] };
  assert.deepEqual(assignCandidates(pub), [cannon, horse]);
  const assigned = assignToken(pub, horse, 1500);
  assert.equal(assigned.phase, "move");
  assert.equal(assigned.tokenRoleId, horse);
});

test("≥2 claim hết giờ → phase assign cho Tướng", () => {
  const cannon = roleIdOf("cannon", "red");
  const horse = roleIdOf("horse", "red");
  let pub = startMatch(fillOwners({ [PALACE_ROLE_ID.red]: "alice", [cannon]: "bob", [horse]: "carol" }), 1000);
  pub = { ...pub, claimants: [cannon, horse] };
  const next = beginAssign(pub, 6000, 5000);
  assert.equal(next.phase, "assign");
  assert.equal(next.assignDeadline, 11000);
});

test("afterMove chuyển phe", () => {
  const pub = startMatch(fillOwners({ [roleIdOf("cannon", "red")]: "bob" }), 1000);
  const applied = applyMove(emptyBoard(), 9, sq(1, 1));
  assert.ok(applied);
  const next = afterMove(pub, applied!.board, applied!.last, 5000);
  assert.equal(next.side, "black");
  assert.equal(next.phase, "claim");
  assert.equal(next.turn, 2);
});

test("chiếu khi xe đối đầu tướng không có chắn", () => {
  const ps = emptyBoard().pieces.map((p) => ({ ...p, alive: false }));
  ps[4] = piece(4, 4, 0);
  ps[20] = piece(20, 4, 9);
  ps[0] = piece(0, 0, 9);
  assert.ok(isInCheck(boardFromPieces(ps), "black"));
});
