# Arena

Đấu trường game đối kháng chạy hoàn toàn trên trình duyệt — <https://arena.nguyentuan.dev>.

Không máy chủ game, không đăng ký: các trình duyệt nối trực tiếp với nhau qua WebRTC
([Trystero](https://github.com/dmotz/trystero), bắt tay qua relay Nostr công khai), trạng thái được đồng bộ
bằng giao thức gossip tự viết. Site là trang tĩnh (Next.js `output: "export"`) deploy lên GitHub Pages.

## Đường dẫn

| Trang          | Đường dẫn                                         |
| -------------- | ------------------------------------------------- |
| Trang chủ      | `/`                                               |
| Sảnh của game  | `/games/caro/`, `/games/loto/`, `/games/werewolf/` |
| Phòng chơi     | `/games/<game>/room/?id=<mã>`                      |

Mã phòng nằm ở query string vì site tĩnh không sinh trước được trang cho từng phòng.

## Kiến trúc mạng

```
lib/net/wire.ts    kênh P2P (một room Trystero, appId riêng mỗi kênh), đếm tham chiếu
lib/net/ice.ts     máy chủ TURN (cấu hình lúc build) cho các cặp máy không nối thẳng được
lib/net/gossip.ts  gossip store LWW + đồng hồ Lamport, anti-entropy push–pull, rumor, bộ phát hiện lỗi nhịp tim
lib/net/lobby.ts      kênh "lobby": ai đang online / ở game nào, quảng bá phòng, lời mời
lib/net/room.ts       kênh "room:<id>": phần chung của phòng — ghế, chat, quyền chủ phòng, vòng đời ván
lib/net/caro-room.ts  phòng caro (lớp con của RoomSession): nước đi, xin thua, xử thua người rớt mạng
lib/net/loto-room.ts  phòng lô tô: chọn tờ, chủ phòng kêu số, rao "Hò!" / "Kinh!"
lib/net/werewolf-room.ts  phòng ma sói: máy chủ phòng làm quản trò, bí mật niêm phong giữa từng người và quản trò
lib/net/seal.ts       niêm phong bản ghi bí mật: ECDH P-256 + AES-GCM, độn cùng cỡ
lib/games/caro.ts     luật caro thuần (dựng lại ván tất định từ nhật ký nước đi)
lib/games/loto.ts     luật lô tô thuần (sinh bộ tờ từ seed, dựng lại ván từ dãy số đã kêu)
lib/games/werewolf.ts luật ma sói thuần (máy trạng thái đêm → ngày → bỏ phiếu, điều kiện thắng)
```

**Gossip store.** Mỗi bản ghi mang phiên bản `(c, w)` = (đồng hồ Lamport, uid người ghi); bản mới hơn thắng.
Thay đổi được đẩy ngay cho peer kề và lan tiếp tối đa 3 bước; ngoài ra mỗi giây một peer gửi digest tới 3 peer
ngẫu nhiên để bù phần thiếu (anti-entropy) — nhờ vậy trạng thái vẫn hội tụ khi một cặp peer không nối trực tiếp
được với nhau (NAT). Nhịp tim chỉ đi đường anti-entropy để đỡ ồn mạng.

**Chốt trạng thái người dùng.** Người dùng chỉ ghi *ý định* của mình (`p:<uid>`: muốn vào ghế / rời ghế, kèm số thứ tự).
Chủ phòng là người duy nhất ghi `meta` (ghế, trạng thái ván, danh sách kick) và ghi nhận từng ý định theo thứ tự
(`ack`), nên không có xung đột giành ghế. Kết quả ván được mọi peer tự suy ra từ nhật ký nước đi `g:<ván>`.

**Lô tô.** Bộ 10 màu × 2 tờ; mỗi tờ 9 hàng × 9 cột (3 khối), mỗi hàng đúng 5 số, cột theo chục, hai tờ cùng màu gộp
lại đủ 1–90. Cả bộ tờ sinh tất định từ `seed` trong `meta.opts` nên không phải gửi qua mạng. Chọn tờ là một ý định
(`p:<uid>.pick`, tối đa 2 tờ) — chủ phòng ghi nhận theo thứ tự vào `meta.claims`, nên không ai giành trùng tờ; hết tờ
thì chỉ vào xem được (phòng không giới hạn người xem). Chọn xong phải bấm *Sẵn sàng* (`p:<uid>.ready` → `meta.ready`;
đã sẵn sàng thì khoá tờ). Chủ phòng chỉ bắt đầu được khi mọi người giữ tờ đã sẵn sàng (chủ phòng bấm Bắt đầu là đã
sẵn sàng); mỗi ván sẵn sàng lại. Bắt đầu ván, các tờ được chốt vào `meta.dealt`. Máy chủ phòng
là người kêu số: cứ mỗi nhịp (3/5/8 giây) rút một số chưa kêu và nối vào `g:<ván>`; mọi máy tự dựng lại ván từ dãy số
đó, tự đánh dấu, tự rao "Hò! / Hẹn! / Đợi!" khi một hàng có 4/5 số và "Kinh!" khi đủ 5 (nhiều người cùng một số là
"Kinh trùng!"). Câu rao chọn tất định theo người + ván + lần kêu nên máy nào cũng hiện giống nhau. Số được đọc to
bằng giọng tiếng Việt của máy (Web Speech API, chỉ nhận giọng `vi`, ưu tiên giọng tự nhiên); sau số, có người vừa đợi
thì đọc "{tên} đang đợi rồi á nha!", có người kinh thì đọc "Chúc mừng {tên} đã kinh!" (nhiều người: "… đã kinh trùng!").
Máy không có giọng Việt thì không đọc và hiện hướng dẫn cài.

**Ma sói.** 4–16 người chơi, phòng không giới hạn người xem. Người tạo phòng là *Quản trò*: mặc định không chơi,
chỉ xem hết vai và điều khiển ván; luật "Quản trò tham gia chơi" cho quản trò sẵn sàng và nhận vai như mọi người (khi đó
giao diện chỉ hiện phần của mình — máy vẫn giữ bí mật của ván để điều khiển). Ai bấm *Sẵn sàng* (ghế trong `meta.players`) mới được chia vai; còn lại là người xem. Hết
ván mọi người về chế độ xem, ván sau sẵn sàng lại. Vai: Ma Sói,
Dân Làng, Tiên Tri, Bảo Vệ, Phù Thủy — quản trò bấm thẻ để bật/tắt từng vai có trong ván (Sói luôn có, chọn số lượng
hoặc tự động; Dân Làng lấp phần còn lại, tắt đi thì số người phải vừa khít số vai), luật Bảo Vệ, hoà phiếu (bỏ phiếu lại
một lần / không ai chết), thời gian thảo luận. Vai của người chết giữ bí mật tới hết ván. Máy chủ phòng là
quản trò, chạy vòng *nhận vai ("Trời tối rồi…", chia bài rồi lật) → đêm → đếm ngược 3‑2‑1 → sáng, thảo luận → bỏ phiếu
→ (bỏ phiếu lại) → tuyên án*. Ban đêm mọi vai có chức năng thức cùng lúc, chọn người rồi bấm chốt (Phù Thủy thấy người
bầy Sói đang thống nhất cắn). Đêm không giới hạn thời gian: ai cũng chốt xong (tối thiểu 6 giây) thì đếm ngược 3‑2‑1 rồi
trời sáng; có người treo máy thì quản trò bấm *Trời sáng ngay*. Người bị treo luôn bị
lật bài *Sói / không phải Sói*. Hết ván công bố phe thắng, lật bài vai của mọi người và kể diễn biến từng đêm, từng
ngày (`Public.story`, quản trò ghi dần trong bí mật rồi công bố khi hết ván). Các cảnh (trời tối, trời sáng, treo cổ,
phe thắng) mỗi máy tự suy ra từ phần công khai rồi diễn bằng lớp phủ toàn màn hình.

Phần công khai (giai đoạn, hạn chót, ai sống / chết) nằm trong `meta.ww`; phiếu bầu `v:<ván>:<uid>` công khai. Phần bí
mật đi trong gossip nhưng được niêm phong: mỗi tab có cặp khoá ECDH (khoá công khai nằm trong `p:<uid>`), quản trò gửi
riêng từng người chơi `s:<ván>:<uid>` (vai, đồng bọn, kết quả soi, nạn nhân cho Phù Thủy…) và ghi lại *cả loạt* cùng
cỡ mỗi khi có gì đổi; người xem nhận bản thấy hết (vai mọi người, hành động đêm nay) nên bị khoá chat trong ván. Ban đêm
*mọi người còn sống* gửi `a:<ván>:<uid>` cho quản trò theo nhịp 2 giây, cùng cỡ (dân làng gửi hộp rỗng) — nhìn lưu lượng
không đoán được ai có chức năng. Sói thì thầm với nhau qua quản trò. Ban đêm và người đã chết bị khoá ô chat. Quản trò
thấy hết như người xem. Bí mật của
quản trò chỉ nằm trên máy chủ phòng (sessionStorage — tải lại trang vẫn giữ) nên chủ phòng mất kết nối giữa ván thì
người kế nhiệm dừng ván; đang chơi thì không nhường chủ phòng được.

**Sống / chết.** Mỗi peer ghi giờ máy mình vào bản ghi hiện diện mỗi 2–3 giây; peer khác lấy *giờ cục bộ* lúc thấy
nhịp tim tăng để xét còn sống hay không (không phụ thuộc lệch giờ). Chủ phòng im lặng quá 20 giây thì người kế nhiệm
(người chơi theo thứ tự ghế, rồi người vào sớm nhất) tiếp quản. Người chơi caro mất kết nối 30 giây giữa ván bị xử thua; người chơi ma sói mất kết nối 60 giây thì coi như bỏ làng (chết).

**Tải lại trang.** uid lưu theo tab (sessionStorage), snapshot gossip của phòng cũng vậy — chủ phòng tải lại vẫn giữ
phòng và quyền. Snapshot chỉ được dùng nếu mới hơn 20 giây (ngưỡng tiếp quản chủ phòng): quay lại phòng sau lâu hơn thì
vào như người mới, tránh trạng thái cũ ghi đè trạng thái hiện tại. Tab nhân bản được phát hiện qua `BroadcastChannel`
và cấp uid mới.

**TURN.** Trystero mặc định chỉ có STUN: hai máy cùng mạng LAN nối được, nhưng khác mạng — nhất là điện thoại
4G/5G (NAT nhà mạng) — thường bắt tay xong vẫn không thông kênh, mỗi bên chỉ thấy mình online (huy hiệu mạng hiện
"N máy bị chặn"). Khi đó lưu lượng phải đi qua máy chủ TURN, cấu hình bằng biến môi trường lúc build (GitHub Secrets
`TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` hoặc `TURN_API`, xem `lib/net/ice.ts`). Giá trị được nhúng vào trang
tĩnh nên ai cũng đọc được — dùng tài khoản TURN miễn phí riêng cho site này. Thử trên một máy: mở hai tab, một tab
thêm `?relay` vào URL để ép đi qua TURN.

Mô hình tin cậy là hợp tác (bạn bè chơi với nhau): bản ghi chưa được ký số.

## Phát triển

```bash
npm install
npm run dev     # http://localhost:3000 — mở hai tab để thử chơi với chính mình
                # TURN khi chạy local: đặt NEXT_PUBLIC_TURN_* trong .env.local
npm test        # unit test gossip + niêm phong + luật caro, lô tô, ma sói (node --test)
npm run lint
npm run build   # xuất trang tĩnh ra out/
```

Deploy: đẩy lên nhánh `main`, workflow `.github/workflows/deploy.yml` build và đăng lên GitHub Pages;
`public/CNAME` trỏ tên miền `arena.nguyentuan.dev`.

## Thêm game mới

1. Khai báo trong `lib/games/registry.ts` (`available: true`).
2. Viết luật thuần trong `lib/games/<game>.ts` (dựng lại trạng thái tất định từ nhật ký) kèm unit test.
3. Viết lớp phòng `lib/net/<game>-room.ts` kế thừa `RoomSession`: bắt buộc `begin` (chốt đội hình khi bắt đầu ván),
   `outcome` (kết quả suy ra từ nhật ký), `gameView`, `resultText`; tuỳ chọn `applyIntent`, `hostPlay`, `tidy`,
   `onKick`, `watch`, `stopped`, `adExtra`, `memberExtra`. Thêm lớp mới vào `acquire` trong `components/room/useRoom.ts`.
4. Viết bàn chơi `components/room/<Game>Table.tsx` (dùng `RoomLayout`, `PeoplePanel`, `ChatPanel`) và gắn vào
   `RoomScreen`; thêm tuỳ chọn tạo phòng vào `CreateForm` và thẻ phòng trong `components/lobby/GameLobby.tsx`.
