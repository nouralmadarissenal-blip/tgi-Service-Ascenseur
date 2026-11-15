import { useState } from 'react'
import {
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  FileText,
  LoaderCircle,
  Plus,
  ReceiptText,
  Trash2,
  X,
} from 'lucide-react'

const TABS = [
  { id: 'general', label: 'Informations générales', icon: FileText },
  { id: 'lines', label: 'Lignes de facturation', icon: ReceiptText },
  { id: 'terms', label: 'Conditions & notes', icon: CircleDollarSign },
]
const VAT_OPTIONS = [20, 14, 0]
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-steel-500 focus:ring-4 focus:ring-steel-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'

function clientName(client) {
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

export default function InvoiceForm({
  clients,
  clientsLoading,
  company,
  documents,
  editingInvoice,
  error,
  form,
  linePreviews,
  numberPreview,
  numberPreviewError,
  numberPreviewLoading,
  onAddLine,
  onCancel,
  onClientChange,
  onDocumentChange,
  onRemoveLine,
  onSelectStock,
  onSetField,
  onSubmit,
  onUpdateLine,
  readOnly = false,
  saving,
  stock,
  stockLoading,
  totals,
}) {
  const [activeTab, setActiveTab] = useState('general')
  const [clientQuery, setClientQuery] = useState(() => {
    const selected = clients.find((client) => client.id === form.clientId)
    return selected ? clientName(selected) : ''
  })
  const [clientMenuOpen, setClientMenuOpen] = useState(false)
  const selectedClient = clients.find((client) => client.id === form.clientId)
  const matches = clients
    .filter((client) => clientName(client).toLocaleLowerCase('fr')
      .includes(clientQuery.trim().toLocaleLowerCase('fr')))
    .slice(0, 8)

  const selectClient = (client) => {
    onClientChange(client.id)
    setClientQuery(clientName(client))
    setClientMenuOpen(false)
  }

  const updateClientQuery = (value) => {
    setClientQuery(value)
    setClientMenuOpen(true)
    if (selectedClient && value !== clientName(selectedClient)) onClientChange('')
  }

  const updateLineType = (index, type) => {
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
        aria-describedby="invoice-form-description"
        aria-labelledby="invoice-form-title"
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
              <h2 className="text-lg font-semibold text-slate-900" id="invoice-form-title">
                {readOnly ? 'Consulter la facture' : editingInvoice ? 'Modifier le brouillon' : 'Nouvelle facture'}
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500" id="invoice-form-description">
                {readOnly
                  ? 'Cette facture est verrouillée ; seules la consultation et l’export PDF sont disponibles.'
                  : 'Vérifiez les lignes, les taxes et les échéances avant validation.'}
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

        <div aria-label="Sections de la facture" className="grid shrink-0 grid-cols-3 gap-1 border-b border-slate-100 px-3 py-2 sm:px-6" role="tablist">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              aria-controls={`invoice-panel-${id}`}
              aria-selected={activeTab === id}
              className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left text-xs font-semibold transition sm:px-3 ${
                activeTab === id
                  ? 'border-steel-100 bg-steel-50 text-steel-800 shadow-sm'
                  : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
              id={`invoice-tab-${id}`}
              key={id}
              onClick={() => setActiveTab(id)}
              role="tab"
              type="button"
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${activeTab === id ? 'bg-white text-steel-700 shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                <Icon aria-hidden="true" size={15} />
              </span>
              <span className="hidden truncate sm:block">{label}</span>
              <span className="truncate sm:hidden">{id === 'general' ? 'Général' : id === 'lines' ? 'Lignes' : 'Conditions'}</span>
            </button>
          ))}
        </div>

        <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={onSubmit}>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
            <section
              aria-labelledby={`invoice-tab-${activeTab}`}
              id={`invoice-panel-${activeTab}`}
              role="tabpanel"
              tabIndex={0}
            >
              {activeTab === 'general' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Client *" wide>
                    <div className="relative">
                      <input
                        aria-autocomplete="list"
                        aria-controls="invoice-client-options"
                        aria-expanded={clientMenuOpen}
                        autoComplete="off"
                        className={`${inputClass} pr-10`}
                        disabled={readOnly || clientsLoading}
                        onBlur={() => window.setTimeout(() => setClientMenuOpen(false), 120)}
                        onChange={(event) => updateClientQuery(event.target.value)}
                        onFocus={() => setClientMenuOpen(true)}
                        placeholder={clientsLoading ? 'Chargement des clients…' : 'Rechercher par nom ou raison sociale'}
                        role="combobox"
                        value={clientQuery}
                      />
                      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                      {!readOnly && clientMenuOpen && matches.length > 0 && (
                        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl" id="invoice-client-options" role="listbox">
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
                                <span className="block text-sm font-medium text-slate-800">{clientName(client)}</span>
                                <span className="mt-0.5 block text-xs text-slate-500">{client.ice ? `ICE ${client.ice}` : 'ICE non renseigné'}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {selectedClient && (
                        <span className="mt-1.5 block text-xs text-slate-500">
                          ICE : {selectedClient.ice || 'Non renseigné'}
                          {selectedClient.address ? ` · ${selectedClient.address}` : ''}
                        </span>
                      )}
                    </div>
                  </Field>

                  <Field label="N° de facture">
                    <div className="relative">
                      <input
                        className={`${inputClass} bg-slate-50 pr-10 font-semibold`}
                        readOnly
                        value={editingInvoice?.number || numberPreview || ''}
                      />
                      {numberPreviewLoading && <LoaderCircle aria-label="Chargement du numéro" className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-steel-700" size={16} />}
                    </div>
                    {numberPreviewError && <span className="mt-1.5 block text-xs text-red-700">{numberPreviewError}</span>}
                    {!numberPreviewError && <span className="mt-1.5 block text-xs text-slate-500">Le numéro définitif est attribué dans une transaction Firestore.</span>}
                  </Field>

                  <Field label="Date de facturation *">
                    <div className="relative">
                      <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input className={`${inputClass} pl-10`} disabled={readOnly} onChange={(event) => onSetField('issueDate', event.target.value)} required type="date" value={form.issueDate} />
                    </div>
                  </Field>
                  <Field label="Date d’échéance *">
                    <div className="relative">
                      <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input className={`${inputClass} pl-10`} disabled={readOnly} min={form.issueDate || undefined} onChange={(event) => onSetField('dueDate', event.target.value)} required type="date" value={form.dueDate} />
                    </div>
                  </Field>

                  <Field label="Devis ou bon de livraison lié" wide>
                    <select
                      className={inputClass}
                      disabled={readOnly}
                      onChange={(event) => onDocumentChange(event.target.value)}
                      value={form.linkedDocumentKey}
                    >
                      <option value="">Aucun document lié</option>
                      {documents.map((document) => (
                        <option key={`${document.sourceCollection}:${document.id}`} value={`${document.sourceCollection}:${document.id}`}>
                          {document.typeLabel} · {document.number || 'Sans numéro'} · {document.clientName}
                        </option>
                      ))}
                    </select>
                    {form.linkedDocumentKey && (
                      <span className="mt-1.5 block text-xs text-slate-500">
                        Référence enregistrée : {form.linkedDocumentNumber || 'Document sélectionné'}
                      </span>
                    )}
                  </Field>
                </div>
              )}

              {activeTab === 'lines' && (
                <div className="space-y-5">
                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <header className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Lignes de facturation</h3>
                        <p className="mt-1 text-xs text-slate-500">Les pièces peuvent être rattachées au stock ; les prestations sont saisies librement.</p>
                      </div>
                      {!readOnly && (
                        <button className="inline-flex items-center justify-center gap-2 rounded-xl border border-steel-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-steel-800 shadow-sm transition hover:bg-steel-50" onClick={onAddLine} type="button">
                          <Plus aria-hidden="true" size={15} /> Ajouter une ligne
                        </button>
                      )}
                    </header>
                    {stockLoading && <p className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">Chargement du stock…</p>}
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1060px] text-left">
                        <thead className="bg-white text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="w-40 px-3 py-3">Type</th>
                            <th className="min-w-52 px-3 py-3">Article</th>
                            <th className="min-w-56 px-3 py-3">Désignation</th>
                            <th className="w-24 px-3 py-3">Quantité</th>
                            <th className="w-36 px-3 py-3">PU HT</th>
                            <th className="w-24 px-3 py-3">TVA</th>
                            <th className="w-36 px-3 py-3 text-right">Total HT</th>
                            {!readOnly && <th className="w-12 px-2 py-3"><span className="sr-only">Action</span></th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {form.items.map((line, index) => {
                            const preview = linePreviews[index] || {}
                            const stockLine = line.type === 'piece'
                            return (
                              <tr className="align-top" key={line.id || `invoice-line-${index}`}>
                                <td className="px-3 py-3">
                                  <select aria-label={`Type de ligne ${index + 1}`} className={inputClass} disabled={readOnly} onChange={(event) => updateLineType(index, event.target.value)} value={line.type}>
                                    <option value="piece">Pièce de stock</option>
                                    <option value="service">Prestation libre</option>
                                  </select>
                                </td>
                                <td className="px-3 py-3">
                                  {stockLine ? (
                                    <select aria-label={`Article de stock ligne ${index + 1}`} className={inputClass} disabled={readOnly || stockLoading} onChange={(event) => onSelectStock(index, event.target.value)} required value={line.stockId}>
                                      <option value="">Sélectionner un article</option>
                                      {stock.map((item) => (
                                        <option key={item.id} value={item.id}>
                                          {[item.reference || item.tgiReference, item.name || item.designation].filter(Boolean).join(' · ')}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-600">Prestation libre</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  <input aria-label={`Désignation ligne ${index + 1}`} className={inputClass} disabled={readOnly} maxLength={180} onChange={(event) => onUpdateLine(index, { designation: event.target.value })} placeholder={stockLine ? 'Désignation de la pièce' : 'Ex. Main-d’œuvre / déplacement'} required value={line.designation} />
                                  {preview.error && <span className="mt-1 block text-[11px] leading-4 text-red-700" role="alert">{preview.error}</span>}
                                </td>
                                <td className="px-3 py-3">
                                  <input aria-label={`Quantité ligne ${index + 1}`} className={inputClass} disabled={readOnly} min="1" onChange={(event) => onUpdateLine(index, { quantity: event.target.value })} required step="1" type="number" value={line.quantity} />
                                </td>
                                <td className="px-3 py-3">
                                  <div className="relative">
                                    <input aria-label={`Prix unitaire HT ligne ${index + 1}`} className={`${inputClass} pr-12`} disabled={readOnly} min="0" onChange={(event) => onUpdateLine(index, { unitPrice: event.target.value })} required step="0.01" type="number" value={line.unitPrice} />
                                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">{company.defaultCurrency || 'MAD'}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <select aria-label={`Taux de TVA ligne ${index + 1}`} className={inputClass} disabled={readOnly} onChange={(event) => onUpdateLine(index, { taxRate: event.target.value })} value={line.taxRate}>
                                    {VAT_OPTIONS.map((rate) => <option key={rate} value={rate}>{rate} %</option>)}
                                  </select>
                                </td>
                                <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold text-slate-800">
                                  {preview.amounts ? formatCurrency(preview.amounts.totalHT, company.defaultCurrency) : '—'}
                                </td>
                                {!readOnly && (
                                  <td className="px-2 py-3">
                                    <button aria-label={`Supprimer la ligne ${index + 1}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-40" disabled={form.items.length <= 1} onClick={() => onRemoveLine(index)} type="button">
                                      <Trash2 aria-hidden="true" size={15} />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="ml-auto w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="space-y-2.5 p-4 sm:p-5">
                      <div className="flex justify-between gap-4 text-sm text-slate-600"><span>Total HT</span><strong className="text-slate-900">{formatCurrency(totals.totalHT, company.defaultCurrency)}</strong></div>
                      {totals.taxBreakdown.map((row) => (
                        <div className="flex justify-between gap-4 text-sm text-slate-600" key={row.taxRate}>
                          <span>TVA {row.taxRate} % <span className="text-xs text-slate-400">(base {formatCurrency(row.totalHT, company.defaultCurrency)})</span></span>
                          <strong className="text-slate-900">{formatCurrency(row.totalTax, company.defaultCurrency)}</strong>
                        </div>
                      ))}
                      <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 text-sm text-slate-600"><span>Total TVA</span><strong className="text-slate-900">{formatCurrency(totals.totalTax, company.defaultCurrency)}</strong></div>
                      <div className="flex justify-between gap-4 rounded-xl bg-blue-50 px-3.5 py-3 text-base font-bold text-blue-900"><span>Total TTC</span><span>{formatCurrency(totals.totalTTC, company.defaultCurrency)}</span></div>
                      {totals.error && <p className="text-xs text-red-700" role="alert">{totals.error}</p>}
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'terms' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Conditions de règlement *">
                    <select className={inputClass} disabled={readOnly} onChange={(event) => onSetField('paymentTerms', event.target.value)} required value={form.paymentTerms}>
                      <option value="">Sélectionner un mode de règlement</option>
                      <option value="Virement">Virement</option>
                      <option value="Chèque">Chèque</option>
                      <option value="Espèces">Espèces</option>
                    </select>
                  </Field>
                  <div className="flex items-end rounded-xl border border-steel-100 bg-steel-50/70 px-4 py-3 text-xs leading-5 text-steel-900">
                    Le solde et le statut de paiement seront suivis dans le module Recouvrement après validation.
                  </div>
                  <Field label="Notes de bas de page" wide>
                    <textarea className={`${inputClass} min-h-36 resize-y`} disabled={readOnly} maxLength={3000} onChange={(event) => onSetField('notes', event.target.value)} placeholder="Informations complémentaires figurant sur la facture" value={form.notes} />
                  </Field>
                </div>
              )}
            </section>
          </div>

          {(error || totals.error) && (
            <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 sm:px-7" role="alert">
              {error || totals.error}
            </div>
          )}
          <footer className="flex flex-col-reverse justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-4 sm:flex-row sm:items-center sm:px-7">
            <p className="text-xs text-slate-500">{readOnly ? 'Facture en lecture seule' : `Total TTC : ${formatCurrency(totals.totalTTC, company.defaultCurrency)}`}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50" disabled={saving} onClick={onCancel} type="button">
                {readOnly ? 'Fermer' : 'Annuler'}
              </button>
              {!readOnly && (
                <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-900/15 transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60" disabled={saving || Boolean(totals.error) || numberPreviewLoading || Boolean(numberPreviewError)} type="submit">
                  {saving ? <LoaderCircle aria-hidden="true" className="animate-spin" size={17} /> : <ReceiptText aria-hidden="true" size={17} />}
                  {saving ? 'Enregistrement…' : 'Enregistrer le brouillon'}
                </button>
              )}
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}
