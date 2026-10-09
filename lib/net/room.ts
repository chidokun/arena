/**
 * Phiên phòng chơi. Toàn bộ trạng thái phòng là một gossip store nhân bản giữa những người trong phòng:
 *
 *   meta            — do chủ phòng ghi: tên, sức chứa, luật, danh sách ghế, trạng thái ván, danh sách bị kick…
 *   p:<uid>         — mỗi người tự ghi: hồ sơ, nhịp tim, và *ý định* (muốn vào ghế / rời ghế, chọn tờ) kèm số thứ tự.
 *   g:<round>       — nhật ký của ván: caro, cờ tướng, thả cờ 4 là nước đi (hai người chơi lần lượt nối thêm, luôn ghi sau khi đã thấy
 *                     nước trước), bắn tàu là phát bắn và câu trả lời, lô tô là dãy số chủ phòng đã kêu.
 *   x:<round>:<uid> — người chơi xin thua.
 *   v:<round>:<uid> — ma sói, undercover: phiếu bầu công khai của từng người; cờ tướng: lời xin hoà (kèm số nước lúc xin).
 *   a:<round>:<uid> — ma sói: hành động ban đêm, niêm phong gửi riêng quản trò (chủ phòng).
 *   s:<round>:<uid> — ma sói, undercover: bí mật quản trò gửi riêng từng người (vai, từ khoá…), niêm phong.
 *   c:<round>:<uid> — undercover: mô tả từ khoá của từng người trong vòng hiện tại, công khai.
 *   w:<round>:<uid> — undercover: phe Trắng bị loại đoán từ khoá, công khai.
 *   m:<round>:<uid> — sudoku: nhật ký nước điền của từng người; chủ phòng phân xử thứ tự rồi ghi bàn chung vào `g:<ván>`.
 *   i:<uid>         — né bão: input hiện tại (phím / bắn), mỗi người tự ghi LWW.
 *   f:<round>:<uid> — bắn tàu: cam kết hạm đội (SHA-256) lúc bày xong, hết ván thêm hạm đội + muối để đối chiếu.
 *
 * "Chốt" trạng thái người dùng: người dùng chỉ phát ý định; chủ phòng là người duy nhất ghi `meta`, xử lý ý định
 * theo thứ tự rồi ghi nhận (`ack`). Vì chỉ có một người ghi nên không có xung đột ghế; gossip đảm bảo mọi người
 * cuối cùng thấy cùng một `meta`. Kết quả ván suy ra tất định từ nhật ký nên ai cũng tự tính được.
 * Chủ phòng rớt mạng quá hạn thì người kế nhiệm (tất định: người chơi theo ghế, rồi người vào sớm nhất) tiếp quản.
 *
 * RoomSession lo phần chung (kết nối, ghế, chat, quyền chủ phòng); luật riêng của từng game nằm ở lớp con
 * (CaroRoom, LotoRoom, WerewolfRoom, UndercoverRoom, SudokuRoom, XiangqiRoom, DodgeRoom, XiangqiRoleRoom, ConnectFourRoom,
 * BattleshipRoom)
 * qua các hook `applyIntent`, `begin`, `outcome`, `hostPlay`, `gameView`…
 */
import type { DodgePublic } from "../games/dodge";
import type { SudokuRound } from "../games/sudoku";
import type { Public as UcPublic, Role as UcTeam } from "../games/undercover";
import type { Public as WolfPublic, Side } from "../games/werewolf";
import type { XqRolePublic } from "../games/xiangqi-role";
import { hostTitle } from "../games/registry";
import type { Profile } from "../identity";
import { isStickerId, type StickerId } from "../stickers";
import { Gossip, Liveness, type Rumor } from "./gossip";
import type { Lobby, RoomAd } from "./lobby";
import { ViewStore } from "./view-store";
import { openChannel, Redialer, type Channel } from "./wire";

export type Status = "waiting" | "playing" | "ended";

