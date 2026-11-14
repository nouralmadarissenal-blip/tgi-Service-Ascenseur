export default function TableSkeleton({ columns = 6, rows = 5, minWidth = 720 }) {
  return (
    <div aria-label="Chargement des données" className="overflow-x-auto px-4 py-4 sm:px-6" role="status">
      <span className="sr-only">Chargement des données…</span>
      <table className="w-full" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-slate-100">
            {Array.from({ length: columns }, (_, index) => (
              <th className="px-3 py-3 text-left" key={`skeleton-heading-${index}`}>
                <span className="block h-3 w-20 animate-pulse rounded bg-slate-200" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr className="border-b border-slate-100" key={`skeleton-row-${row}`}>
              {Array.from({ length: columns }, (_, column) => (
                <td className="px-3 py-4" key={`skeleton-cell-${row}-${column}`}>
                  <span
                    className={`block h-3 animate-pulse rounded bg-slate-100 ${column === 0 ? 'w-32' : 'w-20'}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
