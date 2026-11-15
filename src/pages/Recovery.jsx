import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { AlertCircle, Banknote, CheckCircle2, Clock3, Printer, Search } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import ReceiptPdf from '../components/pdf/ReceiptPdf'
import { db } from '../firebase/config'
import DataTableExportToolbar from '../components/common/DataTableExportToolbar'
import DataTablePagination from '../components/common/DataTablePagination'
import SortableTableHeader from '../components/common/SortableTableHeader'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'

const METHODS = ['Espèces', 'Chèque', 'Virement', 'Effet']
const REMINDER_METHODS = ['Appel', 'Email', 'Visite']
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'

function localDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatCurrency(value, currency = 'MAD') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: ['MAD', 'EUR', 'USD'].includes(currency) ? currency : 'MAD',
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('fr-FR')
}

function getDaysOverdue(invoice, today = localDate()) {
  if (!invoice.dueDate) return null
  const due = new Date(`${invoice.dueDate}T00:00:00`)
  const current = new Date(`${today}T00:00:00`)
  if (Number.isNaN(due.getTime())) return null
  if (due >= current) return 0
  return Math.floor((current.getTime() - due.getTime()) / 86400000)
}

function getAgingBucket(days) {
  if (days === null) return 'no-date'
  if (days === 0) return 'current'
  if (days <= 30) return '0-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

function getAgingLabel(bucket) {
  return ({
    current: 'À échoir / à date',
    '0-30': '0–30 jours',
    '31-60': '31–60 jours',
    '61-90': '61–90 jours',
    '90+': '+90 jours',
    'no-date': 'Sans échéance',
  })[bucket] || '—'
}

function getAgingTone(bucket) {
  return ({
    current: 'bg-slate-100 text-slate-700',
    '0-30': 'bg-amber-100 text-amber-800',
    '31-60': 'bg-orange-100 text-orange-800',
    '61-90': 'bg-rose-100 text-rose-800',
    '90+': 'bg-red-100 text-red-800',
    'no-date': 'bg-slate-100 text-slate-600',
  })[bucket] || 'bg-slate-100 text-slate-600'
}

function getRemainingAmount(invoice) {
  const storedRemaining = Number(invoice.remainingAmount)
  if (invoice.remainingAmount !== undefined && invoice.remainingAmount !== null && Number.isFinite(storedRemaining)) {
    return Math.max(0, storedRemaining)
  }
  return Math.max(0, Number(invoice.totalTTC || 0) - Number(invoice.paidAmount || 0))
}

function getPaidAmount(invoice) {
  const total = Math.max(0, Number(invoice.totalTTC || 0))
  const storedPaid = Number(invoice.paidAmount)
  const paid = invoice.paidAmount !== null && invoice.paidAmount !== undefined && Number.isFinite(storedPaid)
    ? storedPaid
    : total - getRemainingAmount(invoice)
  return Math.min(total, Math.max(0, paid))
}

function toCents(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError('Le montant doit être un nombre positif ou nul.')
  }
  const cents = Math.round((amount + Number.EPSILON) * 100)
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('Le montant dépasse la précision prise en charge.')
  }
  return cents
}