export type Result = {
  round: number;
  /** Người thắng; null nếu hoà hoặc không ai thắng (lô tô kinh trùng xem `winners`). */
  winner: string | null;
  loser?: string;
  /** Lô tô: những người kinh cùng một số — từ hai người trở lên là kinh trùng. */
  winners?: string[];
  /** Cờ tướng: "mate" là thắng theo luật (chiếu bí, bí nước, đối phương chiếu dai), "agree" là hai bên đồng ý hoà. Bắn tàu: "sunk" là đánh chìm hết hạm đội. */
  reason: "line" | "draw" | "resign" | "leave" | "kick" | "kinh" | "stop" | "team" | "solve" | "mate" | "agree" | "sunk";
  /** Ma sói, undercover: phe thắng (`winners` là những người thắng). */
  team?: Side | UcTeam;
};

export type Meta = {
  game: string;
  name: string;
  host: string;
  /** Số người chơi tối đa (caro: 2 ghế; lô tô: số tờ). */
  seats: number;
  /** Số người tối đa trong phòng, tính cả người xem; 0 là không giới hạn. */
  cap: number;
  /** Tuỳ chọn riêng của game (CaroOptions, LotoOptions). */
  opts: Record<string, unknown>;
  status: Status;
  round: number;
  players: string[];
  /** Đội hình của ván hiện tại, chốt lúc bắt đầu (caro: lineup[0] cầm X đi trước, lineup[1] cầm O). */
  lineup: string[];
  /** Lô tô: các tờ mỗi người đang giữ (đổi được giữa các ván). */
  claims?: Record<string, number[]>;
  /** Lô tô: các tờ đã chia cho ván hiện tại, chốt lúc bắt đầu. */
  dealt?: Record<string, number[]>;
  /** Lô tô: những người đã bấm sẵn sàng cho ván tới; xoá khi ván bắt đầu (mỗi ván sẵn sàng lại). */
  ready?: string[];
  /** Lô tô: chủ phòng tạm dừng kêu số. */
  paused?: boolean;
  /** Ma sói: phần công khai của ván gần nhất. */
  ww?: WolfPublic;
  /** Undercover: phần công khai của ván gần nhất. */
  uc?: UcPublic;
  /** Sudoku: đề và chế độ của ván gần nhất, chốt lúc bắt đầu. */
  sd?: SudokuRound;
  /** Né bão: runner, cạnh nấp, điểm sống — chủ phòng cập nhật khi đổi lượt / dừng. */
  dg?: DodgePublic;
  /** Cờ tướng nhập vai: ownership + board + turn phase (chủ phòng ghi). */
  xqr?: XqRolePublic;
  /** Undercover: mã các cặp từ đã chơi trong phòng (ghi khi hết ván) — không bốc lại. */
  ucUsed?: number[];
  ack: Record<string, number>;
  kicked: string[];
  result?: Result;
  /** Caro, cờ tướng: số ván thắng của từng người trong phòng, cộng dồn qua các ván. */
  wins?: Record<string, number>;
  /** Caro, cờ tướng: số ván hoà. */
  draws?: number;
  /** Caro: ván gần nhất đã cộng vào `wins`/`draws` — để mỗi kết quả chỉ được tính một lần. */
  scored?: number;
  created: number;
};

export type Member = Profile & {
  uid: string;
  peer: string;
  hb: number;
  joined: number;
  want: "play" | "watch" | null;
  /** Lựa chọn đi kèm ý định (lô tô: các tờ muốn giữ). */
  pick?: number[];
  /** Ý định "sẵn sàng chơi" đi kèm (lô tô: bấm sau khi chọn tờ). */
  ready?: boolean;
  /** Khoá công khai ECDH để nhận / gửi bản ghi niêm phong (ma sói, undercover). */
  key?: string;
  seq: number;
  left?: boolean;
};

export type { StickerId };

export type ChatMsg = {
  id: string;
  uid: string;
  name: string;
  avatar: string;
  color: string;
  at: number;
  text?: string;
  sticker?: StickerId;
  system?: boolean;
  /** Câu rao tự động thay người chơi (lô tô: "Hò!", "Kinh!"). */
  shout?: boolean;
  /** Undercover: mô tả từ khoá của người chơi, chép vào khung chat (tô tím). */
  clue?: boolean;
};

export type Phase = "connecting" | "ready" | "notfound" | "full" | "kicked" | "left" | "elsewhere";

export type SeatView = { uid: string; member?: Member; online: boolean };

