import { CircleHelp } from 'lucide-react'

export default function EmptyState({
  actionLabel,
  description,
  icon: Icon = CircleHelp,
  onAction,
  title,
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center" role="status">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-steel-700 ring-1 ring-slate-200">
        <Icon aria-hidden="true" size={25} />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm leading-6 text-slate-500">{description}</p>}
      {onAction && actionLabel && (
        <button
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-steel-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-steel-800 focus:outline-none focus:ring-4 focus:ring-steel-100"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
