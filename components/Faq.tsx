export type FaqItem = { q: string; a: string };

// Danh sách hỏi đáp dạng gập/mở, kèm dữ liệu có cấu trúc FAQPage cho công cụ tìm kiếm.
export function Faq({ items, title = "Câu hỏi thường gặp", children }: { items: FaqItem[]; title?: string; children?: React.ReactNode }) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <section className="mx-auto max-w-[800px] px-4 py-10 sm:px-6">
      <h2 className="mb-6 text-center font-display text-3xl font-extrabold tracking-tight">{title}</h2>
      <div className="flex flex-col gap-3">
        {items.map((f) => (
          <details key={f.q} className="group card p-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-display text-lg font-extrabold [&::-webkit-details-marker]:hidden">
              {f.q}
              <span className="text-2xl leading-none text-pen transition-transform group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </summary>
            <p className="-mt-1 px-5 pb-5 text-[15px] text-ink-2">{f.a}</p>
          </details>
        ))}
      </div>
      {children}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    </section>
  );
}
