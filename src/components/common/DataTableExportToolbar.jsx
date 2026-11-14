import { useState } from 'react'
import { FileDown, FileSpreadsheet, LoaderCircle } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { exportRowsToCsv, exportRowsToPdf } from '../../utils/tableExports'

function safeFilename(value) {
  return String(value || 'export')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

export default function DataTableExportToolbar({ rows, columns, title }) {
  const [exporting, setExporting] = useState('')
  const [error, setError] = useState('')
  const basename = safeFilename(title)

  const exportCsv = () => {
    setError('')
    try {
      exportRowsToCsv(rows, columns, `${basename}.csv`)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Impossible de créer le fichier CSV.')
    }
  }

  const exportPdf = async () => {
    setError('')
    setExporting('pdf')
    try {
      const settings = await getDoc(doc(db, 'settings', 'company'))
      await exportRowsToPdf(
        rows,
        columns,
        title,
        `${basename}.pdf`,
        settings.exists() ? settings.data() : {},
      )
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Impossible de créer le PDF.')
    } finally {
      setExporting('')
    }
  }

  return (
    <div className="rounded-2xl border border-white/70 bg-white/70 p-3 shadow-inner shadow-slate-900/[0.03] ring-1 ring-slate-200/70 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">
          Export de {rows.length} ligne{rows.length === 1 ? '' : 's'} filtrée{rows.length === 1 ? '' : 's'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white/80 px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-50 hover:shadow-md"
            onClick={exportCsv}
            type="button"
          >
            <FileSpreadsheet aria-hidden="true" size={15} />
            Exporter en Excel (CSV)
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-800 to-indigo-700 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/15 transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-70"
            disabled={Boolean(exporting)}
            onClick={() => void exportPdf()}
            type="button"
          >
            {exporting
              ? <LoaderCircle aria-hidden="true" className="animate-spin" size={15} />
              : <FileDown aria-hidden="true" size={15} />}
            {exporting ? 'Préparation du PDF…' : 'Exporter la liste en PDF'}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs font-medium text-red-700" role="alert">{error}</p>}
    </div>
  )
}
