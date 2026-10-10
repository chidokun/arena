/**
 * Luật chơi chi tiết của từng game, hiện trong popup "Luật chơi" ở sảnh. Viết theo luật đang chạy trong code
 * (`lib/games/*.ts`) — sửa luật thì sửa cả ở đây. Game chưa có mục ở đây thì popup dùng mô tả ngắn từ API.
 */

export type RuleSection = { emoji: string; title: string; items: string[] };
export type GameRules = {
  /** Một hai câu giới thiệu ngay dưới lời chào. */
  intro: string;
  sections: RuleSection[];
};

export const RULES: Record<string, GameRules> = {
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

  dodge: {
    intro: "Né Bão cho 2–8 người: một người chạy né chướng ngại, những người còn lại nấp quanh màn hình bắn đạn truy cản.",
    sections: [
      {
        emoji: "🏃",
        title: "Người chạy",
        items: [
          "Nhân vật tự chạy liên tục từ trái sang phải, bạn chỉ cần nhảy (Space / W / ↑) để né hố, gai và đạn.",
          "Chạy càng lâu càng được cộng nhiều thời gian sống sót vào điểm.",
        ],
      },
      {
        emoji: "🔫",
        title: "Người truy cản",
        items: [
          "Những người khác nấp ở bốn cạnh màn hình, trượt dọc cạnh (↑↓) để đổi vị trí.",
          "Bấm chuột hoặc Space để bắn đạn về phía người chạy — mỗi phát cách nhau một khoảng hồi chiêu.",
        ],
      },
      {
        emoji: "🔁",
        title: "Đổi người chạy",
        items: [
          "Người chạy trúng đạn: người bắn trúng lên làm người chạy.",
          "Người chạy rơi hố hoặc vướng gai: người kế tiếp trong danh sách lên chạy.",
        ],
      },
      {
        emoji: "🏆",
        title: "Thắng thua",
        items: ["Chủ phòng bấm dừng để chốt bảng xếp hạng: ai có tổng thời gian sống sót dài nhất thắng."],
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
