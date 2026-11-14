import { useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  FileText,
  LoaderCircle,
  MapPin,
  Plus,
  ReceiptText,
  Trash2,
  X,
} from 'lucide-react'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-steel-500 focus:ring-4 focus:ring-steel-100 disabled:cursor-not-allowed disabled:bg-slate-100'

function getClientName(client) {
  return client?.name || client?.companyName || client?.clientName || 'Client'
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

function Field({ as = 'label', children, className = '', label, required = false }) {
  const Wrapper = as
  return (
    <Wrapper className={className}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">
        {label}{required && <span className="text-red-600"> *</span>}
      </span>
      {children}
    </Wrapper>
  )
}

export default function SalesDocumentForm({
  calculatedTotals,
  clients,
  clientsLoading,
  company,
  documentOptions,
  editingDocument,
  error,
  form,
  linePreviews,
  numberPreview,
  numberPreviewError,
  numberPreviewLoading,
  onAddLine,
  onCancel,
  onClientChange,
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
  const selectedClient = clients.find((client) => client.id === form.clientId)
  const [clientQuery, setClientQuery] = useState(() =>
    selectedClient ? getClientName(selectedClient) : '',
  )
  const [clientMenuOpen, setClientMenuOpen] = useState(false)
  const matches = clients
    .filter((client) => getClientName(client).toLowerCase().includes(clientQuery.trim().toLowerCase()))
    .slice(0, 8)
  const vatRates = [...new Set([0, 14, 20, Number(company.defaultVatRate)])]
    .filter((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 100)
    .sort((first, second) => second - first)
  const isStockSensitive = ['deliveryNote', 'invoice'].includes(form.type)
  const isQuote = form.type === 'quote'

  const selectClient = (client) => {
    onClientChange(client.id)
    setClientQuery(getClientName(client))
    setClientMenuOpen(false)
  }

  const updateClientQuery = (value) => {
    setClientQuery(value)
    setClientMenuOpen(true)
    if (selectedClient && value !== getClientName(selectedClient)) onClientChange('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-2 backdrop-blur-sm sm:p-5">
      <section
        aria-describedby="sales-form-description"
        aria-labelledby="sales-form-title"
        aria-modal="true"
        className="my-auto flex max-h-[calc(100vh-1rem)] w-full max-w-6xl animate-slide-up flex-col overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl shadow-slate-950/30 sm:max-h-[calc(100vh-2.5rem)]"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-4 sm:px-7">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-steel-800 text-white shadow-md shadow-steel-900/20">
              <ReceiptText aria-hidden="true" size={19} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900" id="sales-form-title">
                {editingDocument ? 'Modifier le document' : 'Nouveau document commercial'}
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500" id="sales-form-description">
                Choisissez un client et vérifiez les lignes et les montants avant l’enregistrement.
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

        <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={onSubmit}>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <FileText aria-hidden="true" className="text-steel-800" size={17} />
                <h3 className="text-sm font-semibold text-slate-900">En-tête du document</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Type de document" required>
                  <select
                    className={inputClass}
                    onChange={(event) => onSetField('type', event.target.value)}
                    required
                    value={form.type}
                  >
                    {documentOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="N° de document">
                  <input
                    aria-describedby={numberPreviewError ? 'sales-number-error' : undefined}
                    className={`${inputClass} bg-slate-50 font-semibold text-steel-900`}
                    readOnly
                    value={numberPreviewLoading ? 'Attribution…' : numberPreview || 'Attribué à l’enregistrement'}
                  />
                  {numberPreviewError && (
                    <span className="mt-1.5 block text-xs text-red-700" id="sales-number-error" role="alert">
                      Aperçu indisponible : {numberPreviewError}
                    </span>
                  )}
                  {!numberPreviewError && (
                    <span className="mt-1.5 block text-xs text-slate-500">
                      Numéro attribué atomiquement à la sauvegarde.
                    </span>
                  )}
                </Field>
                <Field label="Date d’émission" required>
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
                <Field label={isQuote ? 'Date de validité' : 'Date d’échéance'} required>
                  <div className="relative">
                    <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      className={`${inputClass} pl-10`}
                      min={form.issueDate || undefined}
                      onChange={(event) => onSetField('dueDate', event.target.value)}
                      required
                      type="date"
                      value={form.dueDate}
                    />
                  </div>
                </Field>

                <Field as="div" className="relative md:col-span-2 xl:col-span-4" label="Client" required>
                  <div className="relative">
                    <input
                      aria-autocomplete="list"
                      aria-controls="sales-client-options"
                      aria-expanded={clientMenuOpen}
                      aria-label="Rechercher un client"
                      autoComplete="off"
                      className={`${inputClass} pr-10`}
                      disabled={clientsLoading}
                      onBlur={() => window.setTimeout(() => setClientMenuOpen(false), 120)}
                      onChange={(event) => updateClientQuery(event.target.value)}
                      onFocus={() => setClientMenuOpen(true)}
                      placeholder={clientsLoading ? 'Chargement des clients…' : 'Rechercher par nom ou raison sociale'}
                      role="combobox"
                      value={clientQuery}
                    />
                    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                    {clientMenuOpen && matches.length > 0 && (
                      <ul
                        className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                        id="sales-client-options"
                        role="listbox"
                      >
                        {matches.map((client) => (
                          <li key={client.id} role="presentation">
                            <button
                              aria-selected={client.id === form.clientId}
                              className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-steel-50 focus:bg-steel-50 focus:outline-none"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectClient(client)}
                              role="option"
                              type="button"
                            >
                              <span className="block text-sm font-medium text-slate-800">{getClientName(client)}</span>
                              <span className="mt-0.5 block text-xs text-slate-500">{client.ice ? `ICE ${client.ice}` : 'ICE non renseigné'}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {clientMenuOpen && clientQuery && matches.length === 0 && (
                      <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-500 shadow-lg">
                        Aucun client ne correspond à cette recherche.
                      </div>
                    )}
                  </div>
                  {selectedClient ? (
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-steel-100 bg-steel-50/70 px-4 py-3 text-xs text-steel-950">
                      <span><strong>ICE :</strong> {selectedClient.ice || 'Non renseigné'}</span>
                      <span className="inline-flex items-start gap-1">
                        <MapPin aria-hidden="true" className="mt-0.5 shrink-0" size={13} />
                        {[
                          selectedClient.address,
                          selectedClient.city,
                          selectedClient.postalCode,
                        ].filter(Boolean).join(', ') || 'Adresse non renseignée'}
                      </span>
                    </div>
                  ) : (
                    <span className="mt-1.5 block text-xs text-slate-500">
                      Sélectionnez un client dans les résultats pour associer le document.
                    </span>
                  )}
                </Field>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Articles et prestations</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Les références et prix initiaux proviennent du stock ; désignation et prix restent modifiables.
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
              </div>

              {isStockSensitive && (
                <div className={`flex items-start gap-2 border-b px-4 py-3 text-xs leading-5 ${form.type === 'deliveryNote' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-100 bg-blue-50 text-blue-900'}`}>
                  <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={15} />
                  <p>
                    {form.type === 'deliveryNote'
                      ? 'Le stock sera contrôlé et décrémenté uniquement lors de la validation de la livraison. Toute quantité supérieure au disponible sera signalée et bloquera la validation.'
                      : 'Un dépassement du stock disponible est signalé pour vérification ; la facture ne décrémente pas le stock.'}
                  </p>
                </div>
              )}

              {stockLoading && (
                <p className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
                  Chargement du stock…
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left">
                  <thead className="bg-white text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Article</th>
                      <th className="px-3 py-3">Désignation</th>
                      <th className="w-28 px-3 py-3">Quantité</th>
                      <th className="w-36 px-3 py-3">PU HT</th>
                      <th className="w-28 px-3 py-3">TVA</th>
                      <th className="w-36 px-3 py-3 text-right">Total HT ligne</th>
                      <th className="w-12 px-2 py-3"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {form.items.map((line, index) => {
                      const preview = linePreviews[index] || {}
                      const stockWarning = isStockSensitive && preview.stockWarning
                      return (
                        <tr className="align-top" key={`sales-line-${index}`}>
                          <td className="min-w-56 px-3 py-3">
                            <select
                              aria-label={`Article de la ligne ${index + 1}`}
                              className={inputClass}
                              disabled={stockLoading}
                              onChange={(event) => onSelectStock(index, event.target.value)}
                              required
                              value={line.stockId}
                            >
                              <option value="">Sélectionner un article</option>
                              {stock.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.reference || item.tgiReference || 'Sans référence'} · {item.name || item.designation || 'Article'}
                                </option>
                              ))}
                            </select>
                            {preview.stockItem && (
                              <span className="mt-1.5 block text-[11px] text-slate-500">
                                Réf. {preview.stockItem.reference || preview.stockItem.tgiReference || '—'} · Stock {preview.availableQuantity ?? 'invalide'}
                              </span>
                            )}
                          </td>
                          <td className="min-w-52 px-3 py-3">
                            <input
                              aria-label={`Désignation de la ligne ${index + 1}`}
                              className={inputClass}
                              maxLength={180}
                              onChange={(event) => onUpdateLine(index, { designation: event.target.value })}
                              placeholder="Désignation"
                              required
                              value={line.designation}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              aria-label={`Quantité de la ligne ${index + 1}`}
                              className={inputClass}
                              inputMode="numeric"
                              min="1"
                              onChange={(event) => onUpdateLine(index, { quantity: event.target.value })}
                              required
                              step="1"
                              type="number"
                              value={line.quantity}
                            />
                            {stockWarning && (
                              <span className="mt-1.5 flex max-w-40 items-start gap-1 text-[11px] font-semibold leading-4 text-red-700" role="alert">
                                <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={12} />
                                {preview.stockError || `${preview.requestedQuantity} demandé(s) au total, ${preview.availableQuantity} disponible(s).`}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="relative">
                              <input
                                aria-label={`Prix unitaire HT de la ligne ${index + 1}`}
                                className={`${inputClass} pr-12`}
                                inputMode="decimal"
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
                              aria-label={`Taux de TVA de la ligne ${index + 1}`}
                              className={inputClass}
                              onChange={(event) => onUpdateLine(index, { taxRate: event.target.value })}
                              required
                              value={String(line.taxRate)}
                            >
                              {vatRates.map((rate) => (
                                <option key={rate} value={rate}>{rate} %</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-4 text-right">
                            <strong className="text-sm tabular-nums text-slate-900">
                              {preview.amounts
                                ? formatCurrency(preview.amounts.totalHT, company.defaultCurrency)
                                : '—'}
                            </strong>
                            {preview.error && (
                              <span className="mt-1 block max-w-36 text-[11px] leading-4 text-red-700" role="alert">
                                {preview.error}
                              </span>
                            )}
                            {preview.amounts && (
                              <span className="mt-1 block text-[10px] text-slate-500">
                                TVA {formatCurrency(preview.amounts.taxAmount, company.defaultCurrency)}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-3">
                            <button
                              aria-label={`Supprimer la ligne ${index + 1}`}
                              className="mt-1 rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                              disabled={form.items.length === 1}
                              onClick={() => onRemoveLine(index)}
                              type="button"
                            >
                              <Trash2 aria-hidden="true" size={16} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <Field label="Conditions et notes">
                  <textarea
                    className={`${inputClass} min-h-24 resize-y`}
                    maxLength={4000}
                    onChange={(event) => onSetField('notes', event.target.value)}
                    placeholder="Précisions utiles au client ou à l’équipe."
                    rows={4}
                    value={form.notes}
                  />
                </Field>
                {isQuote && (
                  <Field label="Conditions générales de vente">
                    <textarea
                      className={`${inputClass} min-h-28 resize-y`}
                      maxLength={8000}
                      onChange={(event) => onSetField('generalConditions', event.target.value)}
                      rows={5}
                      value={form.generalConditions}
                    />
                  </Field>
                )}
              </div>

              <section aria-label="Totaux du document" className="h-fit rounded-2xl border border-steel-100 bg-gradient-to-br from-steel-50 to-white p-4 shadow-inner shadow-steel-900/[0.03] sm:p-5">
                <div className="mb-4 flex items-center gap-2">
                  <ReceiptText aria-hidden="true" className="text-steel-800" size={17} />
                  <h3 className="text-sm font-semibold text-slate-900">Récapitulatif financier</h3>
                </div>
                {calculatedTotals.error && (
                  <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                    {calculatedTotals.error}
                  </p>
                )}
                <div className="space-y-2.5">
                  <p className="flex justify-between gap-4 text-sm text-slate-600">
                    <span>Total HT</span>
                    <strong className="tabular-nums text-slate-900">{formatCurrency(totals.totalHT, company.defaultCurrency)}</strong>
                  </p>
                  {totals.taxBreakdown.map((row) => (
                    <p className="flex justify-between gap-4 text-xs text-slate-500" key={row.taxRate}>
                      <span>TVA {row.taxRate} % · base {formatCurrency(row.totalHT, company.defaultCurrency)}</span>
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
            </section>

            {error && (
              <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
                {error}
              </p>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-4 py-3.5 sm:px-7">
            <p className="text-xs text-slate-500">
              {stock.length} article{stock.length === 1 ? '' : 's'} disponible{stock.length === 1 ? '' : 's'} dans l’inventaire
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
                disabled={saving || clientsLoading || stockLoading || clients.length === 0 || stock.length === 0}
                type="submit"
              >
                {saving
                  ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                  : editingDocument ? <Check aria-hidden="true" size={16} /> : <Plus aria-hidden="true" size={16} />}
                {saving ? 'Enregistrement…' : editingDocument ? 'Enregistrer les modifications' : 'Enregistrer le document'}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}