export type RoomView<G = unknown> = {
  phase: Phase;
  me: string;
  meta?: Meta;
  isHost: boolean;
  peers: number;
  members: Member[];
  online: Set<string>;
  seats: SeatView[];
  spectators: Member[];
  mySeat: number;
  pending: "play" | "watch" | null;
  /** Phần riêng của game (bàn cờ, tờ lô tô…); có khi đã có meta. */
  game?: G;
  chat: ChatMsg[];
};

export type CreateRoom = { name: string; cap: number; seats: number; opts: Record<string, unknown> };

const HEARTBEAT_MS = 2000;
const MEMBER_TIMEOUT_MS = 9000;
// Đủ dài để chủ phòng tải lại trang (kết nối lại qua relay mất vài giây) mà không bị tiếp quản.
const HOST_TAKEOVER_MS = 20000;
// Snapshot chỉ để tải lại trang. Cũ hơn ngưỡng tiếp quản thì chủ phòng có thể đã đổi: khôi phục lại sẽ ghi đè
// trạng thái mới hơn của cả phòng (đồng hồ Lamport bị đẩy lên khi trao đổi digest nên bản cũ vẫn "thắng").
const SNAPSHOT_TTL_MS = HOST_TAKEOVER_MS;
const SETTLE_MS = 2500;
const NOT_FOUND_MS = 20000;
// Sảnh vẫn thấy quảng bá của phòng (chủ phòng còn sống) thì kiên nhẫn chờ bắt tay lâu hơn.
const NOT_FOUND_ADVERTISED_MS = 60000;
const DROP_SEAT_MS = 15000;
const CHAT_LIMIT = 120;
// Chặn vòng lặp react() tự gọi lại vô hạn nếu một hook cứ ghi mãi.
const MAX_REACT_PASSES = 8;

// Bản ghi gắn với một ván (`<tiền tố><ván>:…`), dọn khi sang ván mới.
const ROUND_KEYS = ["g:", "x:", "v:", "a:", "s:", "c:", "w:", "m:", "f:"];
// Bản ghi chỉ chính chủ được ghi (khoá kết thúc bằng `:<uid>` của người ghi).
const OWN_KEYS = ["x:", "v:", "a:", "c:", "w:", "m:", "i:", "f:"];

const createKey = (id: string) => `arena:create:${id}`;
const snapKey = (id: string) => `arena:room:${id}`;

export function stashCreate(id: string, c: CreateRoom) {
  try {
    sessionStorage.setItem(createKey(id), JSON.stringify(c));
  } catch {}
}

function takeCreate(id: string): CreateRoom | null {
  try {
    const raw = sessionStorage.getItem(createKey(id));
    sessionStorage.removeItem(createKey(id));
    return raw ? (JSON.parse(raw) as CreateRoom) : null;
  } catch {
    return null;
  }
}

type RoomCtor<T> = new (id: string, me: string, profile: Profile, lobby: Lobby, channel: Channel) => T;

export abstract class RoomSession<G = unknown> {
  readonly id: string;
  readonly me: string;
  /** Slug của game; phòng của game khác thì không vào. */
  abstract readonly game: string;
  private profile: Profile;
  private lobby: Lobby;
  private channel: Channel;
  readonly gossip: Gossip;
  private live = new Liveness(MEMBER_TIMEOUT_MS);
  private openedAt = Date.now();
  private metaSeenAt = 0;
  private phase: Phase = "connecting";
  private chat: ChatMsg[] = [];
  private chatFns = new Set<(m: ChatMsg) => void>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private prevOnline = new Set<string>();
  private lastStatus = "";
  private lastAd = 0;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private joined = Date.now();
  private want: Member["want"] = null;
  private choice: number[] | undefined;
  private ready = false;
  private redialer: Redialer;
  private reacting = false;
  private reactAgain = false;
  readonly store: ViewStore<RoomView<G>>;

  /** Mở phiên phòng của một game cụ thể, vd. `LotoRoom.open(...)`. */
  static async open<T extends RoomSession>(this: RoomCtor<T>, id: string, me: string, profile: Profile, lobby: Lobby): Promise<T> {
    const channel = await openChannel(`room:${id}`);
    const session = new this(id, me, profile, lobby, channel);
    session.boot();
    return session;
  }

