import { useMemo, useState } from 'react'
import {
  CalendarDays,
  FileText,
  LoaderCircle,
  Package,
  Plus,
  Truck,
  X,
} from 'lucide-react'

const TABS = [
  { id: 'general', label: 'Informations générales', icon: FileText },
  { id: 'items', label: 'Lignes de commande', icon: Package },
  { id: 'terms', label: 'Conditions & notes', icon: Truck },
]
const EDITABLE_STATUSES = ['Brouillon', 'Envoyé']
const BASE_VAT_OPTIONS = [20, 14, 0]
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-steel-500 focus:ring-4 focus:ring-steel-100 disabled:cursor-not-allowed disabled:bg-slate-100'

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

function Field({ children, label, wide = false }) {
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  )
}

export default function PurchaseOrderForm({
  company,
  editingOrder,
  error,
  form,
  linePreviews,
  numberPreview,
  numberPreviewError,
  numberPreviewLoading,
  onAddLine,
  onCancel,
  onRemoveLine,
  onSelectStock,
  onSetField,
  onSubmit,
  onUpdateLine,
  saving,
  stock,
  stockLoading,
  totals,
}) {
  const [activeTab, setActiveTab] = useState('general')
  const vatRates = useMemo(
    () => [...new Set([...BASE_VAT_OPTIONS, Number(company.defaultVatRate)])]
      .filter((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 100)
      .sort((first, second) => second - first),
    [company.defaultVatRate],
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-2 backdrop-blur-sm sm:p-5">
      <section
        aria-describedby="purchase-order-description"
        aria-labelledby="purchase-order-title"
        aria-modal="true"
        className="my-auto flex max-h-[calc(100vh-1rem)] w-full max-w-6xl animate-slide-up flex-col overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl shadow-slate-950/30 sm:max-h-[calc(100vh-2.5rem)]"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-4 sm:px-7">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-steel-800 text-white shadow-md shadow-steel-900/20">
              <Package aria-hidden="true" size={19} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900" id="purchase-order-title">
                {editingOrder ? `Modifier ${editingOrder.number || 'le bon de commande'}` : 'Nouveau bon de commande'}
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500" id="purchase-order-description">
                Préparez une commande fournisseur à partir des articles du stock.
              </p>
            </div>
          </div>
          <button
            aria-label="Fermer le formulaire"
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
            disabled={saving}
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        <div
          aria-label="Sections du bon de commande"
          className="grid shrink-0 grid-cols-3 gap-1 border-b border-slate-100 px-3 py-2 sm:px-6"
          role="tablist"
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              aria-controls={`purchase-panel-${id}`}
              aria-selected={activeTab === id}
              className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left text-xs font-semibold transition sm:px-3 ${
                activeTab === id
                  ? 'border-steel-100 bg-steel-50 text-steel-800 shadow-sm'
                  : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
              id={`purchase-tab-${id}`}
              key={id}
              onClick={() => setActiveTab(id)}
              role="tab"
              type="button"
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${activeTab === id ? 'bg-white text-steel-700 shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                <Icon aria-hidden="true" size={15} />
              </span>
              <span className="hidden truncate sm:block">{label}</span>
              <span className="truncate sm:hidden">{id === 'general' ? 'Général' : id === 'items' ? 'Articles' : 'Conditions'}</span>
            </button>
          ))}
        </div>

        <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={onSubmit}>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
            <section
              aria-labelledby={`purchase-tab-${activeTab}`}
              id={`purchase-panel-${activeTab}`}
              role="tabpanel"
              tabIndex={0}
            >
              {activeTab === 'general' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nom du fournisseur *">
                    <input
                      autoComplete="organization"
                      className={inputClass}
                      maxLength={160}
                      onChange={(event) => onSetField('supplierName', event.target.value)}
                      placeholder="Raison sociale du fournisseur"
                      required
                      value={form.supplierName}
                    />
                  </Field>
                  <Field label="Téléphone du fournisseur">
                    <input
                      autoComplete="tel"
                      className={inputClass}
                      maxLength={40}
                      onChange={(event) => onSetField('supplierPhone', event.target.value)}
                      placeholder="+212 …"
                      value={form.supplierPhone}
                    />
                  </Field>
                  <Field label="N° de bon de commande">
                    <div className={`${inputClass} flex min-h-[42px] items-center justify-between gap-3 bg-slate-50`}>
                      <span className="font-semibold tabular-nums text-slate-800">
                        {numberPreviewLoading
                          ? 'Attribution du numéro…'
                          : numberPreview || 'Attribué à l’enregistrement'}
                      </span>
                      {numberPreviewLoading && <LoaderCircle aria-hidden="true" className="animate-spin text-slate-400" size={15} />}
                    </div>
                    {numberPreviewError && (
                      <span className="mt-1.5 block text-xs text-red-700" role="alert">{numberPreviewError}</span>
                    )}
                    <span className="mt-1.5 block text-xs text-slate-500">Le numéro définitif est attribué de façon atomique à l’enregistrement.</span>
                  </Field>
                  <Field label="Date de commande *">
                    <div className="relative">
                      <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        className={`${inputClass} pl-10`}
                        onChange={(event) => onSetField('issueDate', event.target.value)}
                        required
                        type="date"
                        value={form.issueDate}
                      />
                    </div>
                  </Field>
                  <Field label="E-mail du fournisseur">
                    <input
                      autoComplete="email"
                      className={inputClass}
                      maxLength={160}
                      onChange={(event) => onSetField('supplierEmail', event.target.value)}
                      placeholder="achats@fournisseur.ma"
                      type="email"
                      value={form.supplierEmail}
                    />
                  </Field>
                  <Field label="ICE fournisseur">
                    <input
                      className={inputClass}
                      maxLength={40}
                      onChange={(event) => onSetField('supplierIce', event.target.value)}
                      placeholder="Identifiant fiscal"
                      value={form.supplierIce}
                    />
                  </Field>
                  <Field label="Adresse fournisseur" wide>
                    <input
                      autoComplete="street-address"
                      className={inputClass}
                      maxLength={240}
                      onChange={(event) => onSetField('supplierAddress', event.target.value)}
                      placeholder="Adresse du fournisseur"
                      value={form.supplierAddress}
                    />
                  </Field>
                  <Field label="Livraison souhaitée *">
                    <div className="relative">
                      <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        className={`${inputClass} pl-10`}
                        min={form.issueDate || undefined}
                        onChange={(event) => onSetField('expectedDeliveryDate', event.target.value)}
                        required
                        type="date"
                        value={form.expectedDeliveryDate}
                      />
                    </div>
                  </Field>
                  <Field label="Statut du bon *" wide>
                    <select
                      className={inputClass}
                      disabled={Boolean(editingOrder && editingOrder.status !== 'Brouillon')}
                      onChange={(event) => onSetField('status', event.target.value)}
                      value={form.status}
                    >
                      {EDITABLE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                    {editingOrder && editingOrder.status !== 'Brouillon' && (
                      <span className="mt-1.5 block text-xs text-amber-700">
                        Un bon envoyé ne peut plus être modifié ; utilisez la réception ou annulez-le.
                      </span>
                    )}
                  </Field>
                </div>
              )}

              {activeTab === 'items' && (
                <div className="space-y-5">
                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <header className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Articles à commander</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Chaque ligne est liée à une fiche existante du stock.
                        </p>
                      </div>
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-steel-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-steel-800 shadow-sm transition hover:bg-steel-50"
                        onClick={onAddLine}
                        type="button"
                      >
                        <Plus aria-hidden="true" size={15} />
                        Ajouter une ligne
                      </button>
                    </header>
                    {stockLoading && (
                      <p className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">Chargement du stock…</p>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[980px] text-left">
                        <thead className="bg-white text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="min-w-60 px-3 py-3">Article stock *</th>
                            <th className="min-w-44 px-3 py-3">Désignation</th>
                            <th className="w-28 px-3 py-3">Qté commandée</th>
                            <th className="w-40 px-3 py-3">PU achat HT</th>
                            <th className="w-24 px-3 py-3">TVA</th>
                            <th className="w-36 px-3 py-3 text-right">Total HT</th>
                            <th className="w-12 px-2 py-3"><span className="sr-only">Action</span></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {form.items.map((line, index) => {
                            const preview = linePreviews[index] || {}
                            return (
                              <tr className="align-top" key={line.id || `purchase-line-${index}`}>
                                <td className="px-3 py-3">
                                  <select
                                    aria-label={`Article de stock ligne ${index + 1}`}
                                    className={inputClass}
                                    disabled={stockLoading || Boolean(editingOrder && editingOrder.status !== 'Brouillon')}
                                    onChange={(event) => onSelectStock(index, event.target.value)}
                                    required
                                    value={line.stockId}
                                  >
                                    <option value="">Sélectionner un article</option>
                                    {stock.map((item) => (
                                      <option key={item.id} value={item.id}>
                                        {[item.reference || item.tgiReference, item.name || item.designation]
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </option>
                                    ))}
                                  </select>
                                  {preview.stockItem && (
                                    <span className="mt-1 block text-[11px] text-slate-500">
                                      Stock actuel : {preview.availableQuantity ?? '—'}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  <input
                                    aria-label={`Désignation ligne ${index + 1}`}
                                    className={inputClass}
                                    disabled={Boolean(editingOrder && editingOrder.status !== 'Brouillon')}
                                    maxLength={180}
                                    onChange={(event) => onUpdateLine(index, { designation: event.target.value })}
                                    placeholder="Description de la pièce"
                                    required
                                    value={line.designation}
                                  />
                                  {preview.error && (
                                    <span className="mt-1 block text-[11px] leading-4 text-red-700" role="alert">
                                      {preview.error}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  <input
                                    aria-label={`Quantité commandée ligne ${index + 1}`}
                                    className={inputClass}
                                    disabled={Boolean(editingOrder && editingOrder.status !== 'Brouillon')}
                                    min="1"
                                    onChange={(event) => onUpdateLine(index, { quantity: event.target.value })}
                                    required
                                    step="1"
                                    type="number"
                                    value={line.quantity}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <div className="relative">
                                    <input
                                      aria-label={`Prix d'achat unitaire HT ligne ${index + 1}`}
                                      className={`${inputClass} pr-12`}
                                      disabled={Boolean(editingOrder && editingOrder.status !== 'Brouillon')}
                                      min="0"
                                      onChange={(event) => onUpdateLine(index, { unitPrice: event.target.value })}
                                      required
                                      step="0.01"
                                      type="number"
                                      value={line.unitPrice}
                                    />
                                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                                      {company.defaultCurrency || 'MAD'}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <select
                                    aria-label={`TVA ligne ${index + 1}`}
                                    className={inputClass}
                                    disabled={Boolean(editingOrder && editingOrder.status !== 'Brouillon')}
                                    onChange={(event) => onUpdateLine(index, { taxRate: event.target.value })}
                                    value={String(line.taxRate)}
                                  >
                                    {vatRates.map((rate) => <option key={rate} value={rate}>{rate} %</option>)}
                                  </select>
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">
                                  {preview.amounts
                                    ? formatCurrency(preview.amounts.totalHT, company.defaultCurrency)
                                    : '—'}
                                </td>
                                <td className="px-2 py-3">
                                  <button
                                    aria-label={`Supprimer la ligne ${index + 1}`}
                                    className="mt-1 rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={form.items.length === 1 || Boolean(editingOrder && editingOrder.status !== 'Brouillon')}
                                    onClick={() => onRemoveLine(index)}
                                    type="button"
                                  >
                                    <X aria-hidden="true" size={16} />
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section aria-label="Totaux du bon de commande" className="ml-auto w-full max-w-md rounded-2xl border border-steel-100 bg-gradient-to-br from-steel-50 to-white p-4 shadow-inner shadow-steel-900/[0.03] sm:p-5">
                    <h3 className="mb-4 text-sm font-semibold text-slate-900">Récapitulatif financier</h3>
                    {totals.error && (
                      <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{totals.error}</p>
                    )}
                    <div className="space-y-2.5">
                      <p className="flex justify-between gap-4 text-sm text-slate-600">
                        <span>Total HT</span>
                        <strong className="tabular-nums text-slate-900">{formatCurrency(totals.totalHT, company.defaultCurrency)}</strong>
                      </p>
                      {totals.taxBreakdown.map((row) => (
                        <p className="flex justify-between gap-4 text-xs text-slate-500" key={row.taxRate}>
                          <span>TVA {row.taxRate} %</span>
                          <strong className="tabular-nums text-slate-700">{formatCurrency(row.totalTax, company.defaultCurrency)}</strong>
                        </p>
                      ))}
                      <p className="flex justify-between gap-4 border-t border-slate-200 pt-2.5 text-sm text-slate-600">
                        <span>Total TVA</span>
                        <strong className="tabular-nums text-slate-900">{formatCurrency(totals.totalTax, company.defaultCurrency)}</strong>
                      </p>
                      <p className="flex justify-between gap-4 rounded-xl bg-steel-800 px-3.5 py-3 text-base font-bold text-white shadow-md shadow-steel-900/15">
                        <span>Total TTC</span>
                        <strong className="tabular-nums">{formatCurrency(totals.totalTTC, company.defaultCurrency)}</strong>
                      </p>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'terms' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Conditions de paiement">
                    <input
                      className={inputClass}
                      disabled={Boolean(editingOrder && editingOrder.status !== 'Brouillon')}
                      maxLength={240}
                      onChange={(event) => onSetField('paymentTerms', event.target.value)}
                      placeholder="Ex. 30 jours fin de mois"
                      value={form.paymentTerms}
                    />
                  </Field>
                  <Field label="Mode de livraison">
                    <input
                      className={inputClass}
                      disabled={Boolean(editingOrder && editingOrder.status !== 'Brouillon')}
                      maxLength={160}
                      onChange={(event) => onSetField('deliveryMethod', event.target.value)}
                      placeholder="Ex. Livraison au dépôt TGI"
                      value={form.deliveryMethod}
                    />
                  </Field>
                  <Field label="Notes" wide>
                    <textarea
                      className={`${inputClass} min-h-40 resize-y`}
                      disabled={Boolean(editingOrder && editingOrder.status !== 'Brouillon')}
                      maxLength={6000}
                      onChange={(event) => onSetField('notes', event.target.value)}
                      placeholder="Références fournisseur, consignes ou précisions de commande."
                      rows={6}
                      value={form.notes}
                    />
                  </Field>
                </div>
              )}
            </section>

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-4 py-3.5 sm:px-7">
            <p className="text-xs text-slate-500">
              {stock.length} article{stock.length === 1 ? '' : 's'} dans l’inventaire
            </p>
            <div className="flex gap-2">
              <button
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                disabled={saving}
                onClick={onCancel}
                type="button"
              >
                Annuler
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-steel-800 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-steel-900/15 transition hover:-translate-y-0.5 hover:bg-steel-900 disabled:cursor-wait disabled:opacity-60"
                disabled={saving || stockLoading || stock.length === 0 || Boolean(editingOrder && editingOrder.status !== 'Brouillon')}
                type="submit"
              >
                {saving
                  ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                  : <Plus aria-hidden="true" size={16} />}
                {saving ? 'Enregistrement…' : editingOrder ? 'Enregistrer les modifications' : 'Enregistrer le bon'}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}
