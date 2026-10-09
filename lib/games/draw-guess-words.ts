/**
 * Bộ từ khoá của Vẽ Đoán, chia ba mức theo độ khó khi vẽ. Mã từ = mức × 1000 + số thứ tự trong mức (`wordId`) —
 * phòng nhớ mã các từ đã chơi để không bốc lại, nên chỉ thêm từ vào *cuối* mỗi mức, không xoá, không đổi chỗ.
 */

/** Đồ vật, con vật, hình quen thuộc — vài nét là ra. */
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
`;

/** Cần chút ý tưởng: con vật khó, đồ vật nhiều chi tiết, nơi chốn, nghề nghiệp, đặc sản Việt. */
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
`;

/** Hành động, sự kiện, trò chơi, khái niệm — phải nghĩ cách vẽ. */
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
`;

const parse = (list: string) =>
  list
    .split("\n")
    .map((w) => w.trim())
    .filter(Boolean);

export const TIERS = [parse(EASY), parse(MEDIUM), parse(HARD)] as const;

/** Mức khó: 0 dễ, 1 vừa, 2 khó. */
export type Tier = 0 | 1 | 2;

export const wordId = (tier: Tier, i: number) => tier * 1000 + i;
export const tierOf = (id: number) => Math.floor(id / 1000) as Tier;

/** Từ theo mã; undefined nếu mã lạ. */
export const wordOf = (id: number): string | undefined => TIERS[tierOf(id)]?.[id % 1000];
