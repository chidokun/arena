# Arena

Đấu trường game đối kháng chạy hoàn toàn trên trình duyệt — <https://arena.nguyentuan.dev>.

Không máy chủ game, không đăng ký: các trình duyệt nối trực tiếp với nhau qua WebRTC
([Trystero](https://github.com/dmotz/trystero), bắt tay qua relay Nostr công khai), trạng thái được đồng bộ
bằng giao thức gossip tự viết. Site là trang tĩnh (Next.js `output: "export"`) deploy lên GitHub Pages.

## Đường dẫn

| Trang          | Đường dẫn                                         |
| -------------- | ------------------------------------------------- |
| Trang chủ      | `/`                                               |
| Sảnh của game  | `/games/caro/`, `/games/loto/`                    |
| Phòng chơi     | `/games/caro/room/?id=<mã>`, `/games/loto/room/?id=<mã>` |

Mã phòng nằm ở query string vì site tĩnh không sinh trước được trang cho từng phòng.

## Kiến trúc mạng

```
lib/net/wire.ts    kênh P2P (một room Trystero, appId riêng mỗi kênh), đếm tham chiếu
lib/net/gossip.ts  gossip store LWW + đồng hồ Lamport, anti-entropy push–pull, rumor, bộ phát hiện lỗi nhịp tim
lib/net/lobby.ts      kênh "lobby": ai đang online / ở game nào, quảng bá phòng, lời mời
lib/net/room.ts       kênh "room:<id>": phần chung của phòng — ghế, chat, quyền chủ phòng, vòng đời ván
lib/net/caro-room.ts  phòng caro (lớp con của RoomSession): nước đi, xin thua, xử thua người rớt mạng
lib/net/loto-room.ts  phòng lô tô: chọn tờ, chủ phòng kêu số, rao "Hò!" / "Kinh!"
lib/games/caro.ts     luật caro thuần (dựng lại ván tất định từ nhật ký nước đi)
lib/games/loto.ts     luật lô tô thuần (sinh bộ tờ từ seed, dựng lại ván từ dãy số đã kêu)
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

**Sống / chết.** Mỗi peer ghi giờ máy mình vào bản ghi hiện diện mỗi 2–3 giây; peer khác lấy *giờ cục bộ* lúc thấy
nhịp tim tăng để xét còn sống hay không (không phụ thuộc lệch giờ). Chủ phòng im lặng quá 20 giây thì người kế nhiệm
(người chơi theo thứ tự ghế, rồi người vào sớm nhất) tiếp quản. Người chơi mất kết nối 30 giây giữa ván bị xử thua.

**Tải lại trang.** uid lưu theo tab (sessionStorage), snapshot gossip của phòng cũng vậy — chủ phòng tải lại vẫn giữ
phòng và quyền. Snapshot chỉ được dùng nếu mới hơn 20 giây (ngưỡng tiếp quản chủ phòng): quay lại phòng sau lâu hơn thì
vào như người mới, tránh trạng thái cũ ghi đè trạng thái hiện tại. Tab nhân bản được phát hiện qua `BroadcastChannel`
và cấp uid mới.

Mô hình tin cậy là hợp tác (bạn bè chơi với nhau): bản ghi chưa được ký số.

## Phát triển

```bash
npm install
npm run dev     # http://localhost:3000 — mở hai tab để thử chơi với chính mình
npm test        # unit test gossip + luật caro + luật lô tô (node --test)
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
   `onKick`, `watch`, `stopped`, `adExtra`. Thêm lớp mới vào `acquire` trong `components/room/useRoom.ts`.
4. Viết bàn chơi `components/room/<Game>Table.tsx` (dùng `RoomLayout`, `PeoplePanel`, `ChatPanel`) và gắn vào
   `RoomScreen`; thêm tuỳ chọn tạo phòng vào `CreateForm` và thẻ phòng trong `components/lobby/GameLobby.tsx`.