  constructor(id: string, me: string, profile: Profile, lobby: Lobby, channel: Channel) {
    this.id = id;
    this.me = me;
    this.profile = profile;
    this.lobby = lobby;
    this.channel = channel;
    this.gossip = new Gossip(me, channel, {
      fanout: 3,
      intervalMs: 1000,
      accept: (e) => {
        if (e.k.startsWith("p:")) return e.k === `p:${e.w}`;
        if (OWN_KEYS.some((p) => e.k.startsWith(p))) return e.k.endsWith(`:${e.w}`);
        return true;
      },
    });
    this.store = new ViewStore(() => this.compute());
    // Sảnh cho biết còn ai khác đang ở phòng này: nếu kênh phòng vẫn trống thì lần bắt tay trước đã hỏng → vào lại.
    this.redialer = new Redialer(channel, () => {
      const ad = lobby.roomAd(id);
      return (!!ad && ad.host !== me) || lobby.store.get().users.some((u) => u.room === id && u.uid !== me);
    });
  }

  /** Khởi động phiên. Tách khỏi constructor để hook của lớp con chạy khi lớp con đã khởi tạo xong. */
  private boot() {
    // Khôi phục khi tải lại trang: giữ được đồng hồ Lamport, nhật ký ván, và quyền chủ phòng.
    try {
      const raw = sessionStorage.getItem(snapKey(this.id));
      const snap = raw ? JSON.parse(raw) : null;
      if (snap && Date.now() - Number(snap.at) < SNAPSHOT_TTL_MS) {
        this.gossip.restore(snap);
        if (Array.isArray(snap.chat)) this.chat = snap.chat;
        const mine = this.gossip.get<Member>(`p:${this.me}`);
        if (mine) {
          this.seq = mine.seq;
          this.joined = mine.joined;
          this.want = mine.want;
          this.choice = mine.pick;
          this.ready = !!mine.ready;
        }
      }
    } catch {}

    const create = takeCreate(this.id);
    if (create && !this.meta()) {
      const meta: Meta = {
        game: this.game,
        name: create.name,
        host: this.me,
        seats: create.seats,
        cap: create.cap,
        opts: create.opts,
        status: "waiting",
        round: 0,
        players: [this.me],
        lineup: [],
        ack: {},
        kicked: [],
        created: Date.now(),
      };
      this.tidy?.(meta);
      this.gossip.set("meta", meta);
    }

    this.gossip.onChange((keys) => {
      for (const k of keys) {
        if (k.startsWith("p:")) {
          const m = this.gossip.get<Member>(k);
          if (m) this.live.observe(k.slice(2), m.hb, !!m.left);
        }
        if (k === "meta") this.onMeta();
      }
      this.schedulePersist();
      this.react();
    });
    this.gossip.onRumor((r) => this.onRumor(r));
    this.channel.onPeerJoin((peer) => {
      // Gửi lịch sử chat cho người mới; họ tự khử trùng lặp theo id.
      const hist = this.chat.filter((m) => !m.system).slice(-60);
      this.gossip.replay(
        hist.map((m) => ({ id: m.id, t: "chat", p: m })),
        peer,
      );
      this.store.invalidate();
    });
    this.channel.onPeerLeave(() => this.store.invalidate());

    for (const e of this.gossip.scan<Member>("p:")) this.live.observe(e.k.slice(2), e.v.hb, !!e.v.left);
    if (this.meta()) this.onMeta();
    this.beat(true);
    this.gossip.start();
    this.timers.push(setInterval(() => this.beat(false), HEARTBEAT_MS));
    this.timers.push(setInterval(() => this.react(), 1000));
  }

  // ---------- luật riêng của từng game ----------

  /** Ghi nhận ý định của một người lúc ngoài ván. Mặc định: vào ghế nếu còn chỗ / rời ghế. */
  protected applyIntent(m: Meta, p: Member) {
    const i = m.players.indexOf(p.uid);
    if (p.want === "play" && i < 0 && m.players.length < m.seats) m.players.push(p.uid);
    if (p.want === "watch" && i >= 0) m.players.splice(i, 1);
  }

  /** Chuẩn bị ván mới (đã tăng `round`): chốt đội hình… Trả về false nếu chưa đủ điều kiện bắt đầu. */
  protected abstract begin(m: Meta): boolean;

