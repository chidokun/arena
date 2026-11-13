// Bản chép games.json của arena-api (https://arena-api.nguyentuan.dev/games.json) cho lúc build — sinh bằng `npm run catalog`, đừng sửa tay.
export const CATALOG: unknown = {
  "games": [
    {
      "slug": "caro",
      "name": "Cờ Caro",
      "emoji": "⭕",
      "status": "LIVE",
      "category": "chill",
      "tagline": "Năm quân thẳng hàng là thắng",
      "description": "Hai người lần lượt đặt X và O trên bàn 15×15. Ai xếp được 5 quân liên tiếp theo hàng ngang, dọc hoặc chéo trước thì thắng. Chủ phòng chọn có áp dụng luật chặn hai đầu hay không.",
      "seats": {
        "min": 2,
        "max": 2
      },
      "capacity": {
        "min": 2,
        "max": 16,
        "default": 8
      },
      "hue": "coral"
    },
    {
      "slug": "loto",
      "name": "Lô Tô Ngày Tết",
      "emoji": "🧧",
      "status": "LIVE",
      "category": "folk",
      "tagline": "Kêu số rộn ràng, đủ năm số một hàng là Kinh!",
      "description": "Bộ 10 màu, mỗi màu 2 tờ bù trừ nhau đủ 90 số. Mỗi người chọn 1–2 tờ; chủ phòng tự động kêu số ngẫu nhiên từ 1 đến 90, tờ của bạn tự đánh dấu. Bốn số cùng hàng thì Hò — đủ năm số một hàng là Kinh!",
      "seats": {
        "min": 1,
        "max": 20
      },
      "capacity": {
        "min": 0,
        "max": 0,
        "default": 0
      },
      "hue": "sun"
    },
    {
      "slug": "werewolf",
      "name": "Ma Sói",
      "emoji": "🐺",
      "status": "LIVE",
      "category": "brain",
      "tagline": "Đêm Sói cắn, ngày cả làng treo cổ",
      "description": "Người tạo phòng là Quản trò — mặc định chơi cùng, hoặc chỉ xem và điều khiển; máy của họ tự chia vai bí mật: Ma Sói, Dân Làng, Tiên Tri, Bảo Vệ, Phù Thủy, Thợ Săn, Cupid, Bán Sói, Minion. Đêm xuống quản trò gọi lần lượt từng vai: Sói chọn người để cắn, các vai đặc biệt dùng năng lực; ngày lên cả làng tranh luận và bỏ phiếu treo cổ. Dân thắng khi hết Sói — Sói thắng khi đông bằng phần còn lại.",
      "seats": {
        "min": 4,
        "max": 16
      },
      "capacity": {
        "min": 0,
        "max": 0,
        "default": 0
      },
      "hue": "grape",
      "host": "Quản trò"
    },
    {
      "slug": "undercover",
      "name": "Truy tìm Gián Điệp",
      "emoji": "🕵️",
      "status": "LIVE",
      "category": "brain",
      "tagline": "Cùng một chủ đề, khác một từ khoá — ai là gián điệp?",
      "description": "Máy chủ phòng bốc một cặp từ na ná nhau trong bộ 1000 cặp và phát bí mật: phe Dân nhận từ chung, phe Gián Điệp nhận từ kia, phe Trắng không có từ nào. Lật bài xem từ, lần lượt từng người mô tả từ khoá theo thứ tự, thảo luận rồi ai cũng có thể gọi biểu quyết loại người đáng ngờ nhất — người bị loại lộ phe, phe Trắng bị loại còn được đoán từ khoá để lật ngược thế cờ.",
      "seats": {
        "min": 3,
        "max": 20
      },
      "capacity": {
        "min": 0,
        "max": 0,
        "default": 0
      },
      "hue": "sky"
    },
    {
      "slug": "sudoku",
      "name": "Sudoku Tranh Đấu",
      "emoji": "🔢",
      "status": "LIVE",
      "category": "brain",
      "tagline": "Cùng một đề — ai nhanh tay, nhanh trí hơn?",
      "description": "Cả phòng nhận cùng một đề Sudoku 9×9 mức Dễ, Vừa hoặc Khó. Cùng giải đề: mọi người điền chung một bàn, điền đúng một ô trước người khác được 1 điểm, sai bị trừ — nhiều điểm nhất thắng. Đối kháng: mỗi người tự giải đề của mình, ô người khác đã giải được tô màu người nhanh nhất — ai giải xong trước thắng, người còn lại giải tiếp để xếp hạng.",
      "seats": {
        "min": 1,
        "max": 10
      },
      "capacity": {
        "min": 0,
        "max": 0,
        "default": 0
      },
      "hue": "lime"
    },
    {
      "slug": "xiangqi",
      "name": "Cờ Tướng",
      "emoji": "🀄",
      "status": "LIVE",
      "category": "brain",
      "tagline": "Chiếu tướng, bắt Tướng — trí tuệ ngàn năm",
      "description": "Hai người cầm quân Đỏ và Đen trên bàn 9×10 với Xe, Pháo, Mã, Tượng, Sĩ, Tướng và Tốt; Đỏ đi trước, đổi bên mỗi ván. Chiếu bí hoặc khiến đối phương hết nước đi là thắng. Có biên bản nước đi kiểu Việt Nam, luật chiếu dai, xin hoà và xin thua.",
      "seats": {
        "min": 2,
        "max": 2
      },
      "capacity": {
        "min": 2,
        "max": 16,
        "default": 8
      },
      "hue": "coral"
    },
    {
      "slug": "xiangqi-role",
      "name": "Cờ Tướng Nhập Vai",
      "emoji": "🦸🏻‍♀️",
      "status": "MAINTENANCE",
      "category": "brain",
      "tagline": "Mỗi người một role — claim lượt, chiếu bí cùng phe",
      "description": "Mỗi phe 5 role: Tướng·Sĩ·Tượng (một người), Xe, Pháo, Mã, Tốt — tối đa 10 người. Ai claim trước được đi; hết giờ thì cung (Tướng·Sĩ·Tượng) nhận token. Luật cờ tướng giữ nguyên; role trống do bot. Chat riêng theo phe.",
      "seats": {
        "min": 2,
        "max": 10
      },
      "capacity": {
        "min": 0,
        "max": 0,
        "default": 0
      },
      "hue": "sun"
    },
    {
      "slug": "connect-four",
      "name": "Thả Cờ 4",
      "emoji": "🔵",
      "status": "LIVE",
      "category": "chill",
      "tagline": "Thả quân, nối bốn, hạ đối thủ",
      "description": "Hai người lần lượt thả quân Đỏ và Vàng vào bàn 7 cột × 6 hàng — quân rơi xuống ô trống thấp nhất của cột. Ai nối được 4 quân liên tiếp theo hàng ngang, dọc hoặc chéo trước thì thắng; đầy bàn là hoà.",
      "seats": {
        "min": 2,
        "max": 2
      },
      "capacity": {
        "min": 2,
        "max": 16,
        "default": 8
      },
      "hue": "sky"
    },
    {
      "slug": "battleship",
      "name": "Bắn Tàu",
      "emoji": "🚢",
      "status": "LIVE",
      "category": "brain",
      "tagline": "Giấu hạm đội, đoán toạ độ",
      "description": "Mỗi người bí mật bày 5 tàu (5–4–3–3–2 ô) trên hải đồ 10×10, rồi thay phiên gọi toạ độ để bắn vào hải đồ đối phương — trúng, trượt hay chìm tàu đều được báo ngay. Ai đánh chìm toàn bộ hạm đội đối phương trước thì thắng. Sơ đồ được niêm phong bằng mã băm và công bố khi hết ván để đối chiếu, chống gian lận.",
      "seats": {
        "min": 2,
        "max": 2
      },
      "capacity": {
        "min": 2,
        "max": 16,
        "default": 8
      },
      "hue": "lime"
    },
    {
      "slug": "draw-guess",
      "name": "Vẽ Đoán",
      "emoji": "🎨",
      "status": "LIVE",
      "category": "chill",
      "tagline": "Một người vẽ, cả phòng đoán",
      "description": "Lần lượt từng người vẽ: chọn 1 trong 3 từ bí mật (dễ, vừa, khó) rồi vẽ — cả phòng thấy từng nét ngay khi đang vẽ. Người khác gõ đáp án, không cần dấu: đoán càng sớm càng nhiều điểm, người vẽ cũng được điểm theo số người đoán ra, chữ cái gợi ý mở dần khi gần hết giờ. Sau 1–4 vòng, ai nhiều điểm nhất thắng.",
      "seats": {
        "min": 2,
        "max": 8
      },
      "capacity": {
        "min": 2,
        "max": 16,
        "default": 10
      },
      "hue": "grape"
    },
    {
      "slug": "oanquan",
      "name": "Ô Ăn Quan",
      "emoji": "🎎",
      "status": "LIVE",
      "category": "folk",
      "tagline": "Bốc quân rải ô, cách một ô trống là ăn",
      "description": "Trò dân gian cho 2 người: mỗi bên 5 ô dân (5 quân mỗi ô), hai đầu bàn là hai ô quan. Tới lượt, bốc hết quân một ô bên mình rải mỗi ô một quân theo chiều tuỳ chọn — rải hết mà ô kế có quân thì bốc rải tiếp, cách một ô trống thì ăn ô sau nó, ăn liền mạch được. Hết quan thì thu quân, dân 1 điểm, quan 10 điểm — ai nhiều điểm hơn thắng. Chủ phòng chọn có cấm ăn quan non hay không.",
      "seats": {
        "min": 2,
        "max": 2
      },
      "capacity": {
        "min": 2,
        "max": 16,
        "default": 8
      },
      "hue": "sun"
    },
    {
      "slug": "chess",
      "name": "Cờ Vua",
      "emoji": "♟️",
      "status": "LIVE",
      "category": "brain",
      "tagline": "Chiếu hết Vua đối phương — môn thể thao trí tuệ của cả thế giới",
      "description": "Hai người cầm quân Trắng và Đen trên bàn 8×8 với Vua, Hậu, Xe, Tượng, Mã và Tốt; Trắng đi trước, đổi bên mỗi ván. Đủ luật nhập thành, bắt tốt qua đường, phong cấp. Chiếu hết là thắng; hết nước, lặp thế cờ ba lần, luật 50 nước hay không đủ quân là hoà. Có biên bản nước đi, xin hoà và xin thua.",
      "seats": {
        "min": 2,
        "max": 2
      },
      "capacity": {
        "min": 2,
        "max": 16,
        "default": 8
      },
      "hue": "grape"
    },
    {
      "slug": "dots-boxes",
      "name": "Chấm Nối Ô",
      "emoji": "🔲",
      "status": "LIVE",
      "category": "chill",
      "tagline": "Kẻ cạnh khép ô, ô nào khép là của mình",
      "description": "Hai người lần lượt kẻ một cạnh nối hai chấm kề nhau trên lưới chấm. Ai kẻ cạnh thứ tư khép kín một ô vuông thì chiếm ô đó và được kẻ tiếp. Hết ô thì ai chiếm nhiều ô hơn thắng. Chủ phòng chọn cỡ bàn 3×3, 5×5 hoặc 7×7 ô.",
      "seats": {
        "min": 2,
        "max": 2
      },
      "capacity": {
        "min": 2,
        "max": 16,
        "default": 8
      },
      "hue": "coral"
    },
    {
      "slug": "co-chep",
      "name": "Cò Chẹp Tuổi Thơ",
      "emoji": "🤾🏻‍♂️",
      "status": "LIVE",
      "category": "folk",
      "tagline": "Cò chẹp - Chiếm nhà và giành chiến thắng",
      "description": "Trò dân gian cho 1–5 người: Chọi đá lần lượt vào ô 1 đến 8, trúng thì tự nhảy cò chẹp nhặt đá về. Xong ô 8 thì chọi lên Trời, nhảy chẹp quanh đá rồi chọi qua lưng không được nhìn — rơi gọn vào ô trống là chiếm làm nhà. Chọi trúng nhà mình là cháy nhà! Ai nhiều nhà nhất thắng.",
      "seats": {
        "min": 1,
        "max": 5
      },
      "capacity": {
        "min": 5,
        "max": 16,
        "default": 10
      },
      "hue": "lime"
    },
    {
      "slug": "mine-control",
      "name": "Dò Mìn Chiến Thuật",
      "emoji": "💣",
      "status": "LIVE",
      "category": "brain",
      "tagline": "Mở đất, né mìn, giành lãnh thổ",
      "description": "Dò mìn đối kháng cho 2–4 người: mỗi người một căn cứ ở góc bản đồ, lần lượt mở ô sát lãnh thổ để chiếm đất và ghi điểm, dùng năng lượng cho Radar, Khiên, Pháo đài, Cướp Đất. Giẫm mìn mất mạng — hết 3 mạng là bị loại. Trụ lại cuối cùng, hoặc nhiều điểm nhất khi mở hết ô an toàn / bế tắc, là thắng.",
      "seats": {
        "min": 2,
        "max": 4
      },
      "capacity": {
        "min": 4,
        "max": 16,
        "default": 8
      },
      "hue": "sky"
    },
    {
      "slug": "kawaii",
      "name": "Nối Thú Kawaii",
      "emoji": "🙉",
      "status": "LIVE",
      "category": "chill",
      "tagline": "Nối cặp thú cưng — dọn sạch bàn, nhiều điểm nhất thắng",
      "description": "Nối thú kiểu Pikachu, không giới hạn người chơi — một mình cũng chơi được. Cả phòng chung một bàn đầy ô thú cưng, mỗi loại 4 ô: bấm hai ô cùng hình nối được bằng đường gấp khúc tối đa 2 lần (đi vòng ra viền được) thì cả hai biến mất. Ai nối trước được 10 điểm, xin gợi ý bị trừ 5. Hết cặp nối được thì bàn tự xáo. Không tính giờ: dọn sạch bàn là hết ván, nhiều điểm nhất thắng.",
      "seats": {
        "min": 1,
        "max": 0
      },
      "capacity": {
        "min": 0,
        "max": 0,
        "default": 0
      },
      "hue": "coral"
    },
    {
      "slug": "truc-xanh",
      "name": "Trúc Xanh",
      "emoji": "🎋",
      "status": "LIVE",
      "category": "chill",
      "tagline": "Lật ô tìm cặp, mở dần tranh ẩn — đoán trúng là thắng",
      "description": "Trúc Xanh như trên truyền hình, không giới hạn người chơi — một mình cũng chơi được. Các ô đánh số úp lên một bức tranh ẩn bốc theo mức chủ phòng chọn — Dễ: hơn 100 danh lam, món ăn, con vật, đồ vật; Khó: 100 khái niệm trừu tượng — mặt dưới là hình emoji, mỗi hình hai ô. Lần lượt lật hai ô: trùng hình thì lộ một mảng tranh và được lật tiếp, trật thì sang người sau. Ai cũng đoán được từ khoá của tranh bất cứ lúc nào, không cần dấu: đúng là thắng, trật thì thôi.",
      "seats": {
        "min": 1,
        "max": 0
      },
      "capacity": {
        "min": 0,
        "max": 0,
        "default": 0
      },
      "hue": "lime"
    },
    {
      "slug": "minesweeper",
      "name": "Dò Mìn Cổ Điển",
      "emoji": "💣",
      "status": "LIVE",
      "category": "chill",
      "tagline": "Mở ô an toàn ghi điểm — đạp mìn là bị loại",
      "description": "Dò mìn cổ điển cho nhiều người, một mình cũng chơi được. Cả phòng chung một bàn, không theo lượt: mở ô an toàn được 1 điểm cho mỗi ô lộ ra, đạp mìn là bị loại. Mở hết bàn thì ai còn trụ nhiều điểm nhất thắng — còn một người thì phải tự mở hết mới thắng.",
      "seats": {
        "min": 1,
        "max": 0
      },
      "capacity": {
        "min": 0,
        "max": 0,
        "default": 0
      },
      "hue": "sky"
    },
    {
      "slug": "reversi",
      "name": "Cờ Lật",
      "emoji": "⚪️",
      "status": "LIVE",
      "category": "chill",
      "tagline": "Kẹp quân đối thủ, lật cả dãy sang màu mình",
      "description": "Cờ lật (Reversi / Othello) cho 2 người trên bàn 8×8. Lần lượt đặt quân sao cho kẹp được một dãy quân đối thủ theo hàng ngang, dọc hoặc chéo — cả dãy bị lật sang màu mình. Hết nước thì bị bỏ lượt; cả hai cùng hết nước thì ai nhiều quân hơn thắng.",
      "seats": {
        "min": 2,
        "max": 2
      },
      "capacity": {
        "min": 2,
        "max": 16,
        "default": 8
      },
      "hue": "coral"
    },
    {
      "slug": "co-cho",
      "name": "Cờ Chó",
      "emoji": "🐕",
      "status": "LIVE",
      "category": "folk",
      "tagline": "Hai nắp chai mỗi bên — chặn hết đường là thắng",
      "description": "Cờ chó (cờ chặn) dân gian cho 2 người: bàn hình vuông kẻ hai đường chéo, cạnh bên trái có chó canh nên không đi được. Mỗi bên hai nắp chai, tâm để trống; lần lượt đi một quân theo đường kẻ sang điểm trống kề nó. Tới lượt mà không còn quân nào đi được là thua — thế cờ lặp lại 3 lần thì hoà.",
      "seats": {
        "min": 2,
        "max": 2
      },
      "capacity": {
        "min": 2,
        "max": 16,
        "default": 8
      },
      "hue": "sun"
    },
    {
      "slug": "system-design",
      "name": "Thiết Kế Hệ Thống",
      "emoji": "🏗️",
      "status": "LIVE",
      "category": "brain",
      "tagline": "Cùng một đề — hệ thống của ai chịu tải giỏi nhất?",
      "description": "Cả phòng nhận cùng một đề thiết kế hệ thống: luồng nghiệp vụ, traffic mục tiêu, budget và sự cố. Mỗi người tự đặt và nối Load Balancer, API Gateway, App Server, Cache, Database, Read Replica, Queue, Worker, CDN… rồi chốt. Khi mọi người đã chốt, load test giả lập tăng tải tới khi từng hệ thống gục — thiết kế đạt mục tiêu trong budget, chịu TPS cao nhất (bằng nhau thì rẻ hơn) thắng.",
      "seats": {
        "min": 1,
        "max": 0
      },
      "capacity": {
        "min": 0,
        "max": 0,
        "default": 0
      },
      "hue": "sky"
    },
    {
      "slug": "citta-challenge",
      "name": "Tâm Đấu",
      "emoji": "🪷",
      "status": "LIVE",
      "category": "chill",
      "tagline": "Mở thẻ dữ kiện, nhận diện tâm — chỉ kết luận theo những gì đã thấy",
      "description": "Trò chơi kiến thức Vi Diệu Pháp cho 1–4 người, 6 vòng mỗi ván với 300 đề ở ba mode Nhập môn, Ứng dụng, Chuyên sâu. Cả bàn đọc chung một tình huống, luân phiên mở 2 trong 4 thẻ dữ kiện, rồi ai nấy nhận diện trạng thái tâm kèm căn cứ và kiểm tra một nhận định. Chấm theo đúng thông tin đã mở — “Chưa đủ dữ kiện” cũng là đáp án — tối đa 5 điểm mỗi vòng, có bảng kiến thức tra cứu bất cứ lúc nào.",
      "seats": {
        "min": 1,
        "max": 4
      },
      "capacity": {
        "min": 0,
        "max": 0,
        "default": 0
      },
      "hue": "sun"
    },
    {
      "slug": "typing-race",
      "name": "Anh Hùng Bàn Phím",
      "emoji": "🏎️",
      "status": "LIVE",
      "category": "chill",
      "tagline": "Gõ càng nhanh, xe càng bốc — khả năng gõ chính là động cơ",
      "description": "Đua xe bằng bàn phím cho 1–20 người: cả phòng nhận cùng một đoạn văn bản, gõ đúng thì xe tiến, gõ sai phải xoá lỗi rồi gõ lại. Đua theo số ký tự (ai gõ xong trước thắng) hoặc theo thời gian (hết giờ ai đi xa nhất thắng); văn bản tiếng Việt hoặc tiếng Anh ở ba mức Dễ, Trung bình, Khó, hay để chủ phòng tự nhập. Hỗ trợ bộ gõ Telex / VNI, tính WPM và độ chính xác.",
      "seats": {
        "min": 1,
        "max": 20
      },
      "capacity": {
        "min": 0,
        "max": 0,
        "default": 0
      },
      "hue": "coral"
    },
    {
      "slug": "vua-tieng-viet",
      "name": "Vua Tiếng Việt",
      "emoji": "👑",
      "status": "LIVE",
      "category": "brain",
      "tagline": "Năm vòng đố chữ — ai giỏi tiếng Việt nhất sẽ lên ngôi",
      "description": "Đố vui tiếng Việt cho 1–12 người qua năm vòng: Ghép từ (xếp chữ cái xáo trộn thành từ có nghĩa), Phản xạ (trắc nghiệm chính tả, từ vựng, thành ngữ, văn học), Giải nghĩa (đoán từ qua gợi ý mở dần), Xâu chuỗi (sắp thẻ thành câu tục ngữ, ca dao) và Soán ngôi (giải mã câu dài hoặc săn từ trong lưới 4×4). Cả phòng nhận cùng câu hỏi, cùng lúc — đúng và nhanh thì nhiều điểm, tổng điểm cao nhất lên ngôi Vua Tiếng Việt. Chơi một mình để luyện tập cũng được.",
      "seats": {
        "min": 1,
        "max": 12
      },
      "capacity": {
        "min": 0,
        "max": 0,
        "default": 0
      },
      "hue": "sun"
    }
  ]
};
