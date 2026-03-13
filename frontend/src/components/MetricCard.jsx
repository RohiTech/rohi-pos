export function MetricCard({ label, value, hint, accent = 'forest' }) {
  const accentStyles = {
    forest: 'from-brand-forest to-brand-moss text-white',
    clay: 'from-brand-clay to-orange-400 text-white',
    cream: 'from-brand-sand to-white text-brand-forest'
  };

  return (
    <article
      className={`rounded-[1.75rem] bg-gradient-to-br p-5 shadow-panel ${accentStyles[accent] || accentStyles.forest}`}
    >
      <p className="text-xs uppercase tracking-[0.2em] opacity-80">{label}</p>
      <p className="mt-4 text-4xl font-bold">{value}</p>
      <p className="mt-3 text-sm opacity-85">{hint}</p>
    </article>
  );
}
