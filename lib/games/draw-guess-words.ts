// Mã từ = mức × 1000 + số thứ tự trong mức; phòng nhớ mã các từ đã chơi để không bốc lại, nên chỉ thêm từ vào *cuối*
// mỗi mức, không xoá, không đổi chỗ.
// Mỗi mức tối đa 1000 từ (số thứ tự 0–999); muốn thêm nữa phải đổi cách đánh mã.

const EASY = `
con mèo
con chó
con cá
con gà
con vịt
con heo
con bò
con ngựa
con voi
con thỏ
con chuột
con rắn
con ếch
con rùa
con cua
con tôm
con ốc sên
con bướm
con ong
con kiến
con nhện
con chim
con cú
con khỉ
con hổ
con sư tử
con gấu
con cá voi
con cá mập
con bạch tuộc
con sâu
con dơi
con muỗi
con giun
cái ghế
cái bàn
cái giường
cái cốc
đôi đũa
cái thìa
con dao
cái kéo
cái bút
quyển sách
cái kính
cái mũ
đôi giày
đôi dép
cái áo
cái váy
chiếc nhẫn
đồng hồ
chìa khoá
ổ khoá
cái chổi
cái xô
cái thang
cái búa
bóng đèn
cây nến
điện thoại
máy tính
ti vi
cái quạt
tủ lạnh
cái gối
bàn chải đánh răng
cái lược
cái gương
ba lô
cái hộp
hộp quà
quả bóng
con diều
bóng bay
cái trống
đàn ghi ta
cái chuông
cái nồi
cái chảo
mặt trời
mặt trăng
ngôi sao
đám mây
cầu vồng
cơn mưa
tia sét
bông tuyết
ngọn núi
dòng sông
cái cây
bông hoa
chiếc lá
cây nấm
cây xương rồng
hòn đảo
ngọn lửa
giọt nước
hoa hướng dương
cây dừa
quả táo
quả chuối
quả cam
quả dưa hấu
chùm nho
quả dứa
quả dâu tây
quả chanh
quả ớt
củ cà rốt
quả trứng
bánh mì
bánh pizza
cây kem
kẹo mút
bắp ngô
quả cà chua
bát cơm
ô tô
xe đạp
xe máy
xe buýt
tàu hoả
máy bay
con thuyền
tên lửa
trực thăng
xe tải
trái tim
ngôi nhà
cái cửa
cửa sổ
lá cờ
người tuyết
con ma
rô bốt
vương miện
kim cương
mỏ neo
mũi tên
đầu lâu
cái răng
con mắt
cái mũi
cái tai
bàn tay
bàn chân
cái miệng
mặt cười
cái ô
quả lê
cây bút chì
cục tẩy
cái thước
con dê
con cừu
con trâu
con nai
con cáo
con sói
con ngỗng
con gà trống
con gà mái
con cá vàng
con cá chép
con mực
con sứa
con ốc
con ruồi
con gián
con châu chấu
con bọ rùa
con đom đóm
con ve sầu
con tằm
chim bồ câu
con thiên nga
con quạ
chim sẻ
con lươn
con nòng nọc
con thằn lằn
con hươu
con đại bàng
con cò
con sò
con nghêu
con hamster
con bê
con cá rô
con cá trê
con cá thu
con ốc biển
con sâu róm
con bọ ngựa
con rết
con bò sữa
tổ chim
tổ ong
mạng nhện
vỏ sò
lông vũ
cái sừng
cái đuôi
móng vuốt
quả trứng gà
quả vải
quả xoài
quả đu đủ
quả mít
quả sầu riêng
quả măng cụt
quả chôm chôm
quả thanh long
quả mận
quả hồng
quả lựu
quả ổi
quả na
quả khế
quả kiwi
quả việt quất
quả cherry
quả bầu
quả mướp
quả dưa chuột
quả cà tím
quả đậu
quả bí đao
quả dưa lưới
quả bưởi
quả quýt
quả me
quả roi
quả hạnh
quả óc chó
củ khoai tây
củ khoai lang
củ tỏi
củ gừng
củ cải
bắp cải
súp lơ
rau muống
rau xà lách
quả bí đỏ
cây hành lá
hạt dẻ
hạt điều
hạt lạc
hạt gạo
hạt cà phê
bánh quy
bánh rán
bánh donut
bánh kem
bánh bông lan
bánh sandwich
bánh mì gối
bánh xốp
kẹo bông
viên kẹo
thanh sô cô la
bỏng ngô
cốc sữa
hộp sữa
chai nước
lon nước ngọt
cốc nước cam
tách trà
xôi
cơm nắm
trứng ốp la
trứng luộc
thịt nướng
đùi gà
cá nướng
mì ý
xiên que
miếng phô mai
miếng bít tết
bát canh
hộp cơm
cái bánh tart
cái đĩa
cái bát
cái nĩa
cái chai
cái lọ
cái hũ
cái giỏ
cái thúng
cái chậu
cái phích
cái khay
cái mâm
cái nắp
cái túi
cái ví
cái cặp
cái tủ
cái kệ
cái rèm
cái thảm
cái chăn
cái nệm
cái móc
cái phao
cái còi
cái bật lửa
cái kẹp
cái ghim
cái khuy
cuộn chỉ
thắt lưng
cà vạt
cái khăn
khăn quàng cổ
găng tay
đôi tất
cái quần
quần đùi
áo mưa
áo khoác
áo len
cái nơ
cái nón
mũ bảo hiểm
kẹp tóc
dây chuyền
vòng tay
túi xách
cái xẻng
cái cuốc
cái liềm
tua vít
cờ lê
cái bơm
sợi dây
xe cút kít
hàng rào
mái nhà
ống khói
cái giếng
cầu thang
cột điện
đèn giao thông
biển báo
hộp thư
thùng rác
ghế đá
vòi nước
vòi hoa sen
bồn tắm
bồn cầu
bồn rửa mặt
khăn tắm
xà phòng
chai dầu gội
tuýp kem đánh răng
cuộn giấy vệ sinh
cái điều khiển
bàn phím
chuột máy tính
màn hình
máy in
đèn bàn
đèn pin
dây điện
phích cắm
đồng hồ báo thức
tờ lịch
cái bảng
viên phấn
bút màu
hộp bút
cái compa
quyển vở
tờ giấy
phong bì
con tem
cái dập ghim
cuộn băng dính
lọ keo
gọt bút chì
cặp sách
quả cầu lông
hình tròn
hình vuông
hình tam giác
hình chữ nhật
hình thoi
hình lục giác
dấu cộng
dấu hỏi
dấu chấm than
dấu nhân
hòn đá
viên sỏi
bãi cát
bãi biển
bãi cỏ
bụi cây
cây thông
cây tre
hoa hồng
hoa sen
hoa cúc
hoa ly
hoa tulip
hoa súng
hoa giấy
cỏ ba lá
cành cây
gốc cây
rễ cây
hạt giống
mầm cây
khúc gỗ
sương mù
giọt sương
tảng băng
đá lạnh
hành tinh
sao Thổ
vệ tinh
sao chổi
mái tóc
cái lưỡi
móng tay
cái rốn
đầu gối
khuỷu tay
cái lưng
cái bụng
bộ râu
ria mép
lông mày
lông mi
khúc xương
bộ xương
dấu chân
thuyền buồm
ca nô
xe cứu hoả
xe cảnh sát
xe taxi
xe xúc
xe cẩu
xe tăng
máy kéo
xe trượt tuyết
ván trượt
tàu thuỷ
du thuyền
xe điện
xe bồn
xe rác
xe đua
xe ba bánh
xe đạp ba bánh
giày patin
con quay
búp bê
gấu bông
trò xếp hình
hòn bi
con lật đật
súng nước
chong chóng
mặt nạ
cây sáo
đàn violin
kèn trumpet
xe đồ chơi
lego
bong bóng xà phòng
tháp cát
lâu đài cát
toà nhà
chung cư
nhà gỗ
nhà trên cây
chuồng gà
chuồng chó
túp lều
quả bóng bàn
vợt bóng bàn
cây gậy
cây chổi lau nhà
cây lau nhà
cái ghế đẩu
ghế bành
cái bàn học
cái võng lưới
thùng carton
cái túi ni lông
ống hút
cái cốc giấy
cái ly rượu
cái bình
bình nước
bình tưới cây
chậu cây
chậu hoa
cái lồng chim
lồng đèn giấy
cái chuông gió
hộp nhạc
quân bài
con xúc xắc
cái đồng xu
tờ tiền
con heo đất
bút bi
bút lông
bút dạ quang
cái quạt giấy
cái quạt nan
chiếc lá phong
hoa bồ công anh
cây thường xuân
cây liễu
cây phượng
cây mía
cây bonsai
giàn hoa
vườn rau
luống hoa
cái chuồng thỏ
cái bể cá
cái lồng
cái bát ăn của mèo
khúc xương chó
cuộn len
kim đan
cái kéo cắt tóc
cái dao cạo
bàn chải tóc
lọ nước hoa
son môi
cái gương tay
kính bơi
mũ bơi
áo phao
áo len cổ lọ
áo sơ mi
áo phông
quần bò
cái tạp dề
đôi ủng
giày cao gót
dép lê
giày thể thao
mũ len
mũ lưỡi trai
mũ phù thuỷ
cái băng đô
cái khẩu trang
cái kính lặn
cái ô che nắng
áo choàng
váy công chúa
bộ đồ ngủ
cái yếm
cái tã
bình sữa
núm vú giả
xe tập đi
con vịt cao su
cái xô cát
cái xẻng nhựa
cái lều trại
túi ngủ
đống lửa trại
cái đèn dầu
cái ấm đun nước
cái nồi áp suất
cái chảo chống dính
cái vỉ nướng
xiên nướng
que diêm
hộp diêm
bao gạo
bao tải
cái cân đồng hồ
dây nhảy
vòng hula hoop
cái cầu thăng bằng
xe trượt scooter
xe đạp đôi
xe lôi
cái phà
chiếc xuồng
mái chèo
cái phao bơi
lưới đánh cá
cần câu
lưỡi câu
ngôi sao biển
san hô
rong biển
hòn đảo nhỏ
cái cối xay
cối xay lúa
bờ tre
đống rơm
bù nhìn rơm
ruộng lúa
cánh đồng
cái ao cá
cái giếng nước
cái thớt gỗ
hũ muối
lọ tiêu
chai nước mắm
chai dầu ăn
lọ đường
gói mì
hộp sữa chua
hộp kem
que kem
cốc kem
bánh mì kẹp
bánh bao chay
bánh tiêu
bánh chuối
bánh khoai
bánh ngô
bánh gạo
bánh phồng
bánh quế
bánh cá
bánh hình gấu
kẹo dẻo
kẹo cao su
kẹo bạc hà
kẹo lạc
kẹo dừa
sữa đậu nành
nước chanh
nước dừa
nước ép táo
cốc cà phê
hộp bánh
hộp pizza
túi bỏng
xúc xích nướng
bắp nướng
khoai lang nướng
trứng vịt lộn
ngô luộc
lạc rang
dưa hấu cắt miếng
đĩa trái cây
giỏ trái cây
giỏ hoa
bó hoa
vòng hoa
cái thiệp
tấm thiệp
lá thư
tấm ảnh
khung ảnh
album ảnh
bức tranh
giá vẽ
bảng màu
cọ vẽ
hộp màu nước
bút sáp
cái ê ke
thước đo độ
lọ hoa
bình gốm
cái thảm chùi chân
cái chuông cửa
khoá cửa
tay nắm cửa
ổ khoá số
móc chìa khoá
cái két
cái hộp đựng giày
giá giày
cái bếp
bếp than
lò sưởi
cái ống nước
cái bồn nước
cột ăng ten
cái đèn đường
đèn nháy
đèn led
cái đèn ngủ
đèn chùm
cây đèn cầy
que hương
hộp trang sức
viên ngọc trai
vỏ ốc
cái kẹp giấy
cái bấm lỗ
tập giấy nhớ
tờ giấy nhớ
cuốn lịch
cái đồng hồ treo tường
đồng hồ đeo tay
đồng hồ quả lắc
cái cân sức khoẻ
cái nhiệt kế
cái ống nghe
hộp sơ cứu
viên thuốc
lọ thuốc
miếng dán
băng gạc
cái bông ngoáy tai
cái tăm bông
dây giày
cái cúc áo
cái khoá kéo
cái móc áo
cái mắc áo
cái giá phơi
dây phơi
cái kẹp phơi đồ
máy sấy
quạt điện
quạt trần
máy hút bụi
bếp từ
máy xay sinh tố
ấm siêu tốc
chiếc bút máy
lọ mực tím
cái bảng trắng
bút lông bảng
loa thùng
cái radio
ăng ten tivi
máy chơi game cầm tay
tay cầm chơi game
con robot đồ chơi
máy bay giấy
thuyền giấy
con hạc giấy
ngôi sao giấy
dây ruy băng
hộp quà nhỏ
nón sinh nhật
bánh cupcake
cây nến sinh nhật
cái lồng đèn cá chép
con thú nhồi bông
con ngựa gỗ
xích đu gỗ
cái bập bênh gỗ
cầu trượt nước
bể bơi phao
cái phao tròn
cái bóng bãi biển
cái ô bãi biển
ghế bãi biển
cái mũ rơm
giỏ đi chợ
xe đẩy siêu thị
cái làn
cái túi vải
gói hàng
thùng hàng
cái hộp gỗ
cái rương
cái tủ gỗ
tủ giày
cái ghế gấp
cái bàn gấp
cái bàn tròn
cái bàn trà
cái ghế sofa
cái giường đôi
giường tầng
cái gối ôm
cái chăn bông
tấm ga giường
cái mền
cái chiếu
cái thảm yoga
cái võng xếp
cái rèm cửa
cửa cuốn
cửa kính
cái ban công
cái sân
cái vườn
cái hiên
nhà vệ sinh
cái công tắc
bóng đèn tuýp
đèn sân vườn
máy bơm nước
cái vòi tưới
cái thang gấp
máy xúc
xe ben
xe khách
xe buýt hai tầng
xe tải nhỏ
xe mô tô
xe đạp điện
xe máy điện
xe đạp thể thao
mũ xe đạp
chuông xe đạp
cái yên xe
tay lái
cái lốp
cái vô lăng
đèn pha
gương chiếu hậu
biển số xe
cái cần gạt nước
bình xăng
cây xăng
bến xe buýt
vạch kẻ đường
cái cầu nhỏ
đường ray
đoàn tàu
toa tàu
tàu điện
thang máy
xe kéo
xe ngựa
xe bò
xe trâu
con cún
con bướm đêm
con sâu ăn lá
con cào cào
con bọ cánh cứng
con ong mật
con cá bống
con cá mè
con cá lóc
con cá diếc
con cá hồi
con cá ngừ
con cá cơm
con nhái
con chim én
con chim sáo
con chim gõ kiến
con chim ruồi
con chim cút
con gà tây
con chuột đồng
con rùa biển
con rắn nước
con tôm càng
con cua biển
con ốc bươu
con hến
con ngao
con trai biển
con giun đất
cây kim khâu
quả dừa xiêm
đôi bông tai
cổng sắt
quả bơ sáp
củ hành tây
rổ rau
sóng biển
ngón tay cái
con rối dây
con dế mèn
con báo hoa mai
muôi múc canh
tạ tay
hồ nước
quả bóng chày
quả bóng bầu dục
quả bóng tennis
cái vợt
cây gậy bóng chày
cầu môn
lưới bóng chuyền
cái huy chương
cái cúp
cờ đuôi nheo
pháo giấy
bánh xe đạp
cái nan hoa
cái bàn đạp
cái phanh
xích xe đạp
con chim hồng hạc
con lạc đà một bướu
con hươu sao
con sơn dương
con linh dương
con bò rừng
con lợn rừng
con chó đốm
con chó săn
con cá mặt trăng
con cá nóc
con cá hề
con cá bảy màu
con tôm sú
con cua ẩn sĩ
con ốc mượn hồn
hũ mật ong
lọ mứt
miếng bơ
lát bánh mì
bánh mì nướng
quả trứng chiên
bát mì
nồi lẩu
đĩa cơm rang
miếng dưa hấu
quả chanh leo
quả cam sành
quả táo xanh
quả lê nâu
buồng chuối
quả mít non
cây nấm độc
nấm rơm
nấm kim châm
quả đậu bắp
quả đậu Hà Lan
cây su hào
cây cần tây
rau mùi
lá chuối
lá sen
quả ớt chuông
quả bí xanh
cây khoai môn
bông cải xanh
cái chổi rơm
cái chổi quét sân
cái hót rác
giẻ lau
miếng bọt biển
cái chậu nhựa
cái ca nhựa
cái gáo dừa
cái thau
cái giá bát
cái rổ nhựa
cái lồng bàn
cái bếp ga mini
cái nồi đất
cái ấm sắt
cái phin cà phê
cái ly thuỷ tinh
cái cốc sứ
cái tách
cái bình trà
cái chén
cái đĩa sứ
cái dĩa ăn
cái khăn ăn
cái mở nắp chai
cái nút chai
cái nắp chai
cái thìa gỗ
cái thìa nhựa
hộp nhựa
hộp đựng cơm
túi giữ nhiệt
bình giữ nhiệt
cái phễu
cái cân bàn
cây lăn bột
khuôn bánh
cái đánh trứng
cái rây bột
găng tay nhà bếp
tạp dề đầu bếp
mũ đầu bếp
cái vỉ ruồi
cái bẫy chuột
cái lồng gà
cái máng ăn
cái bát chó
dây xích chó
vòng cổ chó
cái ổ mèo
cát vệ sinh mèo
cục len cho mèo
cái cần câu mèo
cái lồng hamster
bánh xe hamster
cái bể thuỷ sinh
cái lưới vợt cá
viên đá cuội
`;

