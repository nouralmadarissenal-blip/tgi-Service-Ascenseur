import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FileDown,
  FilePlus2,
  FileText,
  LoaderCircle,
  PackageCheck,
  Pencil,
  Search,
  ShieldAlert,
} from 'lucide-react'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase/config'
import EmptyState from '../components/common/EmptyState'
import DataTableExportToolbar from '../components/common/DataTableExportToolbar'
import DataTablePagination from '../components/common/DataTablePagination'
import SortableTableHeader from '../components/common/SortableTableHeader'
import TableSkeleton from '../components/common/TableSkeleton'
import SalesDocumentForm from '../components/sales/SalesDocumentForm'
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
const SUPPORTED_CURRENCIES = ['MAD', 'EUR', 'USD']
const VAT_OPTIONS = [20, 14, 0]
const DOCUMENT_STATUSES = ['Brouillon', 'Validé', 'Annulé']
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-steel-500 focus:ring-4 focus:ring-steel-100'

function localDate(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addMonthsToDate(value, months) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return localDate(months * 30)
  const [year, month, day] = value.split('-').map(Number)
  const targetMonth = new Date(year, month - 1 + months, 1)
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate()
  targetMonth.setDate(Math.min(day, lastDay))
  return `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, '0')}-${String(targetMonth.getDate()).padStart(2, '0')}`
}

function dateInputValue(value, fallback = '') {
  if (value && typeof value.toDate === 'function') {
    const date = value.toDate()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : fallback
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
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
    items: [{ stockId: '', reference: '', designation: '', unitPrice: '', quantity: '1', taxRate: String(vatRate) }],
  }
}

function formatCurrency(value, currency = 'MAD') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: SUPPORTED_CURRENCIES.includes(currency) ? currency : 'MAD',
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
    unitPrice === '' ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isSafeInteger(count) ||
    count <= 0 ||
    !Number.isFinite(rate) ||
    rate < 0 ||
    rate > 100
  ) {
    return null
  }
  try {
    return calculateLineAmounts(price, count, rate)
  } catch (calculationError) {
    if (calculationError instanceof RangeError || calculationError instanceof TypeError) return null
    throw calculationError
  }
}

function getLinePreviews(items, stockById, type, company) {
  const requestedByStock = new Map()
  items.forEach((line) => {
    if (!line.stockId) return
    const quantity = Number(line.quantity)
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return
    const requested = (requestedByStock.get(line.stockId) || 0) + quantity
    requestedByStock.set(line.stockId, Number.isSafeInteger(requested) ? requested : Number.POSITIVE_INFINITY)
  })

  return items.map((line) => {
    const stockItem = stockById.get(line.stockId)
    const quantity = Number(line.quantity)
    const unitPrice = line.unitPrice
    const taxRate = Number(line.taxRate)
    let error = ''
    if (!line.stockId) error = 'Sélectionnez un article.'
    else if (!stockItem) error = 'Cet article n’est plus disponible.'
    else if (!String(line.designation || '').trim()) error = 'La désignation est obligatoire.'
    else if (!Number.isSafeInteger(quantity) || quantity <= 0) error = 'Saisissez une quantité entière positive.'
    else if (unitPrice === '' || !Number.isFinite(Number(unitPrice)) || Number(unitPrice) < 0) {
      error = 'Le prix HT doit être un montant valide et positif ou nul.'
    } else if (!getVatOptions(company).includes(taxRate)) {
      error = 'Sélectionnez un taux de TVA valide.'
    }

    const calculated = !error
      ? tryCalculateLineAmounts(Number(unitPrice), quantity, taxRate)
      : null
    if (!error && !calculated) error = 'Le calcul de cette ligne dépasse la précision prise en charge.'
    const amounts = calculated ? { ...calculated, taxRate } : null

    const rawAvailable = Number(stockItem?.quantity)
    const availableQuantity = Number.isSafeInteger(rawAvailable) && rawAvailable >= 0
      ? rawAvailable
      : null
    const requestedQuantity = requestedByStock.get(line.stockId) ?? quantity
    const stockWarning = ['deliveryNote', 'invoice'].includes(type) &&
      stockItem &&
      (availableQuantity === null || requestedQuantity > availableQuantity)
    const stockError = availableQuantity === null
      ? 'Quantité en stock invalide.'
      : ''

    return {
      stockItem,
      amounts,
      error,
      availableQuantity,
      requestedQuantity,
      stockWarning,
      stockError,
    }
  })
}

