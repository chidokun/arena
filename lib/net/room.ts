// Người dùng chỉ phát ý định; chủ phòng là người duy nhất ghi `meta`, xử lý ý định theo thứ tự rồi ghi nhận (`ack`).
// Vì chỉ có một người ghi nên không có xung đột ghế; gossip đảm bảo mọi người cuối cùng thấy cùng một `meta`.
import type { CaroOptions } from "../games/caro";
import type { CcPublic } from "../games/co-chep";
import type { DwPublic } from "../games/draw-guess";
import type { KwRound } from "../games/kawaii";
import type { McPublic } from "../games/mine-control";
import type { MsRound } from "../games/minesweeper";
import type { SudokuRound } from "../games/sudoku";
import type { Problem as SxProblem, SxRound } from "../games/system-design";
import type { TxRound } from "../games/truc-xanh";
import type { Public as UcPublic, Role as UcTeam } from "../games/undercover";
import type { Public as WolfPublic, Side } from "../games/werewolf";
import type { XqRolePublic } from "../games/xiangqi-role";
import { hostTitle } from "../games/registry";
import { ANTICHEAT, watchDevtools, type DevtoolsSignal } from "../devtools";
import type { Profile } from "../identity";
import { isStickerId, type StickerId } from "../stickers";
import { CHAT_PERSIST, CHAT_RATE, CHAT_RATE_WINDOW_MS, CHAT_REPLAY, insertMsg, RateLimit, TEXT_MAX } from "./chat";
import { Gossip, Liveness, type Rumor } from "./gossip";
import { joinProgress, type JoinProgress } from "./join";
import type { Lobby, RoomAd } from "./lobby";
import { ViewStore } from "./view-store";
import { openChannel, Redialer, type Channel } from "./wire";

export type Status = "waiting" | "playing" | "ended";

export type Result = {
  round: number;
  winner: string | null;
  loser?: string;
  winners?: string[];
  reason: "line" | "draw" | "resign" | "leave" | "kick" | "kinh" | "stop" | "team" | "solve" | "mate" | "agree" | "sunk" | "points" | "survive" | "guess" | "boom" | "blocked" | "cheat" | "timeout";
  team?: Side | UcTeam;
};

export type Meta = {
  game: string;
  name: string;
  host: string;
  seats: number;
  cap: number;
  opts: Record<string, unknown>;
  status: Status;
  round: number;
  players: string[];
  lineup: string[];
  claims?: Record<string, number[]>;
  dealt?: Record<string, number[]>;
  ready?: string[];
  paused?: boolean;
  ww?: WolfPublic;
  uc?: UcPublic;
  sd?: SudokuRound;
  xqr?: XqRolePublic;
  ucUsed?: number[];
  dw?: DwPublic;
  dwUsed?: number[];
  // Chốt lúc bắt đầu để chủ phòng đổi cỡ giữa các ván không làm hỏng ván vừa xong.
  dbSize?: number;
  dbTurn?: number;
  cr?: CaroOptions;
  cdSetup?: string;
  cc?: CcPublic;
  mc?: McPublic;
  kw?: KwRound;
  tx?: TxRound;
  txUsed?: number[];
  ms?: MsRound;
  sx?: SxRound;
  // Đề đang soạn cho ván tới (opts chỉ giữ phần tóm tắt cho thẻ phòng ở sảnh).
  sxq?: SxProblem;
  ack: Record<string, number>;
  kicked: string[];
  cheats?: string[];
  result?: Result;
  wins?: Record<string, number>;
  draws?: number;
  // Ván gần nhất đã cộng vào `wins`/`draws`, để mỗi kết quả chỉ được tính một lần.
  scored?: number;
  created: number;
  // Lúc `status` đổi gần nhất (giờ máy chủ phòng); chưa đổi lần nào thì lấy `created`.
  statusAt?: number;
};

export type Member = Profile & {
  uid: string;
  peer: string;
  hb: number;
  joined: number;
  want: "play" | "watch" | null;
  pick?: number[];
  ready?: boolean;
  key?: string;
  seq: number;
  left?: boolean;
};

