import { useState } from 'react'
import { Banknote, CalendarDays, LoaderCircle, X } from 'lucide-react'
import { toCents } from '../../utils/money'

const PAYMENT_METHODS = ['Virement', 'Chèque', 'Espèces', 'Effet/Traite']
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100'

function todayAsInputValue() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
}

function formatCurrency(value, currency) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: ['MAD', 'EUR', 'USD'].includes(currency) ? currency : 'MAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export default function PaymentModal({
  clientName,
  currency = 'MAD',
  error = '',
  invoice,
  onClose,
  onSubmit,
  remaining,
  saving = false,
}) {
  const [form, setForm] = useState({
    paymentDate: todayAsInputValue(),
    amount: '',
    method: PAYMENT_METHODS[0],
    reference: '',
    remarks: '',
  })
  const [validationError, setValidationError] = useState('')

  const submitPayment = (event) => {
    event.preventDefault()
    setValidationError('')

    if (!isValidDate(form.paymentDate)) {
      setValidationError('Saisissez une date de paiement valide.')
      return
    }

    let amountCents
    let remainingCents
    try {
      if (form.amount.trim() === '') throw new TypeError('Saisissez un montant.')
      amountCents = toCents(form.amount)
      remainingCents = toCents(remaining)
    } catch (amountError) {
      setValidationError(amountError instanceof Error ? amountError.message : 'Le montant est invalide.')
      return
    }

    if (amountCents <= 0) {
      setValidationError('Le montant doit être supérieur à zéro.')
      return
    }
    if (amountCents > remainingCents) {
      setValidationError(`Le montant ne peut pas dépasser le reste à payer (${formatCurrency(remaining, currency)}).`)
      return
    }
    if (!PAYMENT_METHODS.includes(form.method)) {
      setValidationError('Sélectionnez un mode de paiement valide.')
      return
    }

    void onSubmit({
      ...form,
      amount: amountCents / 100,
    })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
      <section
        aria-describedby="payment-modal-description"
        aria-labelledby="payment-modal-title"
        aria-modal="true"
        className="my-auto w-full max-w-xl animate-slide-up overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl shadow-slate-950/30"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4 sm:px-7">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-900 text-white shadow-md shadow-blue-900/20">
              <Banknote aria-hidden="true" size={19} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900" id="payment-modal-title">
                Ajouter un paiement
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500" id="payment-modal-description">
                Le solde sera recalculé et vérifié dans une transaction Firestore.
              </p>
            </div>
          </div>
          <button
            aria-label="Fermer la fenêtre"
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        <form className="space-y-5 p-5 sm:p-7" noValidate onSubmit={submitPayment}>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Facture</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{invoice.number || 'Sans numéro'}</p>
              <p className="mt-1 text-xs text-slate-600">{clientName || 'Client'}</p>
            </div>
            <div className="rounded-xl bg-blue-900 p-4 text-white shadow-lg shadow-blue-900/15 sm:min-w-48">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-100">Reste à payer</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{formatCurrency(remaining, currency)}</p>
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Date du paiement *</span>
            <span className="relative block">
              <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                className={`${inputClass} pl-10`}
                disabled={saving}
                onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value }))}
                required
                type="date"
                value={form.paymentDate}
              />
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Montant ({currency}) *</span>
              <input
                className={inputClass}
                disabled={saving}
                inputMode="decimal"
                max={remaining.toFixed(2)}
                min="0.01"
                onChange={(event) => {
                  setValidationError('')
                  setForm((current) => ({ ...current, amount: event.target.value }))
                }}
                required
                step="0.01"
                type="number"
                value={form.amount}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Mode de paiement *</span>
              <select
                className={inputClass}
                disabled={saving}
                onChange={(event) => setForm((current) => ({ ...current, method: event.target.value }))}
                required
                value={form.method}
              >
                {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Référence</span>
            <input
              className={inputClass}
              disabled={saving}
              maxLength={120}
              onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))}
              placeholder="N° de chèque, de virement ou de traite"
              value={form.reference}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Remarques</span>
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              disabled={saving}
              maxLength={1000}
              onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))}
              placeholder="Informations complémentaires sur ce règlement…"
              value={form.remarks}
            />
          </label>

          {(validationError || error) && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {validationError || error}
            </p>
          )}

          <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <button
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              disabled={saving}
              onClick={onClose}
              type="button"
            >
              Annuler
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-900/15 transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving
                ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                : <Banknote aria-hidden="true" size={16} />}
              {saving ? 'Enregistrement…' : 'Enregistrer le paiement'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
