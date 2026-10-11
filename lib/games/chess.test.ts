import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMove, insufficient, legalMoves, material, notate, parseFen, QUEEN, KNIGHT, replay, SIZE, startPosition, type Move, type Position } from "./chess.ts";

/** Ô theo tên, vd. "e4". */
const sq = (name: string) => (SIZE - Number(name[1])) * SIZE + name.charCodeAt(0) - 97;
/** Nước theo ký hiệu toạ độ, vd. "e2e4", "e7e8q". */
const mv = (uci: string): Move => {
  const promo = { q: QUEEN, r: 4, b: 3, n: KNIGHT }[uci[4] as "q"];
  return promo ? [sq(uci.slice(0, 2)), sq(uci.slice(2, 4)), promo] : [sq(uci.slice(0, 2)), sq(uci.slice(2, 4))];
};
const play = (ucis: string, fen?: string) => replay(ucis.split(" ").filter(Boolean).map(mv), fen ? parseFen(fen) : undefined);

function perft(p: Position, depth: number): number {
  const moves = legalMoves(p);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(applyMove(p, m).pos, depth - 1);
  return n;
}

// Số thế cờ chuẩn (chessprogramming.org/Perft_Results) — bắt lỗi nhập thành, bắt tốt qua đường, phong cấp, ghim quân.
test("perft thế khai cuộc", () => {
  assert.equal(perft(startPosition(), 1), 20);
  assert.equal(perft(startPosition(), 2), 400);
  assert.equal(perft(startPosition(), 3), 8902);
});

test("perft Kiwipete (nhập thành, ghim, bắt tốt qua đường)", () => {
  const p = parseFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
  assert.equal(perft(p, 1), 48);
  assert.equal(perft(p, 2), 2039);
  assert.equal(perft(p, 3), 97862);
});

test("perft thế tàn cuộc (bắt tốt qua đường để lộ Vua)", () => {
  const p = parseFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");
  assert.equal(perft(p, 1), 14);
  assert.equal(perft(p, 2), 191);
  assert.equal(perft(p, 3), 2812);
  assert.equal(perft(p, 4), 43238);
});

test("perft thế phong cấp", () => {
  const p = parseFen("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1");
  assert.equal(perft(p, 1), 6);
  assert.equal(perft(p, 2), 264);
  assert.equal(perft(p, 3), 9467);
  const q = parseFen("rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8");
  assert.equal(perft(q, 1), 44);
  assert.equal(perft(q, 2), 1486);
});

test("chiếu hết kiểu học trò", () => {
  const s = play("e2e4 e7e5 f1c4 b8c6 d1h5 g8f6 h5f7");
  assert.equal(s.winner, 1);
  assert.equal(s.end, "mate");
  assert.deepEqual(s.notes, ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]);
  assert.deepEqual(s.legal, []);
  assert.equal(s.count, 7);
});

test("hết nước mà không bị chiếu là hoà", () => {
  const u = play("g5g6", "7k/5Q2/8/6K1/8/8/8/8 w - - 0 1");
  assert.equal(u.end, "stalemate");
  assert.equal(u.draw, true);
  assert.equal(u.winner, 0);
});

