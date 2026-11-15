import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowRightLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  FilePlus2,
  FileText,
  LoaderCircle,
  Pencil,
  Search,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import {
  collection,
  doc,
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
import QuoteForm from '../components/quotes/QuoteForm'
import QuotePdf from '../components/quotes/QuotePdf'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'
import { calculateLineAmounts, sumLineAmounts } from '../utils/money'

const STATUSES = ['Brouillon', 'Envoyé', 'Accepté', 'Refusé']
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-steel-500 focus:ring-4 focus:ring-steel-100'

function localDate(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function inputDate(value, fallback = '') {
  if (value && typeof value.toDate === 'function') {
    const date = value.toDate()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : fallback
}

function addDays(value, days) {
  const date = isValidDate(value) ? new Date(`${value}T00:00:00`) : new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function validityDuration(start, end) {
  if (!isValidDate(start) || !isValidDate(end)) return 0
  return Math.max(0, Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000))
}

function clientName(client) {
  return client?.name || client?.companyName || client?.clientName || 'Client'
}

function createLineId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `quote-line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
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
  const dateValue = inputDate(value)
  if (!dateValue) return '—'
  const date = new Date(`${dateValue}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR')
}

function makeLine(defaultVatRate) {
  return {
    id: createLineId(),
    type: 'piece',
    stockId: '',
    reference: '',
    designation: '',
    unitPrice: '',
    quantity: '1',
    taxRate: String(defaultVatRate),
  }
}

function createEmptyForm(company = {}) {
  const rate = Number(company.defaultVatRate)
  const defaultVatRate = Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 20
  const issueDate = localDate()
  const validity = Number(company.defaultQuoteValidityDays)
  const validityDays = Number.isSafeInteger(validity) && validity > 0 && validity <= 3650 ? validity : 30
  return {
    clientId: '',
    elevatorId: '',
    issueDate,
    validUntil: addDays(issueDate, validityDays),
    status: 'Brouillon',
    deliveryDelay: '',
    paymentTerms: '',
    notes: '',
    generalConditions: company.defaultTermsAndConditions || '',
    items: [makeLine(defaultVatRate)],
  }
}

function mapQuoteToForm(quote, company = {}) {
  const empty = createEmptyForm(company)
  const items = (Array.isArray(quote.items) ? quote.items : []).map((line) => ({
    id: createLineId(),
    type: line.lineType || (line.stockId ? 'piece' : 'labor'),
    stockId: line.stockId || '',
    reference: line.reference || line.tgiReference || '',
    designation: line.name || line.designation || '',
    unitPrice: String(line.unitPrice ?? ''),
    quantity: String(line.quantity ?? 1),
    taxRate: String(line.taxRate ?? line.vatRate ?? empty.items[0].taxRate),
  }))
  return {
    clientId: quote.clientId || '',
    elevatorId: quote.elevatorId || '',
    issueDate: inputDate(quote.issueDate, empty.issueDate),
    validUntil: inputDate(quote.validUntil || quote.dueDate, addDays(empty.issueDate, 30)),
    status: STATUSES.includes(quote.status) ? quote.status : 'Brouillon',
    deliveryDelay: quote.deliveryDelay || '',
    paymentTerms: quote.paymentTerms || '',
    notes: quote.notes || '',
    generalConditions: quote.generalConditions || company.defaultTermsAndConditions || '',
    items: items.length ? items : empty.items,
  }
}

function makeTotals(previews) {
  const lines = previews.filter((line) => line.amounts).map((line) => line.amounts)
  try {
    const totals = sumLineAmounts(lines)
    const byRate = new Map()
    previews.forEach((preview) => {
      if (!preview.amounts) return
      const rate = Number(preview.amounts.taxRate)
      const rows = byRate.get(rate) || []
      rows.push(preview.amounts)
      byRate.set(rate, rows)
    })
    const taxBreakdown = [...byRate.entries()]
      .sort(([first], [second]) => second - first)
      .map(([taxRate, rows]) => ({
        taxRate,
        ...sumLineAmounts(rows),
      }))
    return { ...totals, taxBreakdown, error: '' }
  } catch (calculationError) {
    if (!(calculationError instanceof RangeError)) throw calculationError
    return {
      totalHT: 0,
      totalTax: 0,
      totalTTC: 0,
      taxBreakdown: [],
      error: 'Le total dépasse la précision de calcul prise en charge.',
    }
  }
}

function getStatusStyle(status) {
  if (status === 'Envoyé') return 'border-blue-200 bg-blue-50 text-blue-800'
  if (status === 'Accepté') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'Refusé') return 'border-red-200 bg-red-50 text-red-800'
  return 'border-slate-200 bg-slate-100 text-slate-700'
}

function formatDocumentNumber(prefix, year, sequence) {
  return `${prefix}-${year}-${String(sequence).padStart(3, '0')}`
}

function safeFilename(value) {
  return String(value || 'devis')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'devis'
}

function getQuoteStatus(quote) {
  if (STATUSES.includes(quote.status)) return quote.status
  const legacyStatus = String(quote.status || '').trim().toLowerCase()
  if (['draft', 'brouillon'].includes(legacyStatus)) return 'Brouillon'
  if (['cancelled', 'canceled', 'annulé', 'annule'].includes(legacyStatus)) return 'Refusé'
  return quote.sourceCollection === 'sales' ? 'Envoyé' : 'Brouillon'
}

export default function Quotes() {
  const { data: clients, loading: clientsLoading, error: clientsError } = useFirestoreCollection('clients')
  const { data: stock, loading: stockLoading, error: stockError } = useFirestoreCollection('stock')
  const { data: quotes, loading: quotesLoading, error: quotesError } = useFirestoreCollection('quotes')
  const { data: sales, loading: salesLoading, error: salesError } = useFirestoreCollection('sales')
  const [company, setCompany] = useState({})
  const [companyError, setCompanyError] = useState('')
  const [form, setForm] = useState(createEmptyForm)
  const [editingQuote, setEditingQuote] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [convertingId, setConvertingId] = useState('')
  const [exportingId, setExportingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
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
      lineError = 'Saisissez un prix unitaire HT valide et positif ou nul.'
    } else if (![0, 14, 20, Number(company.defaultVatRate)].filter(Number.isFinite).includes(taxRate)) {
      lineError = 'Sélectionnez un taux de TVA valide.'
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
  }), [form.items, stockById, company.defaultVatRate])
  const totals = useMemo(() => makeTotals(linePreviews), [linePreviews])

  const allQuotes = useMemo(() => {
    const dedicated = quotes.map((quote) => ({ ...quote, sourceCollection: 'quotes' }))
    const legacy = sales
      .filter((documentData) => documentData.type === 'quote' && !documentData.sourceQuoteId)
      .map((quote) => ({ ...quote, sourceCollection: 'sales' }))
    const seenIds = new Set(dedicated.map((quote) => quote.id))
    return [...dedicated, ...legacy.filter((quote) => !seenIds.has(quote.id))]
      .map((quote) => {
        const client = clientsById.get(quote.clientId)
        const issueDate = inputDate(quote.issueDate)
        const validUntil = inputDate(quote.validUntil || quote.dueDate)
        return {
          ...quote,
          __clientName: quote.clientName || clientName(client),
          __elevator: quote.elevatorReference || client?.elevators?.find((elevator) => elevator.id === quote.elevatorId)?.reference || '—',
          __status: getQuoteStatus(quote),
          __totalTTC: quote.totalTTC !== null &&
            quote.totalTTC !== undefined &&
            quote.totalTTC !== '' &&
            Number.isFinite(Number(quote.totalTTC))
            ? Number(quote.totalTTC)
            : null,
          __issueDate: issueDate,
          __validUntil: validUntil,
          __validityDays: Number.isSafeInteger(Number(quote.validityDays))
            ? Number(quote.validityDays)
            : validityDuration(issueDate, validUntil),
        }
      })
  }, [quotes, sales, clientsById])

  const filteredQuotes = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('fr')
    return allQuotes
      .filter((quote) => !clientFilter || quote.clientId === clientFilter)
      .filter((quote) => !statusFilter || quote.__status === statusFilter)
      .filter((quote) =>
        [quote.number, quote.__clientName, quote.__elevator, quote.__status]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('fr').includes(search)),
      )
  }, [allQuotes, query, clientFilter, statusFilter])
  const table = useDataTable(filteredQuotes)
  const exportColumns = [
    { label: 'N° Devis', key: 'number' },
    { label: 'Date', value: (quote) => formatDate(quote.issueDate) },
    { label: 'Client', key: '__clientName' },
    { label: 'Ascenseur', key: '__elevator' },
    { label: 'Montant TTC', value: (quote) => formatCurrency(quote.__totalTTC, company.defaultCurrency) },
    { label: 'Validité', value: (quote) => `${quote.__validityDays} jours` },
    { label: 'Statut', key: '__status' },
  ]

  useEffect(() => {
    if (!pdfRequest || !pdfRef.current) return undefined
    let active = true
    const exportQuotePdf = async () => {
      try {
        const generate = (await import('../utils/pdfEngine')).default
        await generate(pdfRef.current, `${safeFilename(pdfRequest.quote.number)}.pdf`, company)
      } catch (pdfError) {
        if (active) setError(pdfError instanceof Error ? pdfError.message : 'Impossible de générer le PDF du devis.')
      } finally {
        if (active) {
          setExportingId('')
          setPdfRequest(null)
        }
      }
    }
    void exportQuotePdf()
    return () => { active = false }
  }, [pdfRequest, company])

  const clearFilters = () => {
    setQuery('')
    setClientFilter('')
    setStatusFilter('')
    table.setPage(1)
  }

  const openNew = () => {
    setEditingQuote(null)
    setForm(createEmptyForm(company))
    setError('')
    setFormOpen(true)
  }

  const openEdit = (quote) => {
    if (quote.sourceCollection !== 'quotes') {
      setError('Ce devis historique est consultable et exportable, mais ne peut pas être modifié ici. Dupliquez-le pour créer une version dans le module Devis.')
      return
    }
    if (quote.convertedInvoiceId) {
      setError('Ce devis a déjà été converti en facture et ne peut plus être modifié.')
      return
    }
    if (quote.__status === 'Refusé') {
      setError('Un devis refusé ne peut pas être modifié. Dupliquez-le pour créer une nouvelle proposition.')
      return
    }
    setEditingQuote(quote)
    setForm(mapQuoteToForm(quote, company))
    setError('')
    setFormOpen(true)
  }

  const duplicateQuote = (quote) => {
    const duplicated = mapQuoteToForm(quote, company)
    const issueDate = localDate()
    const validity = Math.max(1, duplicated.validUntil
      ? validityDuration(duplicated.issueDate, duplicated.validUntil)
      : 30)
    setEditingQuote(null)
    setForm({
      ...duplicated,
      issueDate,
      validUntil: addDays(issueDate, validity || 30),
      status: 'Brouillon',
    })
    setError('')
    setNotice(`Brouillon préparé à partir de ${quote.number || 'ce devis'} ; un nouveau numéro sera attribué.`)
    setFormOpen(true)
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
    const rate = Number(company.defaultVatRate)
    setForm((current) => ({
      ...current,
      items: [...current.items, makeLine(Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 20)],
    }))
  }

  const removeLine = (index) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, lineIndex) => lineIndex !== index),
    }))
  }

  const setField = (name, value) => {
    setForm((current) => {
      if (name === 'issueDate') {
        const duration = Math.max(1, validityDuration(current.issueDate, current.validUntil) || 30)
        return { ...current, issueDate: value, validUntil: isValidDate(value) ? addDays(value, duration) : current.validUntil }
      }
      return { ...current, [name]: value }
    })
  }

  const selectClient = (clientId) => {
    setForm((current) => ({
      ...current,
      clientId,
      elevatorId: '',
    }))
  }

  const saveQuote = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    const client = clientsById.get(form.clientId)
    if (!client) {
      setError('Sélectionnez un client valide.')
      return
    }
    if (!form.elevatorId || !client.elevators?.some((elevator, index) =>
      (elevator.id || `elevator-${index}`) === form.elevatorId,
    )) {
      setError('Sélectionnez un ascenseur appartenant au client choisi.')
      return
    }
    if (!isValidDate(form.issueDate) || !isValidDate(form.validUntil) || form.validUntil < form.issueDate) {
      setError('Renseignez une date de devis et une date de validité correcte, postérieure ou égale à la date du devis.')
      return
    }
    if (!STATUSES.includes(form.status)) {
      setError('Sélectionnez un statut de devis valide.')
      return
    }
    if (form.items.length === 0 || linePreviews.some((preview) => preview.error)) {
      setError('Ajoutez au moins une ligne et vérifiez chaque type, désignation, quantité, prix et taux de TVA.')
      return
    }
    if (totals.error) {
      setError(totals.error)
      return
    }

    setSaving(true)
    const editing = Boolean(editingQuote)
    const quoteRef = editing
      ? doc(db, 'quotes', editingQuote.id)
      : doc(collection(db, 'quotes'))
    const clientRef = doc(db, 'clients', form.clientId)
    const settingsRef = doc(db, 'settings', 'company')
    const sequenceRef = doc(db, 'salesCounters', `quote-${form.issueDate.slice(0, 4)}`)
    const partIds = [...new Set(form.items.filter((line) => line.type === 'piece').map((line) => line.stockId))]
    const partRefs = partIds.map((id) => doc(db, 'stock', id))

    try {
      const saved = await runTransaction(db, async (transaction) => {
        const refs = [settingsRef, clientRef, sequenceRef]
        if (editing) refs.push(quoteRef)
        refs.push(...partRefs)
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)))
        const settingsSnapshot = snapshots[0]
        const clientSnapshot = snapshots[1]
        const sequenceSnapshot = snapshots[2]
        const existingSnapshot = editing ? snapshots[3] : null
        const partsStart = editing ? 4 : 3
        const stockSnapshots = snapshots.slice(partsStart)
        const stockSnapshotById = new Map(partIds.map((id, index) => [id, stockSnapshots[index]]))

        if (!clientSnapshot.exists()) throw new Error('Le client n’existe plus. Actualisez la page et réessayez.')
        const savedClient = { ...clientSnapshot.data(), id: clientSnapshot.id }
        const elevatorIndex = (savedClient.elevators || []).findIndex((elevator, index) =>
          (elevator.id || `elevator-${index}`) === form.elevatorId,
        )
        if (elevatorIndex < 0) throw new Error('L’ascenseur sélectionné n’appartient plus à ce client.')
        if (editing && !existingSnapshot?.exists()) throw new Error('Ce devis a été supprimé. Actualisez la liste.')
        if (editing && existingSnapshot.data()?.convertedInvoiceId) {
          throw new Error('Ce devis a déjà été converti en facture et ne peut plus être modifié.')
        }
        const currentSettings = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
        const vatSetting = Number(currentSettings.defaultVatRate)
        const allowedRates = [...new Set([0, 14, 20, vatSetting].filter((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 100))]
        const savedLines = form.items.map((line) => {
          const isPiece = line.type === 'piece'
          const stockSnapshot = isPiece ? stockSnapshotById.get(line.stockId) : null
          if (isPiece && !stockSnapshot?.exists()) {
            throw new Error('Une pièce sélectionnée n’existe plus dans l’inventaire.')
          }
          const item = stockSnapshot?.data() || {}
          const quantity = Number(line.quantity)
          const unitPrice = Number(line.unitPrice)
          const taxRate = Number(line.taxRate)
          if (!['piece', 'labor', 'travel'].includes(line.type)) throw new Error('Le type d’une ligne est invalide.')
          if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Chaque quantité doit être un entier positif.')
          if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Chaque prix unitaire doit être positif ou nul.')
          if (!allowedRates.includes(taxRate)) throw new Error('Un taux de TVA sélectionné n’est plus autorisé.')
          const designation = String(line.designation || '').trim()
          if (!designation) throw new Error('La désignation de chaque ligne est obligatoire.')
          const amounts = calculateLineAmounts(unitPrice, quantity, taxRate)
          return {
            lineType: line.type,
            stockId: isPiece ? line.stockId : '',
            reference: isPiece ? item.reference || item.tgiReference || line.reference || '' : '',
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
        const computedTotals = sumLineAmounts(savedLines)
        const grouped = new Map()
        savedLines.forEach((line) => {
          const current = grouped.get(line.taxRate) || []
          current.push(line)
          grouped.set(line.taxRate, current)
        })
        const taxBreakdown = [...grouped.entries()]
          .sort(([first], [second]) => second - first)
          .map(([taxRate, lines]) => ({
            taxRate,
            ...sumLineAmounts(lines),
            totalTax: sumLineAmounts(lines).totalTax,
          }))

        const currentSequence = Number(sequenceSnapshot.data()?.value || 0)
        if (!Number.isSafeInteger(currentSequence) || currentSequence < 0 || currentSequence >= Number.MAX_SAFE_INTEGER) {
          throw new Error('Le compteur de devis est invalide ou a atteint sa limite.')
        }
        const nextSequence = editingQuote?.number &&
          inputDate(editingQuote.issueDate).slice(0, 4) === form.issueDate.slice(0, 4)
          ? null
          : currentSequence + 1
        const quoteNumber = nextSequence === null
          ? editingQuote.number
          : formatDocumentNumber(
              String(currentSettings.quotePrefix || 'DEV').trim() || 'DEV',
              form.issueDate.slice(0, 4),
              nextSequence,
            )
        if (nextSequence !== null) {
          transaction.set(sequenceRef, { value: nextSequence, updatedAt: serverTimestamp() })
        }
        const elevator = savedClient.elevators[elevatorIndex]
        const data = {
          type: 'quote',
          number: quoteNumber,
          clientId: savedClient.id,
          clientName: clientName(savedClient),
          clientAddress: savedClient.address || '',
          clientCity: savedClient.city || '',
          clientPostalCode: savedClient.postalCode || '',
          clientPhone: savedClient.phone || savedClient.phone1 || '',
          clientEmail: savedClient.email || '',
          clientIce: savedClient.ice || '',
          elevatorId: form.elevatorId,
          elevatorReference: elevator.reference || `Ascenseur ${elevatorIndex + 1}`,
          elevatorBrand: elevator.brand || '',
          elevatorType: elevator.type || '',
          elevatorFloors: elevator.floors ?? '',
          issueDate: form.issueDate,
          validUntil: form.validUntil,
          dueDate: form.validUntil,
          validityDays: validityDuration(form.issueDate, form.validUntil),
          status: form.status,
          deliveryDelay: String(form.deliveryDelay || '').trim(),
          paymentTerms: String(form.paymentTerms || '').trim(),
          notes: String(form.notes || '').trim(),
          generalConditions: String(form.generalConditions || '').trim(),
          items: savedLines,
          ...computedTotals,
          taxBreakdown,
          currency: currentSettings.defaultCurrency || 'MAD',
          updatedAt: serverTimestamp(),
        }
        if (editing) transaction.update(quoteRef, data)
        else transaction.set(quoteRef, { ...data, createdAt: serverTimestamp() })
        return { ...data, id: quoteRef.id, sourceCollection: 'quotes' }
      })
      setFormOpen(false)
      setEditingQuote(null)
      setNotice(`Devis ${saved.number} enregistré.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer ce devis.')
    } finally {
      setSaving(false)
    }
  }

  const exportQuote = (quote) => {
    const client = clientsById.get(quote.clientId) || {
      name: quote.clientName,
      address: quote.clientAddress,
      city: quote.clientCity,
      phone: quote.clientPhone,
      email: quote.clientEmail,
      ice: quote.clientIce,
    }
    setError('')
    setExportingId(quote.id)
    setPdfRequest({ quote, client })
  }

  const convertToInvoice = async (quote) => {
    if (quote.convertedInvoiceId) {
      setError(`Ce devis est déjà rattaché à la facture ${quote.convertedInvoiceNumber || ''}.`)
      return
    }
    if (quote.__status === 'Refusé') {
      setError('Un devis refusé ne peut pas être converti en facture.')
      return
    }
    setError('')
    setNotice('')
    setConvertingId(quote.id)
    const sourceRef = doc(db, quote.sourceCollection, quote.id)
    const settingsRef = doc(db, 'settings', 'company')
    const invoiceRef = doc(collection(db, 'invoices'))
    const invoiceDate = localDate()
    const invoiceCounterRef = doc(db, 'salesCounters', `invoice-${invoiceDate.slice(0, 4)}`)
    try {
      const invoice = await runTransaction(db, async (transaction) => {
        const [sourceSnapshot, settingsSnapshot, counterSnapshot] = await Promise.all([
          transaction.get(sourceRef),
          transaction.get(settingsRef),
          transaction.get(invoiceCounterRef),
        ])
        if (!sourceSnapshot.exists()) throw new Error('Le devis n’existe plus. Actualisez la liste.')
        const source = sourceSnapshot.data()
        if (source.convertedInvoiceId) throw new Error('Ce devis a déjà été converti en facture.')
        if (getQuoteStatus(source) === 'Refusé') throw new Error('Un devis refusé ne peut pas être converti en facture.')
        const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
        const currentSequence = Number(counterSnapshot.data()?.value || 0)
        if (!Number.isSafeInteger(currentSequence) || currentSequence < 0 || currentSequence >= Number.MAX_SAFE_INTEGER) {
          throw new Error('Le compteur de factures est invalide ou a atteint sa limite.')
        }
        const sequence = currentSequence + 1
        const invoiceNumber = formatDocumentNumber(
          String(settings.invoicePrefix || 'FAC').trim() || 'FAC',
          invoiceDate.slice(0, 4),
          sequence,
        )
        const items = (Array.isArray(source.items) ? source.items : []).map((line) => ({
          ...line,
          name: line.name || line.designation || '',
          designation: line.designation || line.name || '',
          lineType: line.lineType || (line.stockId ? 'piece' : 'labor'),
        }))
        const totalsFromLines = sumLineAmounts(items)
        const totalTTC = Number(source.totalTTC)
        const totalHT = Number(source.totalHT)
        const totalTax = Number(source.totalTax)
        if (
          !Number.isFinite(totalTTC) ||
          totalTTC < 0 ||
          !Number.isFinite(totalHT) ||
          !Number.isFinite(totalTax) ||
          Math.abs(totalHT - totalsFromLines.totalHT) > 0.01 ||
          Math.abs(totalTax - totalsFromLines.totalTax) > 0.01 ||
          Math.abs(totalTTC - totalsFromLines.totalTTC) > 0.01
        ) {
          throw new Error('Les totaux du devis ne sont pas cohérents avec ses lignes ; vérifiez le document avant conversion.')
        }
        const invoiceData = {
          type: 'invoice',
          number: invoiceNumber,
          clientId: source.clientId,
          clientName: source.clientName || 'Client',
          clientAddress: source.clientAddress || '',
          clientCity: source.clientCity || '',
          clientPostalCode: source.clientPostalCode || '',
          clientPhone: source.clientPhone || '',
          clientEmail: source.clientEmail || '',
          clientIce: source.clientIce || '',
          items,
          totalHT: totalsFromLines.totalHT,
          totalTax: totalsFromLines.totalTax,
          totalTTC: totalsFromLines.totalTTC,
          taxBreakdown: source.taxBreakdown || [],
          issueDate: invoiceDate,
          dueDate: addDays(invoiceDate, 30),
          notes: source.notes || '',
          paymentTerms: source.paymentTerms || '',
          generalConditions: '',
          paidAmount: 0,
          remainingAmount: totalsFromLines.totalTTC,
          status: 'Validée / Non Payée',
          linkedDocumentCollection: quote.sourceCollection,
          linkedDocumentId: sourceSnapshot.id,
          linkedDocumentNumber: source.number || '',
          linkedDocumentType: 'Devis',
          sourceQuoteId: sourceSnapshot.id,
          sourceQuoteNumber: source.number || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
        transaction.set(invoiceCounterRef, { value: sequence, updatedAt: serverTimestamp() })
        transaction.set(invoiceRef, invoiceData)
        transaction.update(sourceRef, {
          status: 'Accepté',
          convertedInvoiceId: invoiceRef.id,
          convertedInvoiceNumber: invoiceNumber,
          updatedAt: serverTimestamp(),
        })
        return { number: invoiceNumber }
      })
      setNotice(`Facture ${invoice.number} créée depuis le devis ${quote.number}.`)
    } catch (conversionError) {
      setError(conversionError instanceof Error ? conversionError.message : 'Impossible de convertir ce devis en facture.')
    } finally {
      setConvertingId('')
    }
  }

  const pageError = clientsError || stockError || quotesError || salesError || companyError || error
  const isLoading = clientsLoading || stockLoading || quotesLoading || salesLoading
  const hasFilters = Boolean(query || clientFilter || statusFilter)

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
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Devis</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Préparez des propositions de pièces et prestations pour le parc d’ascenseurs, puis suivez leur validation.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-steel-800 to-steel-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-steel-900/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
          disabled={clientsLoading || clients.length === 0}
          onClick={openNew}
          type="button"
        >
          <FilePlus2 aria-hidden="true" size={18} />
          Nouveau devis
        </button>
      </header>

      {pageError && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          {pageError}
          <button
            aria-label="Fermer le message"
            className="ml-auto shrink-0 rounded-md p-1 hover:bg-red-100"
            onClick={() => setError('')}
            type="button"
          >
            <XCircle aria-hidden="true" size={16} />
          </button>
        </p>
      )}

      <section className="mt-8 overflow-hidden rounded-2xl border border-white bg-white/90 shadow-xl shadow-slate-900/[0.04] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:px-6 sm:py-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-steel-50 text-steel-800">
              <FileText aria-hidden="true" size={19} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Propositions commerciales</h2>
              <p className="text-xs text-slate-500">
                {filteredQuotes.length} résultat{filteredQuotes.length === 1 ? '' : 's'} sur {allQuotes.length}
              </p>
            </div>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 xl:max-w-4xl xl:grid-cols-[minmax(190px,1fr)_minmax(180px,1fr)_160px]">
            <label className="relative block">
              <span className="sr-only">Rechercher un devis</span>
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                className={`${inputClass} pl-10`}
                onChange={(event) => {
                  setQuery(event.target.value)
                  table.setPage(1)
                }}
                placeholder="N°, client ou ascenseur…"
                type="search"
                value={query}
              />
            </label>
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
              {clients.map((client) => <option key={client.id} value={client.id}>{clientName(client)}</option>)}
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
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
        </div>

        <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
          <DataTableExportToolbar columns={exportColumns} rows={table.sortedItems} title="Liste des devis" />
        </div>

        {isLoading ? (
          <TableSkeleton columns={7} minWidth={1000} />
        ) : filteredQuotes.length === 0 ? (
          <EmptyState
            actionLabel={hasFilters ? 'Effacer les filtres' : clients.length > 0 ? 'Créer un devis' : 'Ajouter un client'}
            description={hasFilters
              ? 'Aucun devis ne correspond aux filtres actifs.'
              : clients.length > 0
                ? 'Créez un devis détaillé pour une pièce, une intervention ou un déplacement.'
                : 'Ajoutez un client avant de préparer une proposition commerciale.'}
            icon={FileText}
            onAction={() => {
              if (hasFilters) clearFilters()
              else if (clients.length > 0) openNew()
              else setError('Ajoutez un client dans le module Clients avant de créer un devis.')
            }}
            title={hasFilters ? 'Aucun devis trouvé' : 'Aucun devis enregistré'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <SortableTableHeader className="px-5 py-3.5" columnKey="number" label="N° Devis" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__issueDate" label="Date" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__clientName" label="Client" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__elevator" label="Ascenseur" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__totalTTC" label="Montant TTC" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__validityDays" label="Validité" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__status" label="Statut" {...table} />
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((quote) => {
                  const status = quote.__status
                  const statusIcon = status === 'Accepté'
                    ? BadgeCheck
                    : status === 'Envoyé'
                      ? Send
                      : status === 'Refusé'
                        ? ShieldAlert
                        : Clock3
                  const StatusIcon = statusIcon
                  const canEdit = quote.sourceCollection === 'quotes' && !quote.convertedInvoiceId && status !== 'Refusé'
                  return (
                    <tr className="transition hover:bg-steel-50/40" key={`${quote.sourceCollection}-${quote.id}`}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-900">{quote.number || 'Sans numéro'}</p>
                        {quote.convertedInvoiceNumber && (
                          <p className="mt-1 text-[11px] text-emerald-700">Facture · {quote.convertedInvoiceNumber}</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays aria-hidden="true" className="text-slate-400" size={14} />
                          {formatDate(quote.issueDate)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-slate-700">{quote.__clientName}</p>
                        {quote.clientIce && <p className="mt-1 text-xs text-slate-500">ICE · {quote.clientIce}</p>}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{quote.__elevator}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold tabular-nums text-slate-800">
                        {quote.__totalTTC === null
                          ? '—'
                          : formatCurrency(quote.__totalTTC, quote.currency || company.defaultCurrency)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                        <span>{quote.__validityDays} jours</span>
                        <span className="mt-1 block text-xs text-slate-400">jusqu’au {formatDate(quote.validUntil || quote.dueDate)}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex animate-slide-up items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyle(status)}`}>
                          <StatusIcon aria-hidden="true" size={13} />
                          {status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <button
                            aria-label={`Modifier ${quote.number || 'le devis'}`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!canEdit}
                            onClick={() => openEdit(quote)}
                            title={!canEdit ? quote.sourceCollection !== 'quotes' ? 'Devis historique : dupliquez-le pour le modifier' : quote.convertedInvoiceId ? 'Déjà converti en facture' : 'Un devis refusé ne peut pas être modifié' : 'Modifier'}
                            type="button"
                          >
                            <Pencil aria-hidden="true" size={16} />
                          </button>
                          <button
                            aria-label={`Dupliquer ${quote.number || 'le devis'}`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-steel-50 hover:text-steel-800"
                            onClick={() => duplicateQuote(quote)}
                            title="Dupliquer"
                            type="button"
                          >
                            <Copy aria-hidden="true" size={16} />
                          </button>
                          <button
                            aria-label={`Exporter ${quote.number || 'le devis'} en PDF`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-800 disabled:opacity-50"
                            disabled={Boolean(exportingId)}
                            onClick={() => exportQuote(quote)}
                            title="Exporter le PDF"
                            type="button"
                          >
                            {exportingId === quote.id
                              ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                              : <FileText aria-hidden="true" size={16} />}
                          </button>
                          <button
                            aria-label={`Convertir ${quote.number || 'le devis'} en facture`}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={Boolean(convertingId) || Boolean(quote.convertedInvoiceId) || status === 'Refusé'}
                            onClick={() => void convertToInvoice(quote)}
                            title={quote.convertedInvoiceNumber
                              ? `Facture ${quote.convertedInvoiceNumber} déjà créée`
                              : status === 'Refusé'
                                ? 'Un devis refusé ne peut pas être converti'
                                : 'Créer une facture dans Ventes'}
                            type="button"
                          >
                            {convertingId === quote.id
                              ? <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />
                              : <ArrowRightLeft aria-hidden="true" size={14} />}
                            <span className="hidden 2xl:inline">Facturer</span>
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
        {!isLoading && filteredQuotes.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3 sm:px-6">
            <DataTablePagination {...table} />
          </div>
        )}
      </section>

      {formOpen && (
        <QuoteForm
          clients={clients}
          clientsLoading={clientsLoading}
          company={company}
          editingQuote={editingQuote}
          error={error}
          form={form}
          linePreviews={linePreviews}
          onAddLine={addLine}
          onCancel={() => {
            if (saving) return
            setFormOpen(false)
            setError('')
          }}
          onClientChange={selectClient}
          onRemoveLine={removeLine}
          onSelectStock={selectStockItem}
          onSetField={setField}
          onSubmit={(event) => void saveQuote(event)}
          onUpdateLine={updateLine}
          saving={saving}
          stock={stock}
          stockLoading={stockLoading}
          totals={totals}
        />
      )}

      {pdfRequest && (
        <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 z-[-1] w-[190mm] bg-white">
          <QuotePdf company={company} quote={pdfRequest.quote} client={pdfRequest.client} ref={pdfRef} />
        </div>
      )}
    </main>
  )
}
