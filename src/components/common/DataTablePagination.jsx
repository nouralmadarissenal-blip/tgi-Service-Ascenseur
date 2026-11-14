import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function DataTablePagination({
  page,
  pageCount,
  pageSize,
  setPage,
  total,
}) {
  const firstItem = total ? (page - 1) * pageSize + 1 : 0
  const lastItem = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="text-xs text-slate-500">
        Affichage <span className="font-semibold text-slate-700">{firstItem}–{lastItem}</span> sur{' '}
        <span className="font-semibold text-slate-700">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          aria-label="Page précédente"
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          type="button"
        >
          <ChevronLeft size={15} /> Précédent
        </button>
        <span aria-live="polite" className="min-w-16 text-center text-xs font-medium text-slate-500">
          {page} / {pageCount}
        </span>
        <button
          aria-label="Page suivante"
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={page >= pageCount}
          onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          type="button"
        >
          Suivant <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}