const MEDIUM = `
con công
con hạc
chim cánh cụt
con cá sấu
con chuột túi
con gấu trúc
con lạc đà
con tê giác
con hà mã
con ngựa vằn
con hải cẩu
con cá heo
con sóc
con nhím
con tắc kè
con chuồn chuồn
con bọ cạp
con khủng long
con kỳ lân
con rồng
con sao biển
con cá ngựa
con vẹt
con đà điểu
con hươu cao cổ
kính lúp
nam châm
la bàn
đồng hồ cát
máy ảnh
tai nghe
cái micro
cái loa
cục pin
ổ cắm điện
máy sấy tóc
bàn là
nồi cơm điện
lò vi sóng
xe đẩy
xe lăn
cái võng
cầu trượt
xích đu
bập bênh
cái lều
va li
bản đồ
quả địa cầu
rương báu
thanh kiếm
cái khiên
cung tên
nàng tiên cá
ông già Noel
cây thông Noel
bánh sinh nhật
pháo hoa
đèn lồng
bánh chưng
áo dài
nón lá
bánh xèo
trà sữa
bánh trung thu
hoa mai
hoa đào
bao lì xì
múa lân
đèn ông sao
ruộng bậc thang
xích lô
bệnh viện
trường học
lâu đài
kim tự tháp
tháp Eiffel
cối xay gió
ngọn hải đăng
sân bóng
rạp xiếc
sở thú
siêu thị
cây cầu
thác nước
núi lửa
sa mạc
hang động
bác sĩ
cảnh sát
lính cứu hoả
đầu bếp
phi hành gia
cướp biển
ninja
chú hề
thợ lặn
nông dân
siêu nhân
ma cà rồng
người ngoài hành tinh
đĩa bay
xe cứu thương
tàu ngầm
khinh khí cầu
bánh xe
con bù nhìn
phù thuỷ
quả bí ngô
bánh bao
xúc xích
gà rán
hamburger
khoai tây chiên
mì tôm
cà phê
nước mía
cái kèn
đàn piano
trống cơm
ống nhòm
kính râm
máy giặt
cái thớt
cái ấm
cái cân
bình hoa
lọ mực
cái đinh
cái rìu
cái kìm
con ốc vít
con tôm hùm
con cá đuối
cái gáo
cái chum
cái chày
cái van
cái téc nước
máy pha cà phê
lò nướng bánh mì
máy rửa bát
đĩa CD
băng cát xét
máy nghe nhạc
cái gác mái
cái hầm
cái nhà kho
cái gara
phòng tắm
phòng bếp
phòng ngủ
phòng khách
cái hành lang
cái cầu dao
xe nâng
xe lu
xe trộn bê tông
xe container
xe bán tải
trạm sạc
cột mốc
đầu máy
cáp treo
thang cuốn
cửa tự động
con cá kiếm
con cá chuồn
con chim khuyên
con chim chào mào
con chim họa mi
con gà ác
con chim công
con chim yến
con dơi quả
con chuột lang
con sóc chuột
con kỳ nhông
con trăn
con chồn
con rái cá
con hải ly
con sư tử biển
con hải mã
con hàu
con linh cẩu
con báo săn
con tinh tinh
con đười ươi
con khỉ đột
con gấu túi
con thú mỏ vịt
con kỳ đà
con rắn hổ mang
con tê tê
con bò tót
con tuần lộc
con nai sừng tấm
con voi ma mút
khủng long bạo chúa
con phượng hoàng
con nhân sư
con ngựa có cánh
con chim bói cá
con bồ nông
con hải âu
con nhím biển
con sam
con ba ba
con bọ hung
con ong bắp cày
con cá voi sát thủ
con gấu bắc cực
con cáo tuyết
con cú tuyết
con sói đồng cỏ
con chim ưng
con kền kền
con chim cắt
con vẹt đuôi dài
con cá piranha
con lươn điện
con mực khổng lồ
con cua hoàng đế
con tôm tít
con cá rồng
con cá koi
con kỳ giông
con rồng Komodo
con thằn lằn bay
con chuột chũi
con báo tuyết
con cầy mangut
con linh miêu
con trâu rừng
kính hiển vi
kính thiên văn
ống nghiệm
ống tiêm
cái nạng
cáng cứu thương
bình chữa cháy
vòi cứu hoả
chuông báo cháy
camera an ninh
két sắt
cây ATM
thẻ ngân hàng
máy bán hàng tự động
máy xay thịt
nồi chiên không dầu
máy hút mùi
máy lọc nước
bình nóng lạnh
bếp ga
máy cạo râu
máy khâu
móc treo quần áo
giá sách
tủ quần áo
bàn trang điểm
ghế xoay
bàn bi a
bàn bóng bàn
khung thành
cột cờ
máy khoan
cưa máy
mỏ hàn
xà beng
thước dây
máy chơi game
kính thực tế ảo
đồng hồ thông minh
máy tính bảng
máy tính xách tay
cái USB
ổ cứng
cục phát wifi
máy chiếu
máy quay phim
máy bay không người lái
cục sạc
sạc dự phòng
dây cáp sạc
chảo vệ tinh
robot hút bụi
máy photocopy
máy fax
máy quét mã vạch
máy tính tiền
máy chấm công
bộ đàm
điện thoại bàn
điện thoại cục gạch
đèn kéo quân
đèn neon
đèn chiếu sáng sân khấu
máy tạo khói
quả cầu disco
máy đánh chữ
máy may
xe đẩy hàng
xe bò kéo
xe ngựa kéo
xe tuk tuk
xe jeep
xe limousine
xe mui trần
xe cổ
xe đầu kéo
xe phun nước
xe quét đường
xe chở tiền
xe kem
xe bánh mì
xe hủ tiếu
thuyền thúng
thuyền kayak
thuyền rồng
tàu cánh ngầm
tàu sân bay
tàu cướp biển
tàu Titanic
tàu chở hàng
tàu kéo
bè chuối
phao cứu sinh
mỏ neo tàu
bánh lái
cánh buồm
kính tiềm vọng
dù lượn
tàu lượn
máy bay chiến đấu
trạm vũ trụ
tàu con thoi
xe tự hành mặt trăng
bộ đồ phi hành gia
mũ phi hành gia
vệ tinh nhân tạo
lỗ đen
dải ngân hà
sao Hoả
sao Mộc
chòm sao
kính viễn vọng
đài thiên văn
chợ nổi
nhà thờ
ngôi chùa
ngôi đền
Văn Miếu
chùa Một Cột
Hồ Gươm
tháp Rùa
vịnh Hạ Long
cầu Rồng
cầu Vàng
chợ Bến Thành
phố cổ Hội An
cầu Long Biên
Nhà hát Lớn
cột cờ Hà Nội
Tượng Nữ thần Tự do
Vạn Lý Trường Thành
đấu trường La Mã
tháp nghiêng Pisa
nhà hát Opera Sydney
tháp Big Ben
tượng Chúa cứu thế
núi Phú Sĩ
đảo Phục Sinh
đền Taj Mahal
cầu Cổng Vàng
sân bay
nhà ga
bến xe
bến cảng
trạm xăng
tiệm cắt tóc
tiệm bánh
hiệu thuốc
ngân hàng
bưu điện
thư viện
bảo tàng
rạp chiếu phim
công viên nước
khu vui chơi
vòng đu quay
tàu lượn siêu tốc
đu quay ngựa gỗ
nhà ma
mê cung
sân trượt băng
bể bơi
phòng gym
sân golf
sân vận động
nhà thi đấu
trạm cứu hoả
đồn công an
nhà tù
toà án
trường mầm non
nhà trẻ
ký túc xá
khách sạn
nhà nghỉ
khu cắm trại
trang trại
nông trại
vườn cây ăn quả
vườn thú
thuỷ cung
nhà kính
vườn bách thảo
khu rừng
rừng tre
rừng thông
rừng mưa
đầm lầy
ốc đảo
thảo nguyên
sông băng
hẻm núi
bãi đá
rạn san hô
đáy biển
miệng núi lửa
suối nước nóng
mạch nước phun
cồn cát
bờ biển
vách đá
cửa hang
hang băng
thung lũng
đỉnh núi
ngã tư
vòng xuyến
cầu vượt
đường hầm
đường cao tốc
bãi đỗ xe
trạm thu phí
bến phà
hải cảng
nhà máy
công trường
giàn khoan
nhà máy điện gió
tấm pin mặt trời
đập thuỷ điện
tháp nước
cột phát sóng
hoàng tử
công chúa
nhà vua
hoàng hậu
hiệp sĩ
cao bồi
xác ướp
thây ma
người sói
yêu tinh
người khổng lồ
chú lùn
nàng tiên
thiên thần
ác quỷ
thần đèn
thần Cupid
thần sấm
nữ thần
Thánh Gióng
ông Táo
ông Bụt
chú Cuội
chị Hằng
Tôn Ngộ Không
Trư Bát Giới
Đường Tăng
Thạch Sanh
cô Tấm
Lọ Lem
Bạch Tuyết
Pinocchio
Robin Hood
vua Hùng
Lạc Long Quân
Âu Cơ
Mai An Tiêm
Sọ Dừa
giáo viên
y tá
nha sĩ
thợ xây
thợ điện
thợ mộc
thợ may
thợ cắt tóc
ca sĩ
vũ công
hoạ sĩ
nhiếp ảnh gia
phóng viên
phi công
thuyền trưởng
tài xế
người giao hàng
bồi bàn
người đưa thư
ngư dân
thợ săn
kỹ sư
nhà khoa học
lập trình viên
thám tử
bộ đội
lính gác
vệ sĩ
thẩm phán
luật sư
thủ môn
võ sĩ
đô vật
vận động viên
lao công
thợ sửa xe
thợ khoá
thợ ống nước
thợ mỏ
nhân viên cứu hộ
người mẫu
hướng dẫn viên du lịch
tiếp viên hàng không
thu ngân
dược sĩ
bác sĩ thú y
nhà ảo thuật
diễn viên hài
người dẫn chương trình
nhạc trưởng
nhà văn
nhà sư
linh mục
người bán hàng rong
bà bán xôi
bác xe ôm
người gác cổng
người làm vườn
người chăn cừu
người nuôi ong
thợ lặn biển
thợ rèn
thợ gốm
thợ kim hoàn
thợ sơn
thợ làm bánh
người trông trẻ
nhân viên văn phòng
giám đốc
thư ký
kế toán
streamer
youtuber
phở bò
bún chả
bún bò Huế
bánh cuốn
bánh căn
bánh khọt
gỏi cuốn
nem rán
cơm tấm
hủ tiếu
mì Quảng
cao lầu
bánh canh
cháo lòng
xôi gấc
bánh giò
bánh đúc
bánh da lợn
bánh tét
bánh ít
bánh bèo
bánh tráng trộn
bánh bột lọc
chè thập cẩm
chè trôi nước
sữa chua nếp cẩm
trà đá
sinh tố bơ
kem ốc quế
sushi
mì ramen
cơm cuộn
bánh gạo cay
bánh taco
bánh crepe
bánh waffle
bánh sừng bò
bánh macaron
bánh tiramisu
bánh flan
thạch rau câu
kẹo hồ lô
mứt Tết
hạt dưa
bánh đa
bánh phồng tôm
ốc luộc
vịt quay
heo quay
gà luộc
cá kho tộ
canh chua
đậu phụ
nem chua
giò lụa
chả cá
bánh bao nhân thịt
bánh pía
bánh cốm
cốm làng Vòng
bún riêu
bún đậu mắm tôm
bún thang
bánh mì pate
bánh mì chảo
cơm gà
cơm lam
lợn quay
thịt kho trứng
dưa hành
củ kiệu
cá viên chiên
bò bía
bánh tráng nướng
bánh bò
chè bưởi
tào phớ
sữa đậu
trà chanh
nước sấu
cà phê trứng
cà phê muối
cà phê sữa đá
bạc xỉu
trà đào
trà tắc
sương sáo
kem xôi
bánh hỏi
cháo vịt
lẩu thái
lẩu nấm
gà nướng
thịt xiên nướng
hải sản nướng
tôm nướng
mực nướng
bánh tôm Hồ Tây
nem nướng
bò lá lốt
chả giò rế
cây nêu
câu đối đỏ
bàn thờ
mâm ngũ quả
tràng pháo
con tò he
diều sáo
trống đồng
đàn bầu
đàn tranh
đàn nguyệt
sáo trúc
nón quai thao
khăn rằn
áo bà ba
áo tứ thân
guốc mộc
quạt mo
chiếu cói
cối giã gạo
mái đình
cổng làng
lũy tre
nhà sàn
nhà rông
giếng làng
bến đò
con đò
hoa sen hồng
hoa ban
hoa tam giác mạch
hoa gạo
hoa sữa
hoa lộc vừng
hoa phượng
mặt nạ Trung thu
múa rối nước
ông Địa
bánh trôi
bánh chay
bánh phu thê
trầu cau
mâm cỗ
nồi bánh chưng
lá dong
đầu lân
cá chép hoá rồng
ông đồ
chữ thư pháp
tranh Đông Hồ
đèn hoa đăng
kèn saxophone
đàn hạc
đàn accordion
đàn ukulele
kèn harmonica
chũm choẹ
bộ trống jazz
đàn organ
cái mõ
cái chiêng
cồng chiêng
đàn tỳ bà
đàn nhị
kèn bầu
đàn xylophone
đàn cello
đàn contrabass
kèn clarinet
kèn túi
cái tam giác nhạc cụ
đàn piano điện
đĩa than
máy hát đĩa
vợt cầu lông
gậy golf
găng đấm bốc
xà đơn
xà kép
ván lướt sóng
giày trượt băng
gậy khúc côn cầu
bao cát đấm bốc
võ đài
bảng phi tiêu
phi tiêu
cung nỏ
ná cao su
cây giáo
cây đinh ba
đại bác
áo giáp
đũa thần
chổi phù thuỷ
quả cầu pha lê
thảm bay
đèn thần
nồi thuốc phép
cuốn sách phép
mũ tàng hình
gậy phép
cỗ xe bí ngô
giày thuỷ tinh
táo độc
gương thần
lâu đài băng
tháp công chúa
cây đậu thần
con ngỗng đẻ trứng vàng
hũ vàng
bản đồ kho báu
chiếc thuyền ma
đầu lâu xương chéo
cái cân công lý
huy hiệu cảnh sát
còng tay
đèn cảnh sát
còi trọng tài
thẻ đỏ
thẻ vàng
bảng tỉ số
cúp vàng
huy chương vàng
bục nhận giải
thảm đỏ
tượng vàng Oscar
máy quay
ghế đạo diễn
máy karaoke
sân khấu
tấm rèm sân khấu
bóng đèn sân khấu
loa phát thanh
máy đo huyết áp
máy chụp X-quang
xe đẩy bệnh viện
giường bệnh
túi truyền dịch
mặt nạ oxy
bình oxy
xe đẩy em bé
ghế ăn dặm
cũi trẻ em
cầu trượt bơm hơi
nhà bóng
nhà phao
cánh đồng cỏ
chậu quất
cái cày ruộng
con lười ba ngón
con chim cánh cụt hoàng đế
con cá mập trắng
con cá voi lưng gù
con mòng biển
con chim sơn ca
con cò trắng
con sếu đầu đỏ
con chim đà điểu châu Úc
con chim hồng tước
con lợn lòi
con heo vòi
con báo gấm
con sóc bay
con khỉ đuôi dài
con cá thần tiên
con cá chim
con cá bơn
con cá mú
con lươn đồng
con ếch cây
con kỳ lân biển
con sư tử đá
con rồng đá
con rùa đội bia
con hạc đồng
con nghê
con quái vật hồ Loch Ness
người cá
nhân mã
con rồng lửa
quan tài
lăng mộ
hầm mộ
tượng sáp
tượng đồng
tượng đài
đài phun nước
vòi phun nước
cột đá
cổng chào
khải hoàn môn
toà thị chính
nhà quốc hội
lâu đài cổ tích
tháp canh
pháo đài
tường thành
hào nước
cầu treo
cầu khỉ
cầu tre
đường mòn
lối đi bộ
vỉa hè
quầy hàng
sạp báo
ki ốt
quầy bar
quán cà phê
quán trà sữa
nhà hàng
quán phở
quán nhậu
quán karaoke
tiệm vàng
tiệm hoa
tiệm sách
tiệm giặt là
tiệm sửa xe
tiệm tạp hoá
cửa hàng tiện lợi
trung tâm thương mại
chợ đêm
chợ hoa
chợ cá
lò bánh mì
lò gạch
xưởng gỗ
xưởng may
lò rèn
ruộng muối
lồng bè
nhà nổi
làng chài
làng gốm
bến thuyền
ngọn tháp
gác chuông
nhà nguyện
thánh đường
nhà hát múa rối
rạp hát
sân khấu ngoài trời
quảng trường
công viên
vườn hoa
khu phố
con hẻm
chung cư cũ
biệt thự
nhà phố
nhà ống
nhà cấp bốn
nhà chòi
lều tuyết
lều da đỏ
nhà container
nhà di động
xe cắm trại
toa xe lửa
ga tàu điện ngầm
tàu điện ngầm
tàu cao tốc
tàu hơi nước
đường sắt trên cao
xe buýt điện
xe buýt trường học
xe chở rác
xe cứu hộ
xe kéo xe
xe tưới cây
xe máy cày
máy gặt lúa
máy cấy
máy phát điện
máy nén khí
máy hàn
máy mài
máy tiện
máy in 3D
cánh tay robot
băng chuyền
dây chuyền sản xuất
kho hàng
pallet gỗ
thùng phi
thùng container
cái cẩu tháp
giàn giáo
mũ bảo hộ
áo phản quang
cọc tiêu
rào chắn
biển công trường
hố ga
nắp cống
đường ống nước
trụ cứu hoả
cột thu lôi
bộ pin
bình ắc quy
máy đo nhiệt độ
cân điện tử
máy sấy quần áo
máy giặt cửa ngang
bàn là hơi nước
máy hút ẩm
máy tạo độ ẩm
máy lọc không khí
máy massage
ghế massage
bồn sục
phòng xông hơi
máy chạy bộ
xe đạp tập
ghế tập tạ
thảm tập
bóng tập yoga
dây kháng lực
con lắc Newton
khối rubik
bộ cờ vua
bàn cờ tướng
bàn cờ caro
bộ bài Tây
cờ cá ngựa
cờ tỷ phú
bộ domino
trò xếp gỗ
mô hình máy bay
mô hình tàu
`;

