import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

export default function SortableTableHeader({
  columnKey,
  sortKey,
  sortDirection,
  toggleSort,
  label,
  children,
  className = '',
}) {
  const active = sortKey === columnKey
  const SortIcon = active
    ? sortDirection === 'asc' ? ArrowUp : ArrowDown
    : ArrowUpDown

  return (
    <th aria-sort={active ? `${sortDirection === 'asc' ? 'ascending' : 'descending'}` : 'none'} className={className}>
      <button
        className="inline-flex items-center gap-1.5 rounded-md text-left transition hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        onClick={() => toggleSort(columnKey)}
        type="button"
      >
        {label || children}
        <SortIcon aria-hidden="true" className={active ? 'text-blue-700' : 'text-slate-300'} size={13} />
      </button>
    </th>
  )
}
