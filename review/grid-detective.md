# Thám Tử Ô Vuông — bản thiết kế

> Game suy luận cùng thể loại với Murdoku (đặt người lên lưới theo luật hàng/cột + manh mối, tìm thủ phạm),
> nhưng **tên, bối cảnh, nhân vật, bản đồ và đề đều là của Arena**, không chép đề hay hình ảnh của sách.
> Tên: **Thám Tử Ô Vuông**, tiếng Anh **Grid Detective** (slug `grid-detective`).

---

## 1. Luật chơi

### Bàn chơi
- Bản đồ một khung cảnh Việt Nam (nhà ống, đám giỗ, chợ đêm, khu tập thể…) vẽ trên **lưới N×N**.
- Lưới chia thành nhiều **phòng/khu** (vùng liền nhau, có tên: Phòng khách, Bếp, Sân…), viền đậm.
- Mỗi ô là một trong ba loại:
  - **Sàn trống**: đứng được.
  - **Chỗ ngồi/nằm** (ghế 🪑, võng, chiếu, giường): người đứng được, và manh mối có thể nhắc tới ("tôi ngồi trên ghế").
  - **Vật cản** (bàn, tủ, bếp lò, chậu cây, xe máy): **không ai đứng được**.

### Nhân vật
- Mỗi vụ có **N người**: 1 nạn nhân + (N−1) nghi phạm, mỗi người có tên, vai (cô bán xôi, anh xe ôm…) và avatar.
- Mỗi người có **một lời khai** (manh mối). Đề khó có thể thêm một manh mối chung của "hiện trường".

### Luật đặt người
1. **Mỗi hàng và mỗi cột có đúng một người.**
2. Không ai đứng trên vật cản.
3. Mọi lời khai đều **đúng**.
4. **Hung thủ là người duy nhất ở cùng phòng với nạn nhân.** Đề luôn được dựng để điều này xảy ra đúng một lần,
   nên người chơi cũng dùng được nó như một luật để loại trừ.

### Các loại manh mối
| Loại | Ví dụ |
|---|---|
| Ở/không ở phòng | "Tôi ở ngoài sân." · "Tôi không hề vào bếp." |
| Trên đồ vật | "Tôi ngồi trên ghế." · "Tôi nằm võng." |
| Cạnh đồ vật (4 hướng) | "Tôi đứng sát tủ thờ." |
| Vị trí | "Tôi ở hàng trên cùng." · "Tôi đứng ở góc nhà." · "Tôi sát tường bên trái." |
| Quan hệ người–người | "Tôi ở cùng phòng với cô Lan." · "Tôi ở hàng ngay dưới anh Bảo." · "Tôi đứng bên trái chị Mai." |
| Một mình | "Cả buổi tôi ở một mình trong phòng." |

### Thắng
Đặt đủ N người đúng vị trí → bấm **Buộc tội** → lộ hung thủ. Chỉ chọn mỗi tên hung thủ thì không đủ
(đoán bừa 1/3 là trúng), phải đặt đủ cả bàn.

### Ví dụ một vụ 4×4 (Dễ)

*"Đám giỗ nhà ông Tư"* — Ông Tư được phát hiện bất tỉnh. Ai đã ra tay?

```
        A        B        C        D
     ┌─────────────────┬─────────────────┐
  1  │  ·        ⬛bàn  │  ·       🪑ghế   │
     │   PHÒNG KHÁCH   │      BẾP        │
  2  │  ·        ·     │  🔥lò    ·       │
     ├─────────────────┴─────────────────┤
  3  │  ·        ·       〰️võng   ·       │
     │              SÂN VƯỜN             │
  4  │  🪴cây    ·       ·        ·       │
     └───────────────────────────────────┘
```

Lời khai:
- 👵 **Cô Lan**: "Tôi nằm võng suốt buổi."
- 👧 **Bé Na**: "Con chơi ngoài sân vườn."
- 👨 **Anh Bảo**: "Tôi không vào bếp."
- 👴 **Ông Tư** (nạn nhân): "Được tìm thấy ở một góc nhà."

Lời giải:
1. Chỉ có một cái võng, nên Lan ở C3. Hàng 3 và cột C đã có người.
2. Na ở sân, mà hàng 3 đã kín nên Na ở hàng 4: B4 hoặc D4 (A4 là chậu cây).
3. Còn Tư và Bảo cho hàng 1–2, cột A/B/D. Nếu Na ở B4, Tư và Bảo phải ở (A1, D2) hoặc (D1, A2):
   - (A1, D2): ai ở D2 cũng sai. Tư không ở góc, còn Bảo thì lại vào bếp. Loại.
   - (D1, A2): Tư ở góc D1, trong bếp. Nhưng trong bếp không có ai khác, vậy là không có hung thủ, trái luật 4. Loại.
4. Vậy Na ở **D4**, Tư ở góc **A1**, Bảo ở **B2**.
5. Người duy nhất ở cùng Phòng khách với Ông Tư là **Anh Bảo**, nên anh là hung thủ. 🔎

---

## 2. Gameplay trên Arena

Theo khuôn của Sudoku Tranh Đấu và Kawaii: **1–10 người, cả phòng cùng một đề, sinh tất định từ seed** (không gửi đề qua mạng).

### Tuỳ chọn tạo phòng
- **Độ khó**: Dễ 🌱 4×4 (3 nghi phạm) · Vừa 🌿 5×5 · Khó 🔥 6×6. Đề khó thì có nhiều manh mối gián tiếp hơn
  (quan hệ người–người, "một mình", "không ở").
