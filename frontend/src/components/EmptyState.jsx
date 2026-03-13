export function EmptyState({ title, description }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-brand-sand bg-brand-cream/70 px-6 py-10 text-center">
      <h4 className="text-lg font-semibold text-brand-forest">{title}</h4>
      <p className="mt-2 text-sm text-brand-forest/70">{description}</p>
    </div>
  );
}
