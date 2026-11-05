import type { Metadata } from "next";
import Link from "next/link";
import { shareMeta, SITE_URL } from "@/lib/site";

export const metadata: Metadata = shareMeta({
  title: "Chính sách dịch vụ",
  description: "Điều khoản sử dụng Arena: cách nền tảng hoạt động, dữ liệu nào được lưu, quy tắc chơi đẹp và giới hạn trách nhiệm.",
  path: "/terms/",
});

const UPDATED = "03/11/2026";

const TLDR = [
  { icon: "🎁", text: "Miễn phí, không cần tài khoản" },
  { icon: "🔌", text: "Trình duyệt nối thẳng với nhau, không máy chủ game" },
  { icon: "💾", text: "Tên, avatar, cài đặt chỉ lưu trên máy bạn" },
  { icon: "🤝", text: "Chơi đẹp, nói lời hay, không gian lận" },
];

type Section = { id: string; title: string; body: React.ReactNode[] };

const SECTIONS: Section[] = [
  {
    id: "chap-nhan",
    title: "Chấp nhận điều khoản",
    body: [
      <>
        Arena (<Link href="/">{SITE_URL.replace("https://", "")}</Link>) là nền tảng mini game đối kháng chơi trên trình duyệt. Khi vào chơi, tạo phòng
        hay nhắn tin trên Arena, bạn đồng ý với các điều khoản dưới đây. Nếu không đồng ý, bạn vui lòng ngừng sử dụng.
      </>,
      "Nếu bạn dưới 16 tuổi, hãy đọc chính sách này cùng bố mẹ hoặc người giám hộ.",
    ],
  },
  {
    id: "dich-vu",
    title: "Dịch vụ Arena cung cấp",
    body: [
      <>
        Arena cho phép bạn tạo phòng, mời bạn bè bằng đường link và chơi các game đối kháng cùng nhau, kèm chat và sticker. Mọi tính năng hiện có đều{" "}
        <Link href="/pricing/">miễn phí</Link>, không có gói trả phí.
      </>,
      "Arena được duy trì bởi một cá nhân, cung cấp theo hiện trạng (“as is”). Game có thể được thêm mới, tạm khoá để bảo trì hoặc gỡ bỏ bất cứ lúc nào mà không cần báo trước.",
    ],
  },
  {
    id: "ket-noi",
    title: "Cách kết nối hoạt động",
    body: [
      "Arena không có máy chủ game. Khi vào sảnh hoặc phòng, trình duyệt của bạn nối trực tiếp với trình duyệt của người chơi khác qua WebRTC. Nước đi, tin nhắn và thông tin hồ sơ được gửi thẳng giữa các máy, Arena không lưu lại.",
      "Để các máy tìm thấy nhau, trình duyệt gửi tín hiệu bắt tay qua các relay Nostr công khai. Khi mạng của bạn không nối thẳng được (thường do NAT nhà mạng), dữ liệu được chuyển tiếp qua máy chủ TURN; nội dung vẫn được mã hoá đầu-cuối theo chuẩn WebRTC.",
      "Do kết nối trực tiếp, những người cùng phòng hoặc cùng sảnh có thể thấy địa chỉ IP của bạn. Đây là đặc điểm chung của mọi ứng dụng P2P. Nếu bạn không muốn lộ IP, hãy cân nhắc trước khi chơi với người lạ.",
    ],
  },
  {
    id: "du-lieu",
    title: "Dữ liệu và quyền riêng tư",
    body: [
      "Arena không yêu cầu đăng ký, không thu thập họ tên thật, email hay số điện thoại. Tên hiển thị, avatar, giao diện sáng / tối và các tuỳ chọn trong game chỉ được lưu trong bộ nhớ trình duyệt (localStorage, sessionStorage) trên máy của bạn. Xoá dữ liệu trang web là xoá sạch.",
      "Tên, avatar và tin nhắn bạn gửi sẽ hiển thị với những người đang ở cùng sảnh hoặc cùng phòng. Đừng chia sẻ thông tin cá nhân nhạy cảm trong chat.",
      "Arena dùng Google Analytics để đếm lượt truy cập và hiểu game nào được chơi nhiều. Số liệu là tổng hợp, không dùng để nhận diện từng người. Bạn có thể từ chối bằng tiện ích Google Analytics Opt-out hoặc cài đặt chặn theo dõi của trình duyệt.",
    ],
  },
  {
    id: "quang-cao",
    title: "Quảng cáo",
    body: [
      "Để trang trải chi phí duy trì (tên miền, máy chủ chuyển tiếp), Arena hiển thị một lượng nhỏ quảng cáo do Google cung cấp. Google có thể dùng cookie để hiển thị quảng cáo phù hợp; bạn tuỳ chỉnh tại trang Cài đặt quảng cáo của Google.",
      "Arena đề nghị bạn tạm tắt trình chặn quảng cáo khi chơi. Đây là cách duy nhất giúp nền tảng tiếp tục miễn phí.",
    ],
  },
  {
    id: "quy-tac",
    title: "Quy tắc ứng xử",
    body: [
      <>
        Khi dùng Arena, bạn <b className="text-ink">không được</b>:
      </>,
      <ul key="rules" className="list-disc space-y-1.5 pl-5">
        <li>Đặt tên hoặc gửi tin nhắn xúc phạm, quấy rối, phân biệt đối xử, khiêu dâm hay kích động bạo lực.</li>
        <li>Spam tin nhắn, sticker hoặc lời mời làm phiền người khác.</li>
        <li>Mạo danh người khác hoặc giả làm quản trị viên Arena.</li>
        <li>Phát tán đường link lừa đảo, mã độc, hay nội dung vi phạm pháp luật Việt Nam.</li>
        <li>Can thiệp vào kết nối, sửa đổi dữ liệu truyền đi hoặc tấn công máy của người chơi khác.</li>
      </ul>,
      "Chủ phòng có quyền mời người vi phạm ra khỏi phòng. Arena có thể chặn những hành vi gây hại tới cộng đồng mà không cần báo trước.",
    ],
  },
  {
    id: "gian-lan",
    title: "Chơi đẹp, không gian lận",
    body: [
      "Mở công cụ nhà phát triển (DevTools) của trình duyệt khi đang trong ván bị xem là gian lận: bạn bị xử thua ngay và cả phòng nhận được thông báo.",
      "Dùng công cụ, tiện ích hay đoạn mã để xem trộm bài, đoán trước kết quả hoặc tự động chơi cũng bị xem là gian lận. Thắng thua chỉ để vui, đừng làm mất vui của cả hội.",
    ],
  },
  {
    id: "noi-dung",
    title: "Nội dung và sở hữu trí tuệ",
    body: [
      "Giao diện, mã nguồn, logo và hình ảnh của Arena thuộc về người phát triển Arena. Các trò chơi dân gian và cờ truyền thống (cờ tướng, cờ vua, ô ăn quan…) là di sản chung, Arena chỉ xây dựng phiên bản chơi trực tuyến.",
      "Bạn chịu trách nhiệm với nội dung mình gửi (tên, tin nhắn, hình vẽ trong game). Arena không lưu trữ những nội dung này trên máy chủ.",
    ],
  },
  {
    id: "trach-nhiem",
    title: "Giới hạn trách nhiệm",
    body: [
      "Vì kết nối phụ thuộc vào mạng của từng người chơi, ván đấu có thể bị gián đoạn, chậm hoặc mất kết quả. Arena không đảm bảo dịch vụ luôn hoạt động liên tục, không lỗi.",
      "Arena không chịu trách nhiệm về hành vi hay nội dung của người chơi khác, cũng như thiệt hại phát sinh từ việc sử dụng nền tảng. Các ván đấu trên Arena chỉ mang tính giải trí; mọi hình thức cá cược bằng tiền hoặc tài sản đều không được khuyến khích và nằm ngoài trách nhiệm của Arena.",
    ],
  },
  {
    id: "thay-doi",
    title: "Thay đổi chính sách",
    body: [
      "Chính sách này có thể được cập nhật khi Arena thêm tính năng mới (ví dụ lưu lịch sử chơi, giải đấu). Ngày cập nhật gần nhất luôn ghi ở đầu trang. Tiếp tục sử dụng Arena sau khi chính sách thay đổi đồng nghĩa với việc bạn đồng ý với bản mới.",
    ],
  },
];

