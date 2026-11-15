import { useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  FileText,
  LoaderCircle,
  MapPin,
  Plus,
  ReceiptText,
  Trash2,
  Truck,
  Users,
  Wrench,
  X,
} from 'lucide-react'

const TABS = [
  { id: 'general', label: 'Informations générales', icon: FileText },
  { id: 'lines', label: 'Lignes de chiffrage', icon: ReceiptText },
  { id: 'terms', label: 'Conditions & notes', icon: Wrench },
]
const STATUSES = ['Brouillon', 'Envoyé', 'Accepté', 'Refusé']
const LINE_TYPES = [
  { value: 'piece', label: 'Pièce de rechange' },
  { value: 'labor', label: 'Main d’œuvre' },
  { value: 'travel', label: 'Déplacement' },
]
const VAT_OPTIONS = [20, 14, 0]
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

function Field({ children, label, wide = false }) {
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  )
}

export default function QuoteForm({
  clients,
  clientsLoading,
  company,
  editingQuote,
  error,
  form,
  linePreviews,
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
  const [activeTab, setActiveTab] = useState('general')
  const [clientQuery, setClientQuery] = useState(() => {
    const selected = clients.find((client) => client.id === form.clientId)
    return selected ? getClientName(selected) : ''
  })
  const [clientMenuOpen, setClientMenuOpen] = useState(false)
  const selectedClient = clients.find((client) => client.id === form.clientId)
  const clientElevators = Array.isArray(selectedClient?.elevators) ? selectedClient.elevators : []
  const selectedElevator = clientElevators.find((elevator, index) =>
    (elevator.id || `elevator-${index}`) === form.elevatorId,
  )
  const matches = clients
    .filter((client) =>
      getClientName(client).toLocaleLowerCase('fr').includes(clientQuery.trim().toLocaleLowerCase('fr')),
    )
    .slice(0, 8)
  const vatRates = useMemo(
    () => [...new Set([...VAT_OPTIONS, Number(company.defaultVatRate)])]
      .filter((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 100)
      .sort((first, second) => second - first),
    [company.defaultVatRate],
  )
  const validityDays = form.issueDate && form.validUntil
    ? Math.max(
        0,
        Math.round(
          (new Date(`${form.validUntil}T00:00:00`).getTime() -
            new Date(`${form.issueDate}T00:00:00`).getTime()) /
            86400000,
        ),
      )
    : 0

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

  const changeLineType = (index, type) => {
    onUpdateLine(index, {
      type,
      stockId: '',
      reference: '',
      designation: '',
      unitPrice: '',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-2 backdrop-blur-sm sm:p-5">
      <section
        aria-describedby="quote-form-description"
        aria-labelledby="quote-form-title"
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
              <h2 className="text-lg font-semibold text-slate-900" id="quote-form-title">
                {editingQuote ? 'Modifier le devis' : 'Nouveau devis'}
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500" id="quote-form-description">
                Chiffrez les pièces, la main-d’œuvre et les déplacements liés à l’équipement.
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
          aria-label="Sections du devis"
          className="grid shrink-0 grid-cols-3 gap-1 border-b border-slate-100 px-3 py-2 sm:px-6"
          role="tablist"
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              aria-controls={`quote-panel-${id}`}
              aria-selected={activeTab === id}
              className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left text-xs font-semibold transition sm:px-3 ${
                activeTab === id
                  ? 'border-steel-100 bg-steel-50 text-steel-800 shadow-sm'
                  : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
              id={`quote-tab-${id}`}
              key={id}
              onClick={() => setActiveTab(id)}
              role="tab"
              type="button"
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${activeTab === id ? 'bg-white text-steel-700 shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                <Icon aria-hidden="true" size={15} />
              </span>
              <span className="hidden truncate sm:block">{label}</span>
              <span className="truncate sm:hidden">{id === 'general' ? 'Général' : id === 'lines' ? 'Chiffrage' : 'Conditions'}</span>
            </button>
          ))}
        </div>

        <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={onSubmit}>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
            <section
              aria-labelledby={`quote-tab-${activeTab}`}
              id={`quote-panel-${activeTab}`}
              role="tabpanel"
              tabIndex={0}
            >
              {activeTab === 'general' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Client *" wide>
                    <div className="relative">
                      <input
                        aria-autocomplete="list"
                        aria-controls="quote-client-options"
                        aria-expanded={clientMenuOpen}
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
                          id="quote-client-options"
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
                                <span className="mt-0.5 block text-xs text-slate-500">
                                  {client.ice ? `ICE ${client.ice}` : 'ICE non renseigné'}
                                </span>
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
                  </Field>
                  <Field label="Ascenseur concerné *" wide>
                    <select
                      className={inputClass}
                      disabled={!selectedClient || clientElevators.length === 0}
                      onChange={(event) => onSetField('elevatorId', event.target.value)}
                      value={form.elevatorId}
                    >
                      <option value="">
                        {!selectedClient
                          ? 'Sélectionnez d’abord un client'
                          : clientElevators.length
                            ? 'Sélectionner un ascenseur du parc'
                            : 'Aucun ascenseur détaillé pour ce client'}
                      </option>
                      {clientElevators.map((elevator, index) => (
                        <option key={elevator.id || index} value={elevator.id || `elevator-${index}`}>
                          {[elevator.reference, elevator.brand, elevator.type].filter(Boolean).join(' · ')}
                        </option>
                      ))}
                    </select>
                    {selectedClient && clientElevators.length === 0 && (
                      <span className="mt-1.5 block text-xs text-amber-700">
                        Ajoutez d’abord l’équipement dans la fiche du client.
                      </span>
                    )}
                  </Field>
                  {selectedClient && (
                    <div className="sm:col-span-2 flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-steel-100 bg-steel-50/70 px-4 py-3 text-xs text-steel-950">
                      <span className="inline-flex items-center gap-1.5">
                        <Users aria-hidden="true" size={14} />
                        <strong>{getClientName(selectedClient)}</strong>
                      </span>
                      <span className="inline-flex items-start gap-1.5">
                        <MapPin aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
                        {[selectedClient.address, selectedClient.city, selectedClient.postalCode]
                          .filter(Boolean)
                          .join(', ') || 'Adresse non renseignée'}
                      </span>
                      {selectedElevator && (
                        <span className="inline-flex items-center gap-1.5">
                          <Wrench aria-hidden="true" size={14} />
                          {selectedElevator.reference} · {selectedElevator.brand} · {selectedElevator.type}
                        </span>
                      )}
                    </div>
                  )}
                  <Field label="Date du devis *">
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
                  <Field label="Valable jusqu’au *">
                    <div className="relative">
                      <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        className={`${inputClass} pl-10`}
                        min={form.issueDate || undefined}
                        onChange={(event) => onSetField('validUntil', event.target.value)}
                        required
                        type="date"
                        value={form.validUntil}
                      />
                    </div>
                    <span className="mt-1.5 block text-xs text-slate-500">
                      Durée de validité : {validityDays} jour{validityDays === 1 ? '' : 's'}
                    </span>
                  </Field>
                  <Field label="Statut du devis *">
                    <select
                      className={inputClass}
                      onChange={(event) => onSetField('status', event.target.value)}
                      value={form.status}
                    >
                      {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </Field>
                </div>
              )}

              {activeTab === 'lines' && (
                <div className="space-y-5">
                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <header className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Lignes de chiffrage</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Les pièces sélectionnées récupèrent leurs références et prix depuis le stock.
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
                      <p className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
                        Chargement du stock…
                      </p>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1120px] text-left">
                        <thead className="bg-white text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="w-44 px-3 py-3">Type</th>
                            <th className="min-w-52 px-3 py-3">Article stock</th>
                            <th className="min-w-52 px-3 py-3">Désignation</th>
                            <th className="w-24 px-3 py-3">Qté</th>
                            <th className="w-36 px-3 py-3">PU HT</th>
                            <th className="w-24 px-3 py-3">TVA</th>
                            <th className="w-36 px-3 py-3 text-right">Total ligne</th>
                            <th className="w-12 px-2 py-3"><span className="sr-only">Action</span></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {form.items.map((line, index) => {
                            const preview = linePreviews[index] || {}
                            const isPiece = line.type === 'piece'
                            return (
                              <tr className="align-top" key={line.id || `quote-line-${index}`}>
                                <td className="px-3 py-3">
                                  <select
                                    aria-label={`Type de ligne ${index + 1}`}
                                    className={inputClass}
                                    onChange={(event) => changeLineType(index, event.target.value)}
                                    value={line.type}
                                  >
                                    {LINE_TYPES.map((type) => (
                                      <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-3 py-3">
                                  {isPiece ? (
                                    <>
                                      <select
                                        aria-label={`Pièce de stock ligne ${index + 1}`}
                                        className={inputClass}
                                        disabled={stockLoading}
                                        onChange={(event) => onSelectStock(index, event.target.value)}
                                        required
                                        value={line.stockId}
                                      >
                                        <option value="">Sélectionner une pièce</option>
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
                                    </>
                                  ) : (
                                    <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-600">
                                      {line.type === 'labor'
                                        ? <Wrench aria-hidden="true" size={14} />
                                        : <Truck aria-hidden="true" size={14} />}
                                      {line.type === 'labor' ? 'Prestation' : 'Forfait'}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  <input
                                    aria-label={`Désignation ligne ${index + 1}`}
                                    className={inputClass}
                                    maxLength={180}
                                    onChange={(event) => onUpdateLine(index, { designation: event.target.value })}
                                    placeholder={line.type === 'labor' ? 'Main d’œuvre' : line.type === 'travel' ? 'Déplacement' : 'Désignation'}
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
                                    aria-label={`Quantité ligne ${index + 1}`}
                                    className={inputClass}
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
                                      aria-label={`Prix unitaire HT ligne ${index + 1}`}
                                      className={`${inputClass} pr-12`}
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
                                    onChange={(event) => onUpdateLine(index, { taxRate: event.target.value })}
                                    value={String(line.taxRate)}
                                  >
                                    {vatRates.map((rate) => (
                                      <option key={rate} value={rate}>{rate} %</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">
                                  {preview.amounts
                                    ? formatCurrency(preview.amounts.totalTTC, company.defaultCurrency)
                                    : '—'}
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

                  <section aria-label="Totaux du devis" className="ml-auto w-full max-w-md rounded-2xl border border-steel-100 bg-gradient-to-br from-steel-50 to-white p-4 shadow-inner shadow-steel-900/[0.03] sm:p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <CircleDollarSign aria-hidden="true" className="text-steel-800" size={18} />
                      <h3 className="text-sm font-semibold text-slate-900">Récapitulatif financier</h3>
                    </div>
                    {totals.error && (
                      <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                        {totals.error}
                      </p>
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
                  <Field label="Délai de livraison / intervention">
                    <input
                      className={inputClass}
                      maxLength={160}
                      onChange={(event) => onSetField('deliveryDelay', event.target.value)}
                      placeholder="Ex. 10 jours ouvrés après validation"
                      value={form.deliveryDelay}
                    />
                  </Field>
                  <Field label="Conditions de paiement">
                    <input
                      className={inputClass}
                      maxLength={240}
                      onChange={(event) => onSetField('paymentTerms', event.target.value)}
                      placeholder="Ex. 50 % à la commande, 50 % à la réception"
                      value={form.paymentTerms}
                    />
                  </Field>
                  <Field label="Notes libres" wide>
                    <textarea
                      className={`${inputClass} min-h-28 resize-y`}
                      maxLength={4000}
                      onChange={(event) => onSetField('notes', event.target.value)}
                      placeholder="Précisions techniques, périmètre et réserves particulières."
                      rows={5}
                      value={form.notes}
                    />
                  </Field>
                  <Field label="Conditions générales" wide>
                    <textarea
                      className={`${inputClass} min-h-36 resize-y`}
                      maxLength={8000}
                      onChange={(event) => onSetField('generalConditions', event.target.value)}
                      rows={6}
                      value={form.generalConditions}
                    />
                  </Field>
                </div>
              )}
            </section>

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-4 py-3.5 sm:px-7">
            <p className="text-xs text-slate-500">
              {stock.length} article{stock.length === 1 ? '' : 's'} disponible{stock.length === 1 ? '' : 's'} dans le stock
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
                disabled={saving || clientsLoading || stockLoading || clients.length === 0}
                type="submit"
              >
                {saving
                  ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                  : <Plus aria-hidden="true" size={16} />}
                {saving ? 'Enregistrement…' : editingQuote ? 'Enregistrer les modifications' : 'Enregistrer le devis'}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}