export default function Recovery() {
  const [searchParams] = useSearchParams()
  const invoiceFromQuery = searchParams.get('invoice')
  const { data: currentSales, loading: currentSalesLoading, error: currentSalesError } = useFirestoreCollection('sales')
  const { data: dedicatedInvoices, loading: dedicatedInvoicesLoading, error: dedicatedInvoicesError } = useFirestoreCollection('invoices')
  const { data: payments, error: paymentsError } = useFirestoreCollection('payments')
  const { data: clients, error: clientsError } = useFirestoreCollection('clients')
  const { data: reminders, error: remindersError } = useFirestoreCollection('recoveryReminders')
  const [company, setCompany] = useState({})
  const [settingsError, setSettingsError] = useState('')
  const [selectedInvoiceKey, setSelectedInvoiceKey] = useState('')
  const [form, setForm] = useState({
    amount: '',
    paymentDate: localDate(),
    method: METHODS[0],
    transactionReference: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [receiptData, setReceiptData] = useState(null)
  const [autoExportReceipt, setAutoExportReceipt] = useState(false)
  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [agingFilter, setAgingFilter] = useState('')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('')
  const [reminderOpen, setReminderOpen] = useState(false)
  const [reminderSaving, setReminderSaving] = useState(false)
  const [reminderError, setReminderError] = useState('')
  const [reminderForm, setReminderForm] = useState({
    date: localDate(),
    method: REMINDER_METHODS[0],
    result: '',
  })
  const receiptRef = useRef(null)
  const loading = currentSalesLoading || dedicatedInvoicesLoading
  const documentsError = currentSalesError || dedicatedInvoicesError

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
  const invoices = useMemo(() => [
    ...currentSales
      .filter((documentData) =>
        documentData.type === 'invoice' &&
        !['brouillon', 'draft', 'annulé', 'annule', 'annulée', 'annulee', 'cancelled', 'canceled']
          .includes(String(documentData.status || '').trim().toLocaleLowerCase('fr')) &&
        getRemainingAmount(documentData) > 0,
      )
      .map((documentData) => ({ ...documentData, sourceCollection: 'sales' })),
    ...dedicatedInvoices
      .filter((invoice) =>
        !['brouillon', 'draft', 'annulé', 'annule', 'annulée', 'annulee', 'cancelled', 'canceled']
          .includes(String(invoice.status || '').trim().toLocaleLowerCase('fr')) &&
        getRemainingAmount(invoice) > 0,
      )
      .map((invoice) => ({ ...invoice, sourceCollection: 'invoices' })),
  ], [currentSales, dedicatedInvoices])
  const filteredInvoices = useMemo(() => {
    const search = invoiceQuery.trim().toLowerCase()
    return invoices.filter((invoice) =>
      [invoice.number, invoice.clientName, invoice.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    ).filter((invoice) => !agingFilter || getAgingBucket(getDaysOverdue(invoice)) === agingFilter)
      .filter((invoice) => !paymentStatusFilter || (
        paymentStatusFilter === 'partial'
          ? getPaidAmount(invoice) > 0
          : getPaidAmount(invoice) <= 0
      ))
      .map((invoice) => {
        const client = clientById.get(invoice.clientId)
        const paid = getPaidAmount(invoice)
        return {
          ...invoice,
          __clientName: invoice.clientName || client?.name || client?.companyName || 'Client',
          __remaining: getRemainingAmount(invoice),
          __paid: paid,
          __aging: getAgingBucket(getDaysOverdue(invoice)),
          __daysOverdue: getDaysOverdue(invoice) ?? -1,
        }
      })
  }, [invoices, invoiceQuery, agingFilter, paymentStatusFilter, clientById])
  const invoiceTable = useDataTable(filteredInvoices)
  const invoiceExportColumns = [
    { label: 'Facture', key: 'number' },
    { label: 'Client', value: (invoice) => invoice.__clientName },
    { label: 'Date d’échéance', key: 'dueDate' },
    { label: 'Âge de la créance', value: (invoice) => getAgingLabel(invoice.__aging) },
    { label: 'Total TTC', key: 'totalTTC' },
    { label: 'Déjà payé', value: (invoice) => invoice.__paid },
    { label: 'Reste à payer', value: (invoice) => invoice.__remaining },
  ]
  const selectedInvoice = selectedInvoiceKey
    ? invoices.find((invoice) => `${invoice.sourceCollection}:${invoice.id}` === selectedInvoiceKey)
    : invoices.find((invoice) => invoice.id === invoiceFromQuery)
  const activeInvoiceId = selectedInvoice?.id || ''
  const balance = selectedInvoice
    ? getRemainingAmount(selectedInvoice)
    : 0
  const invoicePayments = payments
    .filter((payment) =>
      payment.invoiceId === activeInvoiceId &&
      (payment.invoiceCollection || 'sales') === (selectedInvoice?.sourceCollection || 'sales'),
    )
    .sort((first, second) => (second.createdAt?.seconds || 0) - (first.createdAt?.seconds || 0))
  const paymentTable = useDataTable(invoicePayments)
  const invoiceReminders = reminders
    .filter((reminder) =>
      reminder.invoiceId === activeInvoiceId &&
      (reminder.invoiceCollection || 'sales') === (selectedInvoice?.sourceCollection || 'sales'),
    )
    .sort((first, second) => String(second.date || '').localeCompare(String(first.date || '')))

  useEffect(() => {
    if (!receiptData || !autoExportReceipt || !receiptRef.current) return undefined
    let cancelled = false
    const generateReceipt = async () => {
      try {
        const generatePdf = (await import('../utils/pdfEngine')).default
        await generatePdf(receiptRef.current, `${receiptData.payment.reference}.pdf`, company)
      } catch (pdfError) {
        if (!cancelled) setError(pdfError instanceof Error ? pdfError.message : 'Impossible de générer le reçu PDF.')
      } finally {
        if (!cancelled) setAutoExportReceipt(false)
      }
    }
    void generateReceipt()
    return () => { cancelled = true }
  }, [receiptData, autoExportReceipt, company])

  const addPayment = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!selectedInvoice) {
      setError('Sélectionnez une facture.')
      return
    }
    let amountCents
    try {
      amountCents = toCents(form.amount)
    } catch (amountError) {
      setError(amountError.message)
      return
    }
    if (amountCents <= 0) {
      setError('Le montant doit être supérieur à zéro.')
      return
    }
    if (!form.paymentDate || !METHODS.includes(form.method)) {
      setError('Vérifiez la date et le mode de paiement.')
      return
    }
    if (form.method !== 'Espèces' && !form.transactionReference.trim()) {
      setError('Renseignez la référence du chèque, du virement ou de l’effet.')
      return
    }

    setSaving(true)
    try {
      const invoiceCollection = ['invoices', 'sales'].includes(selectedInvoice.sourceCollection)
        ? selectedInvoice.sourceCollection
        : 'sales'
      const invoiceRef = doc(db, invoiceCollection, activeInvoiceId)
      const paymentRef = doc(collection(db, 'payments'))
      const payment = await runTransaction(db, async (transaction) => {
        const invoiceSnapshot = await transaction.get(invoiceRef)
        if (!invoiceSnapshot.exists()) {
          throw new Error('Cette facture n’existe plus.')
        }
        const invoice = invoiceSnapshot.data()
        if (invoice.type !== 'invoice') {
          throw new Error('Le règlement ne peut être rattaché qu’à une facture.')
        }
        if (['brouillon', 'draft', 'annulé', 'annule', 'annulée', 'annulee', 'cancelled', 'canceled']
          .includes(String(invoice.status || '').trim().toLocaleLowerCase('fr'))) {
          throw new Error('Un brouillon ou une facture annulée ne peut pas recevoir de règlement.')
        }
        const totalCents = toCents(invoice.totalTTC)
        const paidCents = invoice.paidAmount !== null && invoice.paidAmount !== undefined
          ? toCents(invoice.paidAmount)
          : totalCents - toCents(invoice.remainingAmount ?? invoice.totalTTC)
        const remainingCents = totalCents - paidCents
        if (totalCents <= 0 || paidCents < 0 || paidCents > totalCents || remainingCents <= 0) {
          throw new Error('Cette facture ne présente aucun solde à recouvrer.')
        }
        if (amountCents > remainingCents) {
          throw new Error(`Le montant dépasse le solde restant (${formatCurrency(remainingCents / 100, company.defaultCurrency)}).`)
        }

        const paidAmountCents = paidCents + amountCents
        const remainingAfterCents = totalCents - paidAmountCents
        const amount = amountCents / 100
        const paidAmount = paidAmountCents / 100
        const remainingAfter = remainingAfterCents / 100
        const status = remainingAfterCents === 0 ? 'paid' : 'partial'
        const reference = `REC-${new Date().getFullYear()}-${paymentRef.id.slice(0, 6).toUpperCase()}`
        const paymentData = {
          reference,
          invoiceId: activeInvoiceId,
          invoiceCollection,
          invoiceNumber: invoice.number || '',
          clientId: invoice.clientId || '',
          clientName: invoice.clientName || '',
          amount,
          paymentDate: form.paymentDate,
          method: form.method,
          transactionReference: form.transactionReference.trim(),
          remainingAfter,
          createdAt: serverTimestamp(),
        }

        transaction.update(invoiceRef, {
          paidAmount,
          remainingAmount: remainingAfter,
          status,
          updatedAt: serverTimestamp(),
        })
        transaction.set(paymentRef, paymentData)
        return { ...paymentData, id: paymentRef.id }
      })

      const currentInvoice = selectedInvoice
      const currentClient = currentInvoice ? clientById.get(currentInvoice.clientId) : null
      setForm((current) => ({ ...current, amount: '', transactionReference: '' }))
      setReceiptData({
        invoice: selectedInvoice,
        client: currentClient || { name: selectedInvoice?.clientName },
        payment,
        previousPayments: invoicePayments,
      })
      setAutoExportReceipt(true)
      setNotice(`Paiement enregistré. Téléchargement du reçu ${payment.reference} en cours.`)
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Impossible d’enregistrer ce paiement.')
    } finally {
      setSaving(false)
    }
  }

  const exportReceipt = async (payment, invoice, client) => {
    setError('')
    setReceiptData({
      payment,
      invoice,
      client: client || { name: invoice.clientName },
      previousPayments: invoicePayments.filter((entry) => entry.id !== payment.id),
    })
    setAutoExportReceipt(true)
  }

  const addReminder = async (event) => {
    event.preventDefault()
    setReminderError('')
    if (!selectedInvoice) {
      setReminderError('Sélectionnez une facture avant d’enregistrer une relance.')
      return
    }
    if (!reminderForm.date || !REMINDER_METHODS.includes(reminderForm.method) || !reminderForm.result.trim()) {
      setReminderError('Renseignez la date, le moyen et le résultat de la relance.')
      return
    }

    setReminderSaving(true)
    try {
      const invoiceCollection = ['invoices', 'sales'].includes(selectedInvoice.sourceCollection)
        ? selectedInvoice.sourceCollection
        : 'sales'
      await addDoc(collection(db, 'recoveryReminders'), {
        invoiceId: selectedInvoice.id,
        invoiceCollection,
        invoiceNumber: selectedInvoice.number || '',
        clientId: selectedInvoice.clientId || '',
        clientName: selectedInvoice.clientName || '',
        date: reminderForm.date,
        method: reminderForm.method,
        result: reminderForm.result.trim(),
        createdAt: serverTimestamp(),
      })
      setReminderForm({ date: localDate(), method: REMINDER_METHODS[0], result: '' })
      setReminderOpen(false)
    } catch (saveError) {
      setReminderError(saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer cette relance.')
    } finally {
      setReminderSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Gestion financière</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Recouvrement</h1>
        <p className="mt-2 text-sm text-slate-500">Suivez les soldes de facture et enregistrez les règlements clients.</p>
      </div>

      {(documentsError || paymentsError || clientsError || remindersError || settingsError || error) && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          {error || documentsError || paymentsError || clientsError || remindersError || settingsError}
        </p>
      )}
      {notice && (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2"><CheckCircle2 size={17} />{notice}</span>
          {receiptData && (
            <button
              className="inline-flex items-center gap-2 self-start rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 sm:self-auto"
              onClick={() => void exportReceipt(receiptData.payment, receiptData.invoice, receiptData.client)}
              type="button"
            >
              <Printer size={15} /> Générer le reçu PDF
            </button>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
        <section className="overflow-hidden rounded-2xl border border-white bg-white/90 shadow-xl shadow-slate-900/[0.04] ring-1 ring-slate-200/70 backdrop-blur-xl">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:px-7">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Banknote aria-hidden="true" size={19} />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">Factures à recouvrer</h2>
                  <p className="mt-1 text-xs text-slate-500">{filteredInvoices.length} facture{filteredInvoices.length === 1 ? '' : 's'} avec un solde</p>
                </div>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(190px,1fr)_190px_170px]">
              <label className="relative block">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  onChange={(event) => {
                    setInvoiceQuery(event.target.value)
                    invoiceTable.setPage(1)
                  }}
                  placeholder="Rechercher par facture ou client…"
                  type="search"
                  value={invoiceQuery}
                />
              </label>
              <select aria-label="Filtrer par ancienneté" className={inputClass} onChange={(event) => { setAgingFilter(event.target.value); invoiceTable.setPage(1) }} value={agingFilter}>
                <option value="">Toutes anciennetés</option>
                <option value="current">À échoir / à date</option>
                <option value="0-30">0–30 jours</option>
                <option value="31-60">31–60 jours</option>
                <option value="61-90">61–90 jours</option>
                <option value="90+">+90 jours</option>
                <option value="no-date">Sans échéance</option>
              </select>
              <select aria-label="Filtrer par règlement" className={inputClass} onChange={(event) => { setPaymentStatusFilter(event.target.value); invoiceTable.setPage(1) }} value={paymentStatusFilter}>
                <option value="">Tous les impayés</option>
                <option value="unpaid">Non réglées</option>
                <option value="partial">Partiellement réglées</option>
              </select>
            </div>
          </div>
          <div className="border-b border-slate-100 px-5 py-3 sm:px-7">
            <DataTableExportToolbar columns={invoiceExportColumns} rows={invoiceTable.sortedItems} title="Balance des factures à recouvrer" />
          </div>
          {loading ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">Chargement des factures…</p>
          ) : filteredInvoices.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <CheckCircle2 className="mx-auto text-emerald-600" size={28} />
              <p className="mt-3 text-sm font-medium text-slate-700">
                {invoiceQuery || agingFilter || paymentStatusFilter ? 'Aucune facture ne correspond aux filtres.' : 'Toutes les factures sont réglées.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <SortableTableHeader className="px-5 py-3.5" columnKey="number" label="Facture" {...invoiceTable} />
                    <SortableTableHeader className="px-5 py-3.5" columnKey="__clientName" label="Client" {...invoiceTable} />
                    <SortableTableHeader className="px-5 py-3.5" columnKey="dueDate" label="Échéance" {...invoiceTable} />
                    <SortableTableHeader className="px-5 py-3.5" columnKey="__daysOverdue" label="Balance âgée" {...invoiceTable} />
                    <SortableTableHeader className="px-5 py-3.5" columnKey="__paid" label="Progression" {...invoiceTable} />
                    <SortableTableHeader className="px-5 py-3.5" columnKey="__remaining" label="Reste à payer" {...invoiceTable} />
                    <th className="px-5 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoiceTable.pageItems.map((invoice) => {
                    const selected = selectedInvoiceKey === `${invoice.sourceCollection}:${invoice.id}`
                    const total = Math.max(0, Number(invoice.totalTTC || 0))
                    const progress = total > 0 ? Math.min(100, (invoice.__paid / total) * 100) : 0
                    return (
                      <tr className={`transition hover:bg-blue-50/40 ${selected ? 'bg-blue-50/60' : ''}`} key={`${invoice.sourceCollection}:${invoice.id}`}>
                        <td className="px-5 py-4">
                          <button className="text-left" onClick={() => { setSelectedInvoiceKey(`${invoice.sourceCollection}:${invoice.id}`); setError('') }} type="button">
                            <span className="block text-sm font-semibold text-slate-900">{invoice.number || 'Sans numéro'}</span>
                            <span className="mt-1 block text-xs text-slate-500">{invoice.__paid > 0 ? 'Partiellement réglée' : 'Non réglée'}</span>
                          </button>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">{invoice.__clientName}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{formatDate(invoice.dueDate)}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${getAgingTone(invoice.__aging)}`}>
                            <Clock3 size={12} />
                            {getAgingLabel(invoice.__aging)}
                          </span>
                        </td>
                        <td className="min-w-40 px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div aria-label={`${Math.round(progress)} % réglés`} className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all" style={{ width: `${progress}%` }} />
                            </div>
                            <span className="whitespace-nowrap text-xs font-medium text-slate-600">{Math.round(progress)} %</span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">{formatCurrency(invoice.__paid, company.defaultCurrency)} / {formatCurrency(total, company.defaultCurrency)}</p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-sm font-bold text-rose-700">{formatCurrency(invoice.__remaining, company.defaultCurrency)}</td>
                        <td className="px-5 py-4 text-right">
                          <button aria-label={`Sélectionner la facture ${invoice.number || ''}`} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${selected ? 'bg-blue-700 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-blue-50'}`} onClick={() => { setSelectedInvoiceKey(`${invoice.sourceCollection}:${invoice.id}`); setError('') }} type="button">
                            {selected ? 'Sélectionnée' : 'Sélectionner'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!loading && filteredInvoices.length > 0 && <DataTablePagination {...invoiceTable} />}
        </section>

        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="font-semibold text-slate-900">Enregistrer un paiement</h2>
          <p className="mt-1 text-xs text-slate-500">Le solde de la facture et le paiement sont enregistrés atomiquement.</p>
          {selectedInvoice ? (
            <>
              <div className="mt-5 rounded-xl bg-blue-50 p-4">
                <p className="text-xs font-medium text-blue-800">{selectedInvoice.number} · {selectedInvoice.clientName || 'Client'}</p>
                <p className="mt-2 text-xl font-bold text-blue-950">{formatCurrency(balance, company.defaultCurrency)}</p>
                <p className="mt-1 text-xs text-blue-800">Reste à payer</p>
              </div>
              <form className="mt-5 space-y-4" onSubmit={addPayment}>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Montant reçu ({company.defaultCurrency || 'MAD'}) *</span>
                  <input className={inputClass} max={balance} min="0.01" onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} required step="0.01" type="number" value={form.amount} />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">Date *</span>
                    <input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value }))} required type="date" value={form.paymentDate} />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">Mode *</span>
                    <select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, method: event.target.value }))} value={form.method}>
                      {METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Référence de transaction {form.method !== 'Espèces' ? '*' : '(facultatif)'}
                  </span>
                  <input
                    className={inputClass}
                    onChange={(event) => setForm((current) => ({ ...current, transactionReference: event.target.value }))}
                    placeholder="N° de chèque, référence de virement…"
                    required={form.method !== 'Espèces'}
                    value={form.transactionReference}
                  />
                </label>
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-800 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-60" disabled={saving} type="submit">
                  <Banknote size={17} /> {saving ? 'Enregistrement…' : 'Enregistrer le paiement'}
                </button>
              </form>
            </>
          ) : (
            <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Choisissez une facture pour enregistrer son règlement.</p>
          )}

          {selectedInvoice && (
            <div className="mt-7 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Relances</h3>
                  <p className="mt-1 text-xs text-slate-500">{invoiceReminders.length} échange{invoiceReminders.length === 1 ? '' : 's'} enregistré{invoiceReminders.length === 1 ? '' : 's'}</p>
                </div>
                <button className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50" onClick={() => { setReminderOpen((open) => !open); setReminderError('') }} type="button">
                  {reminderOpen ? 'Fermer' : 'Enregistrer une relance'}
                </button>
              </div>
              {reminderOpen && (
                <form className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4" onSubmit={addReminder}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      <span className="mb-1.5 block text-xs font-semibold text-slate-700">Date *</span>
                      <input className={inputClass} onChange={(event) => setReminderForm((current) => ({ ...current, date: event.target.value }))} required type="date" value={reminderForm.date} />
                    </label>
                    <label>
                      <span className="mb-1.5 block text-xs font-semibold text-slate-700">Moyen *</span>
                      <select className={inputClass} onChange={(event) => setReminderForm((current) => ({ ...current, method: event.target.value }))} value={reminderForm.method}>
                        {REMINDER_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">Résultat de l’échange *</span>
                    <textarea className={`${inputClass} min-h-20 resize-y`} onChange={(event) => setReminderForm((current) => ({ ...current, result: event.target.value }))} required value={reminderForm.result} />
                  </label>
                  {reminderError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{reminderError}</p>}
                  <button className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60" disabled={reminderSaving} type="submit">
                    {reminderSaving ? 'Enregistrement…' : 'Enregistrer la relance'}
                  </button>
                </form>
              )}
              {invoiceReminders.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {invoiceReminders.map((reminder) => (
                    <li className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5" key={reminder.id}>
                      <p className="text-xs font-semibold text-slate-700">{formatDate(reminder.date)} · {reminder.method}</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{reminder.result}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {selectedInvoice && invoicePayments.length > 0 && (
            <div className="mt-7 border-t border-slate-100 pt-5">
              <h3 className="text-sm font-semibold text-slate-800">Historique des règlements</h3>
              <ul className="mt-3 divide-y divide-slate-100">
                {paymentTable.pageItems.map((payment) => (
                  <li className="flex items-center justify-between gap-3 py-3" key={payment.id}>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">{formatCurrency(payment.amount, company.defaultCurrency)} · {payment.method}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(payment.paymentDate)} · {payment.reference}</p>
                    </div>
                    <button aria-label={`Générer le reçu ${payment.reference}`} className="rounded-lg p-2 text-blue-700 hover:bg-blue-50" onClick={() => void exportReceipt(payment, selectedInvoice, clientById.get(selectedInvoice.clientId))} type="button">
                      <Printer size={16} />
                    </button>
                  </li>
                ))}
              </ul>
              {invoicePayments.length > 0 && <DataTablePagination {...paymentTable} />}
            </div>
          )}
        </section>
      </div>

      <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0">
        {receiptData && (
          <ReceiptPdf
            client={receiptData.client || {}}
            company={company}
            invoice={receiptData.invoice || {}}
            payment={receiptData.payment}
            previousPayments={receiptData.previousPayments || []}
            ref={receiptRef}
          />
        )}
      </div>
    </main>
  )
}