export default function Terms() {
  return (
    <>
      <section className="mx-auto max-w-[1280px] px-4 pt-12 pb-8 sm:px-6 lg:pt-20">
        <div className="text-center">
          <h1 className="font-display text-[40px] leading-[1.05] font-extrabold tracking-tight text-balance sm:text-[56px]">
            Chính sách <span className="text-pen">dịch vụ</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[56ch] text-lg text-ink-2">Ngắn gọn, dễ hiểu, để cả hội yên tâm vào chơi.</p>
          <p className="mt-4 text-sm text-ink-3">Cập nhật lần cuối: {UPDATED}</p>
        </div>

        <div className="card mx-auto mt-10 max-w-[960px] p-6 sm:p-8" style={{ background: "var(--sun-soft)" }}>
          <h2 className="font-display text-2xl font-extrabold tracking-tight">Tóm tắt nhanh</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {TLDR.map((t) => (
              <li key={t.text} className="flex items-center gap-3 rounded-xl border-2 border-edge bg-surface p-4 font-display font-extrabold">
                <span className="text-3xl" aria-hidden="true">
                  {t.icon}
                </span>
                {t.text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1100px] gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Mục lục" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 font-display text-sm font-extrabold tracking-wide text-ink-3 uppercase">Mục lục</p>
          <ol className="flex flex-col gap-0.5">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-lg px-3 py-1.5 text-[15px] font-semibold text-ink-2 no-underline hover:bg-sunken hover:text-ink">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          {SECTIONS.map((s, i) => (
            <article key={s.id} id={s.id} className="card scroll-mt-24 p-6 sm:p-8">
              <h2 className="flex items-center gap-3 font-display text-2xl font-extrabold tracking-tight">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-edge text-base text-white"
                  style={{ background: "var(--pen)" }}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                {s.title}
              </h2>
              <div className="mt-4 flex flex-col gap-3 text-[15.5px] leading-relaxed text-ink-2">
                {s.body.map((b, j) => (typeof b === "string" ? <p key={j}>{b}</p> : <div key={j}>{b}</div>))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
        <div className="card p-8 text-center sm:p-12" style={{ background: "var(--pen-soft)" }}>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">Đọc xong rồi, vào chơi thôi!</h2>
          <p className="mx-auto mt-3 max-w-[48ch] text-ink-2">Chơi đẹp, cười nhiều, và nhớ khao trà sữa nếu thua nhé.</p>
          <Link href="/games/" className="btn btn-pen mt-6 h-12 px-8 text-base no-underline">
            Chọn game ngay →
          </Link>
        </div>
      </section>
    </>
  );
}
