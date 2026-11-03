import { LogoMark } from "./Logo";

// Màn mở đầu khi tải trang (tải cứng: vào lần đầu, F5). Script chạy đồng bộ trong <head> nên gắn `data-boot` lên <html>
// trước lần vẽ đầu; không có JS thì không có màn này. Chờ sự kiện `load` (ảnh, font, script đã tải xong) nhưng không ngắn
// hơn lượt ráp logo (MIN), tối đa MAX nếu có tài nguyên treo. Khi xong: đo logo đầu trang, cho logo lớn bay về đúng chỗ
// (biến --fly-* trên <html>), nền mờ dần, rồi gỡ `data-boot` — logo thật hiện ra đúng chỗ logo bay vừa đáp.
// Điều hướng nội bộ không chạy lại vì layout gốc giữ nguyên.
export const SPLASH_SCRIPT = `(function(){var d=document.documentElement,t0=Date.now(),done=0;
var calm=matchMedia("(prefers-reduced-motion: reduce)").matches,MIN=calm?250:1500,MAX=10000;
d.setAttribute("data-boot","run");
function end(){d.removeAttribute("data-boot");["--fly-x","--fly-y","--fly-s"].forEach(function(k){d.style.removeProperty(k)})}
function finish(){if(done)return;done=1;
var a=document.querySelector(".splash-mark"),b=document.querySelector(".logo-home .logo-mark");
if(a&&b){var r=a.getBoundingClientRect(),q=b.getBoundingClientRect();if(q.width&&r.width){
d.style.setProperty("--fly-x",(q.left+q.width/2-r.left-r.width/2)+"px");
d.style.setProperty("--fly-y",(q.top+q.height/2-r.top-r.height/2)+"px");
d.style.setProperty("--fly-s",String(q.width/r.width))}}
d.setAttribute("data-boot","out");setTimeout(end,calm?260:720)}
function ready(){setTimeout(finish,Math.max(0,MIN-(Date.now()-t0)))}
if(document.readyState==="complete")ready();else addEventListener("load",ready,{once:true});
setTimeout(finish,MAX)})()`;

export function Splash() {
  return (
    <div className="splash" aria-hidden="true">
      <div className="splash-bg" />
      <div className="splash-stage">
        <div className="splash-mark">
          <LogoMark className="h-full w-full" />
        </div>
        <p className="splash-word font-display">
          {[..."Arena"].map((c, i) => (
            <span key={i} style={{ "--i": i } as React.CSSProperties}>
              {c}
            </span>
          ))}
        </p>
        <span className="splash-dots">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}
