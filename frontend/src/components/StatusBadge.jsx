const statusMap = {
  active: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  expired: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-200 text-slate-700',
  completed: 'bg-emerald-100 text-emerald-700'
};

export function StatusBadge({ value }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
        statusMap[value] || 'bg-slate-100 text-slate-700'
      }`}
    >
      {value}
    </span>
  );
}
