function getCellValue(row, column) {
  const value = typeof column.value === 'function'
    ? column.value(row)
    : row[column.key]
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toLocaleDateString('fr-FR')
  return String(value)
}

function protectSpreadsheetValue(value) {
  return ['=', '+', '-', '@'].includes(value.trimStart()[0]) ? `'${value}` : value
}

export function exportRowsToCsv(rows, columns, filename) {
  const csvCell = (value) => `"${protectSpreadsheetValue(String(value)).replace(/"/g, '""')}"`
  const content = [
    columns.map((column) => csvCell(column.label)).join(';'),
    ...rows.map((row) => columns.map((column) => csvCell(getCellValue(row, column))).join(';')),
  ].join('\r\n')
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function createPdfTable(rows, columns, title) {
  const root = document.createElement('article')
  root.style.cssText =
    'box-sizing:border-box;width:190mm;padding:8mm;background:#fff;color:#172033;font:8pt/1.35 Arial,Helvetica,sans-serif;'
  const heading = document.createElement('h1')
  heading.textContent = title
  heading.style.cssText = 'margin:0 0 2mm;color:#0f172a;font-size:16pt;'
  root.appendChild(heading)

  const count = document.createElement('p')
  count.textContent = `${rows.length} ligne${rows.length === 1 ? '' : 's'} exportée${rows.length === 1 ? '' : 's'}`
  count.style.cssText = 'margin:0 0 6mm;color:#64748b;font-size:8pt;'
  root.appendChild(count)

  const table = document.createElement('table')
  table.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed;'
  const thead = document.createElement('thead')
  thead.style.display = 'table-header-group'
  const headerRow = document.createElement('tr')
  columns.forEach((column) => {
    const cell = document.createElement('th')
    cell.textContent = column.label
    cell.style.cssText =
      'padding:2.5mm 1.5mm;border:1px solid #cbd5e1;background:#eff6ff;color:#1e3a8a;text-align:left;font-size:7pt;overflow-wrap:anywhere;'
    headerRow.appendChild(cell)
  })
  thead.appendChild(headerRow)
  table.appendChild(thead)

  const body = document.createElement('tbody')
  rows.forEach((row) => {
    const tableRow = document.createElement('tr')
    tableRow.style.cssText = 'page-break-inside:avoid;break-inside:avoid;'
    columns.forEach((column) => {
      const cell = document.createElement('td')
      cell.textContent = getCellValue(row, column) || '—'
      cell.style.cssText =
        'padding:2mm 1.5mm;border:1px solid #e2e8f0;vertical-align:top;overflow-wrap:anywhere;'
      tableRow.appendChild(cell)
    })
    body.appendChild(tableRow)
  })
  table.appendChild(body)
  root.appendChild(table)
  return root
}

export async function exportRowsToPdf(rows, columns, title, filename, company = {}) {
  const root = createPdfTable(rows, columns, title)
  document.body.appendChild(root)
  try {
    const generatePdf = (await import('./pdfEngine')).default
    await generatePdf(root, filename, company)
  } finally {
    root.remove()
  }
}