const HARD = `
đánh răng
tắm biển
câu cá
nhảy dây
thả diều
đá bóng
bơi lội
trượt tuyết
leo núi
cắm trại
nấu ăn
ngủ gật
hắt hơi
khóc nhè
nhảy múa
hát karaoke
chụp ảnh
tự sướng
đi chợ
rửa bát
phơi quần áo
quét nhà
tưới cây
gội đầu
cắt tóc
xếp hàng
kẹt xe
mất điện
động đất
sóng thần
nhật thực
sao băng
cơn bão
lũ lụt
cầu thủ
trọng tài
đám cưới
sinh nhật
Tết Nguyên Đán
Trung thu
cờ vua
kéo co
ô ăn quan
nhảy lò cò
trốn tìm
bịt mắt bắt dê
oẳn tù tì
chơi game
xem phim
thức khuya
say xe
ngủ nướng
đi muộn
thất tình
mật khẩu
sóng wifi
trọng lực
giấc mơ
cái bóng
tiếng vang
nụ hôn
cái ôm
vỗ tay
bắt tay
giơ tay
quỳ gối
chạy bộ
tập thể dục
đạp xe
lướt sóng
nhảy dù
bắn cung
đấu kiếm
đánh cầu lông
bóng rổ
bóng chuyền
quần vợt
đua xe
ảo thuật
xiếc thú
hoà nhạc
diễn kịch
mặc cả
trả góp
tiết kiệm
lương tháng
deadline
họp online
làm việc tại nhà
học bài
thi cử
tốt nghiệp
xin việc
phỏng vấn
thổi nến
cắt bánh kem
gói quà
mở quà
gói bánh chưng
chúc Tết
mừng tuổi
xem pháo hoa
rước đèn
phá cỗ
ngắm trăng
đi lễ chùa
hái lộc
dọn nhà đón Tết
thức dậy
rửa mặt
chải tóc
trang điểm
cạo râu
thay quần áo
buộc dây giày
ăn sáng
uống nước
đi làm
đón con
đưa con đi học
nấu cơm
rán trứng
thái rau
gọt hoa quả
luộc trứng
pha cà phê
pha trà
rót nước
giặt đồ
gấp quần áo
là quần áo
dọn giường
đổ rác
tắm mưa
ngáp
ngủ trưa
ngáy
mộng du
ác mộng
đếm cừu
tức giận
vui sướng
buồn bã
sợ hãi
ngạc nhiên
xấu hổ
ghen tị
chán nản
lo lắng
bối rối
hồi hộp
mệt mỏi
no căng bụng
khát nước
đau bụng
đau đầu
sốt cao
cảm cúm
ho sù sụ
chảy máu cam
gãy chân
bó bột
tiêm phòng
nhổ răng
trồng cây
nhổ cỏ
gặt lúa
chăn trâu
vắt sữa bò
cho gà ăn
thả lưới
đào giếng
xây nhà
sơn tường
sửa xe
thay lốp
bơm xe
đổ xăng
rửa xe
lái xe
đỗ xe
vượt đèn đỏ
sang đường
đi bộ
chạy marathon
nhảy xa
nhảy cao
ném lao
đẩy tạ
chạy tiếp sức
chạy vượt rào
nhảy cầu
bơi bướm
bơi ếch
lặn biển
chèo thuyền
đua thuyền
trượt patin
trượt băng
đánh golf
khúc côn cầu
đấm bốc
vật tay
đá cầu
nhảy bao bố
bịt mắt đập niêu
ném còn
đánh đu
đi cà kheo
chọi gà
đấu vật
múa sạp
nhảy sạp
leo cột mỡ
rồng rắn lên mây
mèo đuổi chuột
chơi chuyền
nhảy dây tập thể
đánh khăng
thả đèn trời
thả hoa đăng
đốt pháo
Sơn Tinh Thuỷ Tinh
sự tích Hồ Gươm
Tấm Cám
con Rồng cháu Tiên
bánh chưng bánh giầy
rùa và Thỏ
cô bé quàng khăn đỏ
ba chú heo con
vịt con xấu xí
Aladdin và cây đèn thần
Alibaba và bốn mươi tên cướp
Jack và cây đậu thần
ông lão đánh cá và con cá vàng
chú Cuội cung trăng
quạ và bình nước
cáo và chùm nho
người đẹp và quái vật
nàng công chúa ngủ trong rừng
cô bé bán diêm
hoàng tử ếch
bộ quần áo mới của hoàng đế
gã thổi sáo thành Hamelin
Mị Châu Trọng Thuỷ
sự tích dưa hấu
sự tích trầu cau
sự tích cây vú sữa
thầy bói xem voi
ếch ngồi đáy giếng
đàn gảy tai trâu
nước đổ đầu vịt
há miệng chờ sung
cưỡi ngựa xem hoa
mèo mù vớ cá rán
đẽo cày giữa đường
vẽ rắn thêm chân
nước chảy đá mòn
có công mài sắt có ngày nên kim
ăn quả nhớ kẻ trồng cây
uống nước nhớ nguồn
gậy ông đập lưng ông
ném đá giấu tay
mò kim đáy bể
nuôi ong tay áo
đứng núi này trông núi nọ
cá lớn nuốt cá bé
đầu voi đuôi chuột
mỡ để miệng mèo
thả hổ về rừng
rung cây doạ khỉ
vắt chanh bỏ vỏ
ôm cây đợi thỏ
nước đến chân mới nhảy
chuột sa chĩnh gạo
cõng rắn cắn gà nhà
múa rìu qua mắt thợ
lấy thúng úp voi
ăn cháo đá bát
có mới nới cũ
ngồi mát ăn bát vàng
như cá gặp nước
kiến tha lâu đầy tổ
tre già măng mọc
gần mực thì đen
một cây làm chẳng nên non
ăn cây nào rào cây ấy
chó cậy gần nhà
chạy như ma đuổi
nước mắt cá sấu
đi guốc trong bụng
mặt nặng mày nhẹ
đầu tắt mặt tối
chân lấm tay bùn
bán mặt cho đất bán lưng cho trời
vịt nghe sấm
chó ngáp phải ruồi
mẹ tròn con vuông
ngựa quen đường cũ
như nước đổ lá khoai
nói như rồng leo
con nhà tông không giống lông cũng giống cánh
lên voi xuống chó
treo đầu dê bán thịt chó
ăn như mèo
ngủ như heo
khoẻ như voi
chậm như rùa
nhanh như chớp
hiền như bụt
cao như sếu
nhát như thỏ
đen như cột nhà cháy
trắng như tuyết
ướt như chuột lột
nghèo rớt mồng tơi
tiền mất tật mang
mưa to gió lớn
sấm vang chớp giật
một nắng hai sương
lá lành đùm lá rách
ăn vóc học hay
tắc đường
mưa đá
cháy rừng
lở đất
bắc cực quang
trăng tròn
trăng khuyết
hoàng hôn
bình minh
đêm giao thừa
mưa sao băng
nguyệt thực
lốc xoáy
hạn hán
băng tan
ô nhiễm không khí
hiệu ứng nhà kính
nóng lên toàn cầu
rác thải nhựa
ngập lụt
nước triều cường
sương muối
tuyết rơi
nắng nóng
gió mùa
cầu vồng đôi
ảo ảnh sa mạc
livestream
chốt đơn
sống ảo
hết pin
mất sóng
tin nhắn
cuộc gọi nhỡ
gọi video
lướt mạng xã hội
thả tim
bình luận
chia sẻ bài viết
đặt đồ ăn
giao hàng nhanh
mua sắm online
quét mã QR
chuyển khoản
trúng số
rút tiền
săn sale
hoàn tiền
đánh giá năm sao
spam tin nhắn
bị hack
quên mật khẩu
cập nhật phần mềm
máy treo
màn hình xanh
sập mạng
hết dung lượng
sạc điện thoại
chụp màn hình
ghi âm
quay video
chỉnh ảnh
biên tập video
đăng bài
hủy kết bạn
chặn người lạ
nhắn tin trộm
seen không rep
thả biểu tượng cảm xúc
gửi sticker
gọi nhóm
họp phụ huynh
đi máy bay
lỡ chuyến bay
thất lạc hành lý
say sóng
chụp X-quang
khám bệnh
truyền nước
đo huyết áp
xét nghiệm máu
phẫu thuật
cấp cứu
sinh em bé
đeo khẩu trang
rửa tay
cách ly
ho và hắt hơi
thiền
chống đẩy
gập bụng
kéo xà
squat
plank
nhảy aerobic
đạp xe tại chỗ
leo cầu thang
chạy bộ buổi sáng
đi dạo công viên
dắt chó đi dạo
tắm cho chó
cắt móng tay
sơn móng tay
nhuộm tóc
uốn tóc
đắp mặt nạ
tẩy trang
xăm hình
bấm khuyên tai
ăn kiêng
tăng cân
giảm cân
ăn vặt
ăn buffet
uống trà sữa
đi nhậu
say rượu
cụng ly
hát hò
đi phượt
du lịch bụi
leo núi Fansipan
chèo SUP
cắm trại qua đêm
nướng thịt ngoài trời
ngắm sao
ngắm bình minh
câu mực đêm
lặn ngắm san hô
đi thuyền kayak
tắm suối
đi cáp treo
chơi tàu lượn
vào nhà ma
bắn súng nước
ném bóng nước
đắp người tuyết
ném tuyết
trượt ván tuyết
đi xe trượt tuyết
câu cá trên băng
làm bánh
nặn tượng
vẽ tranh tường
xếp origami
đan len
thêu thùa
cắm hoa
trồng rau
hái chè
hái nấm
đốn củi
bổ củi
nhóm lửa
nướng khoai
thổi cơm
kho cá
gói nem
cuốn chả giò
tráng bánh
xay bột
giã giò
muối dưa
phơi cá khô
phơi thóc
gánh nước
xách nước
giặt giũ bên sông
chèo đò
kéo lưới
đánh bắt cá
nuôi tằm
dệt vải
làm gốm
rèn sắt
đúc đồng
thổi thuỷ tinh
khắc gỗ
làm nón
viết thư pháp
cho chữ
đọc sách
viết nhật ký
làm bài tập
học nhóm
chép bài
nhìn bài
quay cóp
trốn học
bị phạt đứng
điểm danh
giơ tay phát biểu
chào cờ
tập thể dục giữa giờ
ra chơi
tan trường
nghỉ hè
khai giảng
bế giảng
thi đại học
nhận bằng
ném mũ tốt nghiệp
đi du học
ngủ gật trong lớp
lên bảng
kiểm tra miệng
nộp bài
chấm bài
họp lớp
đi dã ngoại
cắm trại trường
văn nghệ
thi hoa hậu
trình diễn thời trang
catwalk
chụp ảnh cưới
rước dâu
trao nhẫn
cắt bánh cưới
tung hoa cưới
đi trăng mật
cầu hôn
hẹn hò
tỏ tình
chia tay
cãi nhau
làm lành
nắm tay
đi xem phim
ăn tối dưới nến
tặng hoa
viết thư tình
ghen tuông
yêu xa
tiếng sét ái tình
mối tình đầu
đám hỏi
lễ thôi nôi
đầy tháng
tân gia
mừng thọ
họp mặt gia đình
về quê
đi chợ Tết
mua sắm Tết
cúng ông Công ông Táo
thả cá chép
xin chữ đầu năm
đi chúc Tết
xông nhà
bói bài
xem bói
rút quẻ
thắp hương
cầu nguyện
ước nguyện
ném đồng xu xuống giếng
thổi bồ công anh
ước sao băng
gieo xúc xắc
tung đồng xu
chơi bài
đánh cờ tướng
chơi cờ caro
xếp hình rubik
giải ô chữ
chơi tú lơ khơ
chơi bida
ném phi tiêu
bowling
chơi gắp thú
chơi điện tử
thua game
thắng giải
lên hạng
nạp thẻ
treo máy
đi rừng
ăn gà
chơi nhập vai
cosplay
hoá trang
hoá trang Halloween
cho kẹo hay bị ghẹo
khắc bí ngô
trang trí cây thông
ông già Noel phát quà
treo tất Giáng sinh
đếm ngược năm mới
bắn pháo giấy
mở sâm panh
nâng ly chúc mừng
biểu diễn xiếc
đi trên dây
tung hứng
nuốt kiếm
phun lửa
biến mất
cưa người
rút thỏ từ mũ
đoán bài
thôi miên
tàng hình
bay lượn
dịch chuyển tức thời
du hành thời gian
đánh nhau với rồng
giải cứu công chúa
săn kho báu
đào kho báu
lạc trên đảo hoang
đắm tàu
cướp ngân hàng
bắt trộm
truy đuổi
trốn thoát
vượt ngục
điều tra
tìm dấu vân tay
hỏi cung
xử án
bỏ phiếu
diễu hành
duyệt binh
hát quốc ca
tuyên thệ
ký hợp đồng
bắt tay thoả thuận
họp báo
phỏng vấn trực tiếp
đọc tin tức
dự báo thời tiết
tường thuật bóng đá
ghi bàn
phản lưới nhà
thẻ đỏ truất quyền
đá phạt đền
việt vị
bàn thắng vàng
ăn mừng bàn thắng
cổ vũ
hô khẩu hiệu
làn sóng khán giả
đi bão
hâm mộ thần tượng
xin chữ ký
chụp ảnh chung
xếp hàng mua vé
hết vé
phe vé
ngồi ghế VIP
đứng hàng đầu
mất ngủ
thức trắng
dậy sớm
báo thức reo
tắt báo thức
đi làm muộn
kẹt thang máy
chạy deadline
tăng ca
họp cả ngày
ngủ trên bàn làm việc
uống cà phê thức đêm
đau lưng
mỏi cổ
mỏi mắt
gõ phím
nghỉ phép
xin nghỉ ốm
thăng chức
tăng lương
bị sa thải
nghỉ việc
khởi nghiệp
gọi vốn
phá sản
làm giàu
chứng khoán
giá vàng
đổi tiền
đếm tiền
tiêu xài hoang phí
cháy túi
hết tiền
vay tiền
trốn nợ
cho vay
mua nhà
thuê nhà
chuyển nhà
sửa nhà
mất trộm
quên chìa khoá
khoá trái cửa
chuông cửa reo
hàng xóm ồn ào
mất nước
cúp điện
hỏng điều hoà
rò rỉ nước
tắc bồn cầu
gián bò
chuột chạy
muỗi đốt
ong đốt
chó cắn
mèo cào
bị ngã
trượt chân
va đầu
vấp ngã
bị bỏng
bị điện giật
đứt tay
sưng mắt
bị cận
đeo kính
niềng răng
sâu răng
hôi miệng
cười to
cười trộm
cười ra nước mắt
khóc thút thít
mếu máo
nhăn mặt
lè lưỡi
nháy mắt
nhún vai
gãi đầu
khoanh tay
chống nạnh
lắc đầu
gật đầu
vẫy tay
chỉ tay
giơ ngón cái
bắn tim
ôm bụng cười
đấm ngực
nhảy cẫng lên
lăn ra cười
nằm dài
duỗi người
vươn vai
ngồi xổm
ngồi bắt chéo chân
đứng một chân
trồng cây chuối
lộn nhào
nhào lộn
uốn dẻo
chẻ chân
đi bằng tay
múa ba lê
nhảy hip hop
nhảy break dance
nhảy tango
khiêu vũ
nhảy flashmob
hát đối đáp
hát quan họ
hát chèo
cải lương
ca trù
hát xẩm
đờn ca tài tử
múa rối
múa quạt
múa nón
múa lửa
thổi kèn
đánh đàn
kéo đàn
gõ trống
chơi nhạc cụ
chỉ huy dàn nhạc
thu âm
phối nhạc
đạo diễn phim
đóng phim
diễn viên đóng thế
quay cảnh nguy hiểm
cảnh quay chậm
hậu trường
thảm đỏ liên hoan phim
nhận giải thưởng
phát biểu cảm ơn
vỗ tay đứng dậy
thắp nến tưởng niệm
phút mặc niệm
ôm chầm
thì thầm
la hét
hét to
gào khóc
huýt sáo
hát ru
kể chuyện
đọc truyện cổ tích
ru con ngủ
thay tã
cho con bú
tập đi
tập nói
bập bẹ
bò lổm ngổm
mọc răng
đẩy xe nôi
cõng em
bế em
chơi trốn tìm
chơi đồ hàng
chơi bác sĩ
chơi cô giáo
xây lâu đài cát
thả thuyền giấy
gấp máy bay giấy
bắn bi
đánh quay
đá bóng ngoài ruộng
tắm sông
hái trộm ổi
trèo cây
ngã xe đạp
tập đi xe đạp
học bơi
đuối nước
cứu người đuối nước
hô hấp nhân tạo
sơ cứu
gọi cứu thương
chữa cháy
thoát hiểm
tập trận
hành quân
gác đêm
ngụy trang
đánh trận giả
bắn pháo
ném lựu đạn
lái xe tăng
nhảy dù từ máy bay
hạ cánh khẩn cấp
cất cánh
hạ cánh
phóng tên lửa
đi bộ ngoài không gian
đặt chân lên mặt trăng
cắm cờ trên mặt trăng
người ngoài hành tinh xâm lược
bị bắt cóc lên đĩa bay
thời kỳ đồ đá
người tiền sử
săn voi ma mút
vẽ tranh hang động
phát minh ra bánh xe
tìm ra lửa
hiệp sĩ đấu thương
đấu sĩ La Mã
cướp biển cướp tàu
đi trên ván gỗ
bỏ chai thư xuống biển
phát hiện châu Mỹ
tàu Titanic chìm
cách mạng công nghiệp
máy hơi nước
phát minh bóng đèn
quả táo rơi
thuyết tương đối
thí nghiệm hoá học
nổ phòng thí nghiệm
nhân bản vô tính
trí tuệ nhân tạo
robot nổi loạn
thực tế ảo
ngày tận thế
đại dịch zombie
trú ẩn dưới hầm
siêu anh hùng cứu thế giới
biến hình
phép thuật
lời nguyền
hoá giải lời nguyền
hôn để phá phép
nụ hôn đánh thức
cưỡi chổi bay
thả bùa
uống thuốc thu nhỏ
lạc vào xứ sở thần tiên
rơi xuống hang thỏ
ngủ một trăm năm
đổi giày lấy bí ngô
đánh rơi chiếc giày
đếm đến mười hai giờ
mười hai giờ đêm
bị hoá thành ếch
thả tóc qua cửa sổ
mũi dài ra khi nói dối
gỗ biết nói
đồ chơi biết đi
tủ quần áo dẫn sang thế giới khác
rút kiếm khỏi đá
bàn tròn hiệp sĩ
đánh bại người khổng lồ
ném đá bằng ná
đốn cây đậu thần
ăn khế trả vàng
may túi ba gang
chim ăn khế
mẹ đi chợ
bà kể chuyện
ông ngồi câu cá
bố đi làm về
con đi học về
gia đình ăn cơm tối
cả nhà xem tivi
tranh điều khiển tivi
giành đồ chơi
anh em cãi nhau
mẹ mắng
bố đánh đòn
ăn vụng
nói dối
hối lỗi
xin lỗi
tha thứ
cảm ơn
chào hỏi
tạm biệt
đưa tiễn ở sân bay
đón người thân
đoàn tụ
ly hôn
nuôi con một mình
nhận con nuôi
sinh đôi
giống nhau như đúc
soi gương
tự ngắm mình
làm duyên
làm nũng
giận dỗi
đóng cửa sầm
đi ra đi vào
đứng ngồi không yên
nóng như lửa đốt
mặt đỏ như gấc
tim đập thình thịch
run cầm cập
toát mồ hôi
nổi da gà
tóc dựng đứng
há hốc mồm
mắt chữ A mồm chữ O
ngậm bồ hòn làm ngọt
đội đá vá trời
lấy trứng chọi đá
dã tràng xe cát
đếm cua trong lỗ
nước xa không cứu được lửa gần
thùng rỗng kêu to
tốt gỗ hơn tốt nước sơn
ăn chắc mặc bền
thuận buồm xuôi gió
thắt lưng buộc bụng
ăn xổi ở thì
chim sa cá lặn
nghiêng nước nghiêng thành
mắt nhắm mắt mở
ba chân bốn cẳng
chân ướt chân ráo
dở khóc dở cười
được voi đòi tiên
một tấc đến trời
khẩu Phật tâm xà
ếch chết tại miệng
`;

const parse = (list: string) =>
  list
    .split("\n")
    .map((w) => w.trim())
    .filter(Boolean);

export const TIERS = [parse(EASY), parse(MEDIUM), parse(HARD)] as const;

export type Tier = 0 | 1 | 2;

export const wordId = (tier: Tier, i: number) => tier * 1000 + i;
export const tierOf = (id: number) => Math.floor(id / 1000) as Tier;

export const wordOf = (id: number): string | undefined => TIERS[tierOf(id)]?.[id % 1000];