function calculateTotals(linePreviews) {
  const validLines = linePreviews
    .filter((preview) => preview.amounts)
    .map((preview) => preview.amounts)
  try {
    const totals = sumLineAmounts(validLines)
    const byRate = new Map()
    linePreviews.forEach((preview) => {
      if (!preview.amounts) return
      const rate = Number(preview.amounts.taxRate)
      const rows = byRate.get(rate) || []
      rows.push(preview.amounts)
      byRate.set(rate, rows)
    })
    const taxBreakdown = [...byRate.entries()]
      .sort(([first], [second]) => second - first)
      .map(([taxRate, rows]) => {
        const subtotal = sumLineAmounts(rows)
        return {
          taxRate,
          totalHT: subtotal.totalHT,
          totalTax: subtotal.totalTax,
        }
      })
    return { ...totals, taxBreakdown, error: '' }
  } catch (calculationError) {
    if (!(calculationError instanceof RangeError)) throw calculationError
    return {
      totalHT: 0,
      totalTax: 0,
      totalTTC: 0,
      taxBreakdown: [],
      error: 'Le total dépasse la limite de calcul prise en charge. Réduisez les quantités ou les montants.',
    }
  }
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

function getPrefix(type, company) {
  const option = DOCUMENT_OPTIONS.find((item) => item.value === type)
  if (!option) return 'DOC'
  const configured = String(company[option.prefixField] || option.prefix)
    .trim()
    .replace(/-+$/, '')
  return configured || option.prefix
}

function getDocumentStatus(documentData) {
  const status = String(documentData.status || '').trim().toLowerCase()
  if (['cancelled', 'canceled', 'annulé', 'annule'].includes(status)) return 'Annulé'
  if (['draft', 'brouillon'].includes(status)) return 'Brouillon'
  if (documentData.type === 'deliveryNote') {
    const delivered = documentData.stockDeducted === true ||
      ['delivered', 'livré', 'livree', 'livrée'].includes(status) ||
      (documentData.sourceCollection === 'salesDocuments' && status === 'issued')
    return delivered ? 'Validé' : 'Brouillon'
  }
  return 'Validé'
}

function isDeliveryValidated(documentData) {
  const status = String(documentData.status || '').trim().toLowerCase()
  return documentData.stockDeducted === true ||
    ['delivered', 'livré', 'livree', 'livrée'].includes(status)
}

function getStoredTotal(documentData) {
  const total = Number(documentData.totalTTC)
  if (
    documentData.totalTTC !== null &&
    documentData.totalTTC !== undefined &&
    documentData.totalTTC !== '' &&
    Number.isFinite(total) &&
    total >= 0
  ) return total
  const lines = Array.isArray(documentData.items) ? documentData.items : []
  if (lines.length === 0) return null
  try {
    const amounts = lines.map((line) => {
      if (
        line.totalHT !== null &&
        line.totalHT !== undefined &&
        line.totalHT !== '' &&
        line.taxAmount !== null &&
        line.taxAmount !== undefined &&
        line.taxAmount !== '' &&
        Number.isFinite(Number(line.totalHT)) &&
        Number.isFinite(Number(line.taxAmount))
      ) {
        return { totalHT: Number(line.totalHT), taxAmount: Number(line.taxAmount) }
      }
      return calculateLineAmounts(
        line.unitPrice,
        line.quantity,
        Number(line.taxRate ?? line.vatRate ?? 0),
      )
    })
    return sumLineAmounts(amounts).totalTTC
  } catch (calculationError) {
    if (calculationError instanceof RangeError || calculationError instanceof TypeError) return null
    throw calculationError
  }
}

function toCents(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) throw new TypeError('Un montant numérique valide est requis.')
  const cents = Math.round((amount + Number.EPSILON) * 100)
  if (!Number.isSafeInteger(cents)) throw new RangeError('Le montant dépasse la précision prise en charge.')
  return cents
}

function buildTaxBreakdown(lines) {
  const totalsByRate = new Map()
  for (const line of lines) {
    const rate = Number(line.taxRate)
    const current = totalsByRate.get(rate) || { totalHTCents: 0, totalTaxCents: 0 }
    current.totalHTCents += toCents(line.totalHT)
    current.totalTaxCents += toCents(line.taxAmount)
    if (!Number.isSafeInteger(current.totalHTCents) || !Number.isSafeInteger(current.totalTaxCents)) {
      throw new RangeError('Le détail de TVA dépasse la précision prise en charge.')
    }
    totalsByRate.set(rate, current)
  }
  return [...totalsByRate.entries()]
    .sort(([first], [second]) => second - first)
    .map(([taxRate, totals]) => ({
      taxRate,
      totalHT: totals.totalHTCents / 100,
      totalTax: totals.totalTaxCents / 100,
    }))
}

function formatDocumentNumber(prefix, year, sequence) {
  return `${prefix}-${year}-${String(sequence).padStart(3, '0')}`
}

