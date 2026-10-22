// Viết theo luật đang chạy trong code (`lib/games/*.ts`) — sửa luật thì sửa cả ở đây.

export type RuleSection = { emoji: string; title: string; items: string[] };
export type GameRules = {
  intro: string;
  sections: RuleSection[];
};

export const RULES: Record<string, GameRules> = {
  "system-design": {
    intro:
      "Cả phòng nhận cùng một đề, mỗi người tự đặt và nối các component có sẵn thành hệ thống của mình rồi chốt. Khi mọi người đã chốt, load test giả lập tăng tải tới khi từng thiết kế gục: thiết kế vượt quality gate, chịu TPS cao nhất thì thắng.",
    sections: [
      {
        emoji: "📋",
        title: "Đề bài",
        items: [
          "Chủ phòng soạn đề trước mỗi ván (hoặc bấm tự sinh): tiêu đề, mô tả, thời gian thiết kế (2 phút, 5 phút hoặc không giới hạn), component được dùng, các luồng nghiệp vụ, sự cố, traffic mục tiêu và budget tối đa.",
          "Mỗi luồng nghiệp vụ có loại request, tỷ lệ trong tổng traffic (cộng lại đúng 100%) và điều kiện hoàn thành — có thể bắt buộc đi qua API Gateway, CDN hoặc Cache.",
          "Mọi người nhận cùng đề, cùng bảng thông số component và cùng kịch bản giả lập; đề giữ nguyên suốt ván.",
          "Ván mở đầu bằng bước đọc đề: màn hình chỉ có đề, ai cũng phải bấm “Xác nhận đã đọc kỹ đề”. Đủ mọi người thì sau 3 giây chuẩn bị bàn thiết kế mới mở và đồng hồ thiết kế mới bắt đầu chạy.",
          "Người xem thấy đề và trạng thái từng người chơi; thiết kế chỉ lộ khi chạy tải — người xem được xem ngẫu nhiên một thiết kế, rồi kết quả của tất cả.",
        ],
      },
      {
        emoji: "🧰",
        title: "Component",
        items: [
          "11 loại: Load Balancer, API Gateway, Application Server, Cache, Database, Read Replica, Message Queue, Worker, Object Storage, CDN, External Service — mỗi loại 3 variant khác nhau về TPS, giá và thuộc tính riêng (tỷ lệ cache hit, sức chứa hàng chờ).",
          "Đặt bao nhiêu bản cũng được, trộn variant thoải mái, đổi variant trước khi chốt. Tổng chi phí là tổng giá mọi bản đã đặt, kể cả cái không nối hay không nhận traffic.",
          "Users chỉ có một cửa vào cho request (LB, Gateway hoặc App) và một cho tệp tĩnh (CDN hoặc Object Storage) — muốn nhiều App thì phải chia qua LB / Gateway.",
        ],
      },
      {
        emoji: "🔀",
        title: "Request đi thế nào",
        items: [
          "Load Balancer chia đều mọi request cho các nhánh còn sống, không nhìn loại request — nhánh nào sau LB cũng phải xử lý được mọi loại đi qua nó.",
          "API Gateway định tuyến theo loại: mỗi loại request chỉ gửi tới nhánh xử lý được loại đó, chia đều giữa các nhánh hợp lệ.",
          "App Server: đọc thì ưu tiên Cache, rồi Read Replica, rồi Database; ghi vào Database; xử lý nền đẩy vào Queue; tải tệp lên vào Object Storage; gọi ngoài tới External Service. Nhiều đích cùng loại thì chia đều.",
          "Cache / CDN trả ngay phần hit; phần miss phải có đường tới Read Replica / Database (Cache) hoặc Object Storage (CDN).",
          "Read Replica chỉ xử lý đọc, phải được nối nhân bản từ Database chính và chịu thêm một lượt tải cho mỗi thao tác ghi vào Database đó.",
          "Queue nhận tác vụ, Worker lấy ra xử lý theo sức mình; tác vụ cần ghi tiếp thì Worker phải nối tới đích. Đích gián đoạn thì Worker tạm dừng, tác vụ chờ trong hàng.",
        ],
      },
      {
        emoji: "⛔",
        title: "Thiết kế hợp lệ",
        items: [
          "Mọi luồng phải có đường xử lý hoàn chỉnh qua đủ vai trò bắt buộc tới điểm hoàn thành; không có nhánh làm mất request, không có vòng lặp.",
          "Trong lúc thiết kế, trò chơi chỉ kiểm tra đường đi (✔️ / ❌ từng luồng) — không được chạy thử tải trước khi chốt.",
          "Thiết kế không hợp lệ không được xét chiến thắng.",
        ],
      },
      {
        emoji: "🔒",
        title: "Chốt thiết kế",
        items: [
          "Chốt bất cứ lúc nào; đã chốt thì không sửa hay mở lại được.",
          "Hết giờ, thiết kế đang có của người chưa chốt được tự chốt. Phòng không giới hạn thời gian thì chờ tới khi mọi người còn trong ván đều chốt.",
          "Mất kết nối giữa ván (quá 20 giây) là bị loại; người còn lại chơi tiếp.",
        ],
      },
      {
        emoji: "📈",
        title: "Load test giả lập",
        items: [
          "Traffic tăng từ 0, mỗi mức thêm 1/20 traffic mục tiêu (mức 20 đúng bằng mục tiêu) và tiếp tục tăng cho tới khi thiết kế thất bại (tối đa 5 lần mục tiêu).",
          "Mỗi mức đánh giá 10 giây, traffic chia theo tỷ lệ các luồng; sau đó ngừng nhận request và Queue có 5 giây để xử lý hết tác vụ.",
          "Thất bại khi một component phải xử lý vượt giới hạn TPS hiện tại, một luồng mất đường xử lý, Queue vượt sức chứa hoặc còn tồn tác vụ sau 5 giây hoàn tất. Một component quá tải là đủ dừng.",
          "TPS tối đa là mức tải cao nhất đã qua trọn vẹn; gục ngay mức đầu thì bằng 0.",
        ],
      },
      {
        emoji: "⚡",
        title: "Sự cố",
        items: [
          "Chủ phòng chọn không có hoặc một vài sự cố: App Server sập, Database giảm 40% TPS, đứt đường vào App, Cache bị xoá, Cache hit giảm, traffic lệch nhánh, tăng gấp đôi tỷ lệ ghi, Worker sập, External Service gián đoạn.",
          "Ở mọi mức tải, các sự cố đã chọn cùng xảy ra từ giây 4 tới giây 7. Đối tượng bị nhắm là component / đường nối nhận nhiều traffic nhất lúc yên ổn (bằng nhau thì cái đặt sớm hơn).",
          "Component sập không tự khiến bạn thua nếu hệ thống vẫn gánh được tải bằng các đường còn lại.",
        ],
      },
      {
        emoji: "🏆",
        title: "Quality gate & xếp hạng",
        items: [
          "Đạt khi cùng lúc: TPS tối đa ≥ traffic mục tiêu và tổng chi phí ≤ budget tối đa.",
          "Trong các thiết kế đạt: TPS cao hơn đứng trên; bằng TPS thì chi phí thấp hơn đứng trên; bằng cả hai thì đồng hạng. Ai đứng đầu thắng — không ai đạt thì ván không có người thắng.",
          "Mọi người chốt xong thì cả phòng cùng xem load test chạy trên sơ đồ: tải từng component tăng theo mức, traffic chạy trên đường nối, sự cố hiện bóng bay lên, component quá tải phát nổ — chạy xong mới công bố người thắng.",
          "Sau đó xem lại bảng kết quả, mức tải và nguyên nhân gục của từng thiết kế, cùng một thiết kế tham khảo do máy dựng.",
        ],
      },
    ],
  },
  kawaii: {
    intro: "Nối thú kiểu Pikachu cho bao nhiêu người cũng được, một mình cũng chơi được: nối hai ô cùng hình để dọn bàn — cả phòng tranh nhau trên một bàn chung, hoặc mỗi người một bàn thi xem ai dọn sạch trước.",
    sections: [
      {
        emoji: "🧩",
        title: "Bàn chơi",
        items: [
          "Chủ phòng chọn bàn Nhỏ 8×6, Vừa 12×8 hoặc Lớn 16×9 — mỗi loại thú có đúng 4 ô. Đổi được trong phòng trước mỗi ván.",
          "Chủ phòng chọn chế độ 🤝 Cùng giải đề hoặc ⚡ Đối kháng — cũng đổi được trong phòng trước mỗi ván.",
          "Mỗi ván xếp bàn mới. Ván bắt đầu sau 3 giây đếm ngược để mọi người cùng lúc thấy bàn.",
        ],
      },
      {
        emoji: "🔗",
        title: "Cách nối",
        items: [
          "Bấm hai ô cùng hình. Nối được khi có đường gồm tối đa 3 đoạn thẳng ngang / dọc (gấp khúc tối đa 2 lần) chỉ đi qua ô trống.",
          "Đường nối được đi vòng ra ngoài viền bàn, như có thêm một vòng ô trống bao quanh.",
          "Nối được thì hai ô biến mất. Không nối được thì chẳng sao, chọn lại cặp khác — không bị trừ điểm.",
          "Bàn không còn cặp nào nối được thì tự xáo lại các ô còn lại.",
        ],
      },
      {
        emoji: "🤝",
        title: "Chế độ Cùng giải đề",
        items: [
          "Cả phòng chơi chung một bàn. Ai nối được một cặp trước người khác được 10 điểm; hai người cùng bấm một cặp thì người được chủ phòng ghi nhận trước có điểm.",
          "💡 Gợi ý chỉ ra một cặp nối được, đổi lại bị trừ 5 điểm.",
          "Không tính giờ: dọn sạch bàn là hết ván, ai nhiều điểm nhất thắng — bằng điểm thì đồng hạng.",
        ],
      },
      {
        emoji: "⚡",
        title: "Chế độ Đối kháng",
        items: [
          "Mỗi người một bàn giống hệt nhau và tự dọn bàn của mình — không ai nối mất cặp của bạn.",
          "Ai dọn sạch bàn trước thì thắng; những người còn lại dọn tiếp để xếp hạng theo thời gian xong.",
          "💡 Gợi ý chỉ ra một cặp nối được, đổi lại bị khoá tay 5 giây.",
          "Người xem, và người đã dọn xong, bấm vào bảng tiến độ để xem bàn của từng người.",
        ],
      },
      {
        emoji: "🙋",
        title: "Người chơi",
        items: [
          "Không giới hạn số ghế: ai vào phòng cũng có thể bấm “Vào chơi” trước khi ván bắt đầu; vào giữa ván thì xem và chờ ván sau.",
          "Chơi một mình thì cứ dọn sạch bàn là xong ván.",
          "Chủ phòng dừng ván được bất cứ lúc nào (không tính ai thắng, trừ người đã về nhất ở chế độ đối kháng); cả đội hình mất kết nối lâu thì ván tự dừng.",
        ],
      },
    ],
  },

  "truc-xanh": {
    intro: "Trúc Xanh như trên truyền hình, cho bao nhiêu người cũng được, một mình cũng chơi được: lần lượt lật ô tìm cặp hình giống nhau để mở dần bức tranh ẩn — ai đoán trúng từ khoá của tranh là thắng.",
    sections: [
      {
        emoji: "🖼️",
        title: "Bàn chơi",
        items: [
          "Các ô đánh số úp lên một bức tranh ẩn, bốc ngẫu nhiên theo mức khó chủ phòng chọn — tranh nào phòng đã chơi thì không bốc lại.",
          "🟢 Dễ: hơn 300 tranh danh lam, món ăn, con vật, đồ vật — nhìn là nhận ra. 🔴 Khó: 100 khái niệm trừu tượng (tình yêu, lạm phát, vô cực…) — suy luận từ tranh minh hoạ; lật được nửa bàn thì mở câu gợi ý kiểu “Đây là một loại cảm xúc”. Đổi được trong phòng trước mỗi ván.",
          "Mặt dưới mỗi ô là một hình emoji, mỗi hình đúng hai ô. Chủ phòng chọn bàn Nhỏ 4×3, Vừa 5×4 (20 ô như truyền hình) hoặc Lớn 6×5.",
        ],
      },
      {
        emoji: "🔄",
        title: "Lật ô",
        items: [
          "Người chơi lần lượt theo thứ tự xáo lúc bắt đầu ván. Tới lượt thì lật hai ô bất kỳ.",
          "Hai ô cùng hình: cặp ô biến mất, lộ ra một mảng tranh — và bạn được lật tiếp.",
          "Hai ô khác hình: ô ngửa thêm chốc lát cho cả phòng ghi nhớ rồi úp lại, sang lượt người sau.",
          "Mỗi lượt có 20 giây, lật trúng thì tính lại giờ. Hết giờ hoặc vắng mặt thì mất lượt.",
        ],
      },
      {
        emoji: "🎯",
        title: "Đoán tranh",
        items: [
          "Ai trong đội hình cũng được đoán từ khoá bất cứ lúc nào, không cần tới lượt — gõ vào ô đoán dưới tranh.",
          "Không cần dấu, không phân biệt hoa thường (“thap eiffel” ≡ “Tháp Eiffel”); vài tranh có nhiều cách gọi, gọi cách nào cũng được.",
          "Đoán đúng là thắng ngay. Đoán trật thì thôi, không bị phạt — chỉ hiện cho cả phòng thấy; gần đúng thì chỉ riêng bạn được báo. Mỗi ván đoán tối đa 20 lần.",
          "Lật hết bàn mà chưa ai đoán ra thì cả phòng còn 30 giây để đoán, hết giờ thì ván kết thúc không ai thắng.",
        ],
      },
      {
        emoji: "🙋",
        title: "Người chơi",
        items: [
          "Không giới hạn số ghế: ai vào phòng cũng có thể bấm “Vào chơi” trước khi ván bắt đầu; vào giữa ván thì xem và chờ ván sau.",
          "Người xem không được đoán, cũng đừng nhắc đáp án trong khung chat.",
          "Chủ phòng dừng ván được bất cứ lúc nào (không tính ai thắng); cả đội hình mất kết nối lâu thì ván tự dừng.",
        ],
      },
    ],
  },

  minesweeper: {
    intro: "Dò mìn cổ điển cho bao nhiêu người cũng được, một mình cũng chơi được: cả phòng chung một bàn, không theo lượt — mở ô an toàn để ghi điểm, đạp mìn là bị loại.",
    sections: [
      {
        emoji: "🧩",
        title: "Bàn chơi",
        items: [
          "Chủ phòng chọn bàn Nhỏ 9×9, Vừa 16×16, Lớn 30×16 hoặc Khổng lồ 40×24, và số mìn (từ 10% tới 30% số ô). Đổi được trong phòng trước mỗi ván.",
          "Ván bắt đầu sau 3 giây đếm ngược. Lúc lộ bàn có sẵn một vùng xuất phát đã mở (không có mìn, không tính điểm cho ai) để không ai phải đoán mò nước đầu.",
          "Ô đã mở hiện số mìn trong 8 ô xung quanh; ô số 0 tự lan rộng mở luôn các ô kề như dò mìn cổ điển.",
        ],
      },
      {
        emoji: "⛏️",
        title: "Cách chơi",
        items: [
          "Không theo lượt: ai trong đội hình cũng bấm mở ô bất cứ lúc nào. Hai người cùng bấm một ô thì người được chủ phòng ghi nhận trước có điểm.",
          "🚩 Cắm cờ bằng chuột phải, hoặc chuyển sang chế độ “Cắm cờ” trên điện thoại. Cờ là của riêng bạn, người khác không thấy.",
          "Bấm vào ô số đã mở khi đã cắm đủ cờ quanh nó để mở nhanh các ô còn lại xung quanh — cắm nhầm cờ là đạp mìn đấy!",
          "Ô đã mở được tô màu người mở, cả phòng nhìn là biết ai đang dẫn.",
        ],
      },
      {
        emoji: "🏅",
        title: "Tính điểm & thắng thua",
        items: [
          "Mỗi ô an toàn bạn làm lộ ra được 1 điểm — một cú bấm vào ô số 0 lan rộng thì được cả mảng.",
          "💥 Đạp mìn là bị loại: không mở ô được nữa và không được tính thắng, dù đang nhiều điểm. Ô mìn đã nổ hiện cho cả phòng thấy.",
          "Mở hết ô an toàn thì hết ván: trong những người còn trụ, ai nhiều điểm nhất thắng (bằng điểm thì đồng hạng).",
          "Chỉ còn một người trụ lại thì người đó phải tự mở hết ô an toàn mới thắng — đạp mìn nữa thì không ai thắng. Ai cũng đạp mìn thì ván kết thúc, không ai thắng.",
        ],
      },
      {
        emoji: "🙋",
        title: "Người chơi",
        items: [
          "Không giới hạn số ghế: ai vào phòng cũng có thể bấm “Vào chơi” trước khi ván bắt đầu; vào giữa ván thì xem và chờ ván sau.",
          "Mất kết nối quá 30 giây (hoặc bị mời ra) thì bị loại như đạp mìn, để người còn lại không phải chờ.",
          "Chủ phòng dừng ván được bất cứ lúc nào (không tính ai thắng); cả đội hình mất kết nối lâu thì ván tự dừng.",
        ],
      },
    ],
  },

  caro: {
    intro: "Cờ caro kiểu Việt Nam cho 2 người: lần lượt đặt quân trên bàn ô vuông, ai xếp được 5 quân thẳng hàng trước là thắng.",
    sections: [
      {
        emoji: "🎯",
        title: "Mục tiêu",
        items: ["Xếp 5 quân của mình liên tiếp theo hàng ngang, hàng dọc hoặc đường chéo trước đối thủ."],
      },
      {
        emoji: "🕹️",
        title: "Cách chơi",
        items: [
          "Hai người ngồi vào 2 ghế, chủ phòng bấm Bắt đầu. Những người còn lại trong phòng được vào xem.",
          "X đi trước, O đi sau, mỗi lượt đặt một quân vào một ô trống bất kỳ. Quân đã đặt không di chuyển được.",
          "Người đi trước đổi luân phiên sau mỗi ván cho công bằng.",
        ],
      },
      {
        emoji: "🚧",
        title: "Luật chặn hai đầu (tuỳ chọn)",
        items: [
          "Chủ phòng chọn có áp dụng luật này lúc tạo phòng.",
          "Khi bật: chuỗi 5 quân trở lên mà bị quân đối phương chặn ở cả hai đầu thì không tính thắng. Mép bàn không tính là bị chặn.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: ["Ai xếp được chuỗi thắng trước thì thắng ván.", "Xin thua, rời bàn hoặc mất kết nối quá lâu khi đang chơi đều tính là thua."],
      },
    ],
  },

  "connect-four": {
    intro: "Thả cờ 4 cho 2 người: thả quân vào bàn 7 cột × 6 hàng, ai nối được 4 quân liên tiếp trước là thắng.",
    sections: [
      {
        emoji: "🎯",
        title: "Mục tiêu",
        items: ["Nối 4 quân cùng màu liên tiếp theo hàng ngang, hàng dọc hoặc đường chéo."],
      },
      {
        emoji: "🕹️",
        title: "Cách chơi",
        items: [
          "Đỏ đi trước, Vàng đi sau. Người đi trước đổi luân phiên sau mỗi ván.",
          "Mỗi lượt chọn một cột: quân rơi xuống ô trống thấp nhất của cột đó. Cột đã đầy thì không thả được nữa.",
          "Vừa tấn công vừa phải để ý chặn đường nối 4 của đối thủ — một nước có thể mở hai đường cùng lúc.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: ["Ai nối được 4 quân trước thì thắng.", "Thả kín cả 42 ô mà chưa ai nối được 4 thì hoà."],
      },
    ],
  },

  "reversi": {
    intro: "Cờ lật cho 2 người: đặt quân kẹp quân đối thủ để lật chúng sang màu mình — hết nước cả hai thì ai nhiều quân hơn là thắng.",
    sections: [
      {
        emoji: "🎯",
        title: "Mục tiêu",
        items: ["Kết thúc ván với nhiều quân cùng màu trên bàn hơn đối thủ."],
      },
      {
        emoji: "🕹️",
        title: "Cách chơi",
        items: [
          "Bàn 8×8, khai cuộc có sẵn 2 quân Đen và 2 quân Trắng đặt chéo nhau ở giữa.",
          "Đen đi trước, Trắng đi sau; người đi trước đổi luân phiên sau mỗi ván.",
          "Mỗi lượt đặt một quân vào ô trống sao cho giữa quân mới và một quân mình có sẵn là một dãy liền quân đối thủ (ngang, dọc hoặc chéo) — cả dãy đó bị lật sang màu mình. Một nước có thể lật nhiều hướng cùng lúc.",
          "Chỉ được đặt vào ô lật được ít nhất một quân — các ô đặt được hiện chấm gợi ý, rê chuột vào để xem những quân sẽ bị lật.",
          "Không còn ô nào đặt được thì bị bỏ lượt, đối thủ đi tiếp.",
        ],
      },
      {
        emoji: "🧠",
        title: "Mẹo",
        items: [
          "Bốn góc không bao giờ bị lật lại — giành được góc là lợi thế lớn.",
          "Tránh đặt vào ô sát góc khi góc còn trống: dễ mở đường cho đối thủ chiếm góc.",
          "Lật nhiều quân chưa chắc đã tốt — giữ ít quân mà nhiều nước đi thường mạnh hơn, đối thủ sẽ bị dồn vào thế phải đi nước xấu.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: [
          "Cả hai cùng hết nước (thường là kín bàn) thì ván kết thúc: ai nhiều quân hơn thắng, bằng nhau là hoà.",
          "Xin thua, rời bàn hoặc mất kết nối quá lâu khi đang chơi đều tính là thua.",
        ],
      },
    ],
  },

  "co-cho": {
    intro: "Trò dân gian cho 2 người: mỗi bên hai nắp chai trên bàn vuông kẻ chéo, lần lượt đi sang điểm trống — ai bị chặn hết đường là thua.",
    sections: [
      {
        emoji: "🎯",
        title: "Mục tiêu",
        items: ["Dồn đối thủ vào thế tới lượt mà không còn quân nào đi được."],
      },
      {
        emoji: "🕹️",
        title: "Cách chơi",
        items: [
          "Bàn là hình vuông kẻ hai đường chéo: năm điểm gồm bốn góc và tâm. Cạnh bên trái có chó canh — không được đi theo cạnh đó.",
          "Mỗi bên hai quân (nắp chai Đỏ và Xanh), tâm để trống. Chủ phòng chọn cách xếp: hai cạnh (mỗi bên giữ hai góc cùng một cạnh) hoặc chéo nhau (mỗi bên giữ một đường chéo).",
          "Đỏ đi trước, Xanh đi sau; người đi trước đổi luân phiên sau mỗi ván.",
          "Mỗi lượt đi một quân của mình theo đường kẻ sang điểm trống ngay cạnh. Bàn chỉ có đúng một điểm trống nên chỉ cần bấm quân muốn đi — quân đi được sẽ sáng lên.",
        ],
      },
      {
        emoji: "🧠",
        title: "Mẹo",
        items: [
          "Tâm nối với cả bốn góc — quân đứng ở tâm luôn có đường đi; rời tâm là mở đường cho đối thủ.",
          "Hai góc sát chó chỉ nối được hai điểm: cẩn thận để cả hai quân mắc kẹt ở đó.",
          "Trước khi đi, nhìn xem điểm mình vừa bỏ trống sẽ kề những quân nào — nếu chỉ toàn quân đối thủ thì có thể bị chặn ngay nước sau.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: [
          "Tới lượt mà không quân nào đi được thì thua.",
          "Bàn nhỏ nên hay đi vòng vòng: cùng một thế cờ (vị trí quân và người tới lượt) lặp lại lần thứ ba thì hoà.",
          "Xin thua, rời bàn hoặc mất kết nối quá lâu khi đang chơi đều tính là thua.",
        ],
      },
    ],
  },

  "co-chep": {
    intro: "Trò dân gian cho 1–5 người: chọi đá chinh phục từng ô, lên Trời rồi chọi qua lưng để chiếm nhà. Ai có nhiều nhà nhất là thắng.",
    sections: [
      {
        emoji: "🗺️",
        title: "Sân chơi",
        items: [
          "Đất: chỗ đứng chọi đá.",
          "Ô 1 → 8: ô đơn (1, 2, 3, 6) nhảy cò một chân; ô đôi (4–5, 7–8) nhảy chẹp hai chân.",
          "Trời: nửa vòng tròn phía trên ô 7–8, không có vạch bao.",
          "Nhà: ô bạn đã chiếm được, tô màu và in hình đại diện của bạn.",
        ],
      },
      {
        emoji: "🎯",
        title: "Cách chọi đá",
        items: [
          "Tới lượt, kéo viên đá ngược về sau như kéo ná rồi buông: kéo càng dài đá bay càng xa, kéo lệch bên này thì đá bay lệch bên kia.",
          "Đá phải nằm gọn trong ô mới tính. Chạm vạch, ra ngoài hay sai ô đều mất lượt.",
        ],
      },
      {
        emoji: "🦩",
        title: "Giai đoạn 1: chinh phục ô 1 → 8",
        items: [
          "Chọi đá vào ô mục tiêu, bắt đầu từ ô 1.",
          "Trúng thì máy tự nhảy giúp bạn: nhảy từ Đất lên tới ô 7–8, quay đầu, nhặt đá ở ô ngay trước ô có đá rồi nhảy về Đất. Khi nhảy, bỏ qua ô có đá và nhà người khác; nhà mình thì được nhảy vào.",
          "Nhảy xong thì chọi tiếp ô kế tiếp, cứ thế tới ô 8. Ô đã thành nhà thì bỏ qua.",
        ],
      },
      {
        emoji: "☁️",
        title: "Giai đoạn 2: chinh phục Trời",
        items: [
          "Xong ô 8 thì chọi đá lên Trời.",
          "Trúng thì nhảy tới ô 7–8, rồi nhảy chẹp quanh viên đá đủ bốn hướng: trên, phải, dưới, trái.",
          "Cuối cùng chọi đá qua lưng, không được nhìn: màn hình quay ra bầu trời, kéo lên trên để lấy đà rồi buông.",
        ],
      },
      {
        emoji: "🏠",
        title: "Kết quả cú chọi qua lưng",
        items: [
          "Rơi gọn vào ô trống hoàn toàn: chiếm ô đó làm nhà, được chơi tiếp và bắt đầu lại hành trình từ ô 1.",
          "Rơi vào nhà người khác, ô có đá người khác, chạm vạch hoặc ra ngoài: mất lượt, lượt sau chọi lên Trời lại.",
          "Rơi vào nhà của chính mình: cháy nhà! Mất nhà và mất lượt.",
        ],
      },
      {
        emoji: "🔥",
        title: "Nhà và cháy nhà",
        items: [
          "Nhà đã có chủ thì người khác không chiếm được. Người khác chọi trúng nhà bạn thì nhà vẫn là của bạn.",
          "Tự chọi trúng nhà mình thì cháy nhà, dù chọi từ Đất hay qua lưng.",
        ],
      },
      {
        emoji: "⏸️",
        title: "Mất lượt nhưng giữ tiến độ",
        items: [
          "Phạm lỗi thì mất lượt, chuyển sang người kế tiếp.",
          "Tiến độ không bị xoá: đá đang nằm đâu vẫn nằm đó, lượt sau chơi tiếp từ chỗ đang dở.",
          "Khi nhảy có thể bị ngã (mất thăng bằng); phải nhảy vượt từ 2 hàng liền bị chặn trở lên thì càng dễ ngã.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: [
          "Ván kết thúc khi chủ phòng bấm Chốt ván, hoặc khi cả 8 ô đều đã thành nhà.",
          "Ai nhiều nhà nhất thắng; bằng nhà thì cùng thắng.",
          "Mỗi lượt có 60 giây; quá giờ hoặc mất kết nối thì bị qua lượt. Bỏ cuộc hoặc mất kết nối quá lâu thì rời cuộc, nhà để lại không được tính.",
        ],
      },
    ],
  },

  "mine-control": {
    intro: "Dò mìn đối kháng cho 2–4 người: mở ô từ căn cứ để chiếm đất, dùng năng lượng cho kỹ năng, né mìn — trụ lại cuối cùng hoặc nhiều điểm nhất là thắng.",
    sections: [
      {
        emoji: "🗺️",
        title: "Bản đồ",
        items: [
          "Chủ phòng chọn bản đồ Nhỏ 10×6, Vừa 15×9 hoặc Lớn 20×12, và 10, 15 hoặc 20 quả mìn rải ngẫu nhiên. Bản đồ nhỏ mà đông người thì số mìn tự hạ xuống (không quá nửa số ô ngoài căn cứ).",
          "Mỗi người có một căn cứ 🏠 ở một góc; vùng 3×3 quanh căn cứ chắc chắn không có mìn.",
          "Mỗi người bắt đầu với 3 mạng ❤️ và 2 năng lượng ⚡ (tối đa 4). Người đi trước xoay vòng sau mỗi ván.",
        ],
      },
      {
        emoji: "⛏️",
        title: "Mở ô",
        items: [
          "Mỗi lượt làm đúng một việc: mở một ô hoặc dùng một kỹ năng. Làm xong (hợp lệ) thì hồi 1 năng lượng.",
          "Chỉ mở được ô đang ẩn nằm sát lãnh thổ của mình theo hàng ngang hoặc dọc (ô chéo không tính). Căn cứ cũng là lãnh thổ.",
          "Ô an toàn hiện số mìn trong 8 ô xung quanh và thuộc về mình: +1 điểm, số 3–5 thưởng thêm 1, số 6–8 thưởng thêm 2.",
          "Mở trúng ô số 0 thì vùng an toàn quanh đó tự mở ra — các ô tự mở là ô trung lập (không của ai, không tính điểm).",
          "Ô của người khác và mìn đã lộ thì không mở, không chiếm được.",
        ],
      },
      {
        emoji: "💥",
        title: "Giẫm mìn",
        items: [
          "Mất 1 mạng, bị trừ 2 điểm (điểm không xuống dưới 0), mìn lộ ra vĩnh viễn và hết lượt.",
          "Có Khiên thì Khiên vỡ thay cho 1 mạng — vẫn bị trừ 2 điểm.",
          "Hết mạng là bị loại; điểm, lãnh thổ và Pháo đài vẫn giữ để xếp hạng.",
        ],
      },
      {
        emoji: "✨",
        title: "Kỹ năng",
        items: [
          "📡 Radar (2⚡): chọn một ô ẩn, biết tổng số mìn trong vùng 3×3 quanh nó (kể cả chính ô đó). Không mở ô, không chỉ chỗ mìn.",
          "🛡️ Khiên (2⚡): đỡ cho lần giẫm mìn tiếp theo không mất mạng. Mỗi lúc chỉ giữ một Khiên.",
          "🏰 Pháo đài (2⚡): đánh dấu một ô của mình (không phải căn cứ), tối đa 2 cái — mỗi Pháo đài thưởng 2 điểm cuối ván.",
          "🚩 Cướp Đất (3⚡): chiếm một ô trung lập đã mở, sát lãnh thổ mình và không sát lãnh thổ đối thủ nào: +1 điểm.",
          "Không muốn làm gì thì bỏ lượt (không hồi năng lượng). Ai tới lượt mà không còn việc gì làm được thì tự động bỏ qua.",
        ],
      },
      {
        emoji: "🏁",
        title: "Kết thúc ván",
        items: [
          "Mở hết mọi ô an toàn (không cần mở mìn).",
          "Chỉ còn một người chưa bị loại — người đó thắng ngay.",
          "Bế tắc: không còn ai mở ô hay Cướp Đất được nữa (Radar, Khiên không giữ ván lại), hoặc mọi người cùng bỏ lượt liên tiếp 2 vòng.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: [
          "Hết ván vì mở hết ô hoặc bế tắc: cộng thưởng cuối ván (+2 mỗi Pháo đài, +1 mỗi mạng còn lại), ai nhiều điểm nhất thắng — kể cả người đã bị loại.",
          "Bằng điểm thì xét lần lượt: nhiều ô sở hữu hơn, nhiều mạng hơn, nhiều Pháo đài hơn. Vẫn bằng thì hoà.",
          "Mỗi lượt có 45 giây; quá giờ hoặc mất kết nối khi tới lượt thì bị cho qua lượt. Bỏ cuộc hay mất kết nối quá lâu thì bị loại.",
        ],
      },
    ],
  },

  "dots-boxes": {
    intro: "Chấm nối ô cho 2 người: lần lượt kẻ cạnh nối các chấm, ai khép kín ô vuông thì chiếm ô đó — nhiều ô hơn là thắng.",
    sections: [
      {
        emoji: "🎯",
        title: "Mục tiêu",
        items: ["Chiếm được nhiều ô vuông hơn đối thủ."],
      },
      {
        emoji: "🕹️",
        title: "Cách chơi",
        items: [
          "Bàn là lưới chấm 3×3, 5×5 hoặc 7×7 ô — chủ phòng chọn lúc tạo phòng và đổi được trước mỗi ván.",
          "Chủ phòng chọn thời gian tối đa mỗi lượt: 15 giây, 30 giây, 1 phút hoặc không giới hạn. Hết giờ mà chưa kẻ thì mất lượt — kể cả lượt được đi tiếp sau khi khép ô.",
          "Đỏ đi trước, Xanh đi sau; người đi trước đổi luân phiên sau mỗi ván.",
          "Mỗi lượt kẻ một cạnh nối hai chấm kề nhau theo hàng ngang hoặc dọc, vào chỗ chưa ai kẻ.",
          "Kẻ cạnh thứ tư khép kín một ô (hoặc hai ô cùng lúc) thì ô đó mang màu của bạn và bạn được kẻ thêm một cạnh nữa — cứ khép được ô là đi tiếp.",
        ],
      },
      {
        emoji: "🧠",
        title: "Mẹo",
        items: [
          "Tránh kẻ cạnh thứ ba của một ô: đối thủ chỉ việc kẻ cạnh thứ tư để ăn.",
          "Cuối ván các ô thường nối thành chuỗi dài — đôi khi nhường đối thủ 2 ô để giành cả chuỗi lớn phía sau mới là nước cao tay.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: [
          "Hết ô thì ai nhiều ô hơn thắng; bằng nhau là hoà (bàn lẻ ô như 3×3, 5×5, 7×7 thì không bao giờ hoà).",
          "Một bên đã chiếm quá nửa số ô thì ván kết thúc sớm — đối thủ không thể đuổi kịp.",
          "Xin thua, rời bàn hoặc mất kết nối quá lâu khi đang chơi đều tính là thua.",
        ],
      },
    ],
  },

  "oanquan": {
    intro: "Ô ăn quan cho 2 người: bốc quân rải quanh bàn, cách một ô trống là ăn — hết quan thì thu quân, ai nhiều điểm hơn là thắng.",
    sections: [
      {
        emoji: "🪨",
        title: "Bàn chơi",
        items: [
          "Mỗi bên 5 ô dân, mỗi ô 5 quân dân. Hai đầu bàn là hai ô quan, mỗi ô một quân quan.",
          "Dân 1 điểm, quan 10 điểm — cả bàn 70 điểm. Dãy ô dân của bạn luôn nằm phía dưới bàn.",
        ],
      },
      {
        emoji: "🕹️",
        title: "Cách rải",
        items: [
          "Tới lượt, chọn một ô dân bên mình còn quân rồi chọn chiều ◀ ▶: bốc hết quân trong ô, rải lần lượt mỗi ô một quân (rải cả vào ô quan).",
          "Rải hết mà ô kế tiếp là ô dân có quân: bốc ô đó lên rải tiếp theo cùng chiều.",
          "Ô kế tiếp là ô quan còn quân, hoặc hai ô liền nhau đều trống: mất lượt.",
        ],
      },
      {
        emoji: "🍽️",
        title: "Ăn quân",
        items: [
          "Rải hết mà ô kế tiếp trống: ăn cả ô ngay sau nó (dân lẫn quan).",
          "Ăn xong, nếu lại một ô trống rồi một ô có quân thì ăn tiếp — cứ thế ăn liền mạch.",
          "Quan non (tuỳ chọn): ô quan còn quân quan mà dưới 5 dân thì chưa được ăn — rải tới đó là mất lượt.",
        ],
      },
      {
        emoji: "🔄",
        title: "Hết dân",
        items: [
          "Tới lượt mà 5 ô bên mình đều trống: lấy 5 quân trong kho rải lại mỗi ô một quân. Kho không đủ thì vay — điểm bị trừ âm.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: [
          "Cả hai ô quan đều hết quân là hết ván: dân còn lại trên dãy bên nào thì về bên đó.",
          "Ai nhiều điểm hơn thì thắng, bằng điểm là hoà. Xin thua, rời bàn hoặc mất kết nối quá lâu khi đang chơi đều tính là thua.",
        ],
      },
    ],
  },

  battleship: {
    intro: "Bắn tàu cho 2 người: giấu hạm đội của mình trên hải đồ, rồi thay phiên gọi toạ độ để săn tàu đối phương.",
    sections: [
      {
        emoji: "🚢",
        title: "Bày hạm đội",
        items: [
          "Mỗi người bí mật đặt 5 tàu trên hải đồ 10×10: Tàu sân bay (5 ô), Thiết giáp hạm (4), Tuần dương hạm (3), Tàu ngầm (3), Khu trục hạm (2).",
          "Tàu nằm ngang hoặc dọc, không chồng lên nhau, không tràn ra ngoài hải đồ. Có thể bấm bày ngẫu nhiên cho nhanh.",
        ],
      },
      {
        emoji: "🎯",
        title: "Cách chơi",
        items: [
          "Hai bên thay phiên chọn một ô (vd. C7) trên hải đồ đối phương để bắn.",
          "Kết quả được báo ngay: trượt 💧, trúng 💥, hoặc chìm tàu — khi chìm thì lộ luôn vị trí con tàu đó.",
          "Nếu chủ phòng bật “Trúng bắn tiếp”: bắn trúng được bắn thêm phát nữa; tắt thì mỗi phát lại đổi lượt.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: ["Ai đánh chìm toàn bộ 5 tàu của đối phương trước thì thắng."],
      },
      {
        emoji: "🔒",
        title: "Chống gian lận",
        items: [
          "Đầu ván sơ đồ của mỗi bên được niêm phong bằng mã băm. Hết ván hai bên công bố sơ đồ thật để mọi người đối chiếu từng câu trả lời trúng / trượt.",
        ],
      },
    ],
  },

  "draw-guess": {
    intro: "Vẽ Đoán cho 2–8 người: lần lượt từng người vẽ một từ bí mật, cả phòng thi nhau đoán xem đó là gì.",
    sections: [
      {
        emoji: "✏️",
        title: "Lượt vẽ",
        items: [
          "Mỗi vòng ai cũng được vẽ một lượt, thứ tự vẽ được xáo ngẫu nhiên lúc bắt đầu.",
          "Tới lượt, người vẽ chọn 1 trong 3 từ: Dễ 🟢, Vừa 🟡 hoặc Khó 🔴 (15 giây, hết giờ máy bốc giúp).",
          "Vẽ để mọi người đoán ra — không được viết chữ, không được nói đáp án trong chat.",
        ],
      },
      {
        emoji: "💬",
        title: "Đoán từ",
        items: [
          "Những người còn lại gõ đáp án vào ô đoán. Không cần dấu, không phân biệt hoa thường, được bỏ loại từ đứng đầu (“meo” ≡ “Con mèo”).",
          "Đoán gần đúng thì chỉ riêng bạn được báo “gần đúng rồi”; đoán sai thì hiện cho cả phòng thấy.",
          "Nếu bật gợi ý, chữ cái của đáp án sẽ mở dần khi gần hết giờ.",
        ],
      },
      {
        emoji: "⭐",
        title: "Tính điểm",
        items: [
          "Người đoán đúng được 60–300 điểm — đoán càng sớm càng nhiều điểm.",
          "Người vẽ được 50 điểm cho mỗi người đoán ra.",
          "Lượt kết thúc khi hết giờ hoặc cả phòng đã đoán đúng, rồi lộ đáp án.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: ["Sau số vòng chủ phòng chọn (1–4 vòng), ai nhiều điểm nhất thắng."],
      },
    ],
  },

  loto: {
    intro: "Lô tô ngày Tết cho cả phòng: chọn tờ, nghe kêu số và dò số — đủ năm số một hàng là Kinh!",
    sections: [
      {
        emoji: "🧧",
        title: "Chọn tờ",
        items: [
          "Bộ 10 màu, mỗi màu 2 tờ — hai tờ cùng màu bù trừ nhau, gộp lại đủ 90 số.",
          "Mỗi tờ 9 hàng × 9 cột, mỗi hàng đúng 5 số. Cột đầu là số 1–9, cột kế 10–19… cột cuối 80–90.",
          "Mỗi người chọn 1–2 tờ còn trống rồi bấm Sẵn sàng. Hết tờ thì chỉ vào xem được.",
        ],
      },
      {
        emoji: "📣",
        title: "Kêu số",
        items: [
          "Chủ phòng bấm Bắt đầu khi mọi người đã sẵn sàng. Máy tự kêu ngẫu nhiên các số từ 1 đến 90, mỗi số một lần, theo nhịp chủ phòng chọn (Nhanh / Vừa / Thong thả).",
          "Số được kêu trên tờ của bạn tự đánh dấu — cứ việc hồi hộp theo dõi.",
          "Một hàng có 4/5 số là đang đợi: cả phòng nghe rao “Hò!”, “Hẹn!”, “Đợi!”.",
        ],
      },
      {
        emoji: "🏆",
        title: "Kinh!",
        items: [
          "Ai có một hàng đủ 5 số trước thì Kinh và thắng ván.",
          "Hai người trở lên cùng kinh ở một số là kinh trùng — tất cả cùng thắng.",
        ],
      },
    ],
  },

  sudoku: {
    intro: "Sudoku tranh đấu: cả phòng nhận cùng một đề 9×9 — thi xem ai nhanh tay, nhanh trí hơn.",
    sections: [
      {
        emoji: "🔢",
        title: "Luật Sudoku",
        items: [
          "Điền số 1–9 vào các ô trống sao cho mỗi hàng, mỗi cột và mỗi khối 3×3 đều có đủ 1–9, không số nào lặp lại.",
          "Đề có 3 mức Dễ 🌱, Vừa 🌿, Khó 🔥 và luôn giải được bằng suy luận, không phải đoán.",
          "Dùng ghi chú bút chì (phím N) để nháp các số có thể điền — ghi chú chỉ lưu trên máy bạn.",
        ],
      },
      {
        emoji: "🤝",
        title: "Chế độ Cùng giải đề",
        items: [
          "Mọi người điền chung một bàn. Ai điền đúng một ô trước người khác thì ô đó là của người đó: +1 điểm.",
          "Điền sai bị trừ 1 điểm. Hết ô trống thì người nhiều điểm nhất thắng.",
        ],
      },
      {
        emoji: "⚡",
        title: "Chế độ Đối kháng",
        items: [
          "Mỗi người tự giải bàn của mình. Ai điền đúng hết trước thì thắng, người còn lại giải tiếp để xếp hạng.",
          "Ô người khác đã giải được tô màu người giải nhanh nhất. Điền sai bị khoá tay 5 giây.",
        ],
      },
    ],
  },

  undercover: {
    intro: "Truy tìm Gián Điệp cho 3–20 người: ai cũng nhận một từ khoá — nhưng có kẻ nhận từ khác. Mô tả, nghi ngờ và loại cho đúng người!",
    sections: [
      {
        emoji: "🃏",
        title: "Các phe",
        items: [
          "🙂 Phe Dân (số đông): nhận từ khoá chung. Tìm và loại hết Gián Điệp cùng phe Trắng.",
          "🕵️ Phe Gián Điệp: nhận một từ na ná từ của phe Dân (vd. “Cà phê” – “Trà sữa”). Trà trộn để sống sót.",
          "👤 Phe Trắng (tuỳ chọn): không có từ nào. Nghe người khác mô tả để đoán chủ đề và nói sao cho khỏi lộ.",
          "Tuỳ chủ phòng, bạn có thể được báo mình thuộc phe nào — hoặc chỉ thấy từ khoá và phải tự đoán.",
        ],
      },
      {
        emoji: "🗣️",
        title: "Mỗi vòng chơi",
        items: [
          "Lật bài xem từ của mình. Lần lượt từng người theo thứ tự mô tả từ khoá bằng một câu ngắn — không được nói thẳng từ khoá.",
          "Sau đó cả phòng thảo luận tự do trong khung chat. Ai cũng có thể bấm gọi biểu quyết.",
          "Mọi người bỏ phiếu loại người đáng ngờ nhất. Hoà phiếu thì bỏ phiếu phụ giữa những người hoà.",
          "Người bị loại bị lật bài, lộ phe. Nếu là phe Trắng thì được đoán từ khoá của phe Dân — đoán đúng là phe Trắng thắng.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: [
          "Phe Dân thắng khi đã loại hết Gián Điệp và phe Trắng.",
          "Gián Điệp thắng khi số Gián Điệp còn lại đông bằng phe Dân, hoặc vẫn còn khi chỉ còn hai người — phe Trắng còn sống cũng thắng theo.",
          "Phe Trắng thắng khi bị loại mà đoán đúng từ khoá, hoặc trụ tới khi chỉ còn hai người mà không còn Gián Điệp.",
        ],
      },
    ],
  },

  werewolf: {
    intro: "Ma Sói cho 4–16 người: đêm xuống Sói đi săn, ngày lên cả làng tranh luận và bỏ phiếu treo cổ kẻ đáng ngờ.",
    sections: [
      {
        emoji: "🎭",
        title: "Nhận vai",
        items: [
          "Người tạo phòng là Quản trò: mặc định chơi cùng, hoặc chỉ xem hết vai và điều khiển ván.",
          "Máy tự chia vai bí mật. Chỉ bạn biết vai của mình — giữ kín tới hết ván!",
        ],
      },
      {
        emoji: "🌙",
        title: "Ban đêm",
        items: [
          "Quản trò gọi lần lượt từng vai thức dậy: Cupid (chỉ đêm đầu) → Bảo Vệ → Ma Sói → Tiên Tri → Phù Thủy.",
          "🐺 Ma Sói cùng bầy chọn một người để cắn.",
          "🛡️ Bảo Vệ che chở một người — Sói cắn người đó sẽ không chết.",
          "🔮 Tiên Tri soi một người để biết có phải Sói không.",
          "🧙 Phù Thủy biết ai bị cắn; có một bình cứu và một bình độc, mỗi bình dùng một lần cả ván.",
          "💘 Cupid ghép một cặp đôi: một người chết thì người kia chết theo.",
        ],
      },
      {
        emoji: "☀️",
        title: "Ban ngày",
        items: [
          "Trời sáng, quản trò công bố ai đã chết trong đêm (không nói vì sao).",
          "Cả làng thảo luận rồi bỏ phiếu treo cổ một người. Người bị treo chỉ lộ là Sói hay không phải Sói.",
          "🏹 Thợ Săn khi chết được bắn kéo theo một người.",
        ],
      },
      {
        emoji: "🌗",
        title: "Vai đặc biệt khác",
        items: [
          "😈 Minion: phe Sói, biết ai là Sói nhưng không cắn người; Tiên Tri soi thấy không phải Sói.",
          "🌗 Bán Sói: phe Dân, nhưng nếu bị Sói cắn thì hoá thành Sói từ đêm sau.",
          "👨‍🌾 Dân Làng: không có năng lực, dùng suy luận và lá phiếu của mình.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: [
          "Phe Dân thắng khi đã hết Sói.",
          "Phe Sói thắng khi số Sói đông bằng phần còn lại.",
          "Cặp đôi khác phe do Cupid ghép thắng riêng khi chỉ còn lại hai người họ.",
        ],
      },
    ],
  },

  xiangqi: {
    intro: "Cờ Tướng cho 2 người: cầm quân Đỏ hoặc Đen, dùng Xe, Pháo, Mã, Tượng, Sĩ, Tốt để chiếu bí Tướng đối phương.",
    sections: [
      {
        emoji: "♟️",
        title: "Cách đi của quân",
        items: [
          "Tướng: đi 1 ô ngang / dọc trong cung. Sĩ: đi chéo 1 ô trong cung.",
          "Tượng: đi chéo 2 ô, bị cản nếu ô giữa có quân, không qua sông.",
          "Mã: đi chữ “nhật”, bị cản nếu có quân ở ô sát bên theo hướng đi.",
          "Xe: đi thẳng bao xa cũng được. Pháo: đi như Xe, nhưng muốn ăn quân phải nhảy qua đúng một quân.",
          "Tốt: đi tiến 1 ô; qua sông rồi được đi ngang.",
          "Hai Tướng không được đối mặt trên cùng một cột trống.",
        ],
      },
      {
        emoji: "🕹️",
        title: "Diễn biến ván",
        items: [
          "Đỏ đi trước, hai người đổi bên sau mỗi ván.",
          "Biên bản nước đi ghi theo kiểu Việt Nam (vd. P2-5, M8.7).",
          "Có thể xin hoà hoặc xin thua bất cứ lúc nào.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: [
          "Chiếu bí, hoặc khiến đối phương tới lượt mà hết nước đi hợp lệ là thắng.",
          "Chiếu dai: thế cờ lặp lại lần thứ ba mà một bên chiếu liên tục suốt vòng lặp thì bên đó thua.",
          "Hoà khi lặp thế cờ (không chiếu dai), 60 nước mỗi bên không ăn quân, hai bên đều hết quân tấn công, hoặc đồng ý hoà.",
        ],
      },
    ],
  },

  chess: {
    intro: "Cờ Vua cho 2 người: cầm quân Trắng hoặc Đen, dùng Hậu, Xe, Tượng, Mã và Tốt để chiếu hết Vua đối phương.",
    sections: [
      {
        emoji: "♟️",
        title: "Cách đi của quân",
        items: [
          "Vua: đi 1 ô theo mọi hướng. Hậu: đi thẳng hoặc chéo bao xa cũng được.",
          "Xe: đi thẳng ngang / dọc. Tượng: đi chéo. Mã: đi chữ L và nhảy qua được quân khác.",
          "Tốt: tiến 1 ô (nước đầu được tiến 2 ô), ăn chéo 1 ô về phía trước.",
          "Không được đi nước để Vua mình bị chiếu.",
        ],
      },
      {
        emoji: "✨",
        title: "Nước đặc biệt",
        items: [
          "Nhập thành: Vua và Xe chưa đi lần nào, giữa hai quân trống, Vua không bị chiếu và không đi qua ô bị khống chế — Vua đi 2 ô về phía Xe, Xe nhảy sang cạnh Vua.",
          "Bắt tốt qua đường: Tốt đối phương vừa tiến 2 ô đứng ngay cạnh Tốt mình thì nước kế tiếp được ăn chéo như thể nó chỉ tiến 1 ô.",
          "Phong cấp: Tốt tới hàng cuối được chọn thành Hậu, Xe, Tượng hoặc Mã.",
        ],
      },
      {
        emoji: "🕹️",
        title: "Diễn biến ván",
        items: [
          "Trắng đi trước, hai người đổi bên sau mỗi ván; bên cầm quân Đen thấy bàn lật lại.",
          "Bấm quân rồi bấm ô đích, hoặc kéo thả quân. Biên bản ghi theo ký hiệu quốc tế (vd. e4, Nf3, O-O).",
          "Có thể xin hoà hoặc xin thua bất cứ lúc nào.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: [
          "Chiếu hết Vua đối phương là thắng.",
          "Hoà khi bên tới lượt hết nước đi mà không bị chiếu, thế cờ lặp lại ba lần, 50 nước mỗi bên không ăn quân và không đi Tốt, hai bên không đủ quân chiếu hết, hoặc đồng ý hoà.",
        ],
      },
    ],
  },

  "xiangqi-role": {
    intro: "Cờ Tướng Nhập Vai cho 2–10 người: mỗi phe chia thành 5 vai, mỗi người điều khiển một loại quân — cả phe phối hợp để chiếu bí đối phương.",
    sections: [
      {
        emoji: "🎭",
        title: "Các vai",
        items: [
          "Mỗi phe có 5 vai: Tướng · Sĩ · Tượng (một người giữ cả cung), Xe, Pháo, Mã, Tốt.",
          "Ai giữ vai nào thì điều khiển mọi quân loại đó của phe mình. Vai không có người sẽ do máy (bot) đánh.",
          "Luật đi quân giữ nguyên như cờ tướng truyền thống. Mỗi phe có khung chat riêng để bàn chiến thuật.",
        ],
      },
      {
        emoji: "✋",
        title: "Mỗi lượt đi",
        items: [
          "Xin lượt (claim): tới lượt phe mình, những vai còn nước đi bấm xin lượt trong thời gian chủ phòng đặt.",
          "Chọn người đi: Tướng chọn một trong những vai đã xin lượt. Tướng không chọn kịp thì vai xin sớm nhất được đi.",
          "Đi quân: vai được chọn có 10 giây để đi một nước.",
          "Bỏ lỡ lượt 3 lần liên tiếp thì vai bị giao cho đồng đội khác hoặc cho bot.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: ["Phe nào chiếu bí, hoặc khiến phe kia tới lượt mà hết nước đi hợp lệ thì thắng."],
      },
    ],
  },
};