  /** Kết quả ván đang chơi suy ra từ nhật ký — tất định, máy nào cũng tính ra như nhau; undefined nếu chưa xong. */
  protected abstract outcome(m: Meta): Result | undefined;

  /** Chủ phòng, trong ván chưa có kết quả: việc riêng của game (xử thua người rớt mạng, kêu số…). Được sửa `m`. */
  protected hostPlay?(m: Meta): void;

  /** Giữ dữ liệu riêng của game khớp với danh sách ghế sau mỗi lần chủ phòng sửa `meta`. */
  protected tidy?(m: Meta): void;

  /** Một người bị kick (đã bị gỡ khỏi ghế); caro thì kết thúc ván nếu người đó đang đấu. */
  protected onKick?(m: Meta, uid: string): void;

  /** Mỗi nhịp, ở mọi máy: theo dõi diễn biến để rao, nhắn hệ thống… */
  protected watch?(m: Meta): void;

  /** Đóng phiên: dọn hẹn giờ riêng. */
  protected stopped?(): void;

  /** Trường thêm vào bản ghi hiện diện của mình (ma sói: khoá công khai). */
  protected memberExtra?(): Partial<Member>;

  /** Thông tin thêm khi quảng bá phòng ra sảnh. */
  protected adExtra?(m: Meta): Partial<RoomAd>;

  protected abstract gameView(m: Meta, seatOf: (uid: string) => SeatView): G;

  /** Câu nhắn hệ thống khi ván kết thúc. */
  protected abstract resultText(r: Result, name: (uid: string) => string): string;

  // ---------- trạng thái ----------

  meta() {
    return this.gossip.get<Meta>("meta");
  }

  protected members(): Member[] {
    return this.gossip.scan<Member>("p:").map((e) => e.v);
  }

  protected isOnline(uid: string) {
    return uid === this.me ? this.phase === "ready" || this.phase === "connecting" : this.live.alive(uid);
  }

  protected silentFor(uid: string) {
    return this.live.silentFor(uid);
  }

  protected nameOf(uid: string) {
    return this.gossip.get<Member>(`p:${uid}`)?.name ?? "Ai đó";
  }

  /** Ý định gần nhất của mình và chủ phòng đã ghi nhận chưa. */
  protected myIntent(m: Meta) {
    return { want: this.want, pick: this.choice, ready: this.ready, pending: this.seq > (m.ack[this.me] ?? 0) };
  }

  private beat(eager: boolean) {
    if (this.phase !== "connecting" && this.phase !== "ready") return;
    const me: Member = {
      uid: this.me,
      peer: this.channel.selfId,
      hb: Date.now(),
      joined: this.joined,
      want: this.want,
      ...(this.choice ? { pick: this.choice } : {}),
      ...(this.ready ? { ready: true } : {}),
      seq: this.seq,
      ...this.memberExtra?.(),
      ...this.profile,
    };
    this.gossip.set(`p:${this.me}`, me, eager);
  }

  /** Ghi lại bản ghi hiện diện ngay (vd. khi trường của `memberExtra` vừa có). */
  protected refresh() {
    this.beat(true);
  }

  private onMeta() {
    const m = this.meta();
    if (!m) return;
    if (!this.metaSeenAt) this.metaSeenAt = Date.now();
    // Dọn nhật ký các ván cũ (ai cũng dọn như nhau nên không bị "sống lại" qua anti-entropy).
    for (const e of ROUND_KEYS.flatMap((p) => this.gossip.scan(p))) {
      const r = Number(e.k.split(":")[1]);
      if (r < m.round) this.gossip.prune(e.k);
    }
    if (m.kicked.includes(this.me) && this.phase !== "kicked") {
      this.phase = "kicked";
      this.shutdown(false);
    }
  }

  /** Chạy lại vòng lặp chính; lời gọi lồng nhau (ghi gossip ngay trong vòng lặp) được dồn thành lượt kế tiếp. */
  protected react() {
    if (this.reacting) {
      this.reactAgain = true;
      return;
    }
    this.reacting = true;
    try {
      for (let pass = 0; pass < MAX_REACT_PASSES; pass++) {
        this.reactAgain = false;
        this.step();
        if (!this.reactAgain) break;
      }
    } finally {
      this.reacting = false;
    }
  }

