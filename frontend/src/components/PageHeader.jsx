export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="mb-8 flex flex-col gap-4 border-b border-brand-sand/70 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-moss">{eyebrow}</p>
        <h2 className="mt-3 font-display text-4xl text-brand-forest">{title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-forest/80">{description}</p>
      </div>

      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </header>
  );
}