export type { StickerId };
export type { JoinPeer, JoinProgress } from "./join";

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
  shout?: boolean;
  clue?: boolean;
  guess?: GuessMark;
  // Không gửi lại cho người mới vào: vẽ đoán dùng cho lời đoán của chính mình, có thể là đáp án.
  local?: boolean;
};

export type GuessMark = "wrong" | "near" | "right";
const GUESS_MARKS: readonly GuessMark[] = ["wrong", "near", "right"];

export type Phase = "connecting" | "ready" | "notfound" | "full" | "kicked" | "left" | "elsewhere";

export type SeatView = { uid: string; member?: Member; online: boolean };

export type RoomState = {
  phase: Phase;
  me: string;
  meta?: Meta;
  isHost: boolean;
  peers: number;
  mySeat: number;
  pending: "play" | "watch" | null;
  joining?: JoinProgress;
};

export type PeopleView = {
  members: Member[];
  online: Set<string>;
  seats: SeatView[];
  spectators: Member[];
};

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
  game?: G;
  chat: ChatMsg[];
  joining?: JoinProgress;
};

export type CheatAlert = { kind: "cheat"; uid: string; name: string; round: number; mine: boolean } | { kind: "warn" };

export type CreateRoom = { name: string; cap: number; seats: number; opts: Record<string, unknown> };

export const START_COUNTDOWN_MS = 3000;

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
// Tin chat đang trên đường lúc người gửi vừa bị cấm (vừa chết, trời vừa tối…) thì vẫn nhận.
const MUTE_GRACE_MS = 2500;
// Chặn vòng lặp react() tự gọi lại vô hạn nếu một hook cứ ghi mãi.
const MAX_REACT_PASSES = 8;
// Thấy bản ghi gian lận cũ hơn ngưỡng này (vào giữa ván, tải lại trang) thì chỉ ghi vào chat, không bật thông báo nữa.
const CHEAT_FRESH_MS = 15000;
// Nhắc đóng DevTools trước ván không quá dày.
const CHEAT_WARN_GAP_MS = 20000;

const ROUND_KEYS = ["g:", "x:", "v:", "a:", "s:", "c:", "w:", "m:", "f:", "d:", "z:"];
const OWN_KEYS = ["x:", "v:", "a:", "c:", "w:", "m:", "i:", "f:", "d:", "z:"];

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

function stampStatus(prev: Meta, next: Meta) {
  if (next.status !== prev.status) next.statusAt = Date.now();
}

export const seatOpen = (m: Pick<Meta, "players" | "seats">) => m.seats <= 0 || m.players.length < m.seats;

type RoomCtor<T> = new (id: string, me: string, profile: Profile, lobby: Lobby, channel: Channel) => T;

export abstract class RoomSession<G = unknown> {
  readonly id: string;
  readonly me: string;
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
  private chatRate = new RateLimit(CHAT_RATE, CHAT_RATE_WINDOW_MS);
  private mutedSince = new Map<string, number>();
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
  private stopDevtools: (() => void) | null = null;
  private cheatFns = new Set<(a: CheatAlert) => void>();
  private cheatsTold = new Set<string>();
  private lastWarn = 0;
  private readyAt = 0;
  readonly store: ViewStore<RoomView<G>>;
  // Store tách theo phần: mỗi store chỉ được báo khi đúng nguồn dữ liệu của nó đổi, nên chỉ phần bàn chơi đọc store đó
  // vẽ lại.
  readonly roomStore = new ViewStore<RoomState>(() => this.computeRoom());
  readonly peopleStore = new ViewStore<PeopleView>(() => this.computePeople());
  readonly gameStore = new ViewStore<G | undefined>(() => this.computeGame());
  readonly chatStore = new ViewStore<ChatMsg[]>(() => this.chat);
  private viewSeen = { phase: "" as Phase | "", online: "" };
  private viewShown = new Map<string, string>();

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

