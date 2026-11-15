import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Eye,
  FileText,
  History,
  Search,
  WalletCards,
  X,
} from 'lucide-react'
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import DataTablePagination from '../components/common/DataTablePagination'
import EmptyState from '../components/common/EmptyState'
import SortableTableHeader from '../components/common/SortableTableHeader'
import TableSkeleton from '../components/common/TableSkeleton'
import PaymentModal from '../components/collections/PaymentModal'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'
import { toCents } from '../utils/money'

const PAYMENT_METHODS = ['Virement', 'Chèque', 'Espèces', 'Effet/Traite']
const EXCLUDED_STATUSES = [
  'brouillon',
  'draft',
  'annulée',
  'annulee',
  'annulé',
  'annule',
  'cancelled',
  'canceled',
]

function localDateValue(value) {
  if (value && typeof value.toDate === 'function') {
    const date = value.toDate()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return ''
}

function formatDate(value) {
  const dateValue = localDateValue(value)
  if (!dateValue) return '—'
  const date = new Date(`${dateValue}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR')
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

function getClientName(client) {
  return client?.name || client?.companyName || client?.clientName || 'Client'
}

function getStatusLabel(totalCents, paidCents) {
  if (paidCents >= totalCents) return 'Payé'
  if (paidCents > 0) return 'Paiement Partiel'
  return 'Non Payé'
}

function getPaymentEntries(invoice, legacyPayments) {
  const embedded = Array.isArray(invoice.payments)
    ? invoice.payments.filter((payment) => payment && typeof payment === 'object')
    : []
  const legacy = legacyPayments.filter((payment) =>
    payment.invoiceId === invoice.id && payment.invoiceCollection === 'invoices',
  )
  const seen = new Set()
  return [...embedded, ...legacy]
    .filter((payment) => {
      const key = String(payment.id || payment.reference || [
        payment.paymentDate || '',
        payment.amount ?? '',
        payment.transactionReference || '',
      ].join('|'))
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((payment, index) => ({
      ...payment,
      id: payment.id || payment.reference || `${invoice.id}-payment-${index}`,
    }))
    .sort((first, second) =>
      String(second.paymentDate || '').localeCompare(String(first.paymentDate || '')),
    )
}

function getInvoiceFinancials(invoice, paymentHistory) {
  try {
    const totalCents = toCents(invoice.totalTTC)
    const recordedPaid = [invoice.amountPaid, invoice.paidAmount]
      .filter((value) => value !== null && value !== undefined)
      .map(toCents)
    const historyPaidCents = paymentHistory.reduce(
      (sum, payment) => sum + toCents(payment.amount),
      0,
    )
    const paidCents = Math.max(0, ...recordedPaid, historyPaidCents)

    if (totalCents < 0 || paidCents < 0 || paidCents > totalCents) {
      throw new RangeError('Les montants enregistrés sur cette facture sont incohérents.')
    }

    const remainingCents = totalCents - paidCents
    return {
      valid: true,
      total: totalCents / 100,
      totalCents,
      paid: paidCents / 100,
      paidCents,
      remaining: remainingCents / 100,
      remainingCents,
      status: getStatusLabel(totalCents, paidCents),
      error: '',
    }
  } catch (financialError) {
    if (!(financialError instanceof TypeError || financialError instanceof RangeError)) {
      throw financialError
    }
    return {
      valid: false,
      total: null,
      totalCents: null,
      paid: null,
      paidCents: null,
      remaining: null,
      remainingCents: null,
      status: 'Données invalides',
      error: financialError.message,
    }
  }
}

function statusStyle(status) {
  return ({
    'Non Payé': 'border-red-200 bg-red-50 text-red-800',
    'Paiement Partiel': 'border-orange-200 bg-orange-50 text-orange-800',
    Payé: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    'Données invalides': 'border-slate-200 bg-slate-100 text-slate-700',
  })[status] || 'border-slate-200 bg-slate-100 text-slate-700'
}

function isExcludedInvoice(invoice) {
  return EXCLUDED_STATUSES.includes(String(invoice.status || '').trim().toLocaleLowerCase('fr'))
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
}

export default function Collections() {
  const { data: invoices, loading: invoicesLoading, error: invoicesError } =
    useFirestoreCollection('invoices')
  const { data: clients, loading: clientsLoading, error: clientsError } =
    useFirestoreCollection('clients')
  const { data: legacyPayments, error: paymentsError } =
    useFirestoreCollection('payments')
  const [company, setCompany] = useState({})
  const [settingsError, setSettingsError] = useState('')
  const [query, setQuery] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [paymentInvoiceId, setPaymentInvoiceId] = useState('')
  const [historyInvoiceId, setHistoryInvoiceId] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => onSnapshot(
    doc(db, 'settings', 'company'),
    (snapshot) => {
      setCompany(snapshot.exists() ? snapshot.data() : {})
      setSettingsError('')
    },
    (snapshotError) => setSettingsError(snapshotError.message),
  ), [])

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const clientsById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  )
  const invoiceRows = useMemo(() => invoices
    .filter((invoice) => !isExcludedInvoice(invoice))
    .map((invoice) => {
      const client = clientsById.get(invoice.clientId)
      const history = getPaymentEntries(invoice, legacyPayments)
      const financials = getInvoiceFinancials(invoice, history)
      return {
        ...invoice,
        __clientName: invoice.clientName || getClientName(client),
        __issueDate: localDateValue(invoice.issueDate),
        __history: history,
        __financials: financials,
        __total: financials.total,
        __paid: financials.paid,
        __remaining: financials.remaining,
        __status: financials.status,
      }
    }), [invoices, clientsById, legacyPayments])

  const filteredInvoices = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('fr')
    return invoiceRows
      .filter((invoice) => !clientFilter || invoice.clientId === clientFilter)
      .filter((invoice) => !statusFilter || invoice.__status === statusFilter)
      .filter((invoice) => [
        invoice.number,
        invoice.__clientName,
        invoice.__status,
      ].filter(Boolean).some((value) => String(value).toLocaleLowerCase('fr').includes(search)))
  }, [invoiceRows, query, clientFilter, statusFilter])

  const table = useDataTable(filteredInvoices)
  const paymentInvoice = invoiceRows.find((invoice) => invoice.id === paymentInvoiceId) || null
  const historyInvoice = invoiceRows.find((invoice) => invoice.id === historyInvoiceId) || null
  const currency = company.defaultCurrency || 'MAD'
  const totalOutstanding = invoiceRows.reduce(
    (sum, invoice) => sum + (invoice.__financials.valid ? invoice.__financials.remainingCents : 0),
    0,
  ) / 100
  const unpaidCount = invoiceRows.filter((invoice) => invoice.__status === 'Non Payé').length
  const partialCount = invoiceRows.filter((invoice) => invoice.__status === 'Paiement Partiel').length
  const errorMessage = invoicesError || clientsError || paymentsError || settingsError
  const isLoading = invoicesLoading || clientsLoading
  const hasFilters = Boolean(query || clientFilter || statusFilter)

  const clearFilters = () => {
    setQuery('')
    setClientFilter('')
    setStatusFilter('')
    table.setPage(1)
  }

  const addPayment = async (form) => {
    setPaymentError('')
    setNotice('')
    if (!paymentInvoice) {
      setPaymentError('La facture sélectionnée n’est plus disponible.')
      return
    }

    let amountCents
    try {
      amountCents = toCents(form.amount)
    } catch (amountError) {
      setPaymentError(amountError instanceof Error ? amountError.message : 'Le montant est invalide.')
      return
    }

    if (amountCents <= 0) {
      setPaymentError('Le montant doit être supérieur à zéro.')
      return
    }
    if (!isValidDate(form.paymentDate)) {
      setPaymentError('Saisissez une date de paiement valide.')
      return
    }
    if (!PAYMENT_METHODS.includes(form.method)) {
      setPaymentError('Sélectionnez un mode de paiement valide.')
      return
    }

    setSavingPayment(true)
    const invoiceRef = doc(db, 'invoices', paymentInvoice.id)
    const paymentId = doc(collection(db, 'payments')).id
    const paymentReference = `REC-${new Date().getFullYear()}-${paymentId.slice(0, 8).toUpperCase()}`

    try {
      const savedPayment = await runTransaction(db, async (transaction) => {
        const invoiceSnapshot = await transaction.get(invoiceRef)
        if (!invoiceSnapshot.exists()) {
          throw new Error('Cette facture n’existe plus.')
        }

        const invoice = invoiceSnapshot.data()
        if (invoice.type !== 'invoice') {
          throw new Error('Le règlement ne peut être rattaché qu’à une facture.')
        }
        if (isExcludedInvoice(invoice)) {
          throw new Error('Un brouillon ou une facture annulée ne peut pas recevoir de règlement.')
        }

        const totalCents = toCents(invoice.totalTTC)
        const existingPayments = Array.isArray(invoice.payments) ? invoice.payments : []
        const paidFieldCents = [invoice.amountPaid, invoice.paidAmount]
          .filter((value) => value !== null && value !== undefined)
          .map(toCents)
        const historyPaidCents = existingPayments.reduce(
          (sum, payment) => sum + toCents(payment.amount),
          0,
        )
        const paidCents = Math.max(0, ...paidFieldCents, historyPaidCents)
        const remainingCents = totalCents - paidCents

        if (totalCents <= 0 || paidCents < 0 || remainingCents <= 0) {
          throw new Error('Cette facture ne présente aucun solde à recouvrer.')
        }
        if (amountCents > remainingCents) {
          throw new Error(`Le montant dépasse le solde restant (${formatCurrency(remainingCents / 100, currency)}).`)
        }

        const nextPaidCents = paidCents + amountCents
        const nextRemainingCents = totalCents - nextPaidCents
        const payment = {
          id: paymentId,
          reference: paymentReference,
          amount: amountCents / 100,
          paymentDate: form.paymentDate,
          method: form.method,
          transactionReference: String(form.reference || '').trim(),
          remarks: String(form.remarks || '').trim(),
          createdAt: new Date().toISOString(),
        }
        const paymentStatus = nextRemainingCents === 0 ? 'Payé' : 'Paiement Partiel'

        transaction.update(invoiceRef, {
          payments: [...existingPayments, payment],
          amountPaid: nextPaidCents / 100,
          paidAmount: nextPaidCents / 100,
          remainingAmount: nextRemainingCents / 100,
          paymentStatus,
          status: nextRemainingCents === 0 ? 'paid' : 'partial',
          updatedAt: serverTimestamp(),
        })

        return {
          ...payment,
          invoiceNumber: invoice.number || '',
          clientName: invoice.clientName || paymentInvoice.__clientName,
          remainingAfter: nextRemainingCents / 100,
        }
      })

      setPaymentInvoiceId('')
      setPaymentError('')
      setNotice(`Paiement de ${formatCurrency(savedPayment.amount, currency)} enregistré sur la facture ${savedPayment.invoiceNumber}.`)
    } catch (saveError) {
      setPaymentError(saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer ce paiement.')
    } finally {
      setSavingPayment(false)
    }
  }

  const renderPaymentHistory = (invoice) => (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
      <section
        aria-labelledby="payment-history-title"
        aria-modal="true"
        className="my-auto w-full max-w-3xl animate-slide-up overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl shadow-slate-950/30"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4 sm:px-7">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-900 text-white">
              <History aria-hidden="true" size={18} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900" id="payment-history-title">Historique des paiements</h2>
              <p className="mt-1 text-xs text-slate-500">{invoice.number || 'Facture'} · {invoice.__clientName}</p>
            </div>
          </div>
          <button
            aria-label="Fermer l’historique"
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            onClick={() => setHistoryInvoiceId('')}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        {invoice.__history.length === 0 ? (
          <div className="p-8 text-center">
            <FileText aria-hidden="true" className="mx-auto text-slate-300" size={28} />
            <p className="mt-3 text-sm font-medium text-slate-700">Aucun paiement enregistré.</p>
          </div>
        ) : (
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full min-w-[690px] text-left">
              <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Mode</th>
                  <th className="px-5 py-3">Référence</th>
                  <th className="px-5 py-3">Remarques</th>
                  <th className="px-5 py-3 text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.__history.map((payment) => (
                  <tr className="text-sm text-slate-700" key={payment.id}>
                    <td className="whitespace-nowrap px-5 py-3">{formatDate(payment.paymentDate)}</td>
                    <td className="whitespace-nowrap px-5 py-3">{payment.method || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="block font-medium text-slate-800">{payment.transactionReference || payment.reference || '—'}</span>
                      {payment.transactionReference && payment.reference && (
                        <span className="mt-0.5 block text-[11px] text-slate-500">{payment.reference}</span>
                      )}
                    </td>
                    <td className="max-w-56 whitespace-pre-wrap px-5 py-3 text-xs text-slate-500">{payment.remarks || '—'}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {formatCurrency(payment.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-700" colSpan={4}>Total réglé</th>
                  <td className="px-5 py-3 text-right text-sm font-bold tabular-nums text-slate-900">
                    {formatCurrency(invoice.__paid, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  )

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
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-800">Gestion financière</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Recouvrement</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Suivez les règlements clients et les soldes de vos factures en temps réel.
          </p>
        </div>
      </header>

      {errorMessage && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          {errorMessage}
        </p>
      )}

      <section aria-label="Synthèse du recouvrement" className="mt-7 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Créances à recouvrer', value: formatCurrency(totalOutstanding, currency), icon: WalletCards, tone: 'bg-blue-50 text-blue-800' },
          { label: 'Factures non payées', value: unpaidCount, icon: AlertCircle, tone: 'bg-red-50 text-red-700' },
          { label: 'Paiements partiels', value: partialCount, icon: Banknote, tone: 'bg-orange-50 text-orange-700' },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div className="flex items-center gap-3 rounded-2xl border border-white bg-white/85 p-4 shadow-lg shadow-slate-900/[0.03] ring-1 ring-slate-200/70 backdrop-blur-xl" key={item.label}>
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.tone}`}>
                <Icon aria-hidden="true" size={19} />
              </span>
              <div>
                <p className="text-xs font-medium text-slate-500">{item.label}</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{item.value}</p>
              </div>
            </div>
          )
        })}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-white bg-white/90 shadow-xl shadow-slate-900/[0.04] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-800">
              <WalletCards aria-hidden="true" size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">Créances clients</h2>
              <p className="mt-1 text-xs text-slate-500">
                {filteredInvoices.length} facture{filteredInvoices.length === 1 ? '' : 's'} · {invoices.length} documents dans la collection Factures
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(190px,1fr)_220px_190px]">
            <label className="relative block">
              <span className="sr-only">Rechercher une facture</span>
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                onChange={(event) => {
                  setQuery(event.target.value)
                  table.setPage(1)
                }}
                placeholder="Rechercher par facture ou client…"
                type="search"
                value={query}
              />
            </label>
            <select
              aria-label="Filtrer par client"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
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
              aria-label="Filtrer par statut de paiement"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              onChange={(event) => {
                setStatusFilter(event.target.value)
                table.setPage(1)
              }}
              value={statusFilter}
            >
              <option value="">Tous les statuts</option>
              {['Non Payé', 'Paiement Partiel', 'Payé', 'Données invalides'].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton columns={8} minWidth={1120} />
        ) : filteredInvoices.length === 0 ? (
          <EmptyState
            actionLabel={hasFilters ? 'Effacer les filtres' : undefined}
            description={hasFilters
              ? 'Aucune facture ne correspond à ces filtres.'
              : 'Les factures validées apparaîtront ici pour le suivi des règlements.'}
            icon={CheckCircle2}
            onAction={hasFilters ? clearFilters : undefined}
            title={hasFilters ? 'Aucun résultat' : 'Aucune créance à afficher'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <SortableTableHeader className="px-5 py-3.5" columnKey="number" label="N° Facture" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__issueDate" label="Date" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__clientName" label="Client" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__total" label="Total TTC" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__paid" label="Montant payé" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__remaining" label="Reste à payer" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__status" label="Statut de paiement" {...table} />
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((invoice) => {
                  const financials = invoice.__financials
                  const canReceivePayment = financials.valid && financials.remainingCents > 0
                  return (
                    <tr className="transition hover:bg-blue-50/35" key={invoice.id}>
                      <td className="whitespace-nowrap px-5 py-4">
                        <p className="text-sm font-semibold text-slate-900">{invoice.number || 'Sans numéro'}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{formatDate(invoice.issueDate)}</td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-700">{invoice.__clientName}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm font-medium tabular-nums text-slate-700">
                        {financials.valid ? formatCurrency(financials.total, invoice.currency || currency) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm tabular-nums text-slate-700">
                        {financials.valid ? formatCurrency(financials.paid, invoice.currency || currency) : '—'}
                      </td>
                      <td className={`whitespace-nowrap px-5 py-4 text-sm font-bold tabular-nums ${
                        financials.valid && financials.remainingCents > 0 ? 'text-rose-700' : 'text-slate-700'
                      }`}>
                        {financials.valid ? formatCurrency(financials.remaining, invoice.currency || currency) : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          invoice.__status === 'Non Payé' || invoice.__status === 'Paiement Partiel'
                            ? 'animate-pulse motion-reduce:animate-none'
                            : ''
                        } ${statusStyle(invoice.__status)}`}>
                          {invoice.__status === 'Payé'
                            ? <CheckCircle2 aria-hidden="true" size={13} />
                            : <AlertCircle aria-hidden="true" size={13} />}
                          {invoice.__status}
                        </span>
                        {!financials.valid && (
                          <p className="mt-1 max-w-48 text-[11px] text-red-700">{financials.error}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1.5">
                          <button
                            aria-label={`Ajouter un paiement à la facture ${invoice.number || ''}`}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!canReceivePayment || savingPayment}
                            onClick={() => {
                              setPaymentError('')
                              setPaymentInvoiceId(invoice.id)
                            }}
                            title={canReceivePayment ? 'Ajouter un paiement' : 'Aucun solde disponible'}
                            type="button"
                          >
                            <Banknote aria-hidden="true" size={14} />
                            Paiement
                          </button>
                          <button
                            aria-label={`Voir l’historique de paiement de la facture ${invoice.number || ''}`}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"
                            onClick={() => setHistoryInvoiceId(invoice.id)}
                            title={`Voir l’historique (${invoice.__history.length})`}
                            type="button"
                          >
                            <Eye aria-hidden="true" size={14} />
                            Historique
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
        {!isLoading && filteredInvoices.length > 0 && <DataTablePagination {...table} />}
      </section>

      {paymentInvoice && (
        <PaymentModal
          clientName={paymentInvoice.__clientName}
          currency={paymentInvoice.currency || currency}
          error={paymentError}
          invoice={paymentInvoice}
          onClose={() => {
            if (!savingPayment) {
              setPaymentInvoiceId('')
              setPaymentError('')
            }
          }}
          onSubmit={addPayment}
          remaining={paymentInvoice.__financials.remaining}
          saving={savingPayment}
        />
      )}

      {historyInvoice && renderPaymentHistory(historyInvoice)}
    </main>
  )
}
