import { useMemo, useState } from 'react'

export default function useDataTable(items, pageSize = 10) {
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState('')
  const [sortDirection, setSortDirection] = useState('asc')
  const sortedItems = useMemo(() => {
    if (!sortKey) return items
    const valueAt = (item) => sortKey.split('.').reduce((value, key) => value?.[key], item)
    return [...items].sort((first, second) => {
      const firstValue = valueAt(first)
      const secondValue = valueAt(second)
      const comparison = typeof firstValue === 'number' && typeof secondValue === 'number'
        ? firstValue - secondValue
        : String(firstValue ?? '').localeCompare(
          String(secondValue ?? ''),
          'fr',
          { numeric: true, sensitivity: 'base' },
        )
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [items, sortDirection, sortKey])
  const pageCount = Math.max(1, Math.ceil(sortedItems.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageItems = useMemo(
    () => sortedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sortedItems, currentPage, pageSize],
  )
  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDirection((currentDirection) => currentDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
    setPage(1)
  }

  return {
    page: currentPage,
    pageCount,
    pageItems,
    pageSize,
    setPage,
    sortKey,
    sortDirection,
    sortedItems,
    toggleSort,
    total: sortedItems.length,
  }
}
