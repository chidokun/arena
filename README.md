# Arena

Đấu trường game đối kháng chạy hoàn toàn trên trình duyệt — <https://arena.nguyentuan.dev>.

Không máy chủ game, không đăng ký: các trình duyệt nối trực tiếp với nhau qua WebRTC
([Trystero](https://github.com/dmotz/trystero), bắt tay qua relay Nostr công khai), trạng thái được đồng bộ
bằng giao thức gossip tự viết. Site là trang tĩnh (Next.js `output: "export"`) deploy lên GitHub Pages.

## Đường dẫn

| Trang          | Đường dẫn                                         |
| -------------- | ------------------------------------------------- |
| Trang chủ      | `/`                                               |
| Sảnh của game  | `/games/caro/`, `/games/loto/`, `/games/werewolf/`, `/games/undercover/`, `/games/sudoku/`, `/games/xiangqi/`, `/games/connect-four/`, `/games/battleship/`, `/games/draw-guess/` |
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
lib/net/undercover-room.ts  phòng undercover: máy chủ phòng điều hành, từ khoá niêm phong giữa từng người và máy chủ phòng
lib/net/sudoku-room.ts  phòng sudoku: người chơi ghi nước điền của mình, máy chủ phòng phân xử thứ tự và ghi bàn chung
lib/net/xiangqi-room.ts phòng cờ tướng: nước đi, xin hoà, xin thua, xử thua người rớt mạng
lib/net/connect-four-room.ts phòng thả cờ 4: nước đi (số cột), xin thua, xử thua người rớt mạng
lib/net/battleship-room.ts phòng bắn tàu: cam kết hạm đội, phát bắn và tự trả lời, công bố + đối chiếu khi hết ván
lib/net/draw-guess-room.ts phòng vẽ đoán: máy chủ phòng điều hành, từ khoá và lời đoán niêm phong, tranh chia trang + nét dở qua rumor
lib/net/seal.ts       niêm phong bản ghi bí mật: ECDH P-256 + AES-GCM, độn cùng cỡ
lib/games/caro.ts     luật caro thuần (dựng lại ván tất định từ nhật ký nước đi)
lib/games/loto.ts     luật lô tô thuần (sinh bộ tờ từ seed, dựng lại ván từ dãy số đã kêu)
lib/games/werewolf.ts luật ma sói thuần (máy trạng thái đêm → ngày → bỏ phiếu, điều kiện thắng)
lib/games/undercover.ts luật undercover thuần (phát từ → thảo luận → biểu quyết → phe Trắng đoán, điều kiện thắng)
lib/games/undercover-words.ts bộ 1000 cặp từ khoá
lib/games/sudoku.ts   luật sudoku thuần (sinh đề tất định từ seed theo mức, phân xử nước điền, dựng lại điểm từ bàn chung)
lib/games/xiangqi.ts  luật cờ tướng thuần (nước đi hợp lệ, chiếu bí / bí nước, chiếu dai, biên bản kiểu Việt Nam)
lib/games/connect-four.ts luật thả cờ 4 thuần (quân rơi xuống ô trống thấp nhất, nối 4 thắng, đầy bàn hoà)
lib/games/battleship.ts luật bắn tàu thuần (hạm đội hợp lệ, trả lời phát bắn, dựng lại ván, cam kết SHA-256, đối chiếu)
lib/games/draw-guess.ts luật vẽ đoán thuần (chọn từ → vẽ → lộ đáp án, chấm lời đoán không dấu, gợi ý chữ cái, điểm, thao tác vẽ)
lib/games/draw-guess-words.ts bộ 380 từ khoá vẽ đoán, ba mức dễ / vừa / khó
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

**Truy tìm Gián Điệp** (Undercover, slug `undercover`). 3–20 người chơi, phòng không giới hạn người xem. Ba phe: *Dân* nhận từ chung, *Gián Điệp* nhận từ kia
của cặp, *Trắng* không có từ. Máy chủ phòng bốc ngẫu nhiên một cặp trong bộ 1000 cặp từ tiếng Việt
(`undercover-words.ts`, mã cặp là số thứ tự dòng — chỉ thêm vào cuối); hết ván, khi cặp từ đã lộ, mã cặp được ghi vào
`meta.ucUsed` nên phòng không bốc lại (chủ phòng làm mới được). Luật phòng chỉnh bằng thẻ phe như ma sói: số Gián Điệp
(tự động hoặc 1–5), bật / tắt phe Trắng (1–2 người); thêm báo phe hay chỉ báo từ khoá, cách
phá hoà, chủ phòng cùng chơi (mặc định — giao diện chỉ hiện phần của mình) hay chỉ điều hành (xem hết, tự đặt cặp từ cho
ván tới, chọn người bị loại khi hoà). Ván: *phát từ* — bộ bài xếp theo thứ tự thảo luận (chốt ngay lúc chia, xáo ngẫu
nhiên, người nói đầu không thuộc phe Trắng, giữ nguyên cả ván), mỗi người bấm lá của mình để lật (`v:<ván>:<uid>`
`ready`); ai cũng lật xong thì sang *mô tả* — bắt buộc lần lượt theo thứ tự, không đếm giờ: tới lượt ai thì người đó
điền một câu vào khung mô tả riêng (`c:<ván>:<uid>`, câu có từ khoá của chính mình bị chặn — so không dấu, nguyên từ),
người treo máy thì chủ phòng bỏ qua lượt; mỗi máy tự chép mô tả vào khung chat như tin của người đó, tô tím (`clue`),
khung chat khoá trong lúc mô tả. Mô tả xong thì *thảo luận* tự do trong khung chat (tin có từ khoá của mình bị chặn);
ai bấm *Biểu quyết ngay* thì cả bàn sang *biểu quyết* — chọn người rồi xác nhận (không đổi được), đa số bị loại và lộ phe; hoà
thì bỏ phiếu phụ giữa những người hoà, vẫn hoà thì bốc thăm / không ai bị loại / chủ phòng chọn. Phe Trắng bị loại được
nhập từ đoán một lần (`w:<ván>:<uid>`, so không dấu, không phân biệt hoa thường): đúng là thắng ngay, sai thì bị loại hẳn
và ván tiếp tục. Phe Dân thắng khi hết Gián Điệp và phe Trắng; Gián Điệp thắng khi số Gián Điệp còn lại bằng số người phe
Dân (phe Trắng còn sống thắng cùng); chỉ còn hai người mà phe đối lập vẫn còn thì phe đó thắng. Hết ván lật bài mọi người
và kể diễn biến câu chuyện (phát từ, các mô tả, ai gọi biểu quyết, phiếu bầu, ai bị loại thuộc phe nào, phe Trắng đoán gì) — tất cả
suy ra từ phần công khai `meta.uc`. Từ khoá và phe đi trong `s:<ván>:<uid>` niêm phong như ma sói (cả loạt cùng cỡ — độ
dài hộp không lộ ai thuộc phe Trắng), người xem nhận bản thấy hết và bị khoá chat trong ván. Người chơi mất kết nối 60
giây thì bị loại (lộ phe).

**Sudoku Tranh Đấu** (slug `sudoku`). 1–10 người chơi (bấm *Vào chơi* để vào ghế), phòng không giới hạn người xem.
Chủ phòng chọn *mức đề* và *chế độ* trước mỗi ván. Bắt đầu ván, chủ phòng chốt đội hình (người trong ghế đang online)
và `meta.sd` (seed, mức, chế độ); mọi máy tự sinh cùng một đề từ seed: bàn đầy sinh bằng quay lui xáo số, rồi khoét
từng cặp ô đối xứng tâm khi đề vẫn giải được theo cách của mức — *Dễ* (46 số) chỉ cần ô còn một ứng viên, *Vừa* (38 số)
và *Khó* (30 số) thêm số chỉ còn một chỗ trong hàng / cột / khối (đề khó ưu tiên đề phải dùng mẹo này); mức nào cũng
giải được không cần đoán. Đề lộ sau cảnh đếm ngược 5‑4‑3‑2‑1 toàn màn hình (tính trên giờ máy từng người, kẹp theo giờ
chủ phòng), kèm lời nhắc theo chế độ. Người chơi
chỉ nối nước điền của mình vào `m:<ván>:<uid>` (ô, số); máy nào cũng có lời giải nên phản hồi đúng / sai ngay, còn
thứ tự do máy chủ phòng phân xử: xét các nước mới theo thứ tự mình thấy rồi ghi bàn chung `g:<ván>` (nước được tính,
đã xét tới đâu của từng người, thời gian giải). Điểm, người giữ ô, người thắng đều suy ra tất định từ bàn chung.
*Cùng giải đề*: cả phòng điền chung một bàn, ai điền đúng một ô trước giữ ô đó (+1, ô tô màu người đó), điền sai −1;
hết ô trống thì người nhiều điểm nhất thắng (bằng điểm thì đồng hạng) — cảnh chiến thắng hiện người thắng và số điểm.
*Đối kháng*: mỗi người giải bàn riêng (dựng từ nhật ký của chính mình), ô người khác đã giải được tô màu của người giải
ô đó nhanh nhất mà không lộ số — người xem cũng vậy; hết ván mới hiện cả lời giải kèm màu. Điền sai bị khoá tay 5 giây.
Ai giải xong trước thắng ngay (cảnh chiến thắng, nhắc người còn lại giải tiếp), những người còn lại giải tiếp tới khi
xong để xếp hạng; chủ phòng ghi giờ xong của từng người vào bàn chung. Ván kết thúc khi mọi người xong, hoặc khi những
người chưa xong đều mất kết nối 20 giây (chủ phòng dừng ván lúc này thì người về nhất vẫn thắng). Ở cả hai chế độ,
khi người khác giải đúng một ô thì pháo giấy màu của người đó nổ ra từ ô ấy (mỗi máy tự diễn theo các nước mới trong bàn
chung, không phát lại nước cũ khi vào phòng / tải lại trang). Màu tô người chơi trên bàn mặc định hiện; ai không muốn thì tự tắt bằng
nút “🎨 Màu người chơi” — chỉ tắt trên máy mình (nhớ trong localStorage), cả hai chế độ. Ghi chú bút chì chỉ lưu ở máy mình; bàn phím: 1–9, mũi tên, N (ghi chú), Backspace.
Cả đội hình mất kết nối 60 giây thì dừng ván.

**Cờ Tướng** (slug `xiangqi`). Hai ghế như caro, phòng giới hạn người xem. `lineup[0]` cầm quân Đỏ (đi trước, ở
dưới), đổi bên mỗi ván; bên cầm quân Đen thấy bàn lật lại để quân mình ở dưới. Hai người lần lượt nối nước `[từ ô, tới ô]`
vào `g:<ván>`, mọi máy tự dựng lại ván bằng `replay` (luật thuần trong `lib/games/xiangqi.ts`, nhớ kết quả theo nhật ký).
Luật: Tướng / Sĩ trong cung, Tượng không qua sông và bị cản mắt, Mã bị cản chân, Pháo ăn qua đúng một ngòi, Tốt qua sông
được đi ngang, hai Tướng không được đối mặt trên cột trống, không được đi nước để Tướng mình bị chiếu. Bên tới lượt hết
nước đi là thua — bị chiếu (chiếu bí) hay không (bí nước). Thế cờ (bàn + lượt) lặp lại lần thứ ba: bên nào mọi nước trong
vòng lặp đều chiếu thì thua (chiếu dai), còn lại hoà; hoà cả khi 60 nước mỗi bên không ăn quân hoặc hai bên hết Xe, Mã,
Pháo, Tốt. Xin hoà ghi `v:<ván>:<uid>` kèm số nước lúc xin — hai bên cùng xin ở một nước là hoà, đi tiếp là lời xin hết
hiệu lực; xin thua `x:<ván>:<uid>`; mất kết nối 30 giây giữa ván bị xử thua. Bảng thắng / hoà cộng dồn như caro. Biên bản
ghi kiểu Việt Nam (P2-5, M8.7, X1/1, Xt.4). Mở ván có cảnh *Khai cuộc* toàn màn hình (hai người chơi lao vào từ hai phía,
nhắc ai cầm quân gì), hết ván có cảnh chiến thắng kèm pháo giấy (người thua không có pháo giấy) hoặc cảnh hoà cờ, mỗi lần
chiếu tướng đóng dấu "Chiếu tướng!" lên bàn — chỉ diễn khi khoảnh khắc xảy ra ngay trước mắt, vào phòng / tải lại trang
không diễn lại. Chữ trên quân (chữ Hán hay tên tiếng Việt) chọn trên từng máy, nhớ trong localStorage.

**Thả Cờ 4** (slug `connect-four`). Hai ghế như caro, phòng giới hạn người xem, bàn 7 cột × 6 hàng. `lineup[0]` cầm
quân Đỏ đi trước, `lineup[1]` cầm quân Vàng; đổi người đi trước mỗi ván. Hai người lần lượt nối *số cột* vào `g:<ván>`,
quân rơi xuống ô trống thấp nhất; mọi máy tự dựng lại ván bằng `replay` (`lib/games/connect-four.ts`). Nối 4 quân liên
tiếp (ngang, dọc, chéo) là thắng — một nước nối nhiều chuỗi thì tô sáng tất cả; đầy bàn là hoà. Xin thua `x:<ván>:<uid>`;
mất kết nối 30 giây giữa ván bị xử thua. Bảng thắng / hoà cộng dồn như caro. Quân mới rơi từ trên xuống lọt sau khung.

**Bắn Tàu** (slug `battleship`). Hai ghế như caro, phòng giới hạn người xem, hải đồ 10 × 10 (cột A–J, hàng 1–10), mỗi
bên 5 tàu: Tàu sân bay 5 ô, Thiết giáp hạm 4, Tuần dương hạm 3, Tàu ngầm 3, Khu trục hạm 2 (thẳng hàng, không chồng nhau,
được chạm nhau). Luật phòng chọn lúc tạo: *trúng được bắn tiếp* (mặc định) hay *mỗi phát một lượt*. `lineup[0]` bắn
trước, đổi mỗi ván. Ván có hai giai đoạn: *bày tàu* — bấm tàu để nhấc, bấm ô để đặt, R / chuột phải / nút để xoay
(quanh ô đang nắm), bày ngẫu nhiên (các tàu không chạm nhau); bản nháp nhớ trong sessionStorage. Bấm *Sẵn sàng* là chốt:
máy cất sơ đồ + muối 16 byte ngẫu nhiên trong sessionStorage và chỉ công bố cam kết `f:<ván>:<uid>` = SHA-256(muối +
sơ đồ). Đủ hai cam kết thì *giao chiến*: người tới lượt nối phát `{ c }` vào `g:<ván>`; máy bên bị bắn thấy phát đang chờ
thì tự trả lời từ sơ đồ của mình — trượt, trúng, hay chìm (kèm vị trí tàu chìm, như "bạn đã bắn chìm tàu sân bay của
tôi"). Ai cũng dựng lại ván bằng `replay` (`lib/games/battleship.ts`); nhật ký dừng ở mục sai đầu tiên (bắn lại ô cũ, khai
chìm tàu chưa trúng hết…). Đánh chìm cả 5 tàu là thắng; mỗi lần chìm tàu mọi máy rao trong khung chat (chỉ diễn biến
mới). Hết ván (kể cả xin thua `x:<ván>:<uid>`, rớt mạng 30 giây bị xử thua), máy hai người tự công bố hạm đội + muối vào
`f:<ván>:<uid>`; mọi máy tính lại cam kết và đối chiếu từng câu trả lời: khớp thì hiện "chơi đẹp", lệch thì gắn cờ gian
lận. Hạm đội đối phương lộ ra (viền vàng nét đứt). Bảng thắng cộng dồn như caro.

**Vẽ Đoán** (slug `draw-guess`). 2–8 người chơi (bấm *Vào chơi*), phòng giới hạn người xem. Ván gồm 1–4 vòng, mỗi vòng
ai cũng vẽ một lượt theo thứ tự xáo lúc bắt đầu. Một lượt: người vẽ chọn 1 trong 3 từ bí mật (dễ / vừa / khó — bộ 380 từ
trong `draw-guess-words.ts`, mã từ = mức × 1000 + số thứ tự nên chỉ thêm vào cuối mỗi mức; phòng nhớ từ đã chơi trong
`meta.dwUsed`), 15 giây không chọn thì bốc thay; rồi vẽ trong 60–120 giây. Người khác gõ đáp án vào ô dưới tranh hoặc khung
chat: không phân biệt dấu, hoa thường, khoảng trắng; được bỏ loại từ đứng đầu ("mèo" ≡ "con mèo"), lời đoán được thêm tiếng
hay nói kèm ("người nông dân", "xe ô tô"). Đoán đúng được 60–300 điểm tuỳ thời gian còn lại, người vẽ +50 mỗi người đoán ra;
cả bàn đoán ra hoặc hết giờ thì lộ đáp án 6 giây rồi sang lượt sau. Gợi ý (tuỳ chọn) mở dần chữ cái ở 50% / 65% / 80% thời
gian. Hết các lượt, nhiều điểm nhất thắng (đồng hạng được). Máy chủ phòng điều hành (`tick` thuần trong
`lib/games/draw-guess.ts`): đáp án chỉ nằm trên máy chủ phòng (sessionStorage), bộ từ niêm phong gửi riêng người vẽ
(`s:<ván>:<uid>`); người đoán niêm phong các lời đoán gửi chủ phòng (`a:<ván>:<uid>`), chủ phòng chấm — sai thì công khai vào
`g:<ván>` (mọi máy chép vào khung chat như tin của người đoán), gần đúng (sai 1–2 ký tự) thì báo riêng người đó, đúng thì ghi
vào `meta.dw.hits`; lời đoán đúng không bao giờ lộ ra. Người đã biết đáp án (người vẽ, người đã đoán ra) không nhắn được tin
có đáp án. Tranh là danh sách thao tác (nét, đổ màu, hoàn tác, xoá; toạ độ trong khổ 800 × 600) chia trang
`d:<ván>:<lượt>.<trang>:<uid>`, 8 thao tác mỗi trang — vẽ xong một nét chỉ gửi lại trang cuối; nét đang vẽ dở phát theo
rumor `ink` (20 lần/giây, chỉ phần điểm mới) nên người xem thấy nét chạy ngay; hết lượt mọi máy dọn tranh cũ. Người vẽ vắng
mặt lúc tới lượt thì bỏ lượt, im lặng 15 giây giữa lượt thì dừng lượt; còn dưới 2 người chơi (mất kết nối 60 giây) thì dừng
ván. Chủ phòng đổi giữa lượt thì lượt đó bị huỷ (đáp án nằm trên máy chủ cũ), ván tiếp tục từ lượt sau; đang chọn từ / đang
vẽ thì không nhường chủ phòng được. Mỗi máy chụp tranh các lượt đã lộ đáp án vào *Triển lãm* cuối trang (chỉ trên máy mình,
tải lại trang là mất; lưu được ảnh).

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
npm test        # unit test gossip + niêm phong + luật caro, lô tô, ma sói, undercover, sudoku, cờ tướng, thả cờ 4, bắn tàu, vẽ đoán (node --test)
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
