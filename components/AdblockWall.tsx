"use client";

import { useEffect, useState } from "react";
import { Dialog } from "./Dialog";

const base = process.env.BASE_PATH ?? "";

// Script quảng cáo phổ biến nhất — mọi bộ lọc (EasyList, uBlock, Brave Shields…) đều chặn.
const AD_SCRIPT = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
// Tên lớp nằm trong EasyList: trình chặn quảng cáo sẽ ẩn phần tử "mồi" mang các lớp này.
const BAIT_CLASS = "adsbox ad-banner ad-placement pub_300x250 textads banner_ad";

/** Đặt một khối "mồi" giả làm quảng cáo, xem trình chặn có ẩn nó đi không. */
async function baitHidden() {
  const bait = document.createElement("div");
  bait.className = BAIT_CLASS;
  bait.setAttribute("aria-hidden", "true");
  bait.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:2px;height:2px;pointer-events:none";
  bait.innerHTML = "&nbsp;";
  document.body.appendChild(bait);
  // Bộ lọc giao diện áp CSS sau một nhịp; chờ chút cho chắc.
  await new Promise((r) => setTimeout(r, 300));
  const s = getComputedStyle(bait);
  const hidden = !bait.isConnected || bait.offsetHeight === 0 || s.display === "none" || s.visibility === "hidden";
  bait.remove();
  return hidden;
}

/** Thử tải script quảng cáo: bị chặn thì fetch ném lỗi mạng. */
async function scriptBlocked() {
  try {
    await fetch(AD_SCRIPT, { method: "HEAD", mode: "no-cors", cache: "no-store" });
    return false;
  } catch {
    // Mất mạng cũng ném lỗi — khi đó không kết luận là có trình chặn.
    return navigator.onLine;
  }
}

async function detectAdblock() {
  const [bait, net] = await Promise.all([baitHidden(), scriptBlocked()]);
  return bait || net;
}

/** Phát hiện trình chặn quảng cáo và nhờ người chơi tạm dừng nó cho Arena. */
export function AdblockWall() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let live = true;
    detectAdblock().then((b) => live && setBlocked(b));
    return () => {
      live = false;
    };
  }, []);

  return (
    <Dialog open={blocked} onClose={() => {}} title="Bạn gì đó ơi!" dismissable={false} className="is-wide">
      <div className="flex flex-col gap-3 text-[15.5px] text-ink-2">
        <p className="flex items-start gap-3">
          <span className="text-4xl leading-none" aria-hidden="true">
            🥺
          </span>
          <span>
            <b className="text-ink">Arena</b> cung cấp nền tảng chơi game <b className="text-ink">hoàn toàn miễn phí</b> cho hội nhóm bạn thân, nhưng
            cũng cần chút kinh phí để duy trì.
          </span>
        </p>
        <p>
          Bạn cho phép hiển thị quảng cáo nha — quảng cáo hiển thị <b className="text-ink">rất ít</b>, không làm ảnh hưởng trải nghiệm chơi game đâu nè 💜
        </p>

        <div className="mt-1 grid gap-4 rounded-2xl border-2 border-edge bg-sunken p-4 sm:grid-cols-[1fr_200px] sm:items-center">
          <div>
            <p className="font-display text-base font-extrabold text-ink">Cách tạm dừng AdBlock</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[14.5px]">
              <li>Bấm vào biểu tượng trình chặn quảng cáo (bàn tay đỏ của AdBlock) ở góc trên bên phải trình duyệt.</li>
              <li>
                Chọn <b className="text-ink">Pause on this site</b> (Tạm dừng trên trang này).
              </li>
              <li>
                Bấm nút <b className="text-ink">Tải lại trang</b> bên dưới là xong!
              </li>
            </ol>
            <p className="mt-2 text-[13px] text-ink-3">
              Dùng uBlock Origin thì bấm nút nguồn xanh to; dùng Brave thì tắt Shields (biểu tượng sư tử) cho trang này.
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- site xuất tĩnh */}
          <img
            src={`${base}/guides/adblock-pause.png`}
            alt="Bảng điều khiển AdBlock với nút Pause on this site ở dưới cùng"
            width={628}
            height={896}
            className="mx-auto w-full max-w-[200px] rounded-xl border-2 border-edge"
          />
        </div>

        <button type="button" className="btn btn-pen mt-2 self-center" onClick={() => location.reload()}>
          Mình tạm dừng rồi, tải lại trang
        </button>
      </div>
    </Dialog>
  );
}