  /** Một lượt của vòng lặp chính: chuyển pha, bầu lại chủ phòng, chủ phòng xử lý ý định, nhắn hệ thống. */
  private step() {
    const now = Date.now();
    if (this.phase === "connecting" || this.phase === "ready") this.redialer.check(now);
    const m = this.meta();
    if (this.phase === "connecting") {
      // Chờ một nhịp để biết đủ ai đang trong phòng (kiểm tra sức chứa); chủ phòng thì vào ngay.
      if (m && (m.host === this.me || now - this.metaSeenAt >= SETTLE_MS)) {
        if (m.game !== this.game) {
          this.phase = "elsewhere";
          this.shutdown(true);
        } else if (m.kicked.includes(this.me)) {
          this.phase = "kicked";
          this.shutdown(false);
        } else {
          const others = this.members().filter((p) => p.uid !== this.me && this.live.alive(p.uid) && !m.kicked.includes(p.uid)).length;
          const seated = m.players.includes(this.me) || m.host === this.me;
          if (!seated && m.cap > 0 && others >= m.cap) {
            this.phase = "full";
            this.shutdown(true);
          } else {
            this.phase = "ready";
            this.prevOnline = this.onlineSet();
          }
        }
      } else if (!m && now - this.openedAt > (this.lobby.roomAd(this.id) ? NOT_FOUND_ADVERTISED_MS : NOT_FOUND_MS)) {
        this.phase = "notfound";
        this.shutdown(true);
      }
    }
    if (this.phase === "ready" && m) {
      this.announceChanges(m);
      this.maybeTakeOver(m);
      if (this.meta()?.host === this.me) this.hostLoop();
      this.watch?.(this.meta()!);
    }
    this.store.invalidate();
  }

  private onlineSet() {
    const kicked = this.meta()?.kicked ?? [];
    return new Set(this.members().filter((p) => this.isOnline(p.uid) && !kicked.includes(p.uid)).map((p) => p.uid));
  }

  private announceChanges(m: Meta) {
    const online = this.onlineSet();
    for (const uid of online) if (!this.prevOnline.has(uid)) this.system(`${this.nameOf(uid)} đã vào phòng`);
    for (const uid of this.prevOnline) if (!online.has(uid)) this.system(`${this.nameOf(uid)} đã rời phòng`);
    this.prevOnline = online;
    const status = `${m.status}:${m.round}`;
    if (this.lastStatus && status !== this.lastStatus) {
      if (m.status === "playing") this.system(`Ván ${m.round} bắt đầu!`);
      if (m.status === "ended" && m.result) this.system(this.resultText(m.result, (uid) => this.nameOf(uid)));
    }
    this.lastStatus = status;
  }

  private successor(m: Meta, exclude: string): string | undefined {
    const alive = this.members().filter((p) => p.uid !== exclude && !m.kicked.includes(p.uid) && this.isOnline(p.uid));
    const seat = (u: string) => {
      const i = m.players.indexOf(u);
      return i < 0 ? 99 : i;
    };
    alive.sort((a, b) => seat(a.uid) - seat(b.uid) || a.joined - b.joined || (a.uid < b.uid ? -1 : 1));
    return alive[0]?.uid;
  }

  private maybeTakeOver(m: Meta) {
    if (m.host === this.me || Date.now() - this.openedAt < HOST_TAKEOVER_MS + SETTLE_MS) return;
    if (this.live.silentFor(m.host) < HOST_TAKEOVER_MS) return;
    if (this.successor(m, m.host) !== this.me) return;
    this.gossip.set<Meta>("meta", { ...m, host: this.me });
    const title = hostTitle(this.game);
    this.system(`${title} mất kết nối — bạn trở thành ${title.toLowerCase()} mới`);
  }

