# Arena

Đấu trường game đối kháng chạy hoàn toàn trên trình duyệt — <https://arena.nguyentuan.dev>.

Không máy chủ game, không đăng ký: các trình duyệt nối trực tiếp với nhau qua WebRTC
([Trystero](https://github.com/dmotz/trystero), bắt tay qua relay Nostr công khai), trạng thái được đồng bộ
bằng giao thức gossip tự viết. Site là trang tĩnh (Next.js `output: "export"`) deploy lên GitHub Pages.

## Đường dẫn

| Trang          | Đường dẫn                    |
| -------------- | ---------------------------- |
| Trang chủ      | `/`                          |
| Sảnh của game  | `/games/caro/`               |
| Phòng chơi     | `/games/caro/room/?id=<mã>`  |

Mã phòng nằm ở query string vì site tĩnh không sinh trước được trang cho từng phòng.

## Kiến trúc mạng

```
lib/net/wire.ts    kênh P2P (một room Trystero, appId riêng mỗi kênh), đếm tham chiếu
lib/net/gossip.ts  gossip store LWW + đồng hồ Lamport, anti-entropy push–pull, rumor, bộ phát hiện lỗi nhịp tim
lib/net/lobby.ts   kênh "lobby": ai đang online / ở game nào, quảng bá phòng, lời mời
lib/net/room.ts    kênh "room:<id>": ghế, ván cờ, chat, quyền chủ phòng
lib/games/caro.ts  luật caro thuần (dựng lại ván tất định từ nhật ký nước đi)
```

**Gossip store.** Mỗi bản ghi mang phiên bản `(c, w)` = (đồng hồ Lamport, uid người ghi); bản mới hơn thắng.
Thay đổi được đẩy ngay cho peer kề và lan tiếp tối đa 3 bước; ngoài ra mỗi giây một peer gửi digest tới 3 peer
ngẫu nhiên để bù phần thiếu (anti-entropy) — nhờ vậy trạng thái vẫn hội tụ khi một cặp peer không nối trực tiếp
được với nhau (NAT). Nhịp tim chỉ đi đường anti-entropy để đỡ ồn mạng.

**Chốt trạng thái người dùng.** Người dùng chỉ ghi *ý định* của mình (`p:<uid>`: muốn vào ghế / rời ghế, kèm số thứ tự).
Chủ phòng là người duy nhất ghi `meta` (ghế, trạng thái ván, danh sách kick) và ghi nhận từng ý định theo thứ tự
(`ack`), nên không có xung đột giành ghế. Kết quả ván được mọi peer tự suy ra từ nhật ký nước đi `g:<ván>`.

**Sống / chết.** Mỗi peer ghi giờ máy mình vào bản ghi hiện diện mỗi 2–3 giây; peer khác lấy *giờ cục bộ* lúc thấy
nhịp tim tăng để xét còn sống hay không (không phụ thuộc lệch giờ). Chủ phòng im lặng quá 20 giây thì người kế nhiệm
(người chơi theo thứ tự ghế, rồi người vào sớm nhất) tiếp quản. Người chơi mất kết nối 30 giây giữa ván bị xử thua.

**Tải lại trang.** uid lưu theo tab (sessionStorage), snapshot gossip của phòng cũng vậy — chủ phòng tải lại vẫn giữ
phòng và quyền. Tab nhân bản được phát hiện qua `BroadcastChannel` và cấp uid mới.

Mô hình tin cậy là hợp tác (bạn bè chơi với nhau): bản ghi chưa được ký số.

## Phát triển

```bash
npm install
npm run dev     # http://localhost:3000 — mở hai tab để thử chơi với chính mình
npm test        # unit test gossip + luật caro (node --test)
npm run lint
npm run build   # xuất trang tĩnh ra out/
```

Deploy: đẩy lên nhánh `main`, workflow `.github/workflows/deploy.yml` build và đăng lên GitHub Pages;
`public/CNAME` trỏ tên miền `arena.nguyentuan.dev`.

## Thêm game mới

1. Khai báo trong `lib/games/registry.ts` (`available: true`).
2. Viết luật thuần trong `lib/games/<game>.ts` (dựng lại trạng thái tất định từ nhật ký).
3. Phần phòng (`lib/net/room.ts`) hiện gắn với caro ở `gameOf`/`move` — tách thành interface theo game khi có game thứ hai.
