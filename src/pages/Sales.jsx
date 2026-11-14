import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, FilePlus2, FileText, PackageCheck, Plus, Printer, Search, Trash2 } from 'lucide-react'
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase/config'
import EmptyState from '../components/common/EmptyState'
import DataTablePagination from '../components/common/DataTablePagination'
import TableSkeleton from '../components/common/TableSkeleton'
import SalesPdf from '../components/pdf/SalesPdf'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'
import { calculateLineAmounts, sumLineAmounts } from '../utils/money'

const DOCUMENT_OPTIONS = [
  { value: 'quote', label: 'Devis', prefix: 'DEV', prefixField: 'quotePrefix' },
  { value: 'purchaseOrder', label: 'Bon de commande', prefix: 'BC', prefixField: 'purchaseOrderPrefix' },
  { value: 'deliveryNote', label: 'Bon de livraison', prefix: 'BL', prefixField: 'deliveryNotePrefix' },
  { value: 'invoice', label: 'Facture', prefix: 'FAC', prefixField: 'invoicePrefix' },
]
const supportedCurrencies = ['MAD', 'EUR', 'USD']
const VAT_OPTIONS = [20, 14, 0]
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'

function localDate(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addMonthsToDate(value, months) {
  const [year, month, day] = value.split('-').map(Number)
  const targetMonth = new Date(year, month - 1 + months, 1)
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate()
  targetMonth.setDate(Math.min(day, lastDay))
  return `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, '0')}-${String(targetMonth.getDate()).padStart(2, '0')}`
}

function createEmptyForm(company = {}) {
  const issueDate = localDate()
  const defaultVatRate = Number(company.defaultVatRate)
  const vatRate = Number.isFinite(defaultVatRate) && defaultVatRate >= 0 && defaultVatRate <= 100
    ? defaultVatRate
    : 20
  return {
    type: 'quote',
    clientId: '',
    issueDate,
    dueDate: addMonthsToDate(issueDate, Number(company.defaultQuoteValidityMonths) || 3),
    notes: '',
    generalConditions: company.defaultTermsAndConditions || '',
    items: [{ stockId: '', quantity: '1', taxRate: String(vatRate) }],
  }
}

function formatCurrency(value, currency = 'MAD') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: supportedCurrencies.includes(currency) ? currency : 'MAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function getDefaultVatRate(company) {
  const rate = Number(company.defaultVatRate)
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 20
}

function getVatOptions(company) {
  return [...new Set([...VAT_OPTIONS, getDefaultVatRate(company)])]
    .sort((first, second) => second - first)
}

function tryCalculateLineAmounts(unitPrice, quantity, taxRate) {
  const price = Number(unitPrice)
  const count = Number(quantity)
  const rate = Number(taxRate)
  if (
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isInteger(count) ||
    count <= 0 ||
    !Number.isFinite(rate) ||
    rate < 0 ||
    rate > 100
  ) {
    return null
  }
  const priceCents = Math.round(price * 100)
  const baseCents = priceCents * count
  if (
    !Number.isSafeInteger(priceCents) ||
    !Number.isSafeInteger(baseCents) ||
    !Number.isSafeInteger(baseCents * Math.round(rate * 100))
  ) {
    return null
  }
  return calculateLineAmounts(price, count, rate)
}

function formatDate(value) {
  if (!value) return '—'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('fr-FR')
}

function getClientName(client) {
  return client?.name || client?.companyName || client?.clientName || 'Client'
}