  /** Chủ phòng: xử lý ý định, loại người rớt mạng, chốt kết quả ván, việc riêng của game, quảng bá phòng ra sảnh. */
  private hostLoop() {
    const cur = this.meta()!;
    const m: Meta = structuredClone(cur);

    if (m.status !== "playing") {
      for (const p of this.members().sort((a, b) => a.hb - b.hb)) {
        if (p.seq <= (m.ack[p.uid] ?? 0) || !this.isOnline(p.uid) || m.kicked.includes(p.uid)) continue;
        m.ack[p.uid] = p.seq;
        this.applyIntent(m, p);
      }
      m.players = m.players.filter((u) => u === this.me || this.live.silentFor(u) < DROP_SEAT_MS);
    } else {
      const result = this.outcome(m);
      if (result) {
        m.status = "ended";
        m.result = result;
      } else this.hostPlay?.(m);
    }
    this.tidy?.(m);
    const dirty = JSON.stringify(m) !== JSON.stringify(cur);
    if (dirty) this.gossip.set("meta", m);

    const now = Date.now();
    if (dirty || now - this.lastAd > 4000) {
      this.lastAd = now;
      const host = this.gossip.get<Member>(`p:${this.me}`);
      this.lobby.publishRoom(
        {
          id: this.id,
          game: m.game,
          name: m.name,
          host: this.me,
          hostName: host?.name ?? this.profile.name,
          hostAvatar: host?.avatar ?? this.profile.avatar,
          cap: m.cap,
          seats: m.seats,
          members: this.onlineSet().size,
          players: m.players.length,
          status: m.status,
          opts: m.opts,
          ...this.adExtra?.(m),
        },
        dirty,
      );
    }
  }

  private compute(): RoomView<G> {
    const m = this.meta();
    const members = this.members();
    const byUid = new Map(members.map((p) => [p.uid, p]));
    const online = new Set(members.filter((p) => this.isOnline(p.uid) && !m?.kicked.includes(p.uid)).map((p) => p.uid));
    const seatOf = (uid: string): SeatView => ({ uid, member: byUid.get(uid), online: online.has(uid) });
    const base: RoomView<G> = {
      phase: this.phase,
      me: this.me,
      meta: m,
      isHost: m?.host === this.me,
      peers: this.channel.peers().length,
      members: members.filter((p) => online.has(p.uid)),
      online,
      seats: [],
      spectators: [],
      mySeat: -1,
      pending: null,
      chat: this.chat,
    };
    if (!m || m.game !== this.game) return base;
    base.seats = m.players.map(seatOf);
    base.mySeat = m.players.indexOf(this.me);
    base.spectators = members
      .filter((p) => online.has(p.uid) && !m.players.includes(p.uid) && !m.kicked.includes(p.uid))
      .sort((a, b) => a.joined - b.joined);
    if (this.myIntent(m).pending) base.pending = this.want;
    base.game = this.gameView(m, seatOf);
    return base;
  }

  // ---------- chat ----------

  private onRumor(r: Rumor) {
    if (r.t !== "chat") return;
    const msg = r.p as ChatMsg;
    if (!msg || typeof msg.uid !== "string" || (!msg.text && !msg.sticker)) return;
    // Id lạ (bản cũ/mới hơn, hoặc bị chế) thì bỏ: id sticker được dùng để dựng đường dẫn ảnh.
    if (msg.sticker !== undefined && !isStickerId(msg.sticker)) return;
    this.pushChat({ ...msg, id: r.id, text: msg.text?.slice(0, 300) });
  }

  protected pushChat(msg: ChatMsg) {
    if (this.chat.some((c) => c.id === msg.id)) return;
    this.chat = [...this.chat, msg].sort((a, b) => a.at - b.at).slice(-CHAT_LIMIT);
    for (const fn of this.chatFns) fn(msg);
    this.schedulePersist();
    this.store.invalidate();
  }

  protected system(text: string) {
    this.pushChat({ id: `sys:${Date.now()}:${Math.random()}`, uid: "", name: "", avatar: "", color: "", at: Date.now(), text, system: true });
  }

  onChat(fn: (m: ChatMsg) => void) {
    this.chatFns.add(fn);
    return () => {
      this.chatFns.delete(fn);
    };
  }

  send(content: { text: string } | { sticker: StickerId }) {
    if (this.phase !== "ready") return;
    const { name, avatar, color } = this.profile;
    const body: ChatMsg = { id: "", uid: this.me, name, avatar, color, at: Date.now(), ...content };
    if ("text" in content) {
      const text = content.text.trim().slice(0, 300);
      if (!text) return;
      body.text = text;
    }
    const r = this.gossip.broadcast("chat", body);
    this.pushChat({ ...body, id: r.id });
  }