export default function Sales() {
  const { role, user } = useAuth()
  const { data: clients, loading: clientsLoading, error: clientsError } =
    useFirestoreCollection('clients')
  const { data: stock, loading: stockLoading, error: stockError } =
    useFirestoreCollection('stock')
  const { data: sales, loading: salesLoading, error: salesError } =
    useFirestoreCollection('sales')
  const {
    data: legacySales,
    loading: legacySalesLoading,
    error: legacySalesError,
  } = useFirestoreCollection('salesDocuments')
  const [form, setForm] = useState(createEmptyForm)
  const [formOpen, setFormOpen] = useState(false)
  const [editingDocument, setEditingDocument] = useState(null)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [deliverySavingId, setDeliverySavingId] = useState('')
  const [exportingId, setExportingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [company, setCompany] = useState({})
  const [settingsError, setSettingsError] = useState('')
  const [pdfRequest, setPdfRequest] = useState(null)
  const [numberPreview, setNumberPreview] = useState('')
  const [numberPreviewLoading, setNumberPreviewLoading] = useState(false)
  const [numberPreviewError, setNumberPreviewError] = useState('')
  const pdfRef = useRef(null)
  const settingsLoadedRef = useRef(false)

  useEffect(() => onSnapshot(
    doc(db, 'settings', 'company'),
    (snapshot) => {
      const settings = snapshot.exists() ? snapshot.data() : {}
      const isInitialSettingsLoad = !settingsLoadedRef.current
      settingsLoadedRef.current = true
      setCompany(settings)
      setSettingsError('')
      if (isInitialSettingsLoad) {
        setForm((current) => {
          const next = {
            ...current,
            items: current.items.map((line) => line.stockId
              ? line
              : { ...line, taxRate: String(getDefaultVatRate(settings)) }),
          }
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
      }
    },
    (snapshotError) => setSettingsError(snapshotError.message),
  ), [])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  )
  const stockById = useMemo(
    () => new Map(stock.map((item) => [item.id, item])),
    [stock],
  )

  const linePreviews = useMemo(
    () => getLinePreviews(form.items, stockById, form.type, company),
    [form.items, form.type, stockById, company.defaultVatRate],
  )
  const calculatedTotals = useMemo(
    () => calculateTotals(linePreviews),
    [linePreviews],
  )
  const documents = useMemo(
    () => [
      ...sales.map((item) => ({ ...item, sourceCollection: 'sales' })),
      ...legacySales.map((item) => ({ ...item, sourceCollection: 'salesDocuments' })),
    ].map((item) => ({
      ...item,
      __clientName: item.clientName || getClientName(clientById.get(item.clientId)),
      __documentStatus: getDocumentStatus(item),
      __typeLabel: DOCUMENT_OPTIONS.find((option) => option.value === item.type)?.label || item.type,
      __totalTTC: getStoredTotal(item),
      __dateSort: dateInputValue(item.issueDate),
    })),
    [sales, legacySales, clientById],
  )
  const filteredDocuments = useMemo(() => {
    const search = query.trim().toLowerCase()
    return documents
      .filter((item) => !typeFilter || item.type === typeFilter)
      .filter((item) => !clientFilter || item.clientId === clientFilter)
      .filter((item) => !statusFilter || item.__documentStatus === statusFilter)
      .filter((item) =>
        [item.number, item.__clientName, item.__typeLabel, item.__documentStatus]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search)),
      )
  }, [documents, query, typeFilter, clientFilter, statusFilter])
  const table = useDataTable(filteredDocuments)
  const exportColumns = [
    { label: 'N° Document', key: 'number' },
    { label: 'Type', value: (item) => item.__typeLabel },
    { label: 'Date', value: (item) => formatDate(item.issueDate) },
    { label: 'Client', key: '__clientName' },
    { label: 'Total TTC', value: (item) => formatCurrency(item.__totalTTC, company.defaultCurrency) },
    { label: 'Statut', value: (item) => item.__documentStatus },
  ]

  const documentYear = form.issueDate.slice(0, 4)
  const documentPrefix = getPrefix(form.type, company)
  const needsNewNumber = !editingDocument ||
    !editingDocument.number ||
    editingDocument.type !== form.type ||
    dateInputValue(editingDocument.issueDate).slice(0, 4) !== documentYear

  useEffect(() => {
    if (!formOpen || !isValidDate(form.issueDate)) {
      setNumberPreview('')
      setNumberPreviewError('')
      setNumberPreviewLoading(false)
      return undefined
    }

    if (editingDocument && !needsNewNumber) {
      setNumberPreview(editingDocument.number || '')
      setNumberPreviewError('')
      setNumberPreviewLoading(false)
      return undefined
    }

    let active = true
    setNumberPreview('')
    setNumberPreviewError('')
    setNumberPreviewLoading(true)
    const counterRef = doc(db, 'salesCounters', `${form.type}-${documentYear}`)
    getDoc(counterRef)
      .then((snapshot) => {
        if (!active) return
        const currentValue = Number(snapshot.data()?.value || 0)
        if (
          !Number.isSafeInteger(currentValue) ||
          currentValue < 0 ||
          currentValue >= Number.MAX_SAFE_INTEGER
        ) {
          throw new Error('Le compteur de documents contient une valeur invalide.')
        }
        setNumberPreview(formatDocumentNumber(documentPrefix, documentYear, currentValue + 1))
      })
      .catch((previewError) => {
        if (active) {
          setNumberPreviewError(
            previewError instanceof Error ? previewError.message : 'Impossible de charger le compteur.',
          )
        }
      })
      .finally(() => {
        if (active) setNumberPreviewLoading(false)
      })
    return () => { active = false }
  }, [
    documentPrefix,
    documentYear,
    editingDocument,
    form.issueDate,
    form.type,
    formOpen,
    needsNewNumber,
  ])

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

  const updateLine = (index, changes) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...changes } : line,
      ),
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
    setForm((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          stockId: '',
          reference: '',
          designation: '',
          unitPrice: '',
          quantity: '1',
          taxRate: String(getDefaultVatRate(company)),
        },
      ],
    }))
  }

  const removeLine = (index) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, lineIndex) => lineIndex !== index),
    }))
  }

  const handleSetField = (name, value) => {
    if (name === 'type') {
      setForm((current) => ({
        ...current,
        type: value,
        dueDate: value === 'quote'
          ? addMonthsToDate(current.issueDate, Number(company.defaultQuoteValidityMonths) || 3)
          : current.dueDate >= current.issueDate
            ? current.dueDate
            : addMonthsToDate(current.issueDate, 1),
        generalConditions: value === 'quote'
          ? current.generalConditions || company.defaultTermsAndConditions || ''
          : current.generalConditions,
      }))
      return
    }
    if (name === 'issueDate') {
      setForm((current) => ({
        ...current,
        issueDate: value,
        dueDate: current.type === 'quote'
          ? addMonthsToDate(value, Number(company.defaultQuoteValidityMonths) || 3)
          : current.dueDate >= value ? current.dueDate : addMonthsToDate(value, 1),
      }))
      return
    }
    setForm((current) => ({ ...current, [name]: value }))
  }

  const openNew = () => {
    setEditingDocument(null)
    setForm(createEmptyForm(company))
    setError('')
    setNotice('')
    setFormOpen(true)
  }

  const mapDocumentToForm = (documentData) => ({
    type: DOCUMENT_OPTIONS.some((option) => option.value === documentData.type)
      ? documentData.type
      : 'quote',
    clientId: documentData.clientId || '',
    issueDate: dateInputValue(documentData.issueDate, localDate()),
    dueDate: dateInputValue(documentData.dueDate, localDate(30)),
    notes: documentData.notes || '',
    generalConditions: documentData.generalConditions || '',
    items: (Array.isArray(documentData.items) ? documentData.items : []).map((line) => {
      const stockItem = stockById.get(line.stockId)
      return {
        stockId: line.stockId || '',
        reference: line.reference || line.tgiReference || stockItem?.reference || stockItem?.tgiReference || '',
        designation: line.name || line.designation || stockItem?.name || stockItem?.designation || '',
        unitPrice: String(line.unitPrice ?? stockItem?.salePrice ?? stockItem?.unitPrice ?? ''),
        quantity: String(line.quantity ?? 1),
        taxRate: String(line.taxRate ?? line.vatRate ?? getDefaultVatRate(company)),
      }
    }),
  })

  const openEdit = (documentData) => {
    if (documentData.sourceCollection !== 'sales') {
      setError('Ce document historique est consultable et exportable, mais ne peut pas être modifié. Dupliquez-le pour créer une nouvelle version.')
      return
    }
    if (documentData.type === 'deliveryNote' && isDeliveryValidated(documentData)) {
      setError('Une livraison déjà validée ne peut pas être modifiée, car son stock a été décrémenté.')
      return
    }
    if (getDocumentStatus(documentData) === 'Annulé') {
      setError('Un document annulé ne peut pas être modifié. Dupliquez-le pour créer une nouvelle version.')
      return
    }
    setEditingDocument(documentData)
    setForm(mapDocumentToForm(documentData))
    setError('')
    setNotice('')
    setFormOpen(true)
  }

  const duplicateDocument = (documentData) => {
    const duplicate = mapDocumentToForm(documentData)
    const issueDate = localDate()
    setEditingDocument(null)
    setForm({
      ...duplicate,
      issueDate,
      dueDate: duplicate.type === 'quote'
        ? addMonthsToDate(issueDate, Number(company.defaultQuoteValidityMonths) || 3)
        : addMonthsToDate(issueDate, 1),
    })
    setError('')
    setNotice(`Brouillon préparé à partir de ${documentData.number || 'ce document'} ; un nouveau numéro sera attribué.`)
    setFormOpen(true)
  }

  const saveDocument = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!clientById.has(form.clientId)) {
      setError('Sélectionnez un client valide.')
      return
    }
    if (!DOCUMENT_OPTIONS.some((option) => option.value === form.type)) {
      setError('Sélectionnez un type de document valide.')
      return
    }
    if (
      !isValidDate(form.issueDate) ||
      !isValidDate(form.dueDate) ||
      form.dueDate < form.issueDate
    ) {
      setError('Renseignez des dates valides ; l’échéance doit être le jour d’émission ou une date ultérieure.')
      return
    }
    if (!form.items.length) {
      setError('Ajoutez au moins une ligne au document.')
      return
    }
    if (linePreviews.some((preview) => preview.error)) {
      setError('Vérifiez chaque ligne : article, désignation, quantité entière positive, prix HT et taux de TVA sont requis.')
      return
    }
    if (calculatedTotals.error) {
      setError(calculatedTotals.error)
      return
    }
    if (
      editingDocument?.type === 'invoice' &&
      form.type !== 'invoice' &&
      Number(editingDocument.paidAmount || 0) > 0
    ) {
      setError('Le type d’une facture ayant reçu un paiement ne peut pas être modifié.')
      return
    }

    setSaving(true)
    const isEditing = Boolean(editingDocument)
    const needsSequence = needsNewNumber
    const documentRef = isEditing
      ? doc(db, 'sales', editingDocument.id)
      : doc(collection(db, 'sales'))
    const clientRef = doc(db, 'clients', form.clientId)
    const settingsRef = doc(db, 'settings', 'company')
    const counterRef = doc(db, 'salesCounters', `${form.type}-${form.issueDate.slice(0, 4)}`)
    const uniqueStockIds = [...new Set(form.items.map((line) => line.stockId))]
    const stockRefs = uniqueStockIds.map((stockId) => doc(db, 'stock', stockId))

    try {
      const savedDocument = await runTransaction(db, async (transaction) => {
        const reads = [
          transaction.get(settingsRef),
          transaction.get(clientRef),
        ]
        if (isEditing) reads.push(transaction.get(documentRef))
        if (needsSequence) reads.push(transaction.get(counterRef))
        stockRefs.forEach((stockRef) => reads.push(transaction.get(stockRef)))
        const snapshots = await Promise.all(reads)
        let snapshotIndex = 0
        const settingsSnapshot = snapshots[snapshotIndex]
        snapshotIndex += 1
        const clientSnapshot = snapshots[snapshotIndex]
        snapshotIndex += 1
        const existingSnapshot = isEditing ? snapshots[snapshotIndex++] : null
        const counterSnapshot = needsSequence ? snapshots[snapshotIndex++] : null
        const stockSnapshots = snapshots.slice(snapshotIndex)
        const stockSnapshotById = new Map(
          uniqueStockIds.map((stockId, index) => [stockId, stockSnapshots[index]]),
        )

        if (!clientSnapshot.exists()) throw new Error('Le client n’existe plus. Actualisez la liste et réessayez.')
        const client = { ...clientSnapshot.data(), id: clientSnapshot.id }
        if (isEditing && !existingSnapshot?.exists()) {
          throw new Error('Le document a été supprimé ou déplacé. Actualisez la liste.')
        }
        const previous = existingSnapshot?.data() || {}
        if (previous.stockDeducted === true || isDeliveryValidated(previous)) {
          throw new Error('Une livraison déjà validée ne peut pas être modifiée.')
        }
        if (getDocumentStatus({ ...previous, sourceCollection: 'sales' }) === 'Annulé') {
          throw new Error('Un document annulé ne peut pas être modifié.')
        }

        const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
        const lines = form.items.map((line) => {
          const itemSnapshot = stockSnapshotById.get(line.stockId)
          if (!itemSnapshot?.exists()) {
            throw new Error('Un article sélectionné n’existe plus dans l’inventaire.')
          }
          const item = itemSnapshot.data()
          const quantity = Number(line.quantity)
          const unitPrice = Number(line.unitPrice)
          const taxRate = Number(line.taxRate)
          if (!Number.isSafeInteger(quantity) || quantity <= 0) {
            throw new Error('La quantité de chaque ligne doit être un entier supérieur à zéro.')
          }
          if (!Number.isFinite(unitPrice) || unitPrice < 0) {
            throw new Error(`Le prix HT de « ${line.designation || item.name || 'l’article'} » est invalide.`)
          }
          if (!getVatOptions(settings).includes(taxRate)) {
            throw new Error(`Le taux de TVA de « ${line.designation || item.name || 'l’article'} » n’est plus autorisé.`)
          }
          const amounts = calculateLineAmounts(unitPrice, quantity, taxRate)
          return {
            stockId: line.stockId,
            reference: item.reference || item.tgiReference || line.reference || '',
            name: String(line.designation || '').trim(),
            designation: String(line.designation || '').trim(),
            quantity,
            unitPrice: amounts.unitPrice,
            taxRate,
            totalHT: amounts.totalHT,
            taxAmount: amounts.taxAmount,
            totalTTC: amounts.totalTTC,
          }
        })
        const totals = sumLineAmounts(lines)
        const taxBreakdown = buildTaxBreakdown(lines)
        const totalCents = toCents(totals.totalTTC)
        const paidAmount = form.type === 'invoice' && previous.type === 'invoice'
          ? Number(previous.paidAmount || 0)
          : 0
        const paidCents = toCents(paidAmount)
        if (paidCents > totalCents) {
          throw new Error('Le nouveau total TTC ne peut pas être inférieur aux paiements déjà enregistrés.')
        }
        if (previous.type === 'invoice' && paidCents > 0 && form.type !== 'invoice') {
          throw new Error('Le type d’une facture ayant reçu un paiement ne peut pas être modifié.')
        }

        let number = previous.number || ''
        if (!isEditing || needsSequence) {
          const currentSequence = Number(counterSnapshot?.data()?.value || 0)
          if (!Number.isSafeInteger(currentSequence) || currentSequence < 0 || currentSequence >= Number.MAX_SAFE_INTEGER) {
            throw new Error('Le compteur de documents est invalide ou a atteint sa limite.')
          }
          const sequence = currentSequence + 1
          const year = form.issueDate.slice(0, 4)
          number = formatDocumentNumber(getPrefix(form.type, settings), year, sequence)
          transaction.set(counterRef, { value: sequence, updatedAt: serverTimestamp() })
        }

        const remainingAmount = form.type === 'invoice'
          ? (totalCents - paidCents) / 100
          : 0
        const status = form.type === 'deliveryNote'
          ? 'pending_delivery'
          : form.type === 'invoice'
            ? remainingAmount === 0 ? 'paid' : 'unpaid'
            : 'issued'
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
          taxBreakdown,
          issueDate: form.issueDate,
          dueDate: form.dueDate,
          notes: String(form.notes || '').trim(),
          generalConditions: form.type === 'quote' ? String(form.generalConditions || '').trim() : '',
          paidAmount: form.type === 'invoice' ? paidAmount : 0,
          remainingAmount,
          status,
          ...(form.type === 'deliveryNote' ? { stockDeducted: false } : {}),
          updatedAt: serverTimestamp(),
        }

        if (isEditing) {
          transaction.update(documentRef, data)
        } else {
          transaction.set(documentRef, {
            ...data,
            createdAt: serverTimestamp(),
          })
        }
        return { ...data, id: documentRef.id, sourceCollection: 'sales' }
      })

      setFormOpen(false)
      setEditingDocument(null)
      setNotice(`${DOCUMENT_OPTIONS.find((option) => option.value === savedDocument.type)?.label || 'Document'} ${savedDocument.number} enregistré.`)
      setError('')
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
      const liveClient = clientById.get(documentData.clientId)
      const client = liveClient ? {
        ...liveClient,
        address: liveClient.address || documentData.clientAddress || '',
        city: liveClient.city || documentData.clientCity || '',
        postalCode: liveClient.postalCode || documentData.clientPostalCode || '',
        phone: liveClient.phone || liveClient.phone1 || documentData.clientPhone || '',
        email: liveClient.email || documentData.clientEmail || '',
        ice: liveClient.ice || documentData.clientIce || '',
      } : {
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
    if (isDeliveryValidated(documentData)) {
      setError('Cette livraison a déjà été validée ; le stock ne sera pas déduit une seconde fois.')
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
        if (isDeliveryValidated(delivery)) {
          throw new Error('Cette livraison a déjà été validée ; le stock ne sera pas déduit une seconde fois.')
        }

        const requiredByStock = new Map()
        for (const line of delivery.items || []) {
          const stockId = String(line.stockId || '')
          const quantity = Number(line.quantity)
          if (!stockId || !Number.isSafeInteger(quantity) || quantity <= 0) {
            throw new Error('Une ligne du bon est invalide (article ou quantité manquante).')
          }
          const combinedQuantity = (requiredByStock.get(stockId) || 0) + quantity
          if (!Number.isSafeInteger(combinedQuantity)) {
            throw new Error('La quantité cumulée d’un article dépasse la limite prise en charge.')
          }
          requiredByStock.set(stockId, combinedQuantity)
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
          if (!Number.isSafeInteger(currentQuantity) || currentQuantity < 0) {
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

  const clearFilters = () => {
    setQuery('')
    setTypeFilter('')
    setClientFilter('')
    setStatusFilter('')
    table.setPage(1)
  }

  const pageError = clientsError || stockError || salesError || legacySalesError || settingsError || error
  const hasFilters = Boolean(query || typeFilter || clientFilter || statusFilter)
  const isLoading = clientsLoading || stockLoading || salesLoading || legacySalesLoading

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      {notice && (
        <div className="fixed right-4 top-4 z-[60] flex max-w-[calc(100vw-2rem)] items-start gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 shadow-xl" role="status">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          {notice}
        </div>
      )}

      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel-700">Gestion commerciale</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Ventes & documents</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Préparez devis, commandes, livraisons et factures avec calculs HT, TVA et TTC au centime.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-steel-800 to-steel-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-steel-900/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
          disabled={clientsLoading || stockLoading || clients.length === 0 || stock.length === 0}
          onClick={openNew}
          type="button"
        >
          <FilePlus2 aria-hidden="true" size={18} />
          Nouveau document
        </button>
      </header>

      {pageError && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          {pageError}
        </p>
      )}

      <section className="mt-8 overflow-hidden rounded-2xl border border-white bg-white/90 shadow-xl shadow-slate-900/[0.04] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:px-6 sm:py-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-steel-50 text-steel-800">
              <FileText aria-hidden="true" size={19} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Documents commerciaux</h2>
              <p className="text-xs text-slate-500">
                {filteredDocuments.length} résultat{filteredDocuments.length === 1 ? '' : 's'} sur {documents.length}
              </p>
            </div>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 xl:max-w-5xl xl:grid-cols-[minmax(190px,1fr)_175px_minmax(190px,1fr)_155px]">
            <label className="relative block">
              <span className="sr-only">Rechercher un document</span>
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                className={`${inputClass} pl-10`}
                onChange={(event) => {
                  setQuery(event.target.value)
                  table.setPage(1)
                }}
                placeholder="N° ou client…"
                type="search"
                value={query}
              />
            </label>
            <select
              aria-label="Filtrer par type de document"
              className={inputClass}
              onChange={(event) => {
                setTypeFilter(event.target.value)
                table.setPage(1)
              }}
              value={typeFilter}
            >
              <option value="">Tous les types</option>
              {DOCUMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              aria-label="Filtrer par client"
              className={inputClass}
              onChange={(event) => {
                setClientFilter(event.target.value)
                table.setPage(1)
              }}
              value={clientFilter}
            >
              <option value="">Tous les clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{getClientName(client)}</option>
              ))}
            </select>
            <select
              aria-label="Filtrer par statut"
              className={inputClass}
              onChange={(event) => {
                setStatusFilter(event.target.value)
                table.setPage(1)
              }}
              value={statusFilter}
            >
              <option value="">Tous les statuts</option>
              {DOCUMENT_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
          <DataTableExportToolbar
            columns={exportColumns}
            rows={table.sortedItems}
            title="Liste des documents commerciaux"
          />
        </div>

        {isLoading ? (
          <TableSkeleton columns={6} minWidth={900} />
        ) : filteredDocuments.length === 0 ? (
          <EmptyState
            actionLabel={hasFilters ? 'Effacer les filtres' : clients.length > 0 && stock.length > 0 ? 'Créer un document' : 'Compléter les données'}
            description={hasFilters
              ? 'Aucun document ne correspond aux filtres actifs.'
              : clients.length > 0 && stock.length > 0
                ? 'Créez un devis, un bon de commande, une livraison ou une facture à partir du stock.'
                : 'Ajoutez au moins un client et un article en stock avant de créer un document.'}
            icon={FileText}
            onAction={() => {
              if (hasFilters) clearFilters()
              else if (clients.length > 0 && stock.length > 0) openNew()
              else setError('Pour créer un document, ajoutez au moins un client et un article au stock.')
            }}
            title={hasFilters ? 'Aucun document trouvé' : 'Aucun document enregistré'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <SortableTableHeader className="px-5 py-3.5" columnKey="number" label="N° Document" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__typeLabel" label="Type" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__dateSort" label="Date" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__clientName" label="Client" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__totalTTC" label="Total TTC" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__documentStatus" label="Statut" {...table} />
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((documentData) => {
                  const status = documentData.__documentStatus
                  const statusStyle = status === 'Validé'
                    ? 'bg-emerald-50 text-emerald-800'
                    : status === 'Annulé'
                      ? 'bg-red-50 text-red-800'
                      : 'bg-amber-50 text-amber-800'
                  const editable = documentData.sourceCollection === 'sales' &&
                    !isDeliveryValidated(documentData) &&
                    status !== 'Annulé'
                  return (
                    <tr className="transition hover:bg-steel-50/40" key={`${documentData.sourceCollection}-${documentData.id}`}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-900">{documentData.number || 'Sans numéro'}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{documentData.__typeLabel}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                        {formatDate(documentData.issueDate)}
                        {documentData.dueDate && (
                          <span className="mt-1 block text-xs text-slate-400">
                            {documentData.type === 'quote' ? 'Validité' : 'Échéance'} · {formatDate(documentData.dueDate)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-slate-700">{documentData.__clientName || '—'}</p>
                        {documentData.clientIce && (
                          <p className="mt-1 text-xs text-slate-500">ICE · {documentData.clientIce}</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold tabular-nums text-slate-800">
                        {documentData.__totalTTC === null
                          ? '—'
                          : formatCurrency(documentData.__totalTTC, company.defaultCurrency)}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle}`}>
                          {status === 'Validé'
                            ? <CheckCircle2 aria-hidden="true" size={13} />
                            : status === 'Annulé'
                              ? <ShieldAlert aria-hidden="true" size={13} />
                              : <AlertCircle aria-hidden="true" size={13} />}
                          {status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <button
                            aria-label={`Modifier ${documentData.number || 'le document'}`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!editable}
                            onClick={() => openEdit(documentData)}
                            title={!editable
                              ? documentData.sourceCollection !== 'sales'
                                ? 'Document historique : dupliquez-le pour créer une nouvelle version'
                                : isDeliveryValidated(documentData)
                                  ? 'Une livraison validée ne peut pas être modifiée'
                                  : 'Un document annulé ne peut pas être modifié'
                              : 'Modifier'}
                            type="button"
                          >
                            <Pencil aria-hidden="true" size={16} />
                          </button>
                          <button
                            aria-label={`Dupliquer ${documentData.number || 'le document'}`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-steel-50 hover:text-steel-800"
                            onClick={() => duplicateDocument(documentData)}
                            title="Dupliquer"
                            type="button"
                          >
                            <Copy aria-hidden="true" size={16} />
                          </button>
                          {documentData.type === 'deliveryNote' &&
                            documentData.sourceCollection === 'sales' &&
                            !isDeliveryValidated(documentData) &&
                            ['Directeur', 'SuperAdmin'].includes(role) && (
                              <button
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-50"
                                disabled={Boolean(deliverySavingId)}
                                onClick={() => void validateDelivery(documentData)}
                                type="button"
                              >
                                {deliverySavingId === documentData.id
                                  ? <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />
                                  : <PackageCheck aria-hidden="true" size={15} />}
                                Valider BL
                              </button>
                            )}
                          <button
                            aria-label={`Exporter ${documentData.number || 'le document'} en PDF`}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-blue-800 transition hover:bg-blue-50 disabled:opacity-50"
                            disabled={exportingId === documentData.id}
                            onClick={() => void exportDocument(documentData)}
                            type="button"
                          >
                            {exportingId === documentData.id
                              ? <LoaderCircle aria-hidden="true" className="animate-spin" size={15} />
                              : <FileDown aria-hidden="true" size={15} />}
                            PDF
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

        {!isLoading && filteredDocuments.length > 0 && <DataTablePagination {...table} />}
      </section>

      {formOpen && (
        <SalesDocumentForm
          calculatedTotals={calculatedTotals}
          clients={clients}
          clientsLoading={clientsLoading}
          company={company}
          documentOptions={DOCUMENT_OPTIONS}
          editingDocument={editingDocument}
          error={error}
          form={form}
          linePreviews={linePreviews}
          numberPreview={numberPreview}
          numberPreviewError={numberPreviewError}
          numberPreviewLoading={numberPreviewLoading}
          onAddLine={addLine}
          onCancel={() => {
            if (!saving) {
              setFormOpen(false)
              setError('')
            }
          }}
          onClientChange={(clientId) => setForm((current) => ({ ...current, clientId }))}
          onRemoveLine={removeLine}
          onSelectStock={selectStockItem}
          onSetField={handleSetField}
          onSubmit={saveDocument}
          onUpdateLine={updateLine}
          saving={saving}
          stock={stock}
          stockLoading={stockLoading}
          totals={calculatedTotals}
        />
      )}

      {pdfRequest && (
        <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 -z-10">
          <SalesPdf
            client={pdfRequest.client}
            company={company}
            documentData={pdfRequest.document}
            ref={pdfRef}
          />
        </div>
      )}

      {saving && (
        <div
          aria-live="assertive"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-slate-950/60 p-6 text-center backdrop-blur-sm"
          role="alertdialog"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-steel-800 shadow-2xl">
            <LoaderCircle aria-hidden="true" className="animate-spin" size={30} />
          </span>
          <div>
            <p className="text-base font-semibold text-white">Enregistrement sécurisé</p>
            <p className="mt-1 text-sm text-slate-200">Validation des lignes et attribution du numéro du document…</p>
          </div>
        </div>
      )}
    </main>
  )
}
