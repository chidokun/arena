import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-7xl">🧱</p>
      <h1 className="mt-4 font-display text-4xl font-extrabold">Lạc đường rồi!</h1>
      <p className="mt-3 text-ink-2">Trang này không tồn tại. Quay về sảnh chính để chọn game nhé.</p>
      <Link href="/" className="btn btn-pen mt-6 no-underline">
        Về trang chủ
      </Link>
    </div>
  );
}
