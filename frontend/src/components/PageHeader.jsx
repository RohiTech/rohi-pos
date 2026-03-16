import { useEffect, useState } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  collapsible = false,
  defaultCollapsed = false,
  storageKey
}) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (!collapsible || typeof window === 'undefined') {
      return defaultCollapsed;
    }

    if (!storageKey) {
      return defaultCollapsed;
    }

    const storedValue = window.localStorage.getItem(storageKey);
    return storedValue === null ? defaultCollapsed : storedValue === 'true';
  });

  useEffect(() => {
    if (!collapsible || !storageKey || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(storageKey, String(isCollapsed));
  }, [collapsible, isCollapsed, storageKey]);

  if (isCollapsed) {
    return (
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-brand-sand/70 pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-moss">{eyebrow}</p>
          <h2 className="truncate font-display text-2xl text-brand-forest lg:text-3xl">{title}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
          {collapsible ? (
            <button
              className="rounded-2xl border border-brand-sand px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-forest"
              onClick={() => setIsCollapsed(false)}
              type="button"
            >
              Expandir titulo
            </button>
          ) : null}
        </div>
      </header>
    );
  }

  return (
    <header className="mb-8 flex flex-col gap-4 border-b border-brand-sand/70 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-moss">{eyebrow}</p>
        <h2 className="mt-3 font-display text-4xl text-brand-forest">{title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-forest/80">{description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        {collapsible ? (
          <button
            className="rounded-2xl border border-brand-sand px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-forest"
            onClick={() => setIsCollapsed(true)}
            type="button"
          >
            Acoplar titulo
          </button>
        ) : null}
      </div>
    </header>
  );
}
