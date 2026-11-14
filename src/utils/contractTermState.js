function parseDate(value) {
  if (value && typeof value.toDate === 'function') return value.toDate()
  if (value instanceof Date) return value
  if (typeof value !== 'string' || !value) return null
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function subtractMonths(date, months) {
  const result = new Date(date)
  const day = result.getDate()
  result.setDate(1)
  result.setMonth(result.getMonth() - months)
  const lastDayOfMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(day, lastDayOfMonth))
  return result
}

export function getContractTermState(contract, today = new Date()) {
  const status = String(contract.status || '').trim().toLowerCase()
  if (['brouillon', 'à signer', 'termine', 'terminé', 'resilie', 'résilié'].includes(status)) {
    return ''
  }
  const parsedEndDate = parseDate(contract.endDate)
  if (!parsedEndDate) return ''

  const endDate = new Date(parsedEndDate)
  endDate.setHours(0, 0, 0, 0)
  const currentDate = new Date(today)
  currentDate.setHours(0, 0, 0, 0)
  if (endDate < currentDate) return 'expired'

  if (contract.autoRenewal === true) {
    const noticeMonths = Number(contract.noticeMonths)
    if (Number.isInteger(noticeMonths) && noticeMonths >= 0) {
      const noticeStart = subtractMonths(endDate, noticeMonths)
      if (currentDate >= noticeStart) return 'renewal'
    }
  }

  const soon = new Date(currentDate)
  soon.setDate(soon.getDate() + 30)
  return endDate <= soon ? 'expiring' : ''
}
