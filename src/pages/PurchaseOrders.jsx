import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FilePlus2,
  FileText,
  LoaderCircle,
  PackageCheck,
  Pencil,
  Search,
  ShieldAlert,
  ShoppingCart,
  Truck,
  X,
  XCircle,
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
import PurchaseOrderForm from '../components/purchases/PurchaseOrderForm'
import PurchaseOrderPdf from '../components/purchases/PurchaseOrderPdf'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'
import { calculateLineAmounts, sumLineAmounts } from '../utils/money'

const STATUSES = ['Brouillon', 'Envoyé', 'Partiellement Reçu', 'Reçu & Clos', 'Annulé']
const EDITABLE_STATUSES = ['Brouillon', 'Envoyé']
const BASE_VAT_OPTIONS = [20, 14, 0]
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

function createId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `po-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
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

function createEmptyForm(company = {}) {
  const vatRate = Number(company.defaultVatRate)
  const defaultVatRate = Number.isFinite(vatRate) && vatRate >= 0 && vatRate <= 100 ? vatRate : 20
  const issueDate = localDate()
  return {
    supplierName: '',
    supplierAddress: '',
    supplierIce: '',
    supplierPhone: '',
    supplierEmail: '',
    issueDate,
    expectedDeliveryDate: addDays(issueDate, 14),
    status: 'Brouillon',
    paymentTerms: '',
    deliveryMethod: '',
    notes: '',
    items: [{
      id: createId(),
      stockId: '',
      reference: '',
      designation: '',
      quantity: '1',
      unitPrice: '',
      taxRate: String(defaultVatRate),
    }],
  }
}

function mapOrderToForm(order, company) {
  const initial = createEmptyForm(company)
  const items = (Array.isArray(order.items) ? order.items : []).map((line) => ({
    id: createId(),
    stockId: line.stockId || '',
    reference: line.reference || '',
    designation: line.name || line.designation || '',
    quantity: String(line.quantity ?? 1),
    unitPrice: String(line.unitPrice ?? ''),
    taxRate: String(line.taxRate ?? company.defaultVatRate ?? 20),
  }))
  return {
    supplierName: order.supplierName || '',
    supplierAddress: order.supplierAddress || '',
    supplierIce: order.supplierIce || '',
    supplierPhone: order.supplierPhone || '',
    supplierEmail: order.supplierEmail || '',
    issueDate: inputDate(order.issueDate, initial.issueDate),
    expectedDeliveryDate: inputDate(order.expectedDeliveryDate, initial.expectedDeliveryDate),
    status: EDITABLE_STATUSES.includes(order.status) ? order.status : 'Brouillon',
    paymentTerms: order.paymentTerms || '',
    deliveryMethod: order.deliveryMethod || '',
    notes: order.notes || '',
    items: items.length ? items : initial.items,
  }
}

function formatDocumentNumber(prefix, year, sequence) {
  return `${prefix}-${year}-${String(sequence).padStart(3, '0')}`
}

function normalizePrefix(value) {
  return String(value || 'BC').trim().replace(/-+$/, '') || 'BC'
}

function getStatusStyle(status) {
  if (status === 'Envoyé') return 'border-blue-200 bg-blue-50 text-blue-800'
  if (status === 'Partiellement Reçu') return 'border-amber-200 bg-amber-50 text-amber-900'
  if (status === 'Reçu & Clos') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'Annulé') return 'border-red-200 bg-red-50 text-red-800'
  return 'border-slate-200 bg-slate-100 text-slate-700'
}

function getStatusIcon(status) {
  if (status === 'Envoyé') return Truck
  if (status === 'Partiellement Reçu') return Clock3
  if (status === 'Reçu & Clos') return BadgeCheck
  if (status === 'Annulé') return ShieldAlert
  return FileText
}

function getStoredStatus(order) {
  if (STATUSES.includes(order.status)) return order.status
  const status = String(order.status || '').toLowerCase()
  if (['cancelled', 'canceled', 'annulé', 'annule'].includes(status)) return 'Annulé'
  if (['sent', 'issued', 'envoyé', 'envoye'].includes(status)) return 'Envoyé'
  if (['received', 'delivered', 'reçu', 'recue'].includes(status)) return 'Reçu & Clos'
  return 'Brouillon'
}

function safeFilename(value) {
  return String(value || 'bon-de-commande')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'bon-de-commande'
}

function calculateTotals(previews) {
  const validLines = previews.filter((preview) => preview.amounts).map((preview) => preview.amounts)
  try {
    const totals = sumLineAmounts(validLines)
    const grouped = new Map()
    previews.forEach((preview) => {
      if (!preview.amounts) return
      const rate = Number(preview.amounts.taxRate)
      const lines = grouped.get(rate) || []
      lines.push(preview.amounts)
      grouped.set(rate, lines)
    })
    const taxBreakdown = [...grouped.entries()]
      .sort(([first], [second]) => second - first)
      .map(([taxRate, lines]) => {
        const breakdown = sumLineAmounts(lines)
        return { taxRate, totalHT: breakdown.totalHT, totalTax: breakdown.totalTax }
      })
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

function ReceiveOrderModal({ error, onCancel, onConfirm, order, saving }) {
  const [quantities, setQuantities] = useState(() =>
    (order.items || []).map((line) =>
      String(Math.max(0, Number(line.quantity) - Number(line.receivedQuantity || 0))),
    ),
  )
  const [localError, setLocalError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLocalError('')
    const received = quantities.map(Number)
    if (received.some((value, index) => {
      const remaining = Number(order.items[index].quantity) - Number(order.items[index].receivedQuantity || 0)
      return !Number.isSafeInteger(value) || value < 0 || value > remaining
    })) {
      setLocalError('Chaque quantité reçue doit être un entier entre zéro et la quantité restante.')
      return
    }
    if (!received.some((value) => value > 0)) {
      setLocalError('Saisissez au moins une quantité à réceptionner.')
      return
    }
    await onConfirm(received)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm">
      <section
        aria-labelledby="receive-order-title"
        aria-modal="true"
        className="my-auto w-full max-w-3xl animate-slide-up overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <PackageCheck aria-hidden="true" size={19} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900" id="receive-order-title">Réceptionner la commande</h2>
              <p className="mt-1 text-xs text-slate-500">{order.number} · {order.supplierName}</p>
            </div>
          </div>
          <button aria-label="Fermer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" disabled={saving} onClick={onCancel} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="max-h-[55vh] overflow-auto p-4 sm:p-6">
            <p className="mb-4 text-sm leading-6 text-slate-600">
              Ajustez les quantités effectivement reçues. Le stock sera mis à jour dans la même transaction que le suivi de réception.
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[610px] text-left">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Article</th>
                    <th className="px-4 py-3 text-right">Commandé</th>
                    <th className="px-4 py-3 text-right">Déjà reçu</th>
                    <th className="w-40 px-4 py-3">À réceptionner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(order.items || []).map((line, index) => {
                    const remaining = Math.max(0, Number(line.quantity) - Number(line.receivedQuantity || 0))
                    return (
                      <tr key={`${line.stockId}-${index}`}>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-slate-800">{line.name || line.designation}</p>
                          <p className="mt-1 text-xs text-slate-500">{line.reference || 'Sans référence'}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600">{line.quantity}</td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600">{line.receivedQuantity || 0}</td>
                        <td className="px-4 py-3">
                          <input
                            aria-label={`Quantité reçue pour ${line.name || line.designation}`}
                            className={inputClass}
                            max={remaining}
                            min="0"
                            onChange={(event) => setQuantities((current) =>
                              current.map((value, itemIndex) => itemIndex === index ? event.target.value : value),
                            )}
                            step="1"
                            type="number"
                            value={quantities[index] ?? '0'}
                          />
                          <span className="mt-1 block text-[11px] text-slate-500">{remaining} restante(s)</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {(localError || error) && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {localError || error}
              </p>
            )}
          </div>
          <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3.5 sm:px-6">
            <button className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50" disabled={saving} onClick={onCancel} type="button">
              Annuler
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60" disabled={saving} type="submit">
              {saving ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <PackageCheck aria-hidden="true" size={16} />}
              {saving ? 'Mise à jour du stock…' : 'Confirmer la réception'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}

export default function PurchaseOrders() {
  const { role, user } = useAuth()
  const { data: orders, loading: ordersLoading, error: ordersError } = useFirestoreCollection('purchase_orders')
  const { data: stock, loading: stockLoading, error: stockError } = useFirestoreCollection('stock')
  const [company, setCompany] = useState({})
  const [settingsError, setSettingsError] = useState('')
  const [form, setForm] = useState(createEmptyForm)
  const [editingOrder, setEditingOrder] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [receivingOrder, setReceivingOrder] = useState(null)
  const [receiving, setReceiving] = useState(false)
  const [receiptError, setReceiptError] = useState('')
  const [cancellingId, setCancellingId] = useState('')
  const [exportingId, setExportingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pdfRequest, setPdfRequest] = useState(null)
  const [numberPreview, setNumberPreview] = useState('')
  const [numberPreviewLoading, setNumberPreviewLoading] = useState(false)
  const [numberPreviewError, setNumberPreviewError] = useState('')
  const pdfRef = useRef(null)

  useEffect(() => onSnapshot(
    doc(db, 'settings', 'company'),
    (snapshot) => {
      const settings = snapshot.exists() ? snapshot.data() : {}
      setCompany(settings)
      setSettingsError('')
      setForm((current) => current.items.some((line) => line.stockId)
        ? current
        : {
            ...current,
            items: current.items.map((line) => ({
              ...line,
              taxRate: String(Number(settings.defaultVatRate) >= 0 ? settings.defaultVatRate : 20),
            })),
          })
    },
    (snapshotError) => setSettingsError(snapshotError.message),
  ), [])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const stockById = useMemo(() => new Map(stock.map((item) => [item.id, item])), [stock])
  const vatRates = useMemo(
    () => [...new Set([...BASE_VAT_OPTIONS, Number(company.defaultVatRate)])]
      .filter((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 100),
    [company.defaultVatRate],
  )

  const linePreviews = useMemo(() => form.items.map((line) => {
    const stockItem = stockById.get(line.stockId)
    const quantity = Number(line.quantity)
    const unitPrice = Number(line.unitPrice)
    const taxRate = Number(line.taxRate)
    let lineError = ''
    if (!line.stockId || !stockItem) lineError = 'Sélectionnez un article existant dans le stock.'
    else if (!String(line.designation || '').trim()) lineError = 'La désignation est obligatoire.'
    else if (!Number.isSafeInteger(quantity) || quantity <= 0) lineError = 'La quantité commandée doit être un entier positif.'
    else if (line.unitPrice === '' || !Number.isFinite(unitPrice) || unitPrice < 0) {
      lineError = 'Saisissez un prix d’achat HT valide et positif ou nul.'
    } else if (!vatRates.includes(taxRate)) lineError = 'Sélectionnez un taux de TVA valide.'
    let amounts = null
    if (!lineError) {
      try {
        amounts = { ...calculateLineAmounts(unitPrice, quantity, taxRate), taxRate }
      } catch (calculationError) {
        if (!(calculationError instanceof RangeError || calculationError instanceof TypeError)) throw calculationError
        lineError = 'Le calcul de cette ligne dépasse la précision prise en charge.'
      }
    }
    const currentQuantity = Number(stockItem?.quantity)
    return {
      error: lineError,
      amounts,
      stockItem,
      availableQuantity: Number.isSafeInteger(currentQuantity) && currentQuantity >= 0 ? currentQuantity : null,
    }
  }), [form.items, stockById, vatRates])
  const totals = useMemo(() => calculateTotals(linePreviews), [linePreviews])

  const purchaseOrders = useMemo(() => orders.map((order) => ({
    ...order,
    __supplierName: order.supplierName || 'Fournisseur non renseigné',
    __status: getStoredStatus(order),
    __issueDate: inputDate(order.issueDate),
    __expectedDelivery: inputDate(order.expectedDeliveryDate),
    __totalTTC: order.totalTTC !== null &&
      order.totalTTC !== undefined &&
      order.totalTTC !== '' &&
      Number.isFinite(Number(order.totalTTC))
      ? Number(order.totalTTC)
      : null,
  })), [orders])
  const filteredOrders = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('fr')
    return purchaseOrders
      .filter((order) => !supplierFilter || order.supplierName === supplierFilter)
      .filter((order) => !statusFilter || order.__status === statusFilter)
      .filter((order) =>
        [order.number, order.__supplierName, order.__status]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('fr').includes(search)),
      )
  }, [purchaseOrders, query, supplierFilter, statusFilter])
  const table = useDataTable(filteredOrders)
  const suppliers = useMemo(
    () => [...new Set(purchaseOrders.map((order) => order.supplierName).filter(Boolean))]
      .sort((first, second) => first.localeCompare(second, 'fr')),
    [purchaseOrders],
  )
  const exportColumns = [
    { label: 'N° BC', key: 'number' },
    { label: 'Date', value: (order) => formatDate(order.issueDate) },
    { label: 'Fournisseur', key: '__supplierName' },
    { label: 'Montant TTC', value: (order) => formatCurrency(order.__totalTTC, order.currency || company.defaultCurrency) },
    { label: 'Livraison prévue', value: (order) => formatDate(order.expectedDeliveryDate) },
    { label: 'Statut', key: '__status' },
  ]

  useEffect(() => {
    if (!formOpen || !isValidDate(form.issueDate)) return undefined
    if (
      editingOrder?.number &&
      inputDate(editingOrder.issueDate).slice(0, 4) === form.issueDate.slice(0, 4)
    ) {
      return undefined
    }
    let active = true
    getDoc(doc(db, 'salesCounters', `purchaseOrder-${form.issueDate.slice(0, 4)}`))
      .then((snapshot) => {
        if (!active) return
        const current = Number(snapshot.data()?.value || 0)
        if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) {
          throw new Error('Le compteur des bons de commande est invalide.')
        }
        setNumberPreviewError('')
        setNumberPreview(formatDocumentNumber(
          normalizePrefix(company.purchaseOrderPrefix),
          form.issueDate.slice(0, 4),
          current + 1,
        ))
      })
      .catch((previewError) => {
        if (active) {
          setNumberPreview('')
          setNumberPreviewError(previewError instanceof Error ? previewError.message : 'Impossible de charger le numéro prévisionnel.')
        }
      })
      .finally(() => {
        if (active) setNumberPreviewLoading(false)
      })
    return () => { active = false }
  }, [company.purchaseOrderPrefix, editingOrder, form.issueDate, formOpen])

  useEffect(() => {
    if (!pdfRequest || !pdfRef.current) return undefined
    let active = true
    const exportPdf = async () => {
      try {
        const generate = (await import('../utils/pdfEngine')).default
        await generate(pdfRef.current, `${safeFilename(pdfRequest.order.number)}.pdf`, company)
      } catch (pdfError) {
        if (active) setError(pdfError instanceof Error ? pdfError.message : 'Impossible de générer le PDF du bon de commande.')
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

  const openNew = () => {
    setEditingOrder(null)
    setForm(createEmptyForm(company))
    setNumberPreview('')
    setNumberPreviewError('')
    setNumberPreviewLoading(true)
    setError('')
    setNotice('')
    setFormOpen(true)
  }

  const openEdit = (order) => {
    if (order.__status !== 'Brouillon') {
      setError('Seul un bon de commande en brouillon peut être modifié. Un bon envoyé doit être réceptionné ou annulé.')
      return
    }
    setEditingOrder(order)
    setForm(mapOrderToForm(order, company))
    setNumberPreview(order.number || '')
    setNumberPreviewError('')
    setNumberPreviewLoading(false)
    setError('')
    setNotice('')
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
    const defaultRate = Number(company.defaultVatRate)
    updateLine(index, {
      stockId,
      reference: item?.reference || item?.tgiReference || '',
      designation: item?.name || item?.designation || '',
      unitPrice: item ? String(item.purchasePrice ?? item.unitPrice ?? item.salePrice ?? '') : '',
      taxRate: String(item?.vatRate ?? (Number.isFinite(defaultRate) ? defaultRate : 20)),
    })
  }

  const addLine = () => {
    const vatRate = Number(company.defaultVatRate)
    setForm((current) => ({
      ...current,
      items: [...current.items, {
        id: createId(),
        stockId: '',
        reference: '',
        designation: '',
        quantity: '1',
        unitPrice: '',
        taxRate: String(Number.isFinite(vatRate) && vatRate >= 0 && vatRate <= 100 ? vatRate : 20),
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
    if (name === 'issueDate') {
      const reuseExistingNumber = editingOrder &&
        editingOrder.number &&
        isValidDate(value) &&
        inputDate(editingOrder.issueDate).slice(0, 4) === value.slice(0, 4)
      setNumberPreview(reuseExistingNumber ? editingOrder.number : '')
      setNumberPreviewError('')
      setNumberPreviewLoading(isValidDate(value) && !reuseExistingNumber)
    }
    setForm((current) => {
      if (name === 'issueDate') {
        const currentExpected = isValidDate(current.expectedDeliveryDate)
          ? current.expectedDeliveryDate
          : addDays(value, 14)
        return {
          ...current,
          issueDate: value,
          expectedDeliveryDate: currentExpected < value ? addDays(value, 14) : currentExpected,
        }
      }
      return { ...current, [name]: value }
    })
  }

  const saveOrder = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!String(form.supplierName || '').trim()) {
      setError('Le nom du fournisseur est obligatoire.')
      return
    }
    if (
      form.supplierEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.supplierEmail).trim())
    ) {
      setError('Saisissez une adresse e-mail fournisseur valide ou laissez le champ vide.')
      return
    }
    if (!isValidDate(form.issueDate) || !isValidDate(form.expectedDeliveryDate) || form.expectedDeliveryDate < form.issueDate) {
      setError('Renseignez des dates valides ; la livraison prévue doit être le jour de commande ou après.')
      return
    }
    if (!EDITABLE_STATUSES.includes(form.status)) {
      setError('Le statut sélectionné n’est pas valide pour la création ou la modification.')
      return
    }
    if (!form.items.length || linePreviews.some((preview) => preview.error)) {
      setError('Ajoutez au moins une ligne et vérifiez les articles, quantités, prix et taux de TVA.')
      return
    }
    if (totals.error) {
      setError(totals.error)
      return
    }
    if (editingOrder && editingOrder.__status !== 'Brouillon') {
      setError('Un bon envoyé ne peut plus être modifié.')
      return
    }

    setSaving(true)
    const isEditing = Boolean(editingOrder)
    const orderRef = isEditing ? doc(db, 'purchase_orders', editingOrder.id) : doc(collection(db, 'purchase_orders'))
    const settingsRef = doc(db, 'settings', 'company')
    const sequenceRef = doc(db, 'salesCounters', `purchaseOrder-${form.issueDate.slice(0, 4)}`)
    const stockIds = [...new Set(form.items.map((line) => line.stockId))]
    const stockRefs = stockIds.map((id) => doc(db, 'stock', id))
    const reuseNumber = isEditing &&
      editingOrder.number &&
      inputDate(editingOrder.issueDate).slice(0, 4) === form.issueDate.slice(0, 4)

    try {
      const saved = await runTransaction(db, async (transaction) => {
        const refs = [settingsRef]
        if (!reuseNumber) refs.push(sequenceRef)
        if (isEditing) refs.push(orderRef)
        refs.push(...stockRefs)
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)))
        let index = 0
        const settingsSnapshot = snapshots[index++]
        const counterSnapshot = reuseNumber ? null : snapshots[index++]
        const existingSnapshot = isEditing ? snapshots[index++] : null
        const stockSnapshots = snapshots.slice(index)
        const stockByIdAtSave = new Map(stockIds.map((id, stockIndex) => [id, stockSnapshots[stockIndex]]))
        if (isEditing && !existingSnapshot?.exists()) throw new Error('Ce bon de commande a été supprimé. Actualisez la page.')
        if (isEditing && getStoredStatus(existingSnapshot.data()) !== 'Brouillon') {
          throw new Error('Ce bon n’est plus en brouillon et ne peut pas être modifié.')
        }
        const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
        const defaultVat = Number(settings.defaultVatRate)
        const allowedRates = [...new Set([...BASE_VAT_OPTIONS, defaultVat])]
          .filter((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 100)
        const resolvedLines = form.items.map((line) => {
          const itemSnapshot = stockByIdAtSave.get(line.stockId)
          if (!line.stockId || !itemSnapshot?.exists()) {
            throw new Error('Un article sélectionné n’existe plus dans l’inventaire.')
          }
          const stockItem = itemSnapshot.data()
          const quantity = Number(line.quantity)
          const unitPrice = Number(line.unitPrice)
          const taxRate = Number(line.taxRate)
          const designation = String(line.designation || '').trim()
          if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Chaque quantité commandée doit être un entier positif.')
          if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`Le prix d’achat de « ${designation || stockItem.name || 'l’article'} » est invalide.`)
          if (!allowedRates.includes(taxRate)) throw new Error('Un taux de TVA sélectionné n’est plus autorisé.')
          if (!designation) throw new Error('La désignation de chaque ligne est obligatoire.')
          const amounts = calculateLineAmounts(unitPrice, quantity, taxRate)
          const previousLine = isEditing
            ? (existingSnapshot.data().items || []).find((item) => item.stockId === line.stockId)
            : null
          return {
            stockId: line.stockId,
            reference: stockItem.reference || stockItem.tgiReference || line.reference || '',
            name: designation,
            designation,
            quantity,
            receivedQuantity: Number.isSafeInteger(Number(previousLine?.receivedQuantity))
              ? Number(previousLine.receivedQuantity)
              : 0,
            unitPrice: amounts.unitPrice,
            taxRate,
            totalHT: amounts.totalHT,
            taxAmount: amounts.taxAmount,
            totalTTC: amounts.totalTTC,
          }
        })
        const computedTotals = sumLineAmounts(resolvedLines)
        const totalsByRate = new Map()
        resolvedLines.forEach((line) => {
          const group = totalsByRate.get(line.taxRate) || []
          group.push(line)
          totalsByRate.set(line.taxRate, group)
        })
        const taxBreakdown = [...totalsByRate.entries()]
          .sort(([first], [second]) => second - first)
          .map(([taxRate, lines]) => {
            const lineTotals = sumLineAmounts(lines)
            return { taxRate, totalHT: lineTotals.totalHT, totalTax: lineTotals.totalTax }
          })
        let number = reuseNumber ? editingOrder.number : ''
        if (!reuseNumber) {
          const currentSequence = Number(counterSnapshot?.data()?.value || 0)
          if (!Number.isSafeInteger(currentSequence) || currentSequence < 0 || currentSequence >= Number.MAX_SAFE_INTEGER) {
            throw new Error('Le compteur des bons de commande est invalide ou a atteint sa limite.')
          }
          const sequence = currentSequence + 1
          number = formatDocumentNumber(
            normalizePrefix(settings.purchaseOrderPrefix),
            form.issueDate.slice(0, 4),
            sequence,
          )
          transaction.set(sequenceRef, { value: sequence, updatedAt: serverTimestamp() })
        }
        const previousData = existingSnapshot?.data() || {}
        const data = {
          type: 'purchaseOrder',
          number,
          supplierName: String(form.supplierName).trim(),
          supplierAddress: String(form.supplierAddress || '').trim(),
          supplierIce: String(form.supplierIce || '').trim(),
          supplierPhone: String(form.supplierPhone || '').trim(),
          supplierEmail: String(form.supplierEmail || '').trim(),
          issueDate: form.issueDate,
          expectedDeliveryDate: form.expectedDeliveryDate,
          status: form.status,
          paymentTerms: String(form.paymentTerms || '').trim(),
          deliveryMethod: String(form.deliveryMethod || '').trim(),
          notes: String(form.notes || '').trim(),
          currency: settings.defaultCurrency || 'MAD',
          items: resolvedLines,
          ...computedTotals,
          taxBreakdown,
          sentAt: form.status === 'Envoyé'
            ? previousData.sentAt || serverTimestamp()
            : null,
          updatedAt: serverTimestamp(),
        }
        if (isEditing) transaction.update(orderRef, data)
        else transaction.set(orderRef, { ...data, createdAt: serverTimestamp() })
        return { ...data, id: orderRef.id }
      })
      setFormOpen(false)
      setEditingOrder(null)
      setNotice(`Bon de commande ${saved.number} enregistré.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer ce bon de commande.')
    } finally {
      setSaving(false)
    }
  }

  const exportOrder = (order) => {
    setError('')
    setExportingId(order.id)
    setPdfRequest({ order })
  }

  const beginReceiving = (order) => {
    if (!['Envoyé', 'Partiellement Reçu'].includes(order.__status)) {
      setError('Seuls les bons envoyés ou partiellement réceptionnés peuvent être réceptionnés.')
      return
    }
    if (!['Directeur', 'SuperAdmin'].includes(role)) {
      setError('Seul le Directeur ou le SuperAdmin peut réceptionner une commande et modifier le stock.')
      return
    }
    setReceiptError('')
    setReceivingOrder({ ...order, receiptId: createId() })
  }

  const receiveOrder = async (quantities) => {
    if (!receivingOrder) return false
    if (!['Directeur', 'SuperAdmin'].includes(role)) {
      setReceiptError('Seul le Directeur ou le SuperAdmin peut réceptionner une commande.')
      return false
    }
    setReceiptError('')
    setReceiving(true)
    const orderRef = doc(db, 'purchase_orders', receivingOrder.id)
    const receiptRef = doc(db, 'purchase_orders', receivingOrder.id, 'receipts', receivingOrder.receiptId)
    try {
      const result = await runTransaction(db, async (transaction) => {
        const [orderSnapshot, receiptSnapshot] = await Promise.all([
          transaction.get(orderRef),
          transaction.get(receiptRef),
        ])
        if (!orderSnapshot.exists()) throw new Error('Ce bon de commande n’existe plus.')
        if (receiptSnapshot.exists()) throw new Error('Cette réception a déjà été traitée. Actualisez la commande avant de recommencer.')
        const order = orderSnapshot.data()
        if (!['Envoyé', 'Partiellement Reçu'].includes(getStoredStatus(order))) {
          throw new Error('Le statut de cette commande ne permet plus de réception.')
        }
        const lines = Array.isArray(order.items) ? order.items : []
        if (lines.length !== quantities.length || !lines.length) throw new Error('Les lignes de commande ont changé. Actualisez puis recommencez.')
        const quantitiesByStock = new Map()
        const updatedLines = lines.map((line, index) => {
          const ordered = Number(line.quantity)
          const alreadyReceived = Number(line.receivedQuantity || 0)
          const receiveNow = Number(quantities[index])
          if (
            !line.stockId ||
            !Number.isSafeInteger(ordered) ||
            ordered <= 0 ||
            !Number.isSafeInteger(alreadyReceived) ||
            alreadyReceived < 0 ||
            alreadyReceived > ordered ||
            !Number.isSafeInteger(receiveNow) ||
            receiveNow < 0 ||
            receiveNow > ordered - alreadyReceived
          ) {
            throw new Error(`Quantité de réception invalide pour « ${line.name || line.designation || 'un article'} ».`)
          }
          const nextReceived = alreadyReceived + receiveNow
          const aggregated = (quantitiesByStock.get(line.stockId) || 0) + receiveNow
          if (!Number.isSafeInteger(aggregated)) throw new Error('La quantité reçue dépasse la limite prise en charge.')
          quantitiesByStock.set(line.stockId, aggregated)
          return { ...line, receivedQuantity: nextReceived }
        })
        if (![...quantitiesByStock.values()].some((quantity) => quantity > 0)) {
          throw new Error('Saisissez au moins une quantité à réceptionner.')
        }
        const stockIds = [...quantitiesByStock.keys()].filter((id) => quantitiesByStock.get(id) > 0)
        const stockRefs = stockIds.map((id) => doc(db, 'stock', id))
        const stockSnapshots = await Promise.all(stockRefs.map((ref) => transaction.get(ref)))
        const stockUpdates = stockSnapshots.map((snapshot, index) => {
          const stockId = stockIds[index]
          if (!snapshot.exists()) throw new Error(`L’article ${stockId} n’existe plus dans l’inventaire.`)
          const item = snapshot.data()
          const currentQuantity = Number(item.quantity)
          const quantityToAdd = quantitiesByStock.get(stockId)
          if (!Number.isSafeInteger(currentQuantity) || currentQuantity < 0) {
            throw new Error(`La quantité actuelle de « ${item.name || item.designation || stockId} » est invalide.`)
          }
          const nextQuantity = currentQuantity + quantityToAdd
          if (!Number.isSafeInteger(nextQuantity)) {
            throw new Error(`La quantité après réception de « ${item.name || item.designation || stockId} » dépasse la limite.`)
          }
          return { ref: stockRefs[index], quantity: nextQuantity }
        })
        const isClosed = updatedLines.every((line) => line.receivedQuantity === Number(line.quantity))
        const nextStatus = isClosed ? 'Reçu & Clos' : 'Partiellement Reçu'
        const receiptItems = updatedLines
          .map((line, index) => ({ line, quantity: Number(quantities[index]) }))
          .filter(({ quantity }) => quantity > 0)
          .map(({ line, quantity }) => ({
            stockId: line.stockId,
            reference: line.reference || '',
            name: line.name || line.designation || '',
            quantity,
          }))
        stockUpdates.forEach((update) => {
          transaction.update(update.ref, { quantity: update.quantity, updatedAt: serverTimestamp() })
        })
        transaction.set(receiptRef, {
          purchaseOrderId: orderSnapshot.id,
          purchaseOrderNumber: order.number || '',
          items: receiptItems,
          createdBy: user?.uid || null,
          createdAt: serverTimestamp(),
        })
        transaction.update(orderRef, {
          items: updatedLines,
          status: nextStatus,
          lastReceiptAt: serverTimestamp(),
          ...(isClosed ? { receivedAt: serverTimestamp() } : {}),
          updatedAt: serverTimestamp(),
        })
        return { status: nextStatus, number: order.number || '' }
      })
      setNotice(result.status === 'Reçu & Clos'
        ? `Bon ${result.number} reçu et clôturé ; le stock a été incrémenté.`
        : `Réception partielle de ${result.number} enregistrée ; le stock a été mis à jour.`)
      setReceivingOrder(null)
      return true
    } catch (receiveError) {
      setReceiptError(receiveError instanceof Error ? receiveError.message : 'Impossible de réceptionner cette commande.')
      return false
    } finally {
      setReceiving(false)
    }
  }

  const cancelOrder = async (order) => {
    if (!['Brouillon', 'Envoyé'].includes(order.__status)) {
      setError('Une commande partiellement reçue ou clôturée ne peut pas être annulée.')
      return
    }
    if (!window.confirm(`Annuler le bon ${order.number || ''} ? Cette action est définitive.`)) return
    setError('')
    setCancellingId(order.id)
    try {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, 'purchase_orders', order.id)
        const snapshot = await transaction.get(orderRef)
        if (!snapshot.exists()) throw new Error('Ce bon de commande n’existe plus.')
        const currentOrder = snapshot.data()
        if (!['Brouillon', 'Envoyé'].includes(getStoredStatus(currentOrder))) {
          throw new Error('Le statut de ce bon ne permet plus son annulation.')
        }
        if ((currentOrder.items || []).some((line) => Number(line.receivedQuantity || 0) > 0)) {
          throw new Error('Une commande déjà réceptionnée, même partiellement, ne peut pas être annulée.')
        }
        transaction.update(orderRef, {
          status: 'Annulé',
          cancelledAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      })
      setNotice(`Bon ${order.number || ''} annulé.`)
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Impossible d’annuler ce bon de commande.')
    } finally {
      setCancellingId('')
    }
  }

  const clearFilters = () => {
    setQuery('')
    setSupplierFilter('')
    setStatusFilter('')
    table.setPage(1)
  }

  const isLoading = ordersLoading || stockLoading
  const pageError = ordersError || stockError || settingsError || error
  const hasFilters = Boolean(query || supplierFilter || statusFilter)

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      {notice && (
        <div className="fixed right-4 top-4 z-[80] flex max-w-[calc(100vw-2rem)] items-start gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 shadow-xl" role="status">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          {notice}
        </div>
      )}

      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel-700">Approvisionnement</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Bons de commande</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Gérez les commandes fournisseurs et réceptionnez les articles directement dans l’inventaire.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-steel-800 to-steel-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-steel-900/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
          disabled={stockLoading || stock.length === 0}
          onClick={openNew}
          type="button"
        >
          <FilePlus2 aria-hidden="true" size={18} />
          Nouveau bon de commande
        </button>
      </header>

      {pageError && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          {pageError}
          <button aria-label="Fermer le message" className="ml-auto shrink-0 rounded-md p-1 hover:bg-red-100" onClick={() => setError('')} type="button">
            <XCircle aria-hidden="true" size={16} />
          </button>
        </p>
      )}

      <section className="mt-8 overflow-hidden rounded-2xl border border-white bg-white/90 shadow-xl shadow-slate-900/[0.04] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:px-6 sm:py-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-steel-50 text-steel-800">
              <ShoppingCart aria-hidden="true" size={19} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Commandes fournisseurs</h2>
              <p className="text-xs text-slate-500">{filteredOrders.length} résultat{filteredOrders.length === 1 ? '' : 's'} sur {purchaseOrders.length}</p>
            </div>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 xl:max-w-4xl xl:grid-cols-[minmax(190px,1fr)_minmax(180px,1fr)_190px]">
            <label className="relative block">
              <span className="sr-only">Rechercher un bon de commande</span>
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                className={`${inputClass} pl-10`}
                onChange={(event) => {
                  setQuery(event.target.value)
                  table.setPage(1)
                }}
                placeholder="N° ou fournisseur…"
                type="search"
                value={query}
              />
            </label>
            <select
              aria-label="Filtrer par fournisseur"
              className={inputClass}
              onChange={(event) => {
                setSupplierFilter(event.target.value)
                table.setPage(1)
              }}
              value={supplierFilter}
            >
              <option value="">Tous les fournisseurs</option>
              {suppliers.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
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
          <DataTableExportToolbar columns={exportColumns} rows={table.sortedItems} title="Bons de commande fournisseurs" />
        </div>

        {isLoading ? (
          <TableSkeleton columns={6} minWidth={1000} />
        ) : filteredOrders.length === 0 ? (
          <EmptyState
            actionLabel={hasFilters ? 'Effacer les filtres' : stock.length > 0 ? 'Créer un bon de commande' : 'Compléter le stock'}
            description={hasFilters
              ? 'Aucun bon de commande ne correspond aux filtres actifs.'
              : stock.length > 0
                ? 'Créez une commande fournisseur pour approvisionner les articles de votre inventaire.'
                : 'Ajoutez d’abord des articles au stock afin de pouvoir les commander.'}
            icon={ShoppingCart}
            onAction={() => {
              if (hasFilters) clearFilters()
              else if (stock.length > 0) openNew()
              else setError('Ajoutez au moins un article au stock avant de créer une commande.')
            }}
            title={hasFilters ? 'Aucun bon trouvé' : 'Aucune commande fournisseur'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <SortableTableHeader className="px-5 py-3.5" columnKey="number" label="N° BC" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__issueDate" label="Date" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__supplierName" label="Fournisseur" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__totalTTC" label="Montant TTC" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__expectedDelivery" label="Livraison prévue" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__status" label="Statut" {...table} />
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((order) => {
                  const StatusIcon = getStatusIcon(order.__status)
                  const canReceive = ['Envoyé', 'Partiellement Reçu'].includes(order.__status)
                  const canCancel = ['Brouillon', 'Envoyé'].includes(order.__status)
                  const receivedQuantity = (order.items || []).reduce(
                    (total, line) => total + (Number(line.receivedQuantity) || 0),
                    0,
                  )
                  return (
                    <tr className="transition hover:bg-steel-50/40" key={order.id}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-900">{order.number || 'Sans numéro'}</p>
                        {receivedQuantity > 0 && <p className="mt-1 text-[11px] text-slate-500">Réception cumulée · {receivedQuantity} unité(s)</p>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays aria-hidden="true" className="text-slate-400" size={14} />
                          {formatDate(order.issueDate)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-700">{order.__supplierName}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold tabular-nums text-slate-800">
                        {order.__totalTTC === null
                          ? '—'
                          : formatCurrency(order.__totalTTC, order.currency || company.defaultCurrency)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{formatDate(order.expectedDeliveryDate)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex animate-slide-up items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyle(order.__status)}`}>
                          <StatusIcon aria-hidden="true" size={13} />
                          {order.__status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <button
                            aria-label={`Modifier ${order.number || 'le bon'}`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={order.__status !== 'Brouillon'}
                            onClick={() => openEdit(order)}
                            title={order.__status === 'Brouillon' ? 'Modifier' : 'Seul un brouillon peut être modifié'}
                            type="button"
                          >
                            <Pencil aria-hidden="true" size={16} />
                          </button>
                          <button
                            aria-label={`Exporter ${order.number || 'le bon'} en PDF`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-800 disabled:opacity-50"
                            disabled={Boolean(exportingId)}
                            onClick={() => exportOrder(order)}
                            title="Exporter le bon de commande en PDF"
                            type="button"
                          >
                            {exportingId === order.id
                              ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                              : <FileText aria-hidden="true" size={16} />}
                          </button>
                          <button
                            aria-label={`Réceptionner ${order.number || 'le bon'}`}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!canReceive || Boolean(receiving || cancellingId)}
                            onClick={() => beginReceiving(order)}
                            title={canReceive ? 'Réceptionner les quantités et incrémenter le stock' : 'Le bon doit être envoyé pour être réceptionné'}
                            type="button"
                          >
                            {receiving && receivingOrder?.id === order.id
                              ? <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />
                              : <PackageCheck aria-hidden="true" size={14} />}
                            <span className="hidden 2xl:inline">Réceptionner</span>
                          </button>
                          {canCancel && (
                            <button
                              aria-label={`Annuler ${order.number || 'le bon'}`}
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                              disabled={Boolean(cancellingId || receiving)}
                              onClick={() => void cancelOrder(order)}
                              title="Annuler le bon"
                              type="button"
                            >
                              {cancellingId === order.id
                                ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                                : <XCircle aria-hidden="true" size={16} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && filteredOrders.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3 sm:px-6">
            <DataTablePagination {...table} />
          </div>
        )}
      </section>

      {formOpen && (
        <PurchaseOrderForm
          company={company}
          editingOrder={editingOrder}
          error={error}
          form={form}
          linePreviews={linePreviews}
          numberPreview={numberPreview}
          numberPreviewError={numberPreviewError}
          numberPreviewLoading={numberPreviewLoading}
          onAddLine={addLine}
          onCancel={() => {
            if (saving) return
            setFormOpen(false)
            setNumberPreviewLoading(false)
            setError('')
          }}
          onRemoveLine={removeLine}
          onSelectStock={selectStockItem}
          onSetField={setField}
          onSubmit={(event) => void saveOrder(event)}
          onUpdateLine={updateLine}
          saving={saving}
          stock={stock}
          stockLoading={stockLoading}
          totals={totals}
        />
      )}

      {receivingOrder && (
        <ReceiveOrderModal
          error={receiptError}
          onCancel={() => {
            if (receiving) return
            setReceivingOrder(null)
            setReceiptError('')
          }}
          onConfirm={receiveOrder}
          order={receivingOrder}
          saving={receiving}
        />
      )}

      {pdfRequest && (
        <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 z-[-1] w-[190mm] bg-white">
          <PurchaseOrderPdf company={company} order={pdfRequest.order} ref={pdfRef} />
        </div>
      )}
    </main>
  )
}