- **Chủ đề**: chỉ đổi lời dẫn và nhân vật, luật giữ nguyên.
  - 🔪 **Án mạng** (trinh thám nhẹ nhàng): nạn nhân "bất tỉnh", không máu me. Tìm **hung thủ**.
  - 🍲 **Ăn vụng**: thay nạn nhân bằng **món bị mất** (nồi thịt kho, hũ mứt, con gà luộc…). Món này chiếm một ô và cũng
    tính vào luật mỗi hàng/cột một quân. Thủ phạm là người duy nhất ở cùng phòng với món đó. Tìm **kẻ ăn vụng**.
- **Chế độ** (2 chế độ, giống Sudoku):

| | 🤝 Cùng phá án | ⚡ Đối kháng |
|---|---|---|
| Bàn | Chung một bàn | Mỗi người một bàn |
| Đặt người | Ai đặt đúng một người trước thì được **+1**. Đặt sai bị **−1**, người đó bật về khay | Tự đặt tự do, không báo đúng/sai từng người |
| Kết thúc | Đặt đủ cả bàn thì lộ hung thủ. Ai **buộc tội** đúng trước nhận thêm **+2** (buộc tội được từ trước khi đặt đủ, nhưng sai bị −2) | Đặt đủ rồi bấm **Buộc tội**. Đúng cả bàn thì về đích. Sai thì **khoá tay 10 giây** và không biết sai ở đâu |
| Thắng | Nhiều điểm nhất | Về đích trước. Người sau giải tiếp để xếp hạng |
| Thấy đối thủ | Thấy mọi nước đặt | Chỉ thấy ai đã về đích và số lần buộc tội sai |

### Màn hình chơi
- **Giữa**: bản đồ có viền phòng, tên phòng, biểu tượng đồ vật. Hàng/cột đã có người thì mờ đi, ô trùng hàng/cột tô đỏ.
- **Khay nhân vật**: bấm avatar rồi bấm ô để đặt, bấm lại để nhấc ra. Máy tính kéo thả được.
- **Thẻ lời khai**: mỗi người một thẻ, bấm để gạch "đã dùng".
- **Nháp ✕**: chế độ đánh dấu ô "không thể" (phím N như Sudoku), chỉ lưu trên máy mình.
- **Kết thúc ván**: hoạt cảnh lật mặt hung thủ, rồi `ResultCard` với thời gian, số lần buộc tội sai, xếp hạng.
- Đề có tiêu đề và hai câu dẫn truyện sinh từ mẫu, ví dụ *"Đám giỗ nhà ông Tư"*, *"Chợ đêm Hội An"*.

### Sinh đề (phần kỹ thuật chính)
1. **Bản đồ sinh ngẫu nhiên hoàn toàn** theo seed:
   - Chia lưới thành K phòng liền nhau (khoảng N−1 đến N+1 phòng, mỗi phòng ít nhất 2 ô) bằng cách loang vùng từ K điểm gốc.
   - Đặt tên phòng từ kho tên theo chủ đề (Phòng khách, Bếp, Gác xép, Sân, Hiên…), không trùng tên.
   - Rải vật cản (khoảng N đến 1,5N ô) và chỗ ngồi/nằm. Mỗi hàng và mỗi cột phải còn ít nhất 2 ô đứng được.
   - Biểu tượng đồ vật chọn theo tên phòng (bếp có bếp lò, phòng ngủ có giường…) để bản đồ đỡ vô nghĩa.
   - Nếu bước 2–4 thất bại thì sinh lại với seed con kế tiếp. Mọi máy ra cùng một kết quả.
2. **Lời giải**: chọn ngẫu nhiên một cách đặt N người, mỗi hàng/cột một người và không đứng trên vật cản, sao cho phòng
   của nạn nhân có **đúng một** người khác.
3. **Manh mối**: liệt kê mọi manh mối đúng với lời giải, gán mỗi người một manh mối, rồi dùng bộ giải kiểm tra lời giải
   có **duy nhất** không. Với N ≤ 6 thì có tối đa 720 hoán vị, kiểm tra bằng vét cạn rất nhanh.
4. **Phân độ khó**: một bộ giải "kiểu người" chỉ dùng loại trừ từng bước, đếm số bước và loại suy luận cần dùng.
   Đề Dễ không cần thử giả định nào. Đề không giải được bằng suy luận thì bỏ.
5. **Trang duyệt đề**: trước khi mở game, làm thêm `review/truy-an-*.html` giống `truc-xanh-*.html` để duyệt mẫu đề.

### Phần code (theo mục "Thêm game mới" trong README)
- `lib/games/grid-detective.ts`: luật, sinh đề, bộ giải, kèm test (đề duy nhất nghiệm, đúng một thủ phạm, tất định theo seed).
- `lib/net/grid-detective-room.ts`: kế thừa `RoomSession`, dùng hai chế độ coop/race giống Sudoku.
- `components/room/GridDetectiveTable.tsx`: bản đồ, khay, thẻ lời khai, hoạt cảnh lật mặt.
- Luật hiển thị trong `lib/games/rules.ts`, logo OG, mục catalog để `DEVELOPMENT` tới khi bạn bật.

---

## 3. Đã chốt
1. **Tên**: Thám Tử Ô Vuông / Grid Detective.
2. **Chủ đề**: có cả Án mạng và Ăn vụng, chọn trong cài đặt phòng.
3. **Cỡ lưới**: 4/5/6.
4. **Điểm Cùng phá án**: +1/−1 mỗi người, buộc tội đúng +2, sai −2.
5. **Bản đồ**: sinh ngẫu nhiên hoàn toàn.