  // ---------- hành động người chơi ----------

  protected intend(want: "play" | "watch", pick?: number[], ready = false) {
    this.want = want;
    this.choice = pick;
    this.ready = ready;
    // Vào lại phòng sau khi rời (không còn snapshot) thì số thứ tự phải vượt mức chủ phòng đã ghi nhận, nếu không
    // ý định mới bị coi là cũ và bỏ qua.
    this.seq = Math.max(this.seq, this.meta()?.ack[this.me] ?? 0) + 1;
    this.beat(true);
    this.react();
  }

  join() {
    this.intend("play");
  }

  leaveSeat() {
    this.intend("watch");
  }

  setProfile(p: Profile) {
    this.profile = p;
    this.beat(true);
  }

  // ---------- hành động chủ phòng ----------

  protected hostEdit(fn: (m: Meta) => boolean | void) {
    const cur = this.meta();
    if (!cur || cur.host !== this.me) return;
    const m = structuredClone(cur);
    if (fn(m) === false) return;
    this.tidy?.(m);
    this.gossip.set("meta", m);
    this.react();
  }

  start() {
    this.hostEdit((m) => {
      if (m.status === "playing") return false;
      m.round += 1;
      if (!this.begin(m)) return false;
      m.status = "playing";
      delete m.result;
    });
  }

  kick(uid: string) {
    if (uid === this.me) return;
    this.hostEdit((m) => {
      if (m.kicked.includes(uid)) return false;
      m.kicked.push(uid);
      m.players = m.players.filter((u) => u !== uid);
      this.onKick?.(m, uid);
    });
  }

  /** Chủ phòng kéo một người xem vào ghế trống. */
  seat(uid: string) {
    this.hostEdit((m) => {
      if (m.status === "playing" || m.players.includes(uid) || m.players.length >= m.seats || !this.isOnline(uid)) return false;
      m.players.push(uid);
    });
  }

  /** Chủ phòng mời một người chơi ra khỏi ghế (vẫn ở lại xem). */
  unseat(uid: string) {
    this.hostEdit((m) => {
      if (m.status === "playing" || !m.players.includes(uid)) return false;
      m.players = m.players.filter((u) => u !== uid);
    });
  }

  makeHost(uid: string) {
    this.hostEdit((m) => {
      if (!this.isOnline(uid) || uid === this.me) return false;
      m.host = uid;
    });
  }

  // ---------- vòng đời ----------

  private schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (this.phase !== "ready" && this.phase !== "connecting") return;
      try {
        sessionStorage.setItem(snapKey(this.id), JSON.stringify({ ...this.gossip.snapshot(), chat: this.chat.slice(-60), at: Date.now() }));
      } catch {}
    }, 800);
  }

  /** Rời phòng chủ động: chủ phòng bàn giao cho người kế nhiệm, hoặc đóng phòng nếu không còn ai. */
  leave() {
    if (this.phase === "ready") {
      const m = this.meta();
      if (m && m.host === this.me) {
        const next = this.successor(m, this.me);
        if (next) {
          const handover = structuredClone(m);
          handover.host = next;
          if (handover.status !== "playing") handover.players = handover.players.filter((u) => u !== this.me);
          this.tidy?.(handover);
          this.gossip.set("meta", handover);
        } else this.lobby.closeRoom(this.id);
      }
    }
    this.phase = this.phase === "ready" || this.phase === "connecting" ? "left" : this.phase;
    this.shutdown(true);
  }

  private shutdown(sayGoodbye: boolean) {
    if (sayGoodbye) {
      const cur = this.gossip.get<Member>(`p:${this.me}`);
      if (cur && !cur.left) this.gossip.set(`p:${this.me}`, { ...cur, hb: Date.now(), left: true });
    }
    try {
      sessionStorage.removeItem(snapKey(this.id));
    } catch {}
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.stopped?.();
    this.gossip.stop();
    this.channel.release();
    this.store.invalidate();
  }

  /** Huỷ phiên khi component unmount (vd. chuyển trang); khác `leave()` ở chỗ giữ snapshot nếu chỉ là tải lại. */
  dispose() {
    if (this.phase === "ready" || this.phase === "connecting") this.leave();
    else this.shutdown(false);
  }
}
