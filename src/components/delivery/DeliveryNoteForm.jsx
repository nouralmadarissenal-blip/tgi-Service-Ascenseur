import { useMemo, useState } from 'react'
import {
  CalendarDays,
  FileText,
  LoaderCircle,
  MapPin,
  Package,
  Plus,
  Truck,
  X,
} from 'lucide-react'

const TABS = [
  { id: 'general', label: 'Informations générales', icon: FileText },
  { id: 'items', label: 'Lignes de livraison', icon: Package },
  { id: 'logistics', label: 'Logistique & signature', icon: Truck },
]
const UNITS = ['Pièce', 'Mètre', 'Litre']
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-steel-500 focus:ring-4 focus:ring-steel-100 disabled:cursor-not-allowed disabled:bg-slate-100'

function getClientName(client) {
  return client?.name || client?.companyName || client?.clientName || 'Client'
}

function Field({ children, label, wide = false }) {
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  )
}

export default function DeliveryNoteForm({
  clients,
  editingNote,
  error,
  form,
  linkedDocuments,
  linePreviews,
  numberPreview,
  numberPreviewError,
  numberPreviewLoading,
  onAddLine,
  onCancel,
  onRemoveLine,
  onSelectClient,
  onSelectLinkedDocument,
  onSelectStock,
  onSetField,
  onSubmit,
  onUpdateLine,
  saving,
  stock,
  stockLoading,
}) {
  const [activeTab, setActiveTab] = useState('general')
  const selectedClient = clients.find((client) => client.id === form.clientId)
  const clientDocuments = useMemo(
    () => linkedDocuments.filter((document) => !form.clientId || document.clientId === form.clientId),
    [linkedDocuments, form.clientId],
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-2 backdrop-blur-sm sm:p-5">
      <section
        aria-describedby="delivery-note-description"
        aria-labelledby="delivery-note-title"
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
              <h2 className="text-lg font-semibold text-slate-900" id="delivery-note-title">
                {editingNote ? `Modifier ${editingNote.number || 'le bon de livraison'}` : 'Nouveau bon de livraison'}
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500" id="delivery-note-description">
                Préparez une sortie de stock avec suivi de livraison et preuve de réception.
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
          aria-label="Sections du bon de livraison"
          className="grid shrink-0 grid-cols-3 gap-1 border-b border-slate-100 px-3 py-2 sm:px-6"
          role="tablist"
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              aria-controls={`delivery-panel-${id}`}
              aria-selected={activeTab === id}
              className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left text-xs font-semibold transition sm:px-3 ${
                activeTab === id
                  ? 'border-steel-100 bg-steel-50 text-steel-800 shadow-sm'
                  : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
              id={`delivery-tab-${id}`}
              key={id}
              onClick={() => setActiveTab(id)}
              role="tab"
              type="button"
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${activeTab === id ? 'bg-white text-steel-700 shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                <Icon aria-hidden="true" size={15} />
              </span>
              <span className="hidden truncate sm:block">{label}</span>
              <span className="truncate sm:hidden">{id === 'general' ? 'Général' : id === 'items' ? 'Articles' : 'Logistique'}</span>
            </button>
          ))}
        </div>

        <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={onSubmit}>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
            <section
              aria-labelledby={`delivery-tab-${activeTab}`}
              id={`delivery-panel-${activeTab}`}
              role="tabpanel"
              tabIndex={0}
            >
              {activeTab === 'general' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Client *">
                    <select
                      className={inputClass}
                      onChange={(event) => onSelectClient(event.target.value)}
                      required
                      value={form.clientId}
                    >
                      <option value="">Sélectionner un client</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>{getClientName(client)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="N° de bon de livraison">
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
                    <span className="mt-1.5 block text-xs text-slate-500">
                      Le numéro définitif est attribué de façon atomique à l’enregistrement.
                    </span>
                  </Field>
                  <Field label="Date de livraison *">
                    <div className="relative">
                      <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        className={`${inputClass} pl-10`}
                        onChange={(event) => onSetField('deliveryDate', event.target.value)}
                        required
                        type="date"
                        value={form.deliveryDate}
                      />
                    </div>
                  </Field>
                  <Field label="Document lié">
                    <select
                      className={inputClass}
                      onChange={(event) => onSelectLinkedDocument(event.target.value)}
                      value={form.linkedDocumentKey}
                    >
                      <option value="">Aucun document associé</option>
                      {clientDocuments.map((document) => (
                        <option key={document.key} value={document.key}>
                          {document.number} · {document.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Référence du document lié" wide>
                    <input
                      className={inputClass}
                      maxLength={120}
                      onChange={(event) => onSetField('linkedDocumentReference', event.target.value)}
                      placeholder="Ex. Facture FAC-2026-001 ou devis DEV-2026-002"
                      value={form.linkedDocumentReference}
                    />
                    <span className="mt-1.5 block text-xs text-slate-500">
                      La sélection d’un devis ou d’une facture renseigne automatiquement cette référence.
                    </span>
                  </Field>
                  {selectedClient && (
                    <div className="sm:col-span-2 flex flex-wrap items-start gap-x-6 gap-y-2 rounded-xl border border-steel-100 bg-steel-50/70 px-4 py-3 text-xs text-steel-950">
                      <span className="font-semibold">{getClientName(selectedClient)}</span>
                      <span className="inline-flex items-start gap-1.5">
                        <MapPin aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
                        {[selectedClient.address, selectedClient.city, selectedClient.postalCode]
                          .filter(Boolean)
                          .join(', ') || 'Adresse non renseignée'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'items' && (
                <div className="space-y-5">
                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <header className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Articles à livrer</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Les quantités en stock sont indicatives ; le stock est revalidé au moment de la livraison.
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
                      <table className="w-full min-w-[790px] text-left">
                        <thead className="bg-white text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="min-w-60 px-3 py-3">Article stock *</th>
                            <th className="w-32 px-3 py-3">Quantité livrée</th>
                            <th className="w-32 px-3 py-3">Unité</th>
                            <th className="w-40 px-3 py-3 text-right">À livrer</th>
                            <th className="w-12 px-2 py-3"><span className="sr-only">Action</span></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {form.items.map((line, index) => {
                            const preview = linePreviews[index] || {}
                            return (
                              <tr className="align-top" key={line.id || `delivery-line-${index}`}>
                                <td className="px-3 py-3">
                                  <select
                                    aria-label={`Article à livrer ligne ${index + 1}`}
                                    className={inputClass}
                                    disabled={stockLoading}
                                    onChange={(event) => onSelectStock(index, event.target.value)}
                                    required
                                    value={line.stockId}
                                  >
                                    <option value="">Sélectionner un article du stock</option>
                                    {stock.map((item) => (
                                      <option key={item.id} value={item.id}>
                                        {[item.reference || item.tgiReference, item.name || item.designation]
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </option>
                                    ))}
                                  </select>
                                  {preview.stockItem && (
                                    <span className={`mt-1.5 block text-[11px] font-medium ${
                                      preview.availableQuantity === null || preview.overStock
                                        ? 'text-red-700'
                                        : 'text-slate-500'
                                    }`}>
                                      Quantité en stock actuelle : {preview.availableQuantity ?? 'invalide'}
                                      {preview.overStock && ' · quantité demandée supérieure au stock'}
                                    </span>
                                  )}
                                  {preview.error && (
                                    <span className="mt-1 block text-[11px] leading-4 text-red-700" role="alert">
                                      {preview.error}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  <input
                                    aria-label={`Quantité livrée ligne ${index + 1}`}
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
                                  <select
                                    aria-label={`Unité ligne ${index + 1}`}
                                    className={inputClass}
                                    onChange={(event) => onUpdateLine(index, { unit: event.target.value })}
                                    value={line.unit}
                                  >
                                    {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                                  </select>
                                </td>
                                <td className="px-3 py-4 text-right text-xs text-slate-500">
                                  {preview.availableQuantity !== null && Number.isSafeInteger(Number(line.quantity))
                                    ? `${Number(line.quantity)} / ${preview.availableQuantity} en stock`
                                    : 'Sélectionnez un article'}
                                </td>
                                <td className="px-2 py-3">
                                  <button
                                    aria-label={`Supprimer la ligne ${index + 1}`}
                                    className="mt-1 rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={form.items.length === 1}
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
                  {linePreviews.some((preview) => preview.overStock) && (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                      Une quantité demandée dépasse le stock disponible. Le BL ne pourra pas être validé avant correction.
                    </p>
                  )}
                </div>
              )}

              {activeTab === 'logistics' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Livreur / Transporteur">
                    <input
                      autoComplete="name"
                      className={inputClass}
                      maxLength={120}
                      onChange={(event) => onSetField('carrierName', event.target.value)}
                      placeholder="Nom du livreur ou transporteur"
                      value={form.carrierName}
                    />
                  </Field>
                  <Field label="Adresse de livraison *">
                    <input
                      autoComplete="street-address"
                      className={inputClass}
                      maxLength={240}
                      onChange={(event) => onSetField('deliveryAddress', event.target.value)}
                      placeholder="Adresse complète"
                      required
                      value={form.deliveryAddress}
                    />
                  </Field>
                  <Field label="Notes de livraison" wide>
                    <textarea
                      className={`${inputClass} min-h-36 resize-y`}
                      maxLength={4000}
                      onChange={(event) => onSetField('notes', event.target.value)}
                      placeholder="Instructions d’accès, créneau ou remarques logistiques."
                      rows={5}
                      value={form.notes}
                    />
                  </Field>
                  <p className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                    La validation du BL déclenchera une décrémentation définitive du stock. Les articles et quantités seront contrôlés à nouveau dans la transaction.
                  </p>
                </div>
              )}
            </section>

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-4 py-3.5 sm:px-7">
            <p className="text-xs text-slate-500">
              Aucun montant financier n’est enregistré sur un bon de livraison.
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
                disabled={saving || stockLoading || stock.length === 0}
                type="submit"
              >
                {saving
                  ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                  : <Plus aria-hidden="true" size={16} />}
                {saving ? 'Enregistrement…' : editingNote ? 'Enregistrer les modifications' : 'Enregistrer le brouillon'}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}
