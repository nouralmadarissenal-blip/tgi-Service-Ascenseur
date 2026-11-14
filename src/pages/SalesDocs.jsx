import { useEffect, useMemo, useRef, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { AlertCircle, FilePlus2, FileText, Plus, Printer, Search, Trash2 } from 'lucide-react'
import SalesDocumentPdf from '../components/sales/SalesDocumentPdf'
import { db } from '../firebase/config'
import DataTablePagination from '../components/common/DataTablePagination'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'

const DOCUMENT_TITLES = {
  purchaseOrder: 'Bons de commande',
  deliveryNote: 'Bons de livraison',
  invoice: 'Factures',
}
const DOCUMENT_LABELS = {
  purchaseOrder: 'Bon de commande',
  deliveryNote: 'Bon de livraison',
  invoice: 'Facture',
}
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'

function localDate(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatCurrency(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('fr-FR')
}

function createEmptyForm(type) {
  return {
    clientId: '',
    issueDate: localDate(),
    dueDate: type === 'invoice' ? localDate(30) : '',
    notes: '',
    items: [{ stockId: '', quantity: '1' }],
  }
}

export default function SalesDocs({ documentType = 'invoice' }) {
  const { data: clients, loading: clientsLoading, error: clientsError } =
    useFirestoreCollection('clients')
  const { data: stock, loading: stockLoading, error: stockError } =
    useFirestoreCollection('stock')
  const { data: documents, loading: documentsLoading, error: documentsError } =
    useFirestoreCollection('salesDocuments')
  const [form, setForm] = useState(() => createEmptyForm(documentType))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pdfDocument, setPdfDocument] = useState(null)
  const [company, setCompany] = useState({})
  const [settingsError, setSettingsError] = useState('')
  const [documentQuery, setDocumentQuery] = useState('')
  const pdfRef = useRef(null)

  useEffect(() => {
    return onSnapshot(
      doc(db, 'settings', 'company'),
      (snapshot) => setCompany(snapshot.exists() ? snapshot.data() : {}),
      (snapshotError) => setSettingsError(snapshotError.message),
    )
  }, [])

  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  )
  const visibleDocuments = useMemo(
    () =>
      documents
        .filter((documentData) => documentData.type === documentType)
        .sort((first, second) => (second.createdAt?.seconds || 0) - (first.createdAt?.seconds || 0)),
    [documents, documentType],
  )
  const searchedDocuments = useMemo(() => {
    const search = documentQuery.trim().toLowerCase()
    return visibleDocuments.filter((item) =>
      [item.number, item.clientName, item.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    )
  }, [visibleDocuments, documentQuery])
  const table = useDataTable(searchedDocuments)
  const selectedStock = useMemo(
    () => new Map(stock.map((item) => [item.id, item])),
    [stock],
  )
  const calculatedTotals = useMemo(() => {
    return form.items.reduce(
      (totals, line) => {
        const item = selectedStock.get(line.stockId)
        const quantity = Number(line.quantity)
        if (!item || !Number.isFinite(quantity) || quantity <= 0) return totals
        const totalHT = Number(item.salePrice ?? item.unitPrice) * quantity
        const tax = totalHT * 0.2
        return {
          totalHT: totals.totalHT + totalHT,
          totalTax: totals.totalTax + tax,
          totalTTC: totals.totalTTC + totalHT + tax,
        }
      },
      { totalHT: 0, totalTax: 0, totalTTC: 0 },
    )
  }, [form.items, selectedStock])

  const updateLine = (index, changes) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...changes } : line,
      ),
    }))
  }

  const addLine = () => {
    setForm((current) => ({
      ...current,
      items: [...current.items, { stockId: '', quantity: '1' }],
    }))
  }

  const removeLine = (index) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, lineIndex) => lineIndex !== index),
    }))
  }

  const saveDocument = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!form.clientId || !clientById.has(form.clientId)) {
      setError('Sélectionnez un client valide.')
      return
    }
    if (documentType === 'invoice' && !form.dueDate) {
      setError('Veuillez indiquer la date d’échéance de la facture.')
      return
    }
    if (form.items.length === 0 || form.items.some((line) => !line.stockId)) {
      setError('Ajoutez au moins un article et choisissez une pièce pour chaque ligne.')
      return
    }
    if (form.items.some((line) => !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0)) {
      setError('La quantité de chaque ligne doit être un entier supérieur à zéro.')
      return
    }
    if (new Set(form.items.map((line) => line.stockId)).size !== form.items.length) {
      setError('Une pièce ne peut apparaître qu’une seule fois. Regroupez les quantités sur sa ligne.')
      return
    }

    setSaving(true)
    try {
      const selectedClient = clientById.get(form.clientId)
      const documentRef = doc(collection(db, 'salesDocuments'))
      const year = form.issueDate.slice(0, 4)
      const counterRef = doc(db, 'documentCounters', `${documentType}-${year}`)
      const stockRefs = form.items.map((line) => doc(db, 'stock', line.stockId))

      const createdDocument = await runTransaction(db, async (transaction) => {
        const counterSnapshot = await transaction.get(counterRef)
        const stockSnapshots = await Promise.all(stockRefs.map((stockRef) => transaction.get(stockRef)))

        const quantitiesByStock = new Map(
          form.items.map((line) => [line.stockId, Number(line.quantity)]),
        )
        const resolvedItems = form.items.map((line, index) => {
          const itemSnapshot = stockSnapshots[index]
          if (!itemSnapshot.exists()) {
            throw new Error('Une pièce sélectionnée n’existe plus dans l’inventaire.')
          }
          const item = itemSnapshot.data()
          const quantity = quantitiesByStock.get(line.stockId)
          const unitPrice = Number(item.salePrice ?? item.unitPrice)
          if (!Number.isFinite(unitPrice) || unitPrice < 0) {
            throw new Error(`Le prix de « ${item.name || 'la pièce'} » est invalide.`)
          }
          if (documentType === 'deliveryNote' && Number(item.quantity) < quantity) {
            throw new Error(`Stock insuffisant pour « ${item.name} » (disponible : ${item.quantity}).`)
          }
          const totalHT = unitPrice * quantity
          return {
            stockId: line.stockId,
            name: item.name || '',
            reference: item.reference || item.tgiReference || '',
            quantity,
            unitPrice,
            taxRate: 20,
            totalHT,
            taxAmount: totalHT * 0.2,
            totalTTC: totalHT * 1.2,
          }
        })
        const totals = resolvedItems.reduce(
          (sum, item) => ({
            totalHT: sum.totalHT + item.totalHT,
            totalTax: sum.totalTax + item.taxAmount,
            totalTTC: sum.totalTTC + item.totalTTC,
          }),
          { totalHT: 0, totalTax: 0, totalTTC: 0 },
        )
        const sequence = Number(counterSnapshot.data()?.value || 0) + 1
        const number = `${year}-${String(sequence).padStart(3, '0')}`
        const data = {
          type: documentType,
          number,
          clientId: selectedClient.id,
          clientName: selectedClient.name || selectedClient.companyName || '',
          clientAddress: selectedClient.address || '',
          clientIce: selectedClient.ice || '',
          items: resolvedItems,
          ...totals,
          issueDate: form.issueDate,
          dueDate: documentType === 'invoice' ? form.dueDate : '',
          notes: form.notes.trim(),
          paidAmount: 0,
          remainingAmount: documentType === 'invoice' ? totals.totalTTC : 0,
          status: documentType === 'invoice' ? 'unpaid' : 'issued',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }

        transaction.set(counterRef, { value: sequence, updatedAt: serverTimestamp() })
        if (documentType === 'deliveryNote') {
          resolvedItems.forEach((item, index) => {
            const currentQuantity = Number(stockSnapshots[index].data().quantity)
            transaction.update(stockRefs[index], {
              quantity: currentQuantity - item.quantity,
              updatedAt: serverTimestamp(),
            })
          })
        }
        transaction.set(documentRef, data)
        return { ...data, id: documentRef.id }
      })

      setForm(createEmptyForm(documentType))
      setPdfDocument(createdDocument)
      setNotice(`${DOCUMENT_LABELS[documentType]} ${createdDocument.number} créé avec succès.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible de créer ce document.')
    } finally {
      setSaving(false)
    }
  }

  const exportPdf = async (documentData) => {
    setError('')
    const client = clientById.get(documentData.clientId) || {
      name: documentData.clientName,
      address: documentData.clientAddress,
      ice: documentData.clientIce,
    }
    setPdfDocument({ ...documentData, _pdfClient: client })
    window.setTimeout(async () => {
      try {
        const generatePdf = (await import('../utils/pdfEngine')).default
        await generatePdf(pdfRef.current, `${documentData.number}.pdf`, company)
      } catch (pdfError) {
        setError(pdfError instanceof Error ? pdfError.message : 'Impossible de générer le PDF.')
      }
    }, 0)
  }

  const activePdfClient =
    pdfDocument?._pdfClient || (pdfDocument ? clientById.get(pdfDocument.clientId) : null) || {}
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Gestion commerciale</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {DOCUMENT_TITLES[documentType] || 'Documents de vente'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Créez vos documents avec calcul automatique de la TVA à 20 % et export PDF.
          </p>
        </div>
      </div>

      {(clientsError || stockError || documentsError || settingsError || error) && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          {error || clientsError || stockError || documentsError || settingsError}
        </p>
      )}
      {notice && (
        <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {notice}
        </p>
      )}

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <FilePlus2 aria-hidden="true" size={19} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Créer un(e) {DOCUMENT_LABELS[documentType]?.toLowerCase()}</h2>
              <p className="mt-1 text-xs text-slate-500">Les prix sont repris depuis l’inventaire au moment de la création.</p>
            </div>
          </div>
        </div>

        <form className="space-y-6 p-5 sm:p-7" onSubmit={saveDocument}>
          <div className="grid gap-4 sm:grid-cols-3">
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Client *</span>
              <select
                className={inputClass}
                onChange={(event) => setForm((current) => ({ ...current, clientId: event.target.value }))}
                required
                value={form.clientId}
              >
                <option value="">Choisir un client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name || client.companyName || 'Client'}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Date du document *</span>
              <input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, issueDate: event.target.value }))} required type="date" value={form.issueDate} />
            </label>
            {documentType === 'invoice' && (
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">Date d’échéance *</span>
                <input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} required type="date" value={form.dueDate} />
              </label>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Articles</h3>
              <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-50" onClick={addLine} type="button">
                <Plus size={15} /> Ajouter une ligne
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {form.items.map((line, index) => {
                const item = selectedStock.get(line.stockId)
                return (
                  <div className="grid items-end gap-3 p-4 sm:grid-cols-[minmax(0,2fr)_100px_170px_40px]" key={`line-${index}`}>
                    <label>
                      <span className="mb-1.5 block text-xs font-semibold text-slate-700">Pièce *</span>
                      <select
                        className={inputClass}
                        onChange={(event) => updateLine(index, { stockId: event.target.value })}
                        required
                        value={line.stockId}
                      >
                        <option value="">Choisir une pièce</option>
                        {stock.map((stockItem) => (
                          <option
                            disabled={form.items.some((otherLine, otherIndex) => otherIndex !== index && otherLine.stockId === stockItem.id)}
                            key={stockItem.id}
                            value={stockItem.id}
                          >
                            {stockItem.name} {stockItem.reference ? `· ${stockItem.reference}` : ''}
                          </option>
                        ))}
                      </select>
                      {item && (
                        <span className="mt-1 block text-xs text-slate-500">
                          {formatCurrency(item.salePrice ?? item.unitPrice)} HT / unité · Stock : {item.quantity}
                        </span>
                      )}
                    </label>
                    <label>
                      <span className="mb-1.5 block text-xs font-semibold text-slate-700">Quantité *</span>
                      <input className={inputClass} min="1" onChange={(event) => updateLine(index, { quantity: event.target.value })} required step="1" type="number" value={line.quantity} />
                    </label>
                    <div className="pb-2 text-right">
                      <span className="block text-xs text-slate-500">Total HT</span>
                      <strong className="text-sm text-slate-900">
                        {item ? formatCurrency(Number(item.salePrice ?? item.unitPrice) * Number(line.quantity)) : '—'}
                      </strong>
                      <span className="mt-1 block text-xs text-slate-500">
                        TTC (20 %) · {item ? formatCurrency(Number(item.salePrice ?? item.unitPrice) * Number(line.quantity) * 1.2) : '—'}
                      </span>
                    </div>
                    <button
                      aria-label={`Supprimer la ligne ${index + 1}`}
                      className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                      disabled={form.items.length === 1}
                      onClick={() => removeLine(index)}
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Notes (facultatif)</span>
            <textarea className={`${inputClass} min-h-20 resize-y`} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} value={form.notes} />
          </label>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="rounded-xl bg-slate-50 px-5 py-4 sm:min-w-72">
              <p className="flex justify-between gap-8 text-sm text-slate-600"><span>Total HT</span><strong>{formatCurrency(calculatedTotals.totalHT)}</strong></p>
              <p className="mt-2 flex justify-between gap-8 text-sm text-slate-600"><span>TVA (20 %)</span><strong>{formatCurrency(calculatedTotals.totalTax)}</strong></p>
              <p className="mt-3 flex justify-between gap-8 border-t border-slate-200 pt-3 text-base font-bold text-blue-900"><span>Total TTC</span><strong>{formatCurrency(calculatedTotals.totalTTC)}</strong></p>
            </div>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-800 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving || clientsLoading || stockLoading || clients.length === 0 || stock.length === 0}
              type="submit"
            >
              <FilePlus2 size={17} />
              {saving ? 'Création…' : `Créer le document`}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <FileText aria-hidden="true" size={19} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Documents créés</h2>
              <p className="mt-1 text-xs text-slate-500">{searchedDocuments.length} document{searchedDocuments.length === 1 ? '' : 's'}</p>
            </div>
          </div>
          <label className="relative block w-full sm:max-w-xs">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              onChange={(event) => {
                setDocumentQuery(event.target.value)
                table.setPage(1)
              }}
              placeholder="Rechercher un document…"
              type="search"
              value={documentQuery}
            />
          </label>
        </div>
        {documentsLoading ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">Chargement des documents…</p>
        ) : searchedDocuments.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            {documentQuery ? 'Aucun document ne correspond à la recherche.' : 'Aucun document pour le moment.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-180 text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3.5">Numéro</th>
                  <th className="px-5 py-3.5">Client</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Total TTC</th>
                  {documentType === 'invoice' && <th className="px-5 py-3.5">État</th>}
                  <th className="px-5 py-3.5 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((documentData) => (
                  <tr className="hover:bg-slate-50/70" key={documentData.id}>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900">{documentData.number}</td>
                    <td className="px-5 py-4 text-sm text-slate-700">{documentData.clientName || '—'}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{formatDate(documentData.issueDate)}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-800">{formatCurrency(documentData.totalTTC)}</td>
                    {documentType === 'invoice' && (
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${documentData.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : documentData.status === 'partial' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                          {documentData.status === 'paid' ? 'Payée' : documentData.status === 'partial' ? 'Partielle' : 'Impayée'}
                        </span>
                      </td>
                    )}
                    <td className="px-5 py-4 text-right">
                      <button
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-50"
                        onClick={() => void exportPdf(documentData)}
                        type="button"
                      >
                        <Printer size={15} /> Exporter
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!documentsLoading && searchedDocuments.length > 0 && <DataTablePagination {...table} />}
      </section>

      <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0">
        {pdfDocument && (
          <SalesDocumentPdf
            client={activePdfClient}
            company={company}
            documentData={pdfDocument}
            ref={pdfRef}
          />
        )}
      </div>
    </main>
  )
}
