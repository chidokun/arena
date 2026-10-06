/**
 * Bộ 1000 cặp từ khoá của Undercover: hai từ gần nghĩa / cùng loại để mô tả của phe Dân và phe Gián Điệp nghe
 * na ná nhau. Mỗi dòng một cặp "từ A|từ B"; số thứ tự của cặp (bắt đầu từ 0) là mã cặp — phòng chơi nhớ các mã đã
 * dùng để không bốc lại, nên chỉ thêm cặp mới vào cuối, đừng xoá hay đổi chỗ. Lúc chia, máy bốc ngẫu nhiên từ nào
 * thuộc phe Dân, từ nào thuộc phe Gián Điệp.
 */
const RAW = `
Phở|Bún bò Huế
Bún chả|Bún thịt nướng
Bánh mì|Bánh bao
Cơm tấm|Cơm chiên
Bánh chưng|Bánh tét
Bánh xèo|Bánh khọt
Gỏi cuốn|Bò bía
Hủ tiếu|Mì Quảng
Bánh cuốn|Bánh ướt
Cháo lòng|Cháo gà
Bún riêu|Bún mắm
Bánh canh|Bánh đa cua
Xôi gấc|Xôi xéo
Chả giò|Chả cá
Cá kho|Thịt kho
Canh chua|Lẩu thái
Lẩu mắm|Lẩu cá kèo
Bánh bèo|Bánh bột lọc
Bánh căn|Bánh đúc
Nem nướng|Chạo tôm
Bò lá lốt|Bò kho
Gà luộc|Gà nướng
Vịt quay|Heo quay
Ốc luộc|Ốc xào
Bánh tráng trộn|Bánh tráng nướng
Cơm gà|Cơm sườn
Mì vằn thắn|Sủi cảo
Bún đậu mắm tôm|Bún ốc
Cao lầu|Mì xào
Bánh flan|Rau câu
Chè đậu xanh|Chè đậu đen
Chè bưởi|Chè khúc bạch
Tào phớ|Sữa chua nếp cẩm
Bánh da lợn|Bánh bò
Bánh ít|Bánh ú
Bánh gai|Bánh khoai
Trứng vịt lộn|Trứng cút
Lạp xưởng|Chả lụa
Giò thủ|Giò lụa
Dưa muối|Kim chi
Cá viên chiên|Bò viên
Phá lấu|Lòng xào
Bánh mì chảo|Bánh mì que
Cơm cháy|Bánh tráng
Gỏi gà|Gỏi đu đủ
Bò bít tết|Sườn nướng
Cá lóc nướng|Mực nướng
Ếch xào|Lươn xào
Bún cá|Bún mọc
Bánh đa|Bánh phồng tôm
Bánh pía|Bánh trung thu
Bánh nướng|Bánh dẻo
Kẹo dừa|Kẹo lạc
Mứt gừng|Mứt dừa
Bánh cốm|Bánh đậu xanh
Xôi lạc|Xôi đỗ
Cơm rang dưa bò|Mì xào bò
Bún bò Nam Bộ|Bún thịt nướng
Canh bí|Canh cua
Thịt luộc|Thịt quay
Đậu phụ chiên|Đậu phụ sốt cà chua
Rau muống xào|Rau lang luộc
Cơm niêu|Cơm lam
Hột vịt muối|Trứng bắc thảo
Pizza|Mì Ý
Hamburger|Sandwich
Sushi|Kimbap
Sashimi|Gỏi cá
Ramen|Udon
Tokbokki|Mì cay
Gà rán|Xúc xích chiên
Khoai tây chiên|Khoai lang chiên
Bắp rang bơ|Snack khoai tây
Taco|Burrito
Cà ri|Bò hầm
Dimsum|Há cảo
Bánh bao kim sa|Xíu mại
Lẩu Tứ Xuyên|Lẩu nấm
Thịt nướng BBQ|Lẩu băng chuyền
Bít tết|Sườn cừu
Salad|Gỏi trộn
Súp cua|Súp gà
Bánh kếp|Bánh waffle
Bánh donut|Bánh muffin
Bánh sừng bò|Bánh mì bơ tỏi
Bánh quy|Bánh xốp
Bánh kem|Bánh bông lan
Bánh tiramisu|Bánh mousse
Bánh su kem|Bánh tart trứng
Kem|Sữa chua
Kem que|Kem ốc quế
Sô-cô-la|Kẹo
Kẹo dẻo|Kẹo mút
Kẹo cao su|Kẹo bạc hà
Bim bim|Bánh gạo
Mì tôm|Miến
Phô mai|Bơ
Mật ong|Siro
Mứt dâu|Bơ đậu phộng
Ngũ cốc|Yến mạch
Xúc xích|Thịt xông khói
Pate|Chà bông
Trứng chiên|Trứng luộc
Hạt dưa|Hạt hướng dương
Hạt điều|Hạt dẻ
Đậu phộng|Hạnh nhân
Mì cay|Mì trộn
Cơm cuộn|Cơm nắm
Cà phê|Trà
Trà sữa|Sữa tươi
Bia|Rượu
Nước cam|Nước chanh
Coca|Pepsi
Sinh tố|Nước ép
Trà đá|Trà chanh
Sữa đậu nành|Sữa bắp
Rượu vang|Sâm panh
Nước dừa|Nước mía
Bạc xỉu|Cà phê sữa
Cà phê đen|Cà phê muối
Trà xanh|Trà ô long
Trà đào|Trà vải
Matcha|Cacao
Rượu đế|Rượu nếp
Whisky|Vodka
Cocktail|Mocktail
Nước tăng lực|Nước điện giải
Sữa đặc|Sữa bột
Trà gừng|Trà atiso
Nước sâm|Nước rau má
Sữa óc chó|Sữa hạnh nhân
Trà sữa trân châu|Sữa tươi trân châu đường đen
Cà phê trứng|Cà phê cốt dừa
Espresso|Cappuccino
Latte|Mocha
Bia hơi|Bia lon
Soju|Sake
Nước ngọt|Nước trái cây
Nước chanh dây|Nước tắc
Nước ép táo|Nước ép cà rốt
Sinh tố bơ|Sinh tố xoài
Trà hoa cúc|Trà nhài
Đá bào|Đá xay
Nước mơ|Nước sấu
Táo|Lê
Cam|Quýt
Xoài|Đu đủ
Dưa hấu|Dưa lưới
Sầu riêng|Mít
Dâu tây|Cherry
Nho|Việt quất
Chanh|Tắc
Vải|Nhãn
Chuối|Thanh long
Bưởi|Cam sành
Măng cụt|Chôm chôm
Dừa|Thốt nốt
Ổi|Mận
Khế|Me
Na|Mãng cầu xiêm
Hồng|Hồng xiêm
Kiwi|Chanh dây
Sơ ri|Dâu tằm
Mơ|Đào
Chà là|Nho khô
Dưa lê|Dưa gang
Táo đỏ|Kỷ tử
Quả óc chó|Hạt mắc ca
Chuối tiêu|Chuối sứ
Dừa xiêm|Dừa sáp
Cà rốt|Củ cải
Khoai tây|Khoai lang
Hành tây|Tỏi
Gừng|Nghệ
Ớt|Tiêu
Bắp cải|Súp lơ
Bí đỏ|Bí đao
Dưa chuột|Mướp
Cà tím|Cà chua
Rau muống|Rau cải
Xà lách|Rau thơm
Nấm|Mộc nhĩ
Ngô|Đậu bắp
Đậu Hà Lan|Đậu cove
Giá đỗ|Rau mầm
Hành lá|Ngò rí
Sả|Lá chanh
Muối|Đường
Nước mắm|Xì dầu
Tương ớt|Tương cà
Mayonnaise|Sốt mè
Bột ngọt|Hạt nêm
Mắm tôm|Mắm ruốc
Quế|Hồi
Củ dền|Củ sen
Khoai môn|Khoai mì
Mồng tơi|Rau đay
Bông bí|Hoa thiên lý
Măng|Măng tây
Đậu phụ|Tàu hũ ky
Rau má|Rau diếp cá
Su hào|Su su
Lá lốt|Lá tía tô
Dầu ăn|Mỡ heo
Bột mì|Bột năng
Chó|Mèo
Hổ|Sư tử
Gà|Vịt
Cá heo|Cá mập
Ngựa|Ngựa vằn
Bướm|Ong
Muỗi|Ruồi
Khỉ|Tinh tinh
Rắn|Lươn
Rùa|Ốc sên
Cá sấu|Thằn lằn
Chim cánh cụt|Gấu Bắc Cực
Voi|Tê giác
Bò|Trâu
Sói|Cáo
Đại bàng|Cú mèo
Tôm|Cua
Thỏ|Sóc
Gấu trúc|Gấu koala
Hươu cao cổ|Lạc đà
Cá voi|Hải cẩu
Sứa|Hải quỳ
Mực|Bạch tuộc
Chuột|Chuột hamster
Dê|Cừu
Lợn|Lợn rừng
Kiến|Mối
Gián|Dế
Nhện|Bọ cạp
Chim sẻ|Chim sáo
Vẹt|Chim họa mi
Bồ câu|Chim én
Báo|Linh miêu
Hải cẩu|Sư tử biển
Cá vàng|Cá chép
Cá hồi|Cá ngừ
Cá trê|Cá lóc
Ốc|Sò
Hàu|Nghêu
Ngỗng|Thiên nga
Gà tây|Đà điểu
Chuồn chuồn|Châu chấu
Ve sầu|Đom đóm
Sâu|Giun
Tắc kè|Kỳ nhông
Rồng|Phượng hoàng
Cá ngựa|Sao biển
Ong mật|Ong bắp cày
Gà trống|Gà mái
Cò|Vạc
Quạ|Diều hâu
Rái cá|Hải ly
Nhím|Tê tê
Bò sữa|Bò tót
Tôm hùm|Cua hoàng đế
Vịt|Ngan
Cá rô|Cá diếc
Gối|Chăn
Ô|Áo mưa
Gương|Cửa sổ
Chìa khoá|Ổ khoá
Nến|Đèn pin
Dép|Giày
Quạt|Điều hoà
Kéo|Dao
Tủ lạnh|Lò vi sóng
Bàn chải đánh răng|Lược
Giường|Sofa
Ghế|Bàn
Tủ quần áo|Kệ sách
Rèm cửa|Thảm
Nồi|Chảo
Bát|Đĩa
Đũa|Thìa
Cốc|Ly
Ấm đun nước|Phích nước
Bếp ga|Bếp từ
Nồi cơm điện|Nồi áp suất
Máy giặt|Máy sấy quần áo
Bàn là|Máy sấy tóc
Chổi|Cây lau nhà
Xô|Chậu
Thùng rác|Túi nilon
Khăn tắm|Khăn mặt
Xà phòng|Sữa tắm
Dầu gội|Dầu xả
Kem đánh răng|Nước súc miệng
Giấy vệ sinh|Khăn giấy
Móc áo|Kẹp phơi đồ
Bình hoa|Chậu cây
Đồng hồ treo tường|Đồng hồ báo thức
Đèn ngủ|Đèn bàn
Ổ cắm|Công tắc
Pin|Sạc dự phòng
Bật lửa|Diêm
Hộp quà|Phong bì
Màn chống muỗi|Vợt muỗi
Bình giữ nhiệt|Bình nước
Hộp cơm|Cặp lồng
Ghế bập bênh|Võng
Bồn tắm|Vòi sen
Bồn cầu|Bồn rửa mặt
Cửa|Cổng
Cầu thang|Thang máy
Ban công|Sân thượng
Hàng rào|Bức tường
Mái nhà|Trần nhà
Chuông cửa|Mắt thần
Bình cứu hoả|Còi báo cháy
Hộp cứu thương|Tủ thuốc
Nhiệt kế|Máy đo huyết áp
Kim chỉ|Máy may
Cúc áo|Khoá kéo
Ống hút|Que khuấy
Tăm|Chỉ nha khoa
Lò nướng|Nồi chiên không dầu
Máy xay sinh tố|Máy ép trái cây
Máy lọc nước|Máy lọc không khí
Máy hút bụi|Robot lau nhà
Bút bi|Bút chì
Cặp sách|Ba lô
Thước kẻ|Compa
Tẩy|Bút xoá
Vở|Sổ tay
Sách giáo khoa|Truyện tranh
Bảng đen|Bảng trắng
Phấn|Bút lông
Hồ dán|Băng dính
Ghim bấm|Kẹp giấy
Máy tính bỏ túi|Bàn tính
Máy in|Máy photocopy
Bút dạ quang|Bút màu
Màu nước|Sáp màu
Giấy note|Giấy A4
Bản đồ|Quả địa cầu
Từ điển|Sách tham khảo
Bài kiểm tra|Bài tập về nhà
Học bạ|Bằng khen
Thẻ học sinh|Thẻ thư viện
Đồng phục|Khăn quàng đỏ
Giờ ra chơi|Giờ tan học
Thi học kỳ|Thi đại học
Giáo viên chủ nhiệm|Hiệu trưởng
Lớp trưởng|Lớp phó
Bút máy|Bút lông ngỗng
Con dấu|Chữ ký
Hợp đồng|Hoá đơn
Cuộc họp|Hội thảo
Email|Tin nhắn
Lương|Thưởng
Nghỉ phép|Nghỉ lễ
Văn phòng|Phòng họp
Sếp|Đồng nghiệp
Phỏng vấn|Thử việc
Tăng ca|Trực đêm
CV|Thư xin việc
Điện thoại|Máy tính bảng
Tivi|Máy chiếu
Tai nghe|Loa
Bàn phím|Chuột máy tính
Laptop|Máy tính bàn
Máy ảnh|Máy quay
Đồng hồ thông minh|Vòng đeo tay thông minh
USB|Thẻ nhớ
Wifi|Bluetooth
Củ sạc|Dây cáp
Router wifi|Bộ kích sóng
Máy chơi game|Tay cầm chơi game
iPhone|Samsung
Android|iOS
Windows|MacOS
Google|Cốc Cốc
Chrome|Firefox
Zalo|Messenger
Facebook|Instagram
TikTok|YouTube
Netflix|Disney+
Spotify|Apple Music
Shopee|Lazada
Grab|Be
Momo|ZaloPay
Robot|Trí tuệ nhân tạo
Kính thực tế ảo|Kính 3D
Ổ cứng|Lưu trữ đám mây
Mật khẩu|Mã OTP
Mã QR|Mã vạch
Selfie|Livestream
Emoji|Sticker
Chụp màn hình|Quay màn hình
Website|Ứng dụng
Loa bluetooth|Micro
Podcast|Radio
Like|Share
Comment|Inbox
Story|Reels
Hashtag|Trend
Follow|Subscribe
Game online|Game offline
Áo dài|Áo bà ba
Áo khoác|Áo len
Quần jeans|Quần kaki
Nhẫn|Dây chuyền
Cà vạt|Nơ
Kính râm|Kính cận
Đồng hồ|Vòng tay
Son môi|Phấn má
Mũ bảo hiểm|Nón lá
Ví|Túi xách
Váy|Quần short
Áo sơ mi|Áo phông
Áo hoodie|Áo nỉ
Quần tây|Quần jogger
Đồ ngủ|Đồ bộ
Đồ bơi|Áo phao
Giày cao gót|Giày búp bê
Giày thể thao|Giày tây
Dép lê|Guốc
Tất|Găng tay
Khăn quàng cổ|Khăn tay
Mũ lưỡi trai|Mũ len
Thắt lưng|Dây đeo quần
Bông tai|Khuyên mũi
Kẹp tóc|Dây buộc tóc
Nước hoa|Lăn khử mùi
Kem chống nắng|Kem dưỡng da
Mascara|Kẻ mắt
Sơn móng tay|Móng giả
Mặt nạ dưỡng da|Sữa rửa mặt
Tóc giả|Mi giả
Vali|Túi du lịch
Áo vest|Áo blazer
Áo yếm|Áo tứ thân
Khẩu trang|Khăn che mặt
Trâm cài|Vương miện
Đồng hồ quả quýt|Đồng hồ cát
Mũ phớt|Mũ cao bồi
Giày patin|Ván trượt
Kính áp tròng|Kính lão
Hình xăm|Hình dán
Uốn tóc|Duỗi tóc
Nhuộm tóc|Cắt tóc
Trang điểm|Hoá trang
Bệnh viện|Nhà thuốc
Trường học|Thư viện
Rạp chiếu phim|Nhà hát
Biển|Hồ bơi
Núi|Đồi
Sân bay|Ga tàu
Chợ|Siêu thị
Quán cà phê|Quán trà sữa
Công viên|Sở thú
Khách sạn|Nhà nghỉ
Nhà thờ|Chùa
Phòng gym|Sân bóng
Ngân hàng|Bưu điện
Tiệm tóc|Spa
Nhà hàng|Căng tin
Trung tâm thương mại|Chợ đêm
Bảo tàng|Triển lãm
Công viên nước|Khu vui chơi
Bãi biển|Hòn đảo
Rừng|Vườn
Sa mạc|Thảo nguyên
Thác nước|Suối nước nóng
Hang động|Đường hầm
Nhà tù|Đồn công an
Toà án|Uỷ ban nhân dân
Bến xe|Trạm xăng
Bến phà|Bến cảng
Ký túc xá|Nhà trọ
Chung cư|Biệt thự
Nhà sách|Cửa hàng văn phòng phẩm
Tiệm vàng|Tiệm cầm đồ
Quán bar|Vũ trường
Quán karaoke|Quán nhậu
Sân vận động|Nhà thi đấu
Nông trại|Ruộng lúa
Nhà máy|Công trường
Phòng thí nghiệm|Phòng máy tính
Tiệm bánh|Tiệm kem
Phòng cấp cứu|Phòng mổ
Tiệm giặt là|Tiệm sửa xe
Khu cắm trại|Homestay
Vườn quốc gia|Khu bảo tồn
Hồ|Ao
Sông|Suối
Cây cầu|Đập nước
Ngã tư|Vòng xoay
Vỉa hè|Lòng đường
Tầng hầm|Gác mái
Phòng khách|Phòng ngủ
Nhà bếp|Phòng ăn
Nhà vệ sinh|Phòng tắm
Trường mầm non|Trường tiểu học
Đại học|Cao đẳng
Phòng học|Hội trường
Chợ nổi|Chợ phiên
Phố đi bộ|Phố cổ
Bãi đỗ xe|Nhà để xe
Ngọn hải đăng|Tháp canh
Siêu thị mini|Tạp hoá
Bác sĩ|Y tá
Giáo viên|Gia sư
Cảnh sát|Bảo vệ
Đầu bếp|Phục vụ
Ca sĩ|Diễn viên
Phi công|Tiếp viên hàng không
Lập trình viên|Hacker
Thợ cắt tóc|Thợ trang điểm
Nhà báo|MC
Kiến trúc sư|Kỹ sư xây dựng
Lính cứu hoả|Cứu hộ
Shipper|Tài xế công nghệ
Nha sĩ|Bác sĩ thú y
Luật sư|Thẩm phán
Kế toán|Thu ngân
Nông dân|Ngư dân
Thợ điện|Thợ nước
Thợ mộc|Thợ xây
Bộ đội|Công an
Nhạc sĩ|Nhạc công
Hoạ sĩ|Nhiếp ảnh gia
Nhà văn|Nhà thơ
Diễn viên hài|Ảo thuật gia
Vận động viên|Huấn luyện viên
Trọng tài|Bình luận viên
Tiktoker|Youtuber
Người mẫu|Hoa hậu
Streamer|Game thủ
Dược sĩ|Hộ lý
Nhà khoa học|Nhà phát minh
Phi hành gia|Nhà thiên văn
Thám tử|Cảnh sát hình sự
Thợ săn|Kiểm lâm
Thuyền trưởng|Thủy thủ
Tài xế taxi|Tài xế xe buýt
Nhân viên bán hàng|Chủ cửa hàng
Lễ tân|Thư ký
Giám đốc|Trưởng phòng
Công nhân|Kỹ sư
Thợ may|Nhà thiết kế thời trang
Thợ làm bánh|Pha chế
Bartender|Barista
Hướng dẫn viên du lịch|Phiên dịch viên
Nhà sư|Linh mục
Thầy bói|Phù thủy
Vua|Hoàng tử
Nữ hoàng|Công chúa
Bảo mẫu|Giúp việc
Bác sĩ phẫu thuật|Bác sĩ tâm lý
Sinh viên|Học sinh
Giảng viên|Giáo sư
Chính trị gia|Nhà ngoại giao
Doanh nhân|Nhà đầu tư
Tỷ phú|Triệu phú
Binh lính|Tướng quân
Hiệp sĩ|Samurai
Ninja|Sát thủ
Cướp biển|Thổ phỉ
Chú hề|Người làm xiếc
Thợ sửa xe|Thợ sửa điện thoại
Xe máy|Xe đạp
Máy bay|Trực thăng
Tàu hoả|Tàu điện ngầm
Taxi|Xe buýt
Thuyền|Ca nô
Xe cứu thương|Xe cứu hoả
Xích lô|Xe ôm
Ô tô|Xe tải
Tàu ngầm|Du thuyền
Xe đạp điện|Xe máy điện
Khinh khí cầu|Dù lượn
Tên lửa|Tàu vũ trụ
Xe tăng|Xe bọc thép
Xe cảnh sát|Xe chở tiền
Xe container|Xe ben
Xe limousine|Xe giường nằm
Xe đua F1|Xe mô tô
Thuyền buồm|Thuyền thúng
Bè|Xuồng
Cáp treo|Tàu lượn siêu tốc
Xe lăn|Xe đẩy em bé
Máy cày|Máy gặt
Xe nâng|Xe cẩu
Phà|Cầu phao
Đèn giao thông|Biển báo
Bằng lái|Đăng ký xe
Kẹt xe|Tai nạn
Vé máy bay|Hộ chiếu
Xăng|Dầu diesel
Lốp xe|Vô lăng
Còi xe|Đèn xe
Phanh|Chân ga
Bóng đá|Bóng rổ
Cầu lông|Tennis
Bơi lội|Lặn
Yoga|Thiền
Chạy bộ|Đi bộ
Trượt tuyết|Lướt sóng
Boxing|Karate
Bóng chuyền|Bóng bàn
Bóng chày|Cricket
Golf|Bi-a
Đấu vật|Sumo
Taekwondo|Judo
Vovinam|Kung fu
Đua xe|Đua ngựa
Đạp xe|Ba môn phối hợp
Leo núi|Leo tường
Nhảy cao|Nhảy xa
Ném đĩa|Ném tạ
Bắn cung|Bắn súng
Thể dục dụng cụ|Nhào lộn
Trượt băng nghệ thuật|Múa ba lê
Cử tạ|Thể hình
Bóng ném|Bóng nước
Đá cầu|Nhảy dây
Kéo co|Nhảy bao bố
Đánh đu|Bập bênh
Chèo thuyền|Chèo kayak
Lướt ván diều|Lướt ván buồm
Nhảy dù|Nhảy bungee
Thủ môn|Hậu vệ
Tiền đạo|Tiền vệ
Thẻ vàng|Thẻ đỏ
Penalty|Phạt góc
World Cup|Euro
SEA Games|Olympic
Huy chương vàng|Cúp vô địch
Sân golf|Sân tennis
Đội tuyển|Câu lạc bộ
Messi|Ronaldo
Khởi động|Giãn cơ
Aerobic|Zumba
Plank|Hít đất
Gập bụng|Squat
Cờ vua|Cờ tướng
Đánh bài|Cờ tỷ phú
Câu cá|Cắm trại
Trốn tìm|Bịt mắt bắt dê
Karaoke|Hát live
Xiếc|Ảo thuật
Phim kinh dị|Phim hành động
Cờ caro|Cờ vây
Rubik|Xếp hình
Lô tô|Bầu cua
Ma sói|Mafia
Uno|Phỏm
Tiến lên|Xì dách
Game bắn súng|Game đối kháng
Liên Quân|Liên Minh Huyền Thoại
Minecraft|Roblox
Pokemon|Digimon
Free Fire|PUBG
Ô ăn quan|Nhảy lò cò
Thả diều|Chơi bi
Đi xem phim|Đi xem kịch
Đọc truyện|Đọc sách
Phim Hàn|Phim Trung
Phim hoạt hình|Phim tài liệu
Sudoku|Ô chữ
Đố vui|Câu đố
Nhảy hiện đại|Múa
Tiệc sinh nhật|Tiệc tất niên
Đi phượt|Du lịch
Picnic|Nướng BBQ
Công viên giải trí|Rạp xiếc
Trò chơi điện tử|Trò chơi dân gian
Bóng bay|Pháo giấy
Búp bê|Gấu bông
Lego|Xếp gỗ
Ô tô đồ chơi|Tàu hoả đồ chơi
Súng nước|Súng nerf
Đu quay|Xe điện đụng
Nhà ma|Mê cung
Mặt trời|Mặt trăng
Mưa|Tuyết
Sấm|Chớp
Hoa hồng|Hoa cúc
Cầu vồng|Cực quang
Bão|Lốc xoáy
Núi lửa|Động đất
Sao băng|Sao chổi
Hoa đào|Hoa mai
Sương mù|Mây
Hạn hán|Lũ lụt
Sóng thần|Sạt lở
Mưa đá|Mưa phùn
Hoa sen|Hoa súng
Hoa hướng dương|Hoa cải
Hoa lan|Hoa ly
Hoa tulip|Hoa oải hương
Hoa giấy|Hoa phượng
Hoa sữa|Hoa ban
Cây tre|Cây trúc
Cây thông|Cây bàng
Cây dừa|Cây cau
Xương rồng|Sen đá
Kim cương|Ngọc trai
Vàng|Bạc
Trái Đất|Sao Hoả
Sao Kim|Sao Mộc
Hành tinh|Ngôi sao
Bình minh|Hoàng hôn
Mùa xuân|Mùa thu
Mùa hè|Mùa đông
Bán đảo|Quần đảo
Đồng bằng|Cao nguyên
Thung lũng|Hẻm núi
Băng hà|Tảng băng trôi
Nhật thực|Nguyệt thực
Trăng tròn|Trăng khuyết
Mắt|Tai
Mũi|Miệng
Tay|Chân
Tóc|Râu
Răng|Lưỡi
Tim|Phổi
Gan|Thận
Dạ dày|Ruột
Xương|Cơ bắp
Máu|Mồ hôi
Nước mắt|Nước mũi
Móng tay|Móng chân
Cảm cúm|Sốt
Ho|Hắt hơi
Đau đầu|Đau bụng
Thuốc|Vitamin
Tiêm|Truyền nước
Băng cá nhân|Bông băng
Mụn|Tàn nhang
Lúm đồng tiền|Răng khểnh
Tóc xoăn|Tóc thẳng
Ác mộng|Giấc mơ
Ngáp|Vươn vai
Nấc cụt|Ợ hơi
Chuột rút|Bong gân
Gãy tay|Trật khớp
Cận thị|Loạn thị
Sâu răng|Viêm lợi
Dị ứng|Mề đay
Tiểu đường|Huyết áp cao
Massage|Bấm huyệt
Châm cứu|Giác hơi
Phẫu thuật|Nội soi
X-quang|Siêu âm
Xét nghiệm máu|Hiến máu
Lông mày|Lông mi
Đầu gối|Khuỷu tay
Vai|Lưng
Tết|Trung thu
Giáng sinh|Năm mới
Sinh nhật|Đám cưới
Pháo hoa|Đèn lồng
Lì xì|Quà tặng
Valentine|Ngày Quốc tế Phụ nữ
Halloween|Lễ Vu Lan
Ngày Nhà giáo|Ngày Thầy thuốc
Đám hỏi|Đám giỗ
Tân gia|Khai trương
Họp lớp|Họp phụ huynh
Lễ tốt nghiệp|Lễ khai giảng
Thôi nôi|Đầy tháng
Tết Đoan Ngọ|Tết Hàn thực
Rằm tháng Giêng|Rằm tháng Bảy
Mâm ngũ quả|Mâm cỗ
Câu đối|Tranh Đông Hồ
Cây nêu|Cây quất
Múa lân|Múa rồng
Đua thuyền|Đua voi
Hội chợ|Lễ hội ẩm thực
Concert|Fan meeting
Lễ hội âm nhạc|Đêm nhạc acoustic
Black Friday|Ngày độc thân 11/11
Ngày Cá tháng Tư|Ngày Thiếu nhi
Quốc khánh|Ngày Thống nhất
Giao thừa|Mùng một Tết
Xông đất|Hái lộc
Cúng ông Công ông Táo|Tảo mộ
Harry Potter|Chúa tể những chiếc nhẫn
Doraemon|Conan
Superman|Batman
Người Nhện|Người Sắt
Ông già Noel|Ông Táo
Tôn Ngộ Không|Trư Bát Giới
Đường Tăng|Sa Tăng
Tấm|Cám
Thạch Sanh|Lý Thông
Sơn Tinh|Thủy Tinh
Thánh Gióng|Lạc Long Quân
Chú Cuội|Chị Hằng
Cô bé Lọ Lem|Bạch Tuyết
Nàng tiên cá|Người đẹp và quái vật
Pinocchio|Peter Pan
Chuột Mickey|Vịt Donald
Tom|Jerry
Shin cậu bé bút chì|Nobita
Songoku|Naruto
One Piece|Dragon Ball
Thủy thủ Mặt Trăng|Phép thuật Doremi
Elsa|Anna
Shrek|Minion
Pikachu|Hello Kitty
Captain America|Thor
Hulk|Thanos
Joker|Venom
Sherlock Holmes|Hercule Poirot
James Bond|Ethan Hunt
Titanic|Avatar
Squid Game|Alice in Borderland
Thúy Kiều|Thúy Vân
Chí Phèo|Thị Nở
Dế Mèn|Dế Choắt
Tây Du Ký|Tam Quốc Diễn Nghĩa
Quan Vũ|Trương Phi
Lưu Bị|Tào Tháo
Gia Cát Lượng|Tư Mã Ý
Bao Công|Triển Chiêu
Hoàn Châu Cách Cách|Thần Điêu Đại Hiệp
Dracula|Zombie
Ma cà rồng|Người sói
Thiên thần|Ác quỷ
Tiên|Bụt
Yêu tinh|Quỷ lùn
Người ngoài hành tinh|UFO
Đàn guitar|Đàn ukulele
Piano|Organ
Trống|Cồng chiêng
Sáo|Kèn
Violin|Cello
Đàn bầu|Đàn tranh
Đàn nguyệt|Đàn tỳ bà
Saxophone|Kèn trumpet
Nhạc pop|Nhạc rock
Rap|Hip hop
Bolero|Cải lương
Quan họ|Ca trù
Hát chèo|Hát tuồng
Nhạc EDM|Nhạc remix
Ballad|R&B
Kpop|Vpop
Ban nhạc|Dàn hợp xướng
Album|Single
MV|Teaser
Hợp âm|Nốt nhạc
Nhạc chuông|Chuông báo thức
Đĩa than|Băng cát-xét
Beatbox|A cappella
Ngủ trưa|Ngủ nướng
Tắm|Gội đầu
Đánh răng|Rửa mặt
Nấu ăn|Rửa bát
Giặt đồ|Phơi đồ
Quét nhà|Lau nhà
Đi chợ|Đi siêu thị
Đi làm|Đi học
Tập thể dục|Đi dạo
Đọc báo|Xem thời sự
Gọi điện|Nhắn tin
Chụp ảnh|Quay video
Mua sắm online|Đặt đồ ăn
Hẹn hò|Đi xem mắt
Tán tỉnh|Tỏ tình
Cãi nhau|Giận dỗi
Uống thuốc|Đi khám bệnh
Đi công tác|Đi du lịch
Chuyển nhà|Dọn nhà
Sửa xe|Rửa xe
Đổ xăng|Sạc điện
Trồng cây|Tưới cây
Nuôi chó|Nuôi mèo
Đi ngủ|Thức khuya
Ăn sáng|Ăn khuya
Đi nhậu|Đi tiệc
Hát|Huýt sáo
Vẽ|Tô màu
Viết nhật ký|Viết thư
Học bài|Làm bài tập
Đi thi|Đi phỏng vấn
Xếp hàng|Chen lấn
Đi muộn|Trốn học
Ngủ gật|Mơ mộng
Lướt Facebook|Lướt TikTok
Mất ví|Mất điện thoại
Đặt báo thức|Hẹn giờ
Gói quà|Mở quà
Thổi nến|Cắt bánh
Tình yêu|Tình bạn
Bạn thân|Người yêu
Crush|Người yêu cũ
Nhớ nhà|Nhớ người yêu
Buồn|Cô đơn
Sợ hãi|Lo lắng
Tự tin|Kiêu ngạo
Thông minh|Khôn ngoan
Đẹp trai|Dễ thương
Giàu có|Thành công
Tiền mặt|Thẻ ngân hàng
Thời gian|Tuổi tác
Tuổi thơ|Tuổi trẻ
Ước mơ|Mục tiêu
Bí mật|Lời nói dối
Lời hứa|Lời thề
Sự thật|Tin đồn
Định mệnh|May mắn
Hoà bình|Tự do
Ly hôn|Chia tay
Cầu hôn|Đính hôn
Tham lam|Keo kiệt
Hào phóng|Tốt bụng
Bố|Mẹ
Ông|Bà
Anh trai|Chị gái
Em trai|Em gái
Chú|Bác
Cô|Dì
Con rể|Con dâu
Mẹ chồng|Mẹ vợ
Anh họ|Em họ
Cháu nội|Cháu ngoại
Bạn cùng lớp|Bạn cùng phòng
Sinh đôi|Sinh ba
Ông bà nội|Ông bà ngoại
Trẻ sơ sinh|Trẻ mẫu giáo
Thiếu niên|Thanh niên
Người già|Trung niên
Thầy giáo|Học trò
Hà Nội|Sài Gòn
Đà Nẵng|Nha Trang
Hội An|Huế
Đà Lạt|Sa Pa
Phú Quốc|Côn Đảo
Vũng Tàu|Phan Thiết
Hạ Long|Ninh Bình
Cần Thơ|Bến Tre
Hồ Gươm|Hồ Tây
Lăng Bác|Văn Miếu
Chợ Bến Thành|Chợ Đồng Xuân
Cầu Rồng|Cầu Vàng
Fansipan|Bà Nà Hills
Mũi Cà Mau|Cột cờ Lũng Cú
Tokyo|Seoul
Paris|London
New York|Los Angeles
Bắc Kinh|Thượng Hải
Bangkok|Singapore
Nhật Bản|Hàn Quốc
Trung Quốc|Đài Loan
Mỹ|Canada
Anh|Pháp
Đức|Ý
Úc|New Zealand
Thái Lan|Lào
Campuchia|Myanmar
Ấn Độ|Nepal
Nga|Mông Cổ
Brazil|Argentina
Ai Cập|Morocco
Tháp Eiffel|Tháp nghiêng Pisa
Vạn Lý Trường Thành|Tử Cấm Thành
Kim tự tháp|Tượng Nhân sư
Tượng Nữ thần Tự do|Tượng Chúa Kitô
Châu Á|Châu Âu
Châu Phi|Châu Mỹ
Bắc Cực|Nam Cực
Dubai|Las Vegas
Hawaii|Bali
Maldives|Phuket
Venice|Amsterdam
Disneyland|Universal Studios
Hollywood|Bollywood
McDonald's|KFC
Starbucks|Highlands Coffee
Trung Nguyên|Phúc Long
Apple|Xiaomi
Nike|Adidas
Gucci|Louis Vuitton
Toyota|Honda
VinFast|Tesla
Uniqlo|Zara
Oreo|Chocopie
Vinamilk|TH True Milk
Mì Hảo Hảo|Mì Omachi
Bitcoin|Ethereum
Visa|Mastercard
Amazon|Tiki
Discord|Telegram
Twitter|Threads
ChatGPT|Siri
Marvel|DC
Disney|Pixar
PlayStation|Xbox
Canon|Nikon
Sony|LG
Biti's|Converse
`;

export const PAIRS: readonly (readonly [string, string])[] = RAW.trim()
  .split("\n")
  .map((line) => {
    const [a, b] = line.split("|");
    return [a.trim(), b.trim()] as const;
  });
