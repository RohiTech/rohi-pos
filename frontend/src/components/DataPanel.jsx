export function DataPanel({ title, subtitle, children }) {
  return (
    <section className="rounded-[1.75rem] border border-brand-sand/70 bg-white p-5 shadow-panel">
      <div className="mb-5">
        <h3 className="text-xl font-semibold text-brand-forest">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-brand-forest/70">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
