# Arena

Đấu trường game đối kháng chạy hoàn toàn trên trình duyệt — <https://arena.nguyentuan.dev>.

Không máy chủ game, không đăng ký: các trình duyệt nối trực tiếp với nhau qua WebRTC
([Trystero](https://github.com/dmotz/trystero), bắt tay qua relay Nostr công khai), trạng thái được đồng bộ
bằng giao thức gossip tự viết. Site là trang tĩnh (Next.js `output: "export"`) deploy lên GitHub Pages.

## Đường dẫn

| Trang          | Đường dẫn                                         |
| -------------- | ------------------------------------------------- |
| Trang chủ      | `/`                                               |
| Sảnh của game  | `/games/<game>/` |
| Phòng chơi     | `/games/<game>/room/?id=<mã>`                      |

Mã phòng nằm ở query string vì site tĩnh không sinh trước được trang cho từng phòng.

## Phát triển

```bash
npm install
npm run dev     # http://localhost:3000 — mở hai tab để thử chơi với chính mình
                # TURN khi chạy local: đặt NEXT_PUBLIC_TURN_* trong .env.local
npm test        # unit test gossip + niêm phong + luật caro, lô tô, ma sói, undercover, sudoku, cờ tướng, cờ vua, thả cờ 4, bắn tàu, vẽ đoán, cò chẹp (node --test)
npm run lint
npm run build   # xuất trang tĩnh ra out/
```

Deploy: đẩy lên nhánh `main`, workflow `.github/workflows/deploy.yml` build và đăng lên GitHub Pages;
`public/CNAME` trỏ tên miền `arena.nguyentuan.dev`.

**Danh mục game.** Tên, mô tả, số ghế… và trạng thái của từng game nằm ở [arena-api](https://arena-api.nguyentuan.dev/games.json)
(build nhúng sẵn một bản, trình duyệt hỏi lại lúc chạy). Game nào có trang thì do code quyết định: mọi slug trong
`BUILT_GAMES` (`lib/games/registry.ts`) có mục trên API đều được xuất trang sảnh + phòng, *bất kể trạng thái*. Trạng thái
chỉ điều khiển hiển thị lúc chạy — `LIVE` vào chơi được, `MAINTENANCE` (bảo trì) và `DEVELOPMENT` (sắp ra mắt) bị chặn ở
`MaintenanceGate` — nên đổi trạng thái theo chiều nào cũng không cần build lại. Slug có trên API mà chưa có code thì luôn
hiện "sắp ra mắt", dù API ghi gì.

## Thêm game mới

1. Thêm mục vào `games.json` của arena-api (để `DEVELOPMENT` tới khi muốn mở) và thêm slug vào `BUILT_GAMES` trong
   `lib/games/registry.ts`. Deploy xong thì bật `LIVE` trên arena-api là mở — không cần build lại.
2. Viết luật thuần trong `lib/games/<game>.ts` (dựng lại trạng thái tất định từ nhật ký) kèm unit test.
3. Viết lớp phòng `lib/net/<game>-room.ts` kế thừa `RoomSession`: bắt buộc `begin` (chốt đội hình khi bắt đầu ván),
   `outcome` (kết quả suy ra từ nhật ký), `gameView`, `resultText`; tuỳ chọn `applyIntent`, `hostPlay`, `tidy`,
   `onKick`, `watch`, `stopped`, `adExtra`, `memberExtra`. Thêm lớp mới vào `acquire` trong `components/room/useRoom.ts`.
4. Viết bàn chơi `components/room/<Game>Table.tsx` (dùng `RoomLayout`, `PeoplePanel`, `ChatPanel`) và gắn vào
   `RoomScreen`; thêm tuỳ chọn tạo phòng vào `CreateForm` và thẻ phòng trong `components/lobby/GameLobby.tsx`.