function safeFilename(value) {
  return String(value || 'document')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

export default function Sales() {
  const { role, user } = useAuth()
  const { data: clients, loading: clientsLoading, error: clientsError } = useFirestoreCollection('clients')
  const { data: stock, loading: stockLoading, error: stockError } = useFirestoreCollection('stock')
  const { data: sales, loading: salesLoading, error: salesError } = useFirestoreCollection('sales')
  const { data: legacySales, error: legacySalesError } = useFirestoreCollection('salesDocuments')
  const [form, setForm] = useState(createEmptyForm)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [deliverySavingId, setDeliverySavingId] = useState('')
  const [exportingId, setExportingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [company, setCompany] = useState({})
  const [settingsError, setSettingsError] = useState('')
  const [pdfRequest, setPdfRequest] = useState(null)
  const pdfRef = useRef(null)
  const settingsLoadedRef = useRef(false)

  const availableDocumentTypes = useMemo(
    () => role === 'Commercial'
      ? DOCUMENT_OPTIONS.filter((option) => ['quote', 'invoice'].includes(option.value))
      : DOCUMENT_OPTIONS,
    [role],
  )

  useEffect(() => {
    return onSnapshot(
      doc(db, 'settings', 'company'),
      (snapshot) => {
        const settings = snapshot.exists() ? snapshot.data() : {}
        setCompany(settings)
        const isInitialSettingsLoad = !settingsLoadedRef.current
        settingsLoadedRef.current = true
        setForm((current) => {
          const next = isInitialSettingsLoad
            ? {
              ...current,
              items: current.items.map((line) => line.stockId
                ? line
                : { ...line, taxRate: String(getDefaultVatRate(settings)) }),
            }
            : current
          return current.type === 'quote' && !current.generalConditions
            ? {
              ...next,
              dueDate: addMonthsToDate(
                current.issueDate,
                Number(settings.defaultQuoteValidityMonths) || 3,
              ),
              generalConditions: settings.defaultTermsAndConditions || '',
            }
            : next
        })
      },
      (snapshotError) => setSettingsError(snapshotError.message),
    )
  }, [])

  useEffect(() => {
    if (!pdfRequest || !pdfRef.current) return undefined
    let cancelled = false
    const generatePdf = async () => {
      try {
        const generate = (await import('../utils/pdfEngine')).default
        await generate(pdfRef.current, `${safeFilename(pdfRequest.document.number)}.pdf`, company)
      } catch (pdfError) {
        if (!cancelled) setError(pdfError instanceof Error ? pdfError.message : 'Impossible de générer le PDF.')
      } finally {
        if (!cancelled) {
          setExportingId('')
          setPdfRequest(null)
        }
      }
    }
    void generatePdf()
    return () => { cancelled = true }
  }, [pdfRequest, company])

  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  )
  const stockById = useMemo(
    () => new Map(stock.map((item) => [item.id, item])),
    [stock],
  )
  const documents = useMemo(
    () => [
      ...sales.map((item) => ({ ...item, sourceCollection: 'sales' })),
      ...legacySales.map((item) => ({ ...item, sourceCollection: 'salesDocuments' })),
    ].filter((item) => availableDocumentTypes.some((option) => option.value === item.type)),
    [sales, legacySales, availableDocumentTypes],
  )
  const filteredDocuments = useMemo(() => {
    const search = query.trim().toLowerCase()
    return documents
      .filter((item) => !typeFilter || item.type === typeFilter)
      .filter((item) =>
        [item.number, item.clientName, item.type]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search)),
      )
      .sort((first, second) => String(second.number || '').localeCompare(String(first.number || ''), 'fr'))
  }, [documents, query, typeFilter])
  const table = useDataTable(filteredDocuments)

  const calculatedTotals = useMemo(() => {
    const validLines = form.items.flatMap((line) => {
      const item = stockById.get(line.stockId)
      const unitPrice = Number(item?.salePrice ?? item?.unitPrice)
      const taxRate = Number(line.taxRate ?? getDefaultVatRate(company))
      if (!item || !getVatOptions(company).includes(taxRate)) return []
      const amounts = tryCalculateLineAmounts(unitPrice, line.quantity, taxRate)
      return amounts ? [amounts] : []
    })
    try {
      return { ...sumLineAmounts(validLines), error: '' }
    } catch (sumError) {
      if (!(sumError instanceof RangeError)) throw sumError
      return {
        totalHT: 0,
        totalTax: 0,
        totalTTC: 0,
        error: 'Le total dépasse la limite de calcul prise en charge. Réduisez les quantités ou les montants.',
      }
    }
  }, [company, form.items, stockById])

  const updateLine = (index, changes) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line, lineIndex) => lineIndex === index ? { ...line, ...changes } : line),
    }))
  }

  const addLine = () => {
    setForm((current) => ({
      ...current,
      items: [
        ...current.items,
        { stockId: '', quantity: '1', taxRate: String(getDefaultVatRate(company)) },
      ],
    }))
  }

  const removeLine = (index) => {
    setForm((current) => ({ ...current, items: current.items.filter((_, lineIndex) => lineIndex !== index) }))
  }

  const saveDocument = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!clientById.has(form.clientId)) {
      setError('Sélectionnez un client valide.')
      return
    }
    if (!availableDocumentTypes.some((option) => option.value === form.type)) {
      setError('Le type de document sélectionné n’est pas autorisé pour votre rôle.')
      return
    }
    if (!form.issueDate || !form.dueDate || form.dueDate < form.issueDate) {
      setError('Renseignez des dates valides ; l’échéance doit être le jour d’émission ou une date ultérieure.')
      return
    }
    if (!form.items.length || form.items.some((line) => !line.stockId)) {
      setError('Ajoutez au moins une ligne et sélectionnez un article sur chaque ligne.')
      return
    }
    if (form.items.some((line) => !Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity) <= 0)) {
      setError('La quantité de chaque ligne doit être un entier supérieur à zéro.')
      return
    }
    if (form.items.some((line) => !stockById.has(line.stockId))) {
      setError('Un article sélectionné n’est plus disponible dans le stock.')
      return
    }
    if (form.items.some((line) => !getVatOptions(company).includes(Number(line.taxRate)))) {
      setError('Sélectionnez un taux de TVA autorisé sur chaque ligne.')
      return
    }
    if (calculatedTotals.error) {
      setError(calculatedTotals.error)
      return
    }

    setSaving(true)
    try {
      const client = clientById.get(form.clientId)
      const documentRef = doc(collection(db, 'sales'))
      const year = form.issueDate.slice(0, 4)
      const counterRef = doc(db, 'salesCounters', `${form.type}-${year}`)
      const stockRefs = form.items.map((line) => doc(db, 'stock', line.stockId))

      const documentData = await runTransaction(db, async (transaction) => {
        const counterSnapshot = await transaction.get(counterRef)
        const stockSnapshots = await Promise.all(stockRefs.map((stockRef) => transaction.get(stockRef)))
        const lines = form.items.map((line, index) => {
          const itemSnapshot = stockSnapshots[index]
          if (!itemSnapshot.exists()) throw new Error('Un article n’existe plus dans l’inventaire.')
          const item = itemSnapshot.data()
          const quantity = Number(line.quantity)
          const unitPrice = Number(item.salePrice ?? item.unitPrice)
          const taxRate = Number(line.taxRate ?? getDefaultVatRate(company))
          if (!Number.isFinite(unitPrice) || unitPrice < 0) {
            throw new Error(`Le prix de vente de « ${item.name || item.designation || 'l’article'} » est invalide.`)
          }
          if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
            throw new Error(`Le taux de TVA de « ${item.name || item.designation || 'l’article'} » est invalide.`)
          }
          const amounts = calculateLineAmounts(unitPrice, quantity, taxRate)
          return {
            stockId: line.stockId,
            reference: item.reference || item.tgiReference || '',
            name: item.name || item.designation || '',
            quantity,
            unitPrice: amounts.unitPrice,
            taxRate,
            totalHT: amounts.totalHT,
            taxAmount: amounts.taxAmount,
            totalTTC: amounts.totalTTC,
          }
        })
        const totals = sumLineAmounts(lines)
        const sequence = Number(counterSnapshot.data()?.value || 0) + 1
        const documentOption = DOCUMENT_OPTIONS.find((option) => option.value === form.type)
        const configuredPrefix = documentOption && String(company[documentOption.prefixField] || documentOption.prefix)
          .trim()
          .replace(/-+$/, '')
        const prefix = configuredPrefix || 'DOC'
        const number = `${prefix}-${year}-${String(sequence).padStart(3, '0')}`
        const data = {
          type: form.type,
          number,
          clientId: client.id,
          clientName: getClientName(client),
          clientAddress: client.address || '',
          clientCity: client.city || '',
          clientPostalCode: client.postalCode || '',
          clientPhone: client.phone || client.phone1 || '',
          clientEmail: client.email || '',
          clientIce: client.ice || '',
          items: lines,
          ...totals,
          issueDate: form.issueDate,
          dueDate: form.dueDate,
          notes: form.notes.trim(),
          generalConditions: form.type === 'quote' ? form.generalConditions.trim() : '',
          paidAmount: 0,
          remainingAmount: form.type === 'invoice' ? totals.totalTTC : 0,
          status: form.type === 'invoice' ? 'unpaid' : 'issued',
          ...(form.type === 'deliveryNote' ? { stockDeducted: false } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
        transaction.set(counterRef, { value: sequence, updatedAt: serverTimestamp() })
        transaction.set(documentRef, data)
        return { ...data, id: documentRef.id }
      })

      setForm(createEmptyForm(company))
      setNotice(`${form.type === 'invoice' ? 'Facture' : availableDocumentTypes.find((option) => option.value === form.type)?.label} ${documentData.number} enregistrée. Génération du PDF…`)
      setExportingId(documentData.id)
      setPdfRequest({
        document: documentData,
        client,
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer ce document.')
    } finally {
      setSaving(false)
    }
  }

  const exportDocument = async (documentData) => {
    setError('')
    setExportingId(documentData.id)
    try {
      const client = clientById.get(documentData.clientId) || {
        name: documentData.clientName,
        address: documentData.clientAddress,
        city: documentData.clientCity,
        postalCode: documentData.clientPostalCode,
        phone: documentData.clientPhone,
        email: documentData.clientEmail,
        ice: documentData.clientIce,
      }
      setPdfRequest({ document: documentData, client })
    } catch (exportError) {
      setExportingId('')
      setError(exportError instanceof Error ? exportError.message : 'Impossible de préparer le PDF.')
    }
  }

  const validateDelivery = async (documentData) => {
    setError('')
    setNotice('')
    if (!['Directeur', 'SuperAdmin'].includes(role)) {
      setError('Seul le Directeur ou le SuperAdmin peut valider une livraison.')
      return
    }
    if (documentData.sourceCollection !== 'sales' || documentData.type !== 'deliveryNote') {
      setError('Seuls les nouveaux bons de livraison peuvent être validés ici. Les documents historiques ont pu déjà déduire le stock.')
      return
    }
    if (!window.confirm(`Confirmer la livraison ${documentData.number} ? Les quantités seront déduites du stock et cette action ne pourra pas être appliquée deux fois.`)) {
      return
    }

    setDeliverySavingId(documentData.id)
    try {
      const deliveryRef = doc(db, 'sales', documentData.id)
      await runTransaction(db, async (transaction) => {
        const deliverySnapshot = await transaction.get(deliveryRef)
        if (!deliverySnapshot.exists()) throw new Error('Ce bon de livraison n’existe plus.')
        const delivery = deliverySnapshot.data()
        if (delivery.type !== 'deliveryNote') throw new Error('Le document sélectionné n’est pas un bon de livraison.')
        if (delivery.stockDeducted === true || ['delivered', 'livré', 'livree', 'livrée'].includes(String(delivery.status || '').toLowerCase())) {
          throw new Error('Cette livraison a déjà été validée ; le stock ne sera pas déduit une seconde fois.')
        }

        const requiredByStock = new Map()
        for (const line of delivery.items || []) {
          const stockId = String(line.stockId || '')
          const quantity = Number(line.quantity)
          if (!stockId || !Number.isInteger(quantity) || quantity <= 0) {
            throw new Error('Une ligne du bon est invalide (article ou quantité manquante).')
          }
          requiredByStock.set(stockId, (requiredByStock.get(stockId) || 0) + quantity)
        }
        if (!requiredByStock.size) throw new Error('Ce bon ne contient aucun article à livrer.')

        const stockIds = [...requiredByStock.keys()]
        const stockRefs = stockIds.map((stockId) => doc(db, 'stock', stockId))
        const stockSnapshots = await Promise.all(stockRefs.map((stockRef) => transaction.get(stockRef)))
        const stockUpdates = stockSnapshots.map((snapshot, index) => {
          const stockId = stockIds[index]
          if (!snapshot.exists()) throw new Error(`L’article de stock ${stockId} n’existe plus.`)
          const item = snapshot.data()
          const currentQuantity = Number(item.quantity)
          const requiredQuantity = requiredByStock.get(stockId)
          if (!Number.isInteger(currentQuantity) || currentQuantity < 0) {
            throw new Error(`La quantité en stock de « ${item.name || item.designation || stockId} » est invalide.`)
          }
          if (currentQuantity < requiredQuantity) {
            throw new Error(`Stock insuffisant pour « ${item.name || item.designation || stockId} » : ${currentQuantity} disponible(s), ${requiredQuantity} requis.`)
          }
          return { ref: stockRefs[index], quantity: currentQuantity - requiredQuantity }
        })

        for (const update of stockUpdates) {
          transaction.update(update.ref, { quantity: update.quantity, updatedAt: serverTimestamp() })
        }
        transaction.update(deliveryRef, {
          status: 'delivered',
          stockDeducted: true,
          deliveryValidatedAt: serverTimestamp(),
          deliveryValidatedBy: user?.uid || null,
          updatedAt: serverTimestamp(),
        })
      })
      setNotice(`Livraison ${documentData.number} validée ; les quantités ont été mises à jour.`)
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Impossible de valider cette livraison.')
    } finally {
      setDeliverySavingId('')
    }
  }

  const documentLabel = (type) => DOCUMENT_OPTIONS.find((option) => option.value === type)?.label || type
  const documentStatusLabel = (documentData) => {
    if (documentData.type === 'deliveryNote') {
      return documentData.stockDeducted === true || ['delivered', 'livré', 'livree', 'livrée'].includes(String(documentData.status || '').toLowerCase())
        ? 'Livré'
        : 'À livrer'
    }
    return documentData.status || 'Émis'
  }
  const pageError = clientsError || stockError || salesError || legacySalesError || settingsError || error
  const selectedClient = clientById.get(form.clientId)

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Gestion commerciale</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Ventes & facturation</h1>
          <p className="mt-2 text-sm text-slate-500">Devis, commandes, livraisons et factures avec calculs HT / TVA / TTC.</p>
        </div>
      </header>

      {pageError && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          {pageError}
        </p>
      )}
      {notice && <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{notice}</p>}

      <section className="mt-8 animate-slide-up rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><FilePlus2 size={19} /></span>
            <div>
              <h2 className="font-semibold text-slate-900">Nouveau document</h2>
              <p className="mt-1 text-xs text-slate-500">Les prix viennent du stock ; le taux de TVA est réglable sur chaque ligne.</p>
            </div>
          </div>
        </div>

        <form className="space-y-6 p-5 sm:p-7" onSubmit={saveDocument}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Type de document *</span>
              <select
                className={inputClass}
                onChange={(event) => setForm((current) => {
                  const type = event.target.value
                  return {
                    ...current,
                    type,
                    dueDate: type === 'quote'
                      ? addMonthsToDate(current.issueDate, Number(company.defaultQuoteValidityMonths) || 3)
                      : current.dueDate || localDate(30),
                    generalConditions: type === 'quote'
                      ? current.generalConditions || company.defaultTermsAndConditions || ''
                      : current.generalConditions,
                  }
                })}
                value={form.type}
              >
                {availableDocumentTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <span className="mt-1 block text-xs text-slate-500">Numéro généré automatiquement à l’enregistrement.</span>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Date d’émission *</span>
              <input
                className={inputClass}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  issueDate: event.target.value,
                  dueDate: current.type === 'quote'
                    ? addMonthsToDate(event.target.value, Number(company.defaultQuoteValidityMonths) || 3)
                    : current.dueDate,
                }))}
                required
                type="date"
                value={form.issueDate}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">{form.type === 'quote' ? 'Valide jusqu’au *' : 'Date d’échéance *'}</span>
              <input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} required type="date" value={form.dueDate} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Client *</span>
              <select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, clientId: event.target.value }))} required value={form.clientId}>
                <option value="">Sélectionner un client</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{getClientName(client)}</option>)}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                ICE : {selectedClient?.ice || 'Non renseigné'}
              </span>
            </label>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Lignes de facturation</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Taux sélectionnable par ligne · défaut des paramètres : {getDefaultVatRate(company)} %.
                </p>
              </div>
              <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-50" onClick={addLine} type="button">
                <Plus size={15} /> Ajouter une ligne
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {form.items.map((line, index) => {
                const item = stockById.get(line.stockId)
                const unitPrice = Number(item?.salePrice ?? item?.unitPrice)
                const taxRate = Number(line.taxRate ?? getDefaultVatRate(company))
                const amounts = item ? tryCalculateLineAmounts(unitPrice, line.quantity, taxRate) : null
                return (
                  <div className="grid items-end gap-3 p-4 sm:grid-cols-[minmax(0,2fr)_100px_110px_minmax(130px,1fr)_40px]" key={`sale-line-${index}`}>
                    <label>
                      <span className="mb-1.5 block text-xs font-semibold text-slate-700">Article *</span>
                      <select className={inputClass} onChange={(event) => updateLine(index, { stockId: event.target.value })} required value={line.stockId}>
                        <option value="">Sélectionner un article</option>
                        {stock.map((stockItem) => (
                          <option key={stockItem.id} value={stockItem.id}>
                            {stockItem.reference || stockItem.tgiReference || '—'} · {stockItem.name || stockItem.designation}
                          </option>
                        ))}
                      </select>
                      {item && <span className="mt-1 block text-xs text-slate-500">{formatCurrency(unitPrice, company.defaultCurrency)} HT / unité · Stock {item.quantity ?? 0}</span>}
                    </label>
                    <label>
                      <span className="mb-1.5 block text-xs font-semibold text-slate-700">Quantité *</span>
                      <input className={inputClass} min="1" onChange={(event) => updateLine(index, { quantity: event.target.value })} required step="1" type="number" value={line.quantity} />
                    </label>
                    <label>
                      <span className="mb-1.5 block text-xs font-semibold text-slate-700">TVA *</span>
                      <select
                        className={inputClass}
                        onChange={(event) => updateLine(index, { taxRate: event.target.value })}
                        required
                        value={String(taxRate)}
                      >
                        {getVatOptions(company).map((rate) => (
                          <option key={rate} value={rate}>{rate}%</option>
                        ))}
                      </select>
                    </label>
                    <div className="pb-2 text-right">
                      <span className="block text-xs text-slate-500">Total HT ligne</span>
                      <strong className="text-sm text-slate-900">{amounts ? formatCurrency(amounts.totalHT, company.defaultCurrency) : '—'}</strong>
                      <span className="mt-1 block text-xs text-slate-500">
                        TVA : {amounts ? formatCurrency(amounts.taxAmount, company.defaultCurrency) : '—'}
                        {' · '}TTC : {amounts ? formatCurrency(amounts.totalTTC, company.defaultCurrency) : '—'}
                      </span>
                    </div>
                    <button aria-label={`Supprimer la ligne ${index + 1}`} className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40" disabled={form.items.length === 1} onClick={() => removeLine(index)} type="button">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Notes / conditions</span>
            <textarea className={`${inputClass} min-h-20 resize-y`} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={3} value={form.notes} />
          </label>
          {form.type === 'quote' && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Conditions générales de vente</span>
              <textarea
                className={`${inputClass} min-h-28 resize-y`}
                onChange={(event) => setForm((current) => ({ ...current, generalConditions: event.target.value }))}
                rows={4}
                value={form.generalConditions}
              />
              <span className="mt-1 block text-xs text-slate-500">Préremplies depuis les paramètres de la société ; modifiables pour ce devis.</span>
            </label>
          )}

          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            {form.type === 'deliveryNote' && (
              <p className="max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                Le stock ne sera décrémenté qu’après validation du bon de livraison.
              </p>
            )}
            <div className="ml-auto rounded-xl bg-slate-50 px-5 py-4 sm:min-w-[20rem]">
              {calculatedTotals.error && (
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                  {calculatedTotals.error}
                </p>
              )}
              <p className="flex justify-between gap-8 text-sm text-slate-600"><span>Total HT</span><strong>{formatCurrency(calculatedTotals.totalHT, company.defaultCurrency)}</strong></p>
              <p className="mt-2 flex justify-between gap-8 text-sm text-slate-600"><span>Total TVA</span><strong>{formatCurrency(calculatedTotals.totalTax, company.defaultCurrency)}</strong></p>
              <p className="mt-3 flex justify-between gap-8 border-t border-slate-200 pt-3 text-base font-bold text-blue-900"><span>Total TTC</span><strong>{formatCurrency(calculatedTotals.totalTTC, company.defaultCurrency)}</strong></p>
            </div>
          </div>
          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-steel-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-steel-900/15 transition hover:-translate-y-0.5 hover:bg-steel-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={saving || clientsLoading || stockLoading || clients.length === 0 || stock.length === 0 || Boolean(calculatedTotals.error)} type="submit">
              <FilePlus2 size={17} /> {saving ? 'Enregistrement…' : 'Enregistrer et générer le PDF'}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><FileText size={19} /></span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Documents de vente</h2>
              <p className="text-xs text-slate-500">{filteredDocuments.length} document(s)</p>
            </div>
          </div>
          <div className="grid w-full gap-2 sm:max-w-lg sm:grid-cols-[minmax(180px,1fr)_170px]">
            <label className="relative block">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" onChange={(event) => { setQuery(event.target.value); table.setPage(1) }} placeholder="Rechercher un document…" type="search" value={query} />
            </label>
            <select aria-label="Filtrer par type de document" className={inputClass} onChange={(event) => { setTypeFilter(event.target.value); table.setPage(1) }} value={typeFilter}>
              <option value="">Tous les types</option>
              {availableDocumentTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
        {salesLoading ? (
          <TableSkeleton columns={6} minWidth={720} />
        ) : filteredDocuments.length === 0 ? (
          <EmptyState
            actionLabel={query || typeFilter ? 'Effacer les filtres' : 'Créer un document'}
            description={query || typeFilter
              ? 'Essayez une autre recherche ou effacez les filtres actifs.'
              : 'Préparez un devis, un bon de livraison ou une facture à partir du formulaire.'}
            icon={FileText}
            onAction={() => {
              if (query || typeFilter) {
                setQuery('')
                setTypeFilter('')
                table.setPage(1)
              } else {
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }
            }}
            title={query || typeFilter ? 'Aucun document trouvé' : 'Aucun document de vente'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[45rem] text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3.5">Numéro / type</th>
                  <th className="px-5 py-3.5">Client</th>
                  <th className="px-5 py-3.5">Émission / échéance</th>
                  <th className="px-5 py-3.5">Total TTC</th>
                  <th className="px-5 py-3.5">État</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((documentData) => (
                  <tr className="hover:bg-slate-50/70" key={`${documentData.sourceCollection}-${documentData.id}`}>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-900">{documentData.number}</p>
                      <p className="mt-1 text-xs text-slate-500">{documentLabel(documentData.type)}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">{documentData.clientName || '—'}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{formatDate(documentData.issueDate)}<span className="mt-1 block text-xs text-slate-400">Échéance : {formatDate(documentData.dueDate)}</span></td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-800">{formatCurrency(documentData.totalTTC, company.defaultCurrency)}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{documentStatusLabel(documentData)}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        {documentData.type === 'deliveryNote' && documentData.sourceCollection === 'sales' && (
                          documentData.stockDeducted === true || documentStatusLabel(documentData) === 'Livré' ? (
                            <span className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-emerald-700">
                              <PackageCheck size={15} /> Validée
                            </span>
                          ) : (
                            <button
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                              disabled={Boolean(deliverySavingId)}
                              onClick={() => void validateDelivery(documentData)}
                              type="button"
                            >
                              <PackageCheck size={15} />
                              {deliverySavingId === documentData.id ? 'Validation…' : 'Valider livraison'}
                            </button>
                          )
                        )}
                        {documentData.type === 'deliveryNote' && documentData.sourceCollection === 'salesDocuments' && (
                          <span className="px-2 py-2 text-xs text-slate-400" title="Le stock de ces documents historiques a pu être déduit à leur création.">Historique</span>
                        )}
                        <button aria-label={`Exporter ${documentData.number} en PDF`} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-50" disabled={exportingId === documentData.id} onClick={() => void exportDocument(documentData)} type="button">
                          <Printer size={15} /> {exportingId === documentData.id ? 'Export…' : 'PDF'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!salesLoading && filteredDocuments.length > 0 && <DataTablePagination {...table} />}
      </section>

      {pdfRequest && (
        <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 -z-10">
          <SalesPdf client={pdfRequest.client} company={company} documentData={pdfRequest.document} ref={pdfRef} />
        </div>
      )}
    </main>
  )
}