test("nhập thành hai cánh, Xe đi kèm, mất quyền khi Vua đã đi", () => {
  const s = play("e1g1", "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  assert.equal(s.board[sq("g1")], 6);
  assert.equal(s.board[sq("f1")], 4);
  assert.equal(s.board[sq("h1")], 0);
  assert.equal(s.ids[sq("f1")], sq("h1"));
  assert.equal(s.notes[0], "O-O");
  const q = play("e1c1 e8g8", "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  assert.deepEqual(q.notes, ["O-O-O", "O-O"]);
  assert.equal(q.board[sq("d1")], 4);
  assert.equal(q.board[sq("f8")], -4);
  // Xe trắng ở d1 khống chế d8 nên Đen không nhập thành cánh Hậu được.
  assert.equal(play("e1c1 e8c8", "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1").count, 1);
  // Vua đi rồi về: không được nhập thành nữa.
  const back = play("e1e2 e8e7 e2e1 e7e8", "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  assert.ok(!back.legal.some(([f, t]) => f === sq("e1") && Math.abs(t - f) === 2));
});

test("không được nhập thành khi đang bị chiếu hay đi qua ô bị khống chế", () => {
  const castles = (fen: string) => legalMoves(parseFen(fen)).filter(([f, t]) => f === sq("e1") && Math.abs(t - f) === 2).map(([, t]) => t);
  assert.deepEqual(castles("r3k2r/8/8/4r3/8/8/8/R3K2R w KQkq - 0 1"), []);
  assert.deepEqual(castles("r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1"), [sq("c1")]);
  const q = parseFen("4k3/8/8/8/8/8/8/R3K2r w Q - 0 1");
  assert.ok(legalMoves(q).every(([f, t]) => !(f === sq("e1") && t === sq("c1"))));
});

test("bắt tốt qua đường", () => {
  const s = play("e2e4 a7a6 e4e5 d7d5 e5d6");
  assert.equal(s.board[sq("d5")], 0);
  assert.equal(s.board[sq("d6")], 1);
  assert.equal(s.captured.length, 1);
  assert.equal(s.notes[4], "exd6");
  // Bỏ lỡ một nước thì mất quyền bắt.
  const late = play("e2e4 a7a6 e4e5 d7d5 a2a3 a6a5 e5d6");
  assert.equal(late.count, 6);
});

test("phong cấp phải chọn quân, ghi biên bản =Q", () => {
  const fen = "7k/P7/8/8/8/8/8/K7 w - - 0 1";
  assert.equal(play("a7a8", fen).count, 0);
  const s = play("a7a8q", fen);
  assert.equal(s.board[sq("a8")], QUEEN);
  assert.equal(s.notes[0], "a8=Q+");
  assert.equal(play("a7a8n", fen).board[sq("a8")], KNIGHT);
});

test("ghi thêm cột / hàng khi hai quân cùng loại tới được một ô", () => {
  const p = parseFen("4k3/8/8/8/8/8/8/R4RK1 w - - 0 1");
  assert.equal(notate(p, mv("a1d1")), "Rad1");
  const q = parseFen("4k3/8/8/R7/8/8/8/R3K3 w - - 0 1");
  assert.equal(notate(q, mv("a1a3")), "R1a3");
});

test("lặp thế cờ ba lần là hoà", () => {
  const s = play("g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8");
  assert.equal(s.end, "repeat");
  assert.equal(s.draw, true);
  assert.equal(s.count, 8);
});

test("không đủ quân chiếu hết", () => {
  assert.ok(insufficient(parseFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1").board));
  assert.ok(insufficient(parseFen("4k3/8/8/8/8/8/8/2B1K3 w - - 0 1").board));
  assert.ok(insufficient(parseFen("2b1k3/8/8/8/8/8/8/3BK3 w - - 0 1").board));
  assert.ok(!insufficient(parseFen("1b2k3/8/8/8/8/8/8/3BK3 w - - 0 1").board));
  assert.ok(!insufficient(parseFen("4k3/8/8/8/8/8/8/R3K3 w - - 0 1").board));
  const s = play("e1d1", "4k3/8/8/8/8/8/8/3qK3 w - - 0 1");
  assert.equal(s.end, "material");
});

test("50 nước không ăn quân, không đi Tốt là hoà", () => {
  // Đi Xe / Vua lòng vòng, không bao giờ lặp thế cờ, không chiếu, không ăn quân.
  let p = parseFen("rnb1k3/8/8/8/8/8/8/1NB1K2R w - - 0 1");
  const seen = new Set([p.board.join()]);
  const moves: Move[] = [];
  while (moves.length < 100) {
    const m = legalMoves(p).find((x) => {
      const a = applyMove(p, x);
      return !a.taken && !seen.has(a.pos.board.join()) && legalMoves(a.pos).length && !insufficient(a.pos.board);
    });
    assert.ok(m, `bí ở nước ${moves.length}`);
    p = applyMove(p, m).pos;
    seen.add(p.board.join());
    moves.push(m);
  }
  const s = replay(moves, parseFen("rnb1k3/8/8/8/8/8/8/1NB1K2R w - - 0 1"));
  assert.equal(s.end, "fifty");
  assert.equal(s.count, 100);
  assert.equal(replay(moves.slice(0, 99), parseFen("rnb1k3/8/8/8/8/8/8/1NB1K2R w - - 0 1")).draw, false);
});

test("nước sai luật hay sau khi hết ván thì dừng ở đó", () => {
  assert.equal(play("e2e5").count, 0);
  assert.equal(replay([[sq("e2"), sq("e4")], "x", [sq("e7"), sq("e5")]]).count, 1);
  const s = play("f2f3 e7e5 g2g4 d8h4 a2a3");
  assert.equal(s.winner, 2);
  assert.equal(s.count, 4);
});

test("chênh lệch quân", () => {
  assert.equal(material(startPosition().board), 0);
  assert.equal(material(parseFen("4k3/8/8/8/8/8/8/Q3K3 w - - 0 1").board), 9);
});
