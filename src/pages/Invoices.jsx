import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Eye,
  FileDown,
  FilePlus2,
  LoaderCircle,
  Pencil,
  ReceiptText,
  Search,
  ShieldCheck,
} from 'lucide-react'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import EmptyState from '../components/common/EmptyState'
import DataTableExportToolbar from '../components/common/DataTableExportToolbar'
import DataTablePagination from '../components/common/DataTablePagination'
import SortableTableHeader from '../components/common/SortableTableHeader'
import TableSkeleton from '../components/common/TableSkeleton'
import InvoiceForm from '../components/invoices/InvoiceForm'
import SalesPdf from '../components/pdf/SalesPdf'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'
import { calculateLineAmounts, sumLineAmounts } from '../utils/money'

const VAT_OPTIONS = [0, 14, 20]
const LINKABLE_COLLECTIONS = ['quotes', 'delivery_notes', 'sales']
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-steel-500 focus:ring-4 focus:ring-steel-100'

function localDate(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateInputValue(value, fallback = '') {
  if (value && typeof value.toDate === 'function') {
    const date = value.toDate()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value
  return fallback
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function clientName(client) {
  return client?.name || client?.companyName || client?.clientName || 'Client'
}

function toCents(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Un montant positif ou nul est requis.')
  const cents = Math.round((amount + Number.EPSILON) * 100)
  if (!Number.isSafeInteger(cents)) throw new RangeError('Le montant dépasse la précision prise en charge.')
  return cents
}

function formatCurrency(value, currency = 'MAD') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: ['MAD', 'EUR', 'USD'].includes(currency) ? currency : 'MAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(value) {
  const dateValue = dateInputValue(value)
  if (!dateValue) return '—'
  const date = new Date(`${dateValue}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR')
}

function safeFilename(value) {
  return String(value || 'facture')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .toLowerCase() || 'facture'
}

function formatDocumentNumber(prefix, year, sequence) {
  const safePrefix = String(prefix || 'FAC').trim().replace(/-+$/, '') || 'FAC'
  return `${safePrefix}-${year}-${String(sequence).padStart(3, '0')}`
}

function createEmptyForm(company = {}) {
  const rate = Number(company.defaultVatRate)
  const defaultRate = VAT_OPTIONS.includes(rate) ? rate : 20
  const issueDate = localDate()
  return {
    clientId: '',
    issueDate,
    dueDate: localDate(30),
    linkedDocumentKey: '',
    linkedDocumentCollection: '',
    linkedDocumentId: '',
    linkedDocumentNumber: '',
    linkedDocumentType: '',
    paymentTerms: '',
    notes: '',
    items: [{
      type: 'service',
      stockId: '',
      reference: '',
      designation: '',
      unitPrice: '',
      quantity: '1',
      taxRate: String(defaultRate),
    }],
  }
}

function mapInvoiceToForm(invoice, stockById) {
  const linkedDocumentCollection = LINKABLE_COLLECTIONS.includes(invoice.linkedDocumentCollection)
    ? invoice.linkedDocumentCollection
    : ''
  const linkedDocumentId = invoice.linkedDocumentId || ''
  return {
    clientId: invoice.clientId || '',
    issueDate: dateInputValue(invoice.issueDate, localDate()),
    dueDate: dateInputValue(invoice.dueDate, localDate(30)),
    linkedDocumentKey: linkedDocumentCollection && linkedDocumentId
      ? `${linkedDocumentCollection}:${linkedDocumentId}`
      : '',
    linkedDocumentCollection,
    linkedDocumentId,
    linkedDocumentNumber: invoice.linkedDocumentNumber || invoice.sourceQuoteNumber || '',
    linkedDocumentType: invoice.linkedDocumentType || '',
    paymentTerms: invoice.paymentTerms || '',
    notes: invoice.notes || '',
    items: (Array.isArray(invoice.items) ? invoice.items : []).map((line) => {
      const stockItem = stockById.get(line.stockId)
      return {
        type: line.stockId ? 'piece' : 'service',
        stockId: line.stockId || '',
        reference: line.reference || line.tgiReference || stockItem?.reference || stockItem?.tgiReference || '',
        designation: line.name || line.designation || stockItem?.name || stockItem?.designation || '',
        unitPrice: String(line.unitPrice ?? ''),
        quantity: String(line.quantity ?? 1),
        taxRate: String(line.taxRate ?? line.vatRate ?? 20),
      }
    }),
  }
}

function makeTotals(linePreviews) {
  const validLines = linePreviews.filter((line) => line.amounts).map((line) => line.amounts)
  try {
    const totals = sumLineAmounts(validLines)
    const grouped = new Map()
    linePreviews.forEach(({ amounts }) => {
      if (!amounts) return
      const rows = grouped.get(amounts.taxRate) || []
      rows.push(amounts)
      grouped.set(amounts.taxRate, rows)
    })
    const taxBreakdown = [...grouped.entries()]
      .sort(([first], [second]) => second - first)
      .map(([taxRate, rows]) => {
        const subtotal = sumLineAmounts(rows)
        return { taxRate, totalHT: subtotal.totalHT, totalTax: subtotal.totalTax }
      })
    return { ...totals, taxBreakdown, error: '' }
  } catch (calculationError) {
    if (!(calculationError instanceof RangeError || calculationError instanceof TypeError)) throw calculationError
    return {
      totalHT: 0,
      totalTax: 0,
      totalTTC: 0,
      taxBreakdown: [],
      error: 'Le total dépasse la précision de calcul prise en charge.',
    }
  }
}

function createSavedLines(items, currentStockSnapshots, allowedRates) {
  return items.map((line) => {
    const type = line.type === 'piece' ? 'piece' : 'service'
    const quantity = Number(line.quantity)
    const unitPrice = Number(line.unitPrice)
    const taxRate = Number(line.taxRate)
    if (!['piece', 'service'].includes(type)) throw new Error('Le type d’une ligne est invalide.')
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Chaque quantité doit être un entier positif.')
    if (line.unitPrice === '' || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error('Chaque prix unitaire HT doit être positif ou nul.')
    }
    if (!allowedRates.includes(taxRate)) throw new Error('Un taux de TVA sélectionné n’est plus autorisé.')
    const designation = String(line.designation || '').trim()
    if (!designation) throw new Error('La désignation de chaque ligne est obligatoire.')

    let stockItem = null
    if (type === 'piece') {
      if (!line.stockId) throw new Error('Sélectionnez un article de stock pour chaque ligne de pièce.')
      const stockSnapshot = currentStockSnapshots.get(line.stockId)
      if (!stockSnapshot?.exists()) throw new Error('Un article sélectionné n’existe plus dans le stock.')
      stockItem = stockSnapshot.data()
    }

    const amounts = calculateLineAmounts(unitPrice, quantity, taxRate)
    return {
      lineType: type,
      stockId: type === 'piece' ? line.stockId : '',
      reference: type === 'piece'
        ? stockItem.reference || stockItem.tgiReference || line.reference || ''
        : '',
      name: designation,
      designation,
      quantity,
      unitPrice: amounts.unitPrice,
      taxRate,
      totalHT: amounts.totalHT,
      taxAmount: amounts.taxAmount,
      totalTTC: amounts.totalTTC,
    }
  })
}

function getTotalsFromSavedLines(lines) {
  const totals = sumLineAmounts(lines)
  const grouped = new Map()
  lines.forEach((line) => {
    const rows = grouped.get(Number(line.taxRate)) || []
    rows.push(line)
    grouped.set(Number(line.taxRate), rows)
  })
  const taxBreakdown = [...grouped.entries()]
    .sort(([first], [second]) => second - first)
    .map(([taxRate, rows]) => {
      const subtotal = sumLineAmounts(rows)
      return { taxRate, totalHT: subtotal.totalHT, totalTax: subtotal.totalTax }
    })
  return { ...totals, taxBreakdown }
}

function isDraft(invoice) {
  const status = String(invoice.status || '').trim().toLocaleLowerCase('fr')
  return ['brouillon', 'draft'].includes(status)
}

function getInvoiceStatus(invoice) {
  const status = String(invoice.status || '').trim().toLocaleLowerCase('fr')
  if (['annulée', 'annulee', 'annulé', 'annule', 'cancelled', 'canceled'].includes(status)) return 'Annulée'
  if (isDraft(invoice)) return 'Brouillon'
  const total = Number(invoice.totalTTC)
  const paid = Number(invoice.paidAmount || 0)
  const remaining = invoice.remainingAmount === null || invoice.remainingAmount === undefined
    ? total - paid
    : Number(invoice.remainingAmount)
  if (Number.isFinite(total) && Number.isFinite(paid) && Number.isFinite(remaining)) {
    try {
      const totalCents = toCents(total)
      const paidCents = toCents(paid)
      const remainingCents = toCents(remaining)
      if (remainingCents === 0 || (totalCents > 0 && paidCents >= totalCents)) return 'Payée'
      if (paidCents > 0) return 'Paiement Partiel'
      return 'Validée / Non Payée'
    } catch {
      return 'Validée / Non Payée'
    }
  }
  if (['paid', 'payée', 'payee'].includes(status)) return 'Payée'
  if (['partial', 'partielle', 'paiement partiel'].includes(status)) return 'Paiement Partiel'
  return 'Validée / Non Payée'
}

function statusStyle(status) {
  return ({
    Brouillon: 'border-slate-200 bg-slate-100 text-slate-700',
    'Validée / Non Payée': 'border-amber-200 bg-amber-50 text-amber-800',
    'Paiement Partiel': 'border-sky-200 bg-sky-50 text-sky-800',
    Payée: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    Annulée: 'border-red-200 bg-red-50 text-red-800',
  })[status] || 'border-slate-200 bg-slate-100 text-slate-700'
}

function getLinkedDocumentType(documentData) {
  if (documentData.type === 'quote' || documentData.sourceCollection === 'quotes') return 'Devis'
  if (documentData.type === 'deliveryNote' || documentData.sourceCollection === 'delivery_notes') return 'Bon de livraison'
  return 'Document'
}

function getReference(invoice) {
  return invoice.linkedDocumentNumber ||
    invoice.sourceQuoteNumber ||
    invoice.sourceDocumentNumber ||
    invoice.referenceNumber ||
    '—'
}

export default function Invoices() {
  const { data: clients, loading: clientsLoading, error: clientsError } = useFirestoreCollection('clients')
  const { data: stock, loading: stockLoading, error: stockError } = useFirestoreCollection('stock')
  const { data: invoiceData, loading: invoicesLoading, error: invoicesError } = useFirestoreCollection('invoices')
  const { data: quotes, loading: quotesLoading, error: quotesError } = useFirestoreCollection('quotes')
  const { data: deliveryNotes, loading: deliveryNotesLoading, error: deliveryNotesError } = useFirestoreCollection('delivery_notes')
  const { data: sales, loading: salesLoading, error: salesError } = useFirestoreCollection('sales')
  const [company, setCompany] = useState({})
  const [companyError, setCompanyError] = useState('')
  const [form, setForm] = useState(createEmptyForm)
  const [formOpen, setFormOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [readOnly, setReadOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [validatingId, setValidatingId] = useState('')
  const [exportingId, setExportingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [numberPreview, setNumberPreview] = useState('')
  const [numberPreviewError, setNumberPreviewError] = useState('')
  const [numberPreviewLoading, setNumberPreviewLoading] = useState(false)
  const [pdfRequest, setPdfRequest] = useState(null)
  const pdfRef = useRef(null)

  useEffect(() => onSnapshot(
    doc(db, 'settings', 'company'),
    (snapshot) => {
      setCompany(snapshot.exists() ? snapshot.data() : {})
      setCompanyError('')
    },
    (snapshotError) => setCompanyError(snapshotError.message),
  ), [])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const clientsById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients])
  const stockById = useMemo(() => new Map(stock.map((item) => [item.id, item])), [stock])

  const linkedDocuments = useMemo(() => {
    const dedicatedQuotes = quotes.map((documentData) => ({ ...documentData, sourceCollection: 'quotes' }))
    const historicalSales = sales
      .filter((documentData) => ['quote', 'deliveryNote'].includes(documentData.type))
      .map((documentData) => ({ ...documentData, sourceCollection: 'sales' }))
    const dedicatedDeliveryNotes = deliveryNotes.map((documentData) => ({
      ...documentData,
      sourceCollection: 'delivery_notes',
    }))
    const sourceDocuments = [
      ...dedicatedQuotes,
      ...dedicatedDeliveryNotes,
      ...historicalSales,
    ]
    const seen = new Set()
    return sourceDocuments
      .filter((documentData) => {
        const key = `${documentData.sourceCollection}:${documentData.id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((documentData) => ({
        ...documentData,
        clientName: documentData.clientName || clientName(clientsById.get(documentData.clientId)),
        typeLabel: getLinkedDocumentType(documentData),
      }))
      .sort((first, second) => String(second.issueDate || second.deliveryDate || '')
        .localeCompare(String(first.issueDate || first.deliveryDate || '')))
  }, [quotes, deliveryNotes, sales, clientsById])
  const linkedDocumentsByKey = useMemo(
    () => new Map(linkedDocuments.map((item) => [`${item.sourceCollection}:${item.id}`, item])),
    [linkedDocuments],
  )

  const linePreviews = useMemo(() => form.items.map((line) => {
    const quantity = Number(line.quantity)
    const unitPrice = Number(line.unitPrice)
    const taxRate = Number(line.taxRate)
    let lineError = ''
    if (line.type === 'piece' && (!line.stockId || !stockById.has(line.stockId))) {
      lineError = 'Sélectionnez une pièce de stock valide.'
    } else if (!String(line.designation || '').trim()) {
      lineError = 'La désignation est obligatoire.'
    } else if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      lineError = 'La quantité doit être un entier positif.'
    } else if (line.unitPrice === '' || !Number.isFinite(unitPrice) || unitPrice < 0) {
      lineError = 'Saisissez un prix unitaire HT positif ou nul.'
    } else if (!VAT_OPTIONS.includes(taxRate)) {
      lineError = 'Le taux de TVA doit être 0 %, 14 % ou 20 %.'
    }
    let amounts = null
    if (!lineError) {
      try {
        amounts = { ...calculateLineAmounts(unitPrice, quantity, taxRate), taxRate }
      } catch (calculationError) {
        if (!(calculationError instanceof RangeError || calculationError instanceof TypeError)) throw calculationError
        lineError = 'Le calcul de cette ligne dépasse la précision prise en charge.'
      }
    }
    return {
      error: lineError,
      amounts,
      stockItem: line.stockId ? stockById.get(line.stockId) : null,
    }
  }), [form.items, stockById])
  const totals = useMemo(() => makeTotals(linePreviews), [linePreviews])

  const invoices = useMemo(() => {
    const dedicated = invoiceData.map((invoice) => ({ ...invoice, sourceCollection: 'invoices' }))
    const legacy = sales
      .filter((documentData) => documentData.type === 'invoice')
      .map((invoice) => ({ ...invoice, sourceCollection: 'sales' }))
    const seenIds = new Set(dedicated.map((invoice) => `${invoice.sourceCollection}:${invoice.id}`))
    return [...dedicated, ...legacy.filter((invoice) => !seenIds.has(`${invoice.sourceCollection}:${invoice.id}`))]
      .map((invoice) => {
        const client = clientsById.get(invoice.clientId)
        const total = Number(invoice.totalTTC)
        const paid = Math.max(0, Number(invoice.paidAmount || 0))
        const remaining = invoice.remainingAmount === null || invoice.remainingAmount === undefined
          ? Math.max(0, total - paid)
          : Math.max(0, Number(invoice.remainingAmount))
        const status = getInvoiceStatus(invoice)
        return {
          ...invoice,
          __clientName: invoice.clientName || clientName(client),
          __client: client || {
            name: invoice.clientName,
            address: invoice.clientAddress,
            city: invoice.clientCity,
            postalCode: invoice.clientPostalCode,
            phone: invoice.clientPhone,
            email: invoice.clientEmail,
            ice: invoice.clientIce,
          },
          __status: status,
          __totalTTC: Number.isFinite(total) ? total : null,
          __remaining: ['Brouillon', 'Annulée'].includes(status)
            ? null
            : Number.isFinite(remaining) ? remaining : 0,
          __issueDate: dateInputValue(invoice.issueDate),
          __reference: getReference(invoice),
        }
      })
  }, [invoiceData, sales, clientsById])

  const filteredInvoices = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('fr')
    return invoices
      .filter((invoice) => !clientFilter || invoice.clientId === clientFilter)
      .filter((invoice) => !statusFilter || invoice.__status === statusFilter)
      .filter((invoice) => !periodStart || (invoice.__issueDate && invoice.__issueDate >= periodStart))
      .filter((invoice) => !periodEnd || (invoice.__issueDate && invoice.__issueDate <= periodEnd))
      .filter((invoice) =>
        [invoice.number, invoice.__clientName, invoice.__reference, invoice.__status]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('fr').includes(search)),
      )
  }, [invoices, query, clientFilter, statusFilter, periodStart, periodEnd])
  const table = useDataTable(filteredInvoices)

  const exportColumns = [
    { label: 'N° Facture', key: 'number' },
    { label: 'Date', value: (invoice) => formatDate(invoice.issueDate) },
    { label: 'Client', key: '__clientName' },
    { label: 'Réf. document', key: '__reference' },
    { label: 'Total TTC', value: (invoice) => formatCurrency(invoice.__totalTTC, company.defaultCurrency) },
    { label: 'Reste à payer', value: (invoice) => invoice.__remaining === null ? '—' : formatCurrency(invoice.__remaining, company.defaultCurrency) },
    { label: 'Statut', key: '__status' },
  ]

  const invoiceYear = form.issueDate.slice(0, 4)
  const needsNewNumber = !editingInvoice ||
    !editingInvoice.number ||
    dateInputValue(editingInvoice.issueDate).slice(0, 4) !== invoiceYear

  useEffect(() => {
    if (!formOpen || readOnly || !isValidDate(form.issueDate) || (editingInvoice && !needsNewNumber)) return undefined
    let active = true
    getDoc(doc(db, 'salesCounters', `invoice-${invoiceYear}`))
      .then((snapshot) => {
        if (!active) return
        const sequence = Number(snapshot.data()?.value || 0)
        if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence >= Number.MAX_SAFE_INTEGER) {
          throw new Error('Le compteur de factures contient une valeur invalide.')
        }
        setNumberPreview(formatDocumentNumber(company.invoicePrefix || 'FAC', invoiceYear, sequence + 1))
      })
      .catch((previewError) => {
        if (active) setNumberPreviewError(previewError instanceof Error ? previewError.message : 'Impossible de charger le compteur de factures.')
      })
      .finally(() => {
        if (active) setNumberPreviewLoading(false)
      })
    return () => { active = false }
  }, [company.invoicePrefix, editingInvoice, form.issueDate, formOpen, needsNewNumber, readOnly, invoiceYear])

  useEffect(() => {
    if (!pdfRequest || !pdfRef.current) return undefined
    let active = true
    const exportPdf = async () => {
      try {
        const generate = (await import('../utils/pdfEngine')).default
        await generate(pdfRef.current, `${safeFilename(pdfRequest.invoice.number)}.pdf`, company)
      } catch (pdfError) {
        if (active) setError(pdfError instanceof Error ? pdfError.message : 'Impossible de générer le PDF de la facture.')
      } finally {
        if (active) {
          setExportingId('')
          setPdfRequest(null)
        }
      }
    }
    void exportPdf()
    return () => { active = false }
  }, [pdfRequest, company])

  const clearFilters = () => {
    setQuery('')
    setClientFilter('')
    setStatusFilter('')
    setPeriodStart('')
    setPeriodEnd('')
    table.setPage(1)
  }

  const openNew = () => {
    setEditingInvoice(null)
    setReadOnly(false)
    setForm(createEmptyForm(company))
    setNumberPreview('')
    setNumberPreviewError('')
    setNumberPreviewLoading(true)
    setError('')
    setNotice('')
    setFormOpen(true)
  }

  const openInvoice = (invoice, lock = false) => {
    const canEdit = invoice.sourceCollection === 'invoices' && invoice.__status === 'Brouillon' && !lock
    setEditingInvoice(invoice)
    setReadOnly(!canEdit)
    setForm(mapInvoiceToForm(invoice, stockById))
    setNumberPreview(invoice.number || '')
    setNumberPreviewError('')
    setNumberPreviewLoading(false)
    setError('')
    setFormOpen(true)
  }

  const closeForm = () => {
    if (saving) return
    setFormOpen(false)
    setNumberPreview('')
    setNumberPreviewError('')
    setNumberPreviewLoading(false)
    setError('')
  }

  const updateLine = (index, changes) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line, lineIndex) => lineIndex === index
        ? { ...line, ...changes }
        : line),
    }))
  }

  const selectStockItem = (index, stockId) => {
    const item = stockById.get(stockId)
    updateLine(index, {
      stockId,
      reference: item?.reference || item?.tgiReference || '',
      designation: item?.name || item?.designation || '',
      unitPrice: item ? String(item.salePrice ?? item.unitPrice ?? '') : '',
    })
  }

  const addLine = () => {
    const defaultRate = Number(company.defaultVatRate)
    setForm((current) => ({
      ...current,
      items: [...current.items, {
        type: 'service',
        stockId: '',
        reference: '',
        designation: '',
        unitPrice: '',
        quantity: '1',
        taxRate: String(VAT_OPTIONS.includes(defaultRate) ? defaultRate : 20),
      }],
    }))
  }

  const removeLine = (index) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, lineIndex) => lineIndex !== index),
    }))
  }

  const setField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }))
    if (name === 'issueDate') {
      const newYear = String(value || '').slice(0, 4)
      const canReuseNumber = editingInvoice?.number &&
        dateInputValue(editingInvoice.issueDate).slice(0, 4) === newYear
      setNumberPreview(canReuseNumber ? editingInvoice.number : '')
      setNumberPreviewError('')
      setNumberPreviewLoading(isValidDate(value) && !canReuseNumber)
    }
  }

  const selectClient = (clientId) => {
    setForm((current) => ({ ...current, clientId }))
  }

  const selectDocument = (key) => {
    const documentData = linkedDocumentsByKey.get(key)
    setForm((current) => ({
      ...current,
      linkedDocumentKey: key,
      linkedDocumentCollection: documentData?.sourceCollection || '',
      linkedDocumentId: documentData?.id || '',
      linkedDocumentNumber: documentData?.number || '',
      linkedDocumentType: documentData ? getLinkedDocumentType(documentData) : '',
    }))
  }

  const saveDraft = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!clientsById.has(form.clientId)) {
      setError('Sélectionnez un client valide.')
      return
    }
    if (!isValidDate(form.issueDate) || !isValidDate(form.dueDate) || form.dueDate < form.issueDate) {
      setError('Renseignez une date de facturation et une échéance valide, postérieure ou égale à la date de facturation.')
      return
    }
    if (!['Virement', 'Chèque', 'Espèces'].includes(form.paymentTerms)) {
      setError('Sélectionnez une condition de règlement valide.')
      return
    }
    if (!form.items.length || linePreviews.some((line) => line.error)) {
      setError('Ajoutez au moins une ligne et vérifiez les désignations, quantités, prix et taux de TVA.')
      return
    }
    if (totals.error) {
      setError(totals.error)
      return
    }
    if (
      Boolean(form.linkedDocumentKey) !== Boolean(form.linkedDocumentCollection && form.linkedDocumentId) ||
      (form.linkedDocumentCollection && !LINKABLE_COLLECTIONS.includes(form.linkedDocumentCollection))
    ) {
      setError('La référence du document lié est invalide.')
      return
    }

    setSaving(true)
    const editing = Boolean(editingInvoice)
    if (editing && (editingInvoice.sourceCollection !== 'invoices' || editingInvoice.__status !== 'Brouillon')) {
      setError('Seuls les brouillons de la collection Factures peuvent être modifiés.')
      setSaving(false)
      return
    }

    const invoiceRef = editing
      ? doc(db, 'invoices', editingInvoice.id)
      : doc(collection(db, 'invoices'))
    const clientRef = doc(db, 'clients', form.clientId)
    const settingsRef = doc(db, 'settings', 'company')
    const counterRef = doc(db, 'salesCounters', `invoice-${form.issueDate.slice(0, 4)}`)
    const stockIds = [...new Set(form.items.filter((line) => line.type === 'piece').map((line) => line.stockId))]
    const stockRefs = stockIds.map((id) => doc(db, 'stock', id))
    const linkedRef = form.linkedDocumentKey
      ? doc(db, form.linkedDocumentCollection, form.linkedDocumentId)
      : null

    try {
      const saved = await runTransaction(db, async (transaction) => {
        const refs = [settingsRef, clientRef, counterRef]
        if (editing) refs.push(invoiceRef)
        refs.push(...stockRefs)
        if (linkedRef) refs.push(linkedRef)
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)))
        const settingsSnapshot = snapshots[0]
        const clientSnapshot = snapshots[1]
        const counterSnapshot = snapshots[2]
        const existingSnapshot = editing ? snapshots[3] : null
        const stockStartIndex = editing ? 4 : 3
        const stockSnapshots = snapshots.slice(stockStartIndex, stockStartIndex + stockRefs.length)
        const stockSnapshotMap = new Map(stockIds.map((id, index) => [id, stockSnapshots[index]]))
        const linkedSnapshot = linkedRef ? snapshots[stockStartIndex + stockRefs.length] : null

        if (!clientSnapshot.exists()) throw new Error('Le client n’existe plus. Actualisez la page et réessayez.')
        const client = { ...clientSnapshot.data(), id: clientSnapshot.id }
        if (editing) {
          if (!existingSnapshot?.exists()) throw new Error('Cette facture a été supprimée. Actualisez la liste.')
          if (!isDraft(existingSnapshot.data())) throw new Error('Cette facture a été validée ou réglée et ne peut plus être modifiée.')
        }
        if (linkedRef) {
          if (!linkedSnapshot?.exists()) throw new Error('Le document lié n’existe plus.')
          if (linkedSnapshot.data().clientId !== client.id) {
            throw new Error('Le document lié appartient à un autre client que celui de la facture.')
          }
          if (
            getLinkedDocumentType({
              ...linkedSnapshot.data(),
              sourceCollection: form.linkedDocumentCollection,
            }) === 'Devis' &&
            linkedSnapshot.data().convertedInvoiceId &&
            linkedSnapshot.data().convertedInvoiceId !== invoiceRef.id
          ) {
            throw new Error(`Ce devis a déjà été converti en facture ${linkedSnapshot.data().convertedInvoiceNumber || ''}.`)
          }
        }

        const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
        const allowedRates = VAT_OPTIONS
        const savedLines = createSavedLines(form.items, stockSnapshotMap, allowedRates)
        const computed = getTotalsFromSavedLines(savedLines)
        const currentSequence = Number(counterSnapshot.data()?.value || 0)
        if (!Number.isSafeInteger(currentSequence) || currentSequence < 0 || currentSequence >= Number.MAX_SAFE_INTEGER) {
          throw new Error('Le compteur de factures est invalide ou a atteint sa limite.')
        }
        const preserveNumber = editing &&
          editingInvoice.number &&
          dateInputValue(existingSnapshot.data().issueDate).slice(0, 4) === form.issueDate.slice(0, 4)
        const sequence = preserveNumber ? null : currentSequence + 1
        const number = preserveNumber
          ? existingSnapshot.data().number
          : formatDocumentNumber(settings.invoicePrefix || 'FAC', form.issueDate.slice(0, 4), sequence)
        const linkedDocument = linkedSnapshot?.data() || {}
        const invoice = {
          type: 'invoice',
          number,
          clientId: client.id,
          clientName: clientName(client),
          clientAddress: client.address || '',
          clientCity: client.city || '',
          clientPostalCode: client.postalCode || '',
          clientPhone: client.phone || client.phone1 || '',
          clientEmail: client.email || '',
          clientIce: client.ice || '',
          issueDate: form.issueDate,
          dueDate: form.dueDate,
          linkedDocumentCollection: linkedRef ? form.linkedDocumentCollection : '',
          linkedDocumentId: linkedRef ? form.linkedDocumentId : '',
          linkedDocumentNumber: linkedRef ? linkedDocument.number || '' : '',
          linkedDocumentType: linkedRef ? getLinkedDocumentType({
            ...linkedDocument,
            sourceCollection: form.linkedDocumentCollection,
          }) : '',
          sourceQuoteId: form.linkedDocumentCollection === 'quotes' ? form.linkedDocumentId : '',
          sourceQuoteNumber: form.linkedDocumentCollection === 'quotes' ? linkedDocument.number || '' : '',
          paymentTerms: form.paymentTerms,
          notes: String(form.notes || '').trim(),
          items: savedLines,
          totalHT: computed.totalHT,
          totalTax: computed.totalTax,
          totalTTC: computed.totalTTC,
          taxBreakdown: computed.taxBreakdown,
          currency: settings.defaultCurrency || 'MAD',
          paidAmount: editing ? Number(existingSnapshot.data().paidAmount || 0) : 0,
          remainingAmount: computed.totalTTC,
          status: 'Brouillon',
          createdAt: editing ? existingSnapshot.data().createdAt || serverTimestamp() : serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
        if (!editing) {
          transaction.set(counterRef, { value: sequence, updatedAt: serverTimestamp() })
          transaction.set(invoiceRef, invoice)
        } else {
          const previousPaid = Number(existingSnapshot.data().paidAmount || 0)
          if (!Number.isFinite(previousPaid) || previousPaid > computed.totalTTC) {
            throw new Error('Le nouveau total ne peut pas être inférieur aux règlements déjà enregistrés.')
          }
          invoice.paidAmount = previousPaid
          invoice.remainingAmount = Math.max(0, computed.totalTTC - previousPaid)
          transaction.update(invoiceRef, invoice)
          if (sequence !== null) transaction.set(counterRef, { value: sequence, updatedAt: serverTimestamp() })
        }
        return { id: invoiceRef.id, ...invoice }
      })
      setFormOpen(false)
      setEditingInvoice(null)
      setReadOnly(false)
      setNotice(`Brouillon ${saved.number} enregistré.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer le brouillon de facture.')
    } finally {
      setSaving(false)
    }
  }

  const validateInvoice = async (invoice) => {
    if (invoice.sourceCollection !== 'invoices' || invoice.__status !== 'Brouillon') return
    if (!window.confirm(`Valider et verrouiller la facture ${invoice.number || ''} ? Cette opération ne pourra pas être annulée depuis le formulaire.`)) {
      return
    }
    setError('')
    setNotice('')
    setValidatingId(invoice.id)
    try {
      const invoiceRef = doc(db, 'invoices', invoice.id)
      const validated = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(invoiceRef)
        if (!snapshot.exists()) throw new Error('Cette facture n’existe plus.')
        const current = snapshot.data()
        if (!isDraft(current)) throw new Error('Cette facture a déjà été validée ou annulée.')
        if (current.type !== 'invoice' || !String(current.number || '').trim() || !String(current.clientId || '').trim()) {
          throw new Error('Les informations d’identification de cette facture sont incomplètes.')
        }
        if (!isValidDate(current.issueDate) || !isValidDate(current.dueDate) || current.dueDate < current.issueDate) {
          throw new Error('Les dates de facturation ou d’échéance sont invalides.')
        }
        if (!['Virement', 'Chèque', 'Espèces'].includes(current.paymentTerms)) {
          throw new Error('Les conditions de règlement de cette facture sont invalides.')
        }
        if (!Array.isArray(current.items) || current.items.length === 0) {
          throw new Error('Une facture sans ligne ne peut pas être validée.')
        }
        const items = current.items.map((line) => {
          const quantity = Number(line.quantity)
          const unitPrice = Number(line.unitPrice)
          const taxRate = Number(line.taxRate ?? line.vatRate)
          if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Une quantité de ligne est invalide.')
          if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Un prix unitaire de ligne est invalide.')
          if (!VAT_OPTIONS.includes(taxRate)) throw new Error('Un taux de TVA de ligne est invalide.')
          const amounts = calculateLineAmounts(unitPrice, quantity, taxRate)
          return {
            ...line,
            quantity,
            unitPrice: amounts.unitPrice,
            taxRate,
            totalHT: amounts.totalHT,
            taxAmount: amounts.taxAmount,
            totalTTC: amounts.totalTTC,
          }
        })
        const totals = getTotalsFromSavedLines(items)
        if (toCents(current.totalHT) !== toCents(totals.totalHT) ||
          toCents(current.totalTax) !== toCents(totals.totalTax) ||
          toCents(current.totalTTC) !== toCents(totals.totalTTC)) {
          throw new Error('Les totaux enregistrés ne correspondent plus aux lignes de la facture.')
        }
        const paidCents = toCents(current.paidAmount || 0)
        const totalCents = toCents(totals.totalTTC)
        if (paidCents !== 0) throw new Error('Un brouillon avec règlement enregistré ne peut pas être validé.')
        transaction.update(invoiceRef, {
          ...totals,
          items,
          paidAmount: 0,
          remainingAmount: totalCents / 100,
          status: 'Validée / Non Payée',
          validatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        return current.number || invoice.number
      })
      setNotice(`Facture ${validated} validée et verrouillée.`)
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Impossible de valider la facture.')
    } finally {
      setValidatingId('')
    }
  }

  const exportInvoice = (invoice) => {
    const client = invoice.__client || clientsById.get(invoice.clientId) || {
      name: invoice.clientName,
      address: invoice.clientAddress,
      city: invoice.clientCity,
      postalCode: invoice.clientPostalCode,
      phone: invoice.clientPhone,
      email: invoice.clientEmail,
      ice: invoice.clientIce,
    }
    setError('')
    setExportingId(invoice.id)
    setPdfRequest({ invoice, client })
  }

  const errorMessage = error || companyError || clientsError || stockError || invoicesError ||
    quotesError || deliveryNotesError || salesError
  const isLoading = clientsLoading || stockLoading || invoicesLoading || quotesLoading ||
    deliveryNotesLoading || salesLoading
  const hasFilters = Boolean(query || clientFilter || statusFilter || periodStart || periodEnd)

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      {notice && (
        <div className="fixed right-4 top-4 z-[60] flex max-w-[calc(100vw-2rem)] items-start gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 shadow-xl" role="status">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0" size={17} />{notice}
        </div>
      )}

      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel-700">Gestion financière</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Factures</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Émettez, validez et consultez les factures. Toute facture validée est verrouillée ; les règlements sont suivis dans le Recouvrement.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:-translate-y-0.5 hover:bg-blue-800 disabled:opacity-60"
          disabled={isLoading}
          onClick={openNew}
          type="button"
        >
          <FilePlus2 aria-hidden="true" size={17} /> Nouvelle facture
        </button>
      </header>

      {errorMessage && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />{errorMessage}
        </p>
      )}

      <section className="mt-7 overflow-hidden rounded-2xl border border-white bg-white/90 shadow-xl shadow-slate-900/[0.04] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-steel-50 text-steel-800">
                <Banknote aria-hidden="true" size={19} />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Registre des factures</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {filteredInvoices.length} résultat{filteredInvoices.length === 1 ? '' : 's'} · les factures historiques restent consultables
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
              <ShieldCheck aria-hidden="true" size={15} /> Validation irréversible
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(190px,1fr)_190px_180px_170px_170px]">
            <label className="relative block">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                className={`${inputClass} pl-10`}
                onChange={(event) => { setQuery(event.target.value); table.setPage(1) }}
                placeholder="Rechercher une facture, un client…"
                type="search"
                value={query}
              />
            </label>
            <select aria-label="Filtrer par client" className={inputClass} onChange={(event) => { setClientFilter(event.target.value); table.setPage(1) }} value={clientFilter}>
              <option value="">Tous les clients</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{clientName(client)}</option>)}
            </select>
            <select aria-label="Filtrer par statut" className={inputClass} onChange={(event) => { setStatusFilter(event.target.value); table.setPage(1) }} value={statusFilter}>
              <option value="">Tous les statuts</option>
              {['Brouillon', 'Validée / Non Payée', 'Paiement Partiel', 'Payée', 'Annulée'].map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <label className="relative">
              <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input aria-label="Période, date de début" className={`${inputClass} pl-9`} max={periodEnd || undefined} onChange={(event) => { setPeriodStart(event.target.value); table.setPage(1) }} type="date" value={periodStart} />
            </label>
            <label className="relative">
              <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input aria-label="Période, date de fin" className={`${inputClass} pl-9`} min={periodStart || undefined} onChange={(event) => { setPeriodEnd(event.target.value); table.setPage(1) }} type="date" value={periodEnd} />
            </label>
          </div>
          {hasFilters && (
            <button className="mt-3 text-xs font-semibold text-steel-700 transition hover:text-steel-900" onClick={clearFilters} type="button">
              Effacer les filtres
            </button>
          )}
        </div>

        <div className="border-b border-slate-100 px-5 py-3 sm:px-7">
          <DataTableExportToolbar columns={exportColumns} rows={table.sortedItems} title="Registre des factures" />
        </div>

        {isLoading ? (
          <TableSkeleton columns={7} rows={6} />
        ) : filteredInvoices.length === 0 ? (
          <EmptyState
            description={hasFilters
              ? 'Aucune facture ne correspond aux filtres sélectionnés.'
              : 'Créez un brouillon, puis validez-le après contrôle des lignes et des taxes.'}
            icon={ReceiptText}
            onAction={() => {
              if (hasFilters) clearFilters()
              else if (clients.length > 0) openNew()
              else setError('Ajoutez au moins un client avant de créer une facture.')
            }}
            actionLabel={hasFilters ? 'Effacer les filtres' : clients.length > 0 ? 'Créer une facture' : 'Ajouter un client'}
            title={hasFilters ? 'Aucun résultat' : 'Aucune facture pour le moment'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <SortableTableHeader className="px-5 py-3.5" columnKey="number" label="N° Facture" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__issueDate" label="Date" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__clientName" label="Client" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__reference" label="Réf. document" {...table} />
                  <SortableTableHeader className="px-5 py-3.5 text-right" columnKey="__totalTTC" label="Total TTC" {...table} />
                  <SortableTableHeader className="px-5 py-3.5 text-right" columnKey="__remaining" label="Reste à payer" {...table} />
                  <th className="px-5 py-3.5">Statut</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((invoice) => {
                  const editable = invoice.sourceCollection === 'invoices' && invoice.__status === 'Brouillon'
                  const validating = validatingId === invoice.id
                  const exporting = exportingId === invoice.id
                  return (
                    <tr className="transition hover:bg-steel-50/40" key={`${invoice.sourceCollection}:${invoice.id}`}>
                      <td className="px-5 py-4">
                        <span className="block text-sm font-semibold text-slate-900">{invoice.number || 'Sans numéro'}</span>
                        <span className="mt-1 block text-[11px] text-slate-400">{invoice.sourceCollection === 'invoices' ? 'Facture' : 'Historique'}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{formatDate(invoice.issueDate)}</td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-700">{invoice.__clientName}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">{invoice.__reference}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold text-slate-800">{invoice.__totalTTC === null ? '—' : formatCurrency(invoice.__totalTTC, invoice.currency || company.defaultCurrency)}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold text-slate-800">{invoice.__remaining === null ? '—' : formatCurrency(invoice.__remaining, invoice.currency || company.defaultCurrency)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusStyle(invoice.__status)}`}>
                          <span className={`h-1.5 w-1.5 rounded-full bg-current ${['Validée / Non Payée', 'Paiement Partiel'].includes(invoice.__status) ? 'animate-pulse' : ''}`} />
                          {invoice.__status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            aria-label={editable ? `Modifier ${invoice.number}` : `Consulter ${invoice.number}`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-800"
                            onClick={() => openInvoice(invoice)}
                            title={editable ? 'Modifier le brouillon' : 'Consulter en lecture seule'}
                            type="button"
                          >
                            {editable ? <Pencil aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
                          </button>
                          {editable && (
                            <button
                              aria-label={`Valider ${invoice.number}`}
                              className="rounded-lg p-2 text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-50"
                              disabled={Boolean(validatingId)}
                              onClick={() => void validateInvoice(invoice)}
                              title="Valider et verrouiller"
                              type="button"
                            >
                              {validating ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <ShieldCheck aria-hidden="true" size={16} />}
                            </button>
                          )}
                          <button
                            aria-label={`Exporter la facture ${invoice.number} en PDF`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-steel-50 hover:text-steel-800 disabled:cursor-wait disabled:opacity-50"
                            disabled={Boolean(exportingId)}
                            onClick={() => exportInvoice(invoice)}
                            title={exporting ? 'Génération du PDF…' : 'Exporter le PDF'}
                            type="button"
                          >
                            {exporting ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <FileDown aria-hidden="true" size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && filteredInvoices.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3 sm:px-6">
            <DataTablePagination {...table} />
          </div>
        )}
      </section>

      {formOpen && (
        <InvoiceForm
          clients={clients}
          clientsLoading={clientsLoading}
          company={company}
          documents={linkedDocuments}
          editingInvoice={editingInvoice}
          error={error}
          form={form}
          linePreviews={linePreviews}
          numberPreview={numberPreview}
          numberPreviewError={numberPreviewError}
          numberPreviewLoading={numberPreviewLoading}
          onAddLine={addLine}
          onCancel={closeForm}
          onClientChange={selectClient}
          onDocumentChange={selectDocument}
          onRemoveLine={removeLine}
          onSelectStock={selectStockItem}
          onSetField={setField}
          onSubmit={(event) => void saveDraft(event)}
          onUpdateLine={updateLine}
          readOnly={readOnly}
          saving={saving}
          stock={stock}
          stockLoading={stockLoading}
          totals={totals}
        />
      )}

      {pdfRequest && (
        <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 z-[-1] w-[190mm] bg-white">
          <SalesPdf client={pdfRequest.client} company={company} documentData={pdfRequest.invoice} ref={pdfRef} />
        </div>
      )}
    </main>
  )
}