  // Tách khỏi constructor để hook của lớp con chạy khi lớp con đã khởi tạo xong.
  private boot() {
    // Khôi phục khi tải lại trang: giữ được đồng hồ Lamport, nhật ký ván, và quyền chủ phòng.
    try {
      const raw = sessionStorage.getItem(snapKey(this.id));
      const snap = raw ? JSON.parse(raw) : null;
      // Lịch sử chat không ảnh hưởng trạng thái phòng nên khôi phục bất kể snapshot cũ hay mới.
      if (snap && Array.isArray(snap.chat)) this.chat = snap.chat;
      if (snap && Date.now() - Number(snap.at) < SNAPSHOT_TTL_MS) {
        this.gossip.restore(snap);
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
          // Nhịp tim chỉ tăng `hb`: không ai trên giao diện cần biết. Đổi tên, avatar, ý định… mới báo.
          if (this.shownChanged(k, m)) {
            this.peopleStore.invalidate();
            this.gameStore.invalidate();
          }
        } else if (k === "meta") {
          this.roomStore.invalidate();
          this.peopleStore.invalidate();
          this.gameStore.invalidate();
        } else if (this.viewKey?.(k) ?? true) this.gameStore.invalidate();
        if (k === "meta") this.onMeta();
      }
      this.trackMutes();
      this.schedulePersist();
      this.react();
    });
    this.gossip.onRumor((r, _from, replayed) => this.onRumor(r, replayed));
    this.channel.onPeerJoin((peer) => {
      // Gửi lịch sử chat cho người mới; họ tự khử trùng lặp theo id.
      const hist = this.chat.filter((m) => !m.system && !m.local).slice(-CHAT_REPLAY);
      this.gossip.replay(
        hist.map((m) => ({ id: m.id, t: "chat", p: m })),
        peer,
      );
      this.store.invalidate();
      this.roomStore.invalidate();
    });
    this.channel.onPeerLeave(() => {
      this.store.invalidate();
      this.roomStore.invalidate();
    });

    for (const e of this.gossip.scan<Member>("p:")) this.live.observe(e.k.slice(2), e.v.hb, !!e.v.left);
    if (this.meta()) this.onMeta();
    this.beat(true);
    this.gossip.start();
    this.timers.push(setInterval(() => this.beat(false), HEARTBEAT_MS));
    this.timers.push(setInterval(() => this.react(), 1000));
    this.timers.push(setInterval(() => this.chatRate.sweep(), 10000));
    if (ANTICHEAT)
      this.stopDevtools = watchDevtools(
        { keys: () => !!this.armed(), probe: () => this.armed() === "play" },
        (how) => this.onDevtools(how),
      );
  }

  protected applyIntent(m: Meta, p: Member) {
    const i = m.players.indexOf(p.uid);
    if (p.want === "play" && i < 0 && seatOpen(m)) m.players.push(p.uid);
    if (p.want === "watch" && i >= 0) m.players.splice(i, 1);
  }

  protected abstract begin(m: Meta): boolean;

  protected abstract outcome(m: Meta): Result | undefined;

  protected hostPlay?(m: Meta): void;

  protected tidy?(m: Meta): void;

  protected onKick?(m: Meta, uid: string, reason?: "kick" | "cheat"): void;

  protected muted?(uid: string): boolean;

  protected watch?(m: Meta): void;

  protected stopped?(): void;

  protected memberExtra?(): Partial<Member>;

  protected adExtra?(m: Meta): Partial<RoomAd>;

  protected abstract gameView(m: Meta, seatOf: (uid: string) => SeatView): G;

  protected abstract resultText(r: Result, name: (uid: string) => string): string;

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
            this.readyAt = now;
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
      this.announceCheats(this.meta()!);
      this.watch?.(this.meta()!);
    }
    this.store.invalidate();
    this.syncViews();
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
      this.punishCheats(m);
      const result = m.status === "playing" ? this.outcome(m) : undefined;
      if (result) {
        m.status = "ended";
        m.result = result;
      } else if (m.status === "playing") this.hostPlay?.(m);
    }
    this.denyCheaters(m);
    this.tidy?.(m);
    stampStatus(cur, m);
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
          since: m.statusAt ?? m.created,
          opts: m.opts,
          ...this.adExtra?.(m),
        },
        dirty,
      );
    }
  }

  protected refreshViews() {
    this.roomStore.invalidate();
    this.peopleStore.invalidate();
    this.gameStore.invalidate();
    this.store.invalidate();
  }

  // Pha của phòng và ai còn kết nối đổi theo thời gian mà không có sự kiện nào báo (nhịp tim im quá lâu là rớt mạng), nên
  // kiểm tra mỗi lượt vòng lặp chính.
  private syncViews() {
    const phase = this.phase !== this.viewSeen.phase;
    const online = this.onlineKey();
    const people = online !== this.viewSeen.online;
    this.viewSeen.phase = this.phase;
    this.viewSeen.online = online;
    // Đang vào phòng: tiến độ bắt tay (sảnh, peer, nhịp tim) đổi liên tục, cứ tính lại mỗi lượt cho tới khi vào xong.
    if (phase || this.phase === "connecting") this.roomStore.invalidate();
    if (phase || people) {
      this.peopleStore.invalidate();
      this.gameStore.invalidate();
    }
  }

  private onlineKey() {
    const kicked = this.meta()?.kicked ?? [];
    return this.members()
      .filter((p) => this.isOnline(p.uid) && !kicked.includes(p.uid))
      .map((p) => p.uid)
      .sort()
      .join(",");
  }

  private shownChanged(k: string, m: Member | undefined) {
    const sig = m ? JSON.stringify(m, (key, v) => (key === "hb" || key === "seq" || key === "peer" ? undefined : v)) : "";
    if (this.viewShown.get(k) === sig) return false;
    this.viewShown.set(k, sig);
    return true;
  }

  protected viewKey?(k: string): boolean;

  private ownMeta() {
    const m = this.meta();
    return m && m.game === this.game ? m : undefined;
  }

  // Giữ cả bản ghi của người đã rớt mạng để còn tên người ở ghế.
  private presence() {
    const m = this.meta();
    const members = this.members();
    const byUid = new Map(members.map((p) => [p.uid, p]));
    const online = new Set(members.filter((p) => this.isOnline(p.uid) && !m?.kicked.includes(p.uid)).map((p) => p.uid));
    const seatOf = (uid: string): SeatView => ({ uid, member: byUid.get(uid), online: online.has(uid) });
    return { members, online, seatOf };
  }

  private computeRoom(): RoomState {
    const m = this.meta();
    const own = this.ownMeta();
    const r: RoomState = {
      phase: this.phase,
      me: this.me,
      meta: m,
      isHost: m?.host === this.me,
      peers: this.channel.peers().length,
      mySeat: own ? own.players.indexOf(this.me) : -1,
      pending: own && this.myIntent(own).pending ? this.want : null,
    };
    if (this.phase === "connecting")
      r.joining = joinProgress({
        me: this.me,
        room: this.id,
        host: m?.host ?? this.lobby.roomAd(this.id)?.host,
        lobby: this.lobby.store.get().users,
        // Bản ghi còn trong snapshot (tải lại trang) có thể của người đã đi; chỉ tính người còn nhịp tim.
        members: this.members().filter((p) => this.live.alive(p.uid)),
        peers: this.channel.peers(),
        kicked: m?.kicked,
        synced: !!m,
        unreachable: this.channel.unreachable(),
      });
    return r;
  }

  private computePeople(): PeopleView {
    const m = this.ownMeta();
    const { members, online, seatOf } = this.presence();
    return {
      members: members.filter((p) => online.has(p.uid)),
      online,
      seats: m ? m.players.map(seatOf) : [],
      spectators: m
        ? members.filter((p) => online.has(p.uid) && !m.players.includes(p.uid) && !m.kicked.includes(p.uid)).sort((a, b) => a.joined - b.joined)
        : [],
    };
  }

  private computeGame(): G | undefined {
    const m = this.ownMeta();
    return m ? this.gameView(m, this.presence().seatOf) : undefined;
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
    if (this.phase === "connecting")
      base.joining = joinProgress({
        me: this.me,
        room: this.id,
        host: m?.host ?? this.lobby.roomAd(this.id)?.host,
        lobby: this.lobby.store.get().users,
        // Bản ghi còn trong snapshot (tải lại trang) có thể của người đã đi; chỉ tính người còn nhịp tim.
        members: members.filter((p) => this.live.alive(p.uid)),
        peers: this.channel.peers(),
        kicked: m?.kicked,
        synced: !!m,
        unreachable: this.channel.unreachable(),
      });
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

  protected cheated(m: Meta, uid: string) {
    return !!m.cheats?.includes(uid);
  }

  private armed(): "play" | "seat" | null {
    const m = this.meta();
    if (this.phase !== "ready" || !m) return null;
    if (m.status === "playing") return m.lineup.includes(this.me) && !this.gossip.get(`z:${m.round}:${this.me}`) ? "play" : null;
    return m.players.includes(this.me) ? "seat" : null;
  }

  private onDevtools(how: DevtoolsSignal) {
    const m = this.meta();
    if (!m || !this.armed()) return;
    if (m.status === "playing") {
      this.gossip.set(`z:${m.round}:${this.me}`, { at: Date.now(), how });
      this.react();
      return;
    }
    const now = Date.now();
    if (now - this.lastWarn < CHEAT_WARN_GAP_MS) return;
    this.lastWarn = now;
    for (const fn of this.cheatFns) fn({ kind: "warn" });
  }

  private cheatersOf(m: Meta) {
    if (m.round <= 0) return [];
    const prefix = `z:${m.round}:`;
    return this.gossip
      .scan<{ at?: unknown }>(prefix)
      .map((e) => ({ uid: e.k.slice(prefix.length), at: Number(e.v?.at) || 0 }))
      .filter((c) => m.lineup.includes(c.uid) || this.cheated(m, c.uid));
  }

  private punishCheats(m: Meta) {
    for (const { uid } of this.cheatersOf(m)) {
      if (m.status !== "playing" || this.cheated(m, uid)) continue;
      m.cheats = [...(m.cheats ?? []), uid];
      this.onKick?.(m, uid, "cheat");
    }
  }

  private denyCheaters(m: Meta) {
    const r = m.result;
    const bad = m.cheats;
    if (!r || r.round !== m.round || !bad?.length) return;
    const winners = r.winners?.filter((u) => !bad.includes(u));
    const winner = r.winner && bad.includes(r.winner) ? (winners?.length === 1 ? winners[0] : null) : r.winner;
    if (winner === r.winner && winners?.length === r.winners?.length) return;
    m.result = { ...r, winner, ...(winners ? { winners } : {}) };
  }

  private announceCheats(m: Meta) {
    const now = Date.now();
    for (const c of this.cheatersOf(m)) {
      const key = `${m.round}:${c.uid}`;
      // Bản ghi tới sát lúc hết ván mà chủ phòng chưa kịp xử thì thôi.
      if (this.cheatsTold.has(key) || (m.status !== "playing" && !this.cheated(m, c.uid))) continue;
      this.cheatsTold.add(key);
      const mine = c.uid === this.me;
      const name = this.nameOf(c.uid);
      // Id cố định theo ván và người: tải lại trang (khung chat khôi phục từ snapshot) không báo lặp.
      const text = `🚨 ${mine ? "Bạn" : name} vừa gian lận — mở công cụ nhà phát triển giữa ván ${m.round}, bị xử thua!`;
      this.pushChat({ id: `cheat:${key}`, uid: "", name: "", avatar: "", color: "", at: now, text, system: true });
      // Vừa vào phòng / tải lại trang thì bản ghi có sẵn là chuyện cũ — chỉ bật thông báo nếu nó còn mới.
      const fresh = now - this.readyAt > SETTLE_MS || Math.abs(now - c.at) < CHEAT_FRESH_MS;
      if (fresh) for (const fn of this.cheatFns) fn({ kind: "cheat", uid: c.uid, name, round: m.round, mine });
    }
  }

  onCheat(fn: (a: CheatAlert) => void) {
    this.cheatFns.add(fn);
    return () => {
      this.cheatFns.delete(fn);
    };
  }

  private onRumor(r: Rumor, replayed: boolean) {
    if (r.t !== "chat") return;
    const msg = r.p as ChatMsg;
    if (!msg || typeof msg.uid !== "string" || (!msg.text && !msg.sticker)) return;
    if (!this.chatAllowed(msg, replayed)) return;
    // Lịch sử gửi lại cho người mới vào không tính vào nhịp gửi.
    if (!replayed && !this.chatRate.take(msg.uid)) return;
    // Id lạ (bản cũ/mới hơn, hoặc bị chế) thì bỏ: id sticker được dùng để dựng đường dẫn ảnh.
    if (msg.sticker !== undefined && !isStickerId(msg.sticker)) return;
    this.pushChat({ ...msg, id: r.id, text: msg.text?.slice(0, TEXT_MAX), guess: GUESS_MARKS.includes(msg.guess!) ? msg.guess : undefined });
  }

  private trackMutes() {
    if (!this.muted) return;
    const now = Date.now();
    for (const { uid } of this.members()) {
      if (!this.muted(uid)) this.mutedSince.delete(uid);
      else if (!this.mutedSince.has(uid)) this.mutedSince.set(uid, now);
    }
  }

  // Chặn ở máy nhận để máy gửi bị sửa vẫn không lọt. Lịch sử chat gửi lại cho người mới vào thì xét theo giờ gửi — tin
  // nói lúc còn được nói vẫn giữ.
  private chatAllowed(msg: ChatMsg, replayed: boolean) {
    if (!this.muted?.(msg.uid)) return true;
    const since = this.mutedSince.get(msg.uid);
    if (replayed) return typeof msg.at === "number" && msg.at < (since ?? Date.now());
    return since !== undefined && Date.now() - since < MUTE_GRACE_MS;
  }

  protected pushChat(msg: ChatMsg) {
    const next = insertMsg(this.chat, msg);
    if (!next) return;
    this.chat = next;
    for (const fn of this.chatFns) fn(msg);
    this.schedulePersist();
    this.store.invalidate();
    this.chatStore.invalidate();
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

  send(content: { text: string } | { sticker: StickerId }): boolean | void {
    if (this.phase !== "ready" || this.muted?.(this.me)) return;
    const { name, avatar, color } = this.profile;
    const body: ChatMsg = { id: "", uid: this.me, name, avatar, color, at: Date.now(), ...content };
    if ("text" in content) {
      const text = content.text.trim().slice(0, TEXT_MAX);
      if (!text) return;
      body.text = text;
    }
    if (!this.chatRate.take(this.me)) return false;
    const r = this.gossip.broadcast("chat", body);
    this.pushChat({ ...body, id: r.id });
  }

  protected intend(want: "play" | "watch", pick?: number[], ready = false) {
    this.want = want;
    this.choice = pick;
    this.ready = ready;
    // Vào lại phòng sau khi rời (không còn snapshot) thì số thứ tự phải vượt mức chủ phòng đã ghi nhận, nếu không
    // ý định mới bị coi là cũ và bỏ qua.
    this.seq = Math.max(this.seq, this.meta()?.ack[this.me] ?? 0) + 1;
    // `pending` (đang chờ chủ phòng ghi nhận ý định) nằm ở roomStore.
    this.roomStore.invalidate();
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

  protected hostEdit(fn: (m: Meta) => boolean | void) {
    const cur = this.meta();
    if (!cur || cur.host !== this.me) return;
    const m = structuredClone(cur);
    if (fn(m) === false) return;
    this.denyCheaters(m);
    this.tidy?.(m);
    stampStatus(cur, m);
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
      delete m.cheats;
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

  seat(uid: string) {
    this.hostEdit((m) => {
      if (m.status === "playing" || m.players.includes(uid) || !seatOpen(m) || !this.isOnline(uid)) return false;
      m.players.push(uid);
    });
  }

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

  private schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (this.phase !== "ready" && this.phase !== "connecting") return;
      try {
        sessionStorage.setItem(snapKey(this.id), JSON.stringify({ ...this.gossip.snapshot(), chat: this.chat.slice(-CHAT_PERSIST), at: Date.now() }));
      } catch {}
    }, 800);
  }

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
    this.stopDevtools?.();
    this.stopDevtools = null;
    this.stopped?.();
    this.gossip.stop();
    this.channel.release();
    this.store.invalidate();
    this.syncViews();
  }

  dispose() {
    if (this.phase === "ready" || this.phase === "connecting") this.leave();
    else this.shutdown(false);
  }
}
