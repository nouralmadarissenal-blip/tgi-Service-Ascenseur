import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Banknote,
  Building2,
  CalendarDays,
  Check,
  FileText,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react'
import { getDefaultClauses } from './contractClauses'
import { calculateContractAmounts } from '../../utils/contractFinancials'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'

const contractTypes = [
  { value: 'intervention', label: 'Maintenance' },
  { value: 'installation', label: 'Installation' },
  { value: 'modernisation', label: 'Modernisation' },
]

const contractVersions = [
  { value: 'simple', label: 'Version simple' },
  { value: 'complete', label: 'Version complète' },
]

const billingFrequencies = [
  'Mensuel',
  'Trimestriel',
  'Annuel',
  'À la livraison',
]

const slaOptions = ['2h', '4h', '12h', '24h']
const taxRates = [20, 14, 0]

const tabs = [
  { id: 'general', label: 'Informations générales', icon: Building2 },
  { id: 'financial', label: 'Conditions financières', icon: Banknote },
  { id: 'validity', label: 'Validité & SLA', icon: CalendarDays },
  { id: 'clauses', label: 'Clauses juridiques', icon: FileText },
]

function Field({ children, hint, label, required = false, className = '' }) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">
        {label}{required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-5 text-slate-500">{hint}</span>}
    </label>
  )
}

function getClientName(client) {
  return client?.name || client?.companyName || client?.clientName || 'Client'
}

function getElevatorId(elevator, index) {
  return String(elevator.id || elevator.reference || `elevator-${index}`)
}

function getElevatorLabel(elevator) {
  return [elevator.reference || 'Ascenseur', elevator.brand, elevator.type]
    .filter(Boolean)
    .join(' · ')
}

function defaultPaymentTerms(type) {
  return type === 'installation' || type === 'modernisation'
    ? '30 % à la commande, solde à la réception des travaux.'
    : 'Facturation selon la périodicité définie aux conditions particulières.'
}

function formatCurrency(value, currency) {
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: ['MAD', 'EUR', 'USD'].includes(currency) ? currency : 'MAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function todayAsInputValue() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function ContractForm({
  clients,
  clientsLoading = false,
  contract,
  currency = 'MAD',
  error,
  onCancel,
  onChange,
  onSubmit,
  saving,
}) {
  const [activeTab, setActiveTab] = useState('general')
  const [amendmentDraft, setAmendmentDraft] = useState('')
  const setField = (name, value) => onChange((current) => ({ ...current, [name]: value }))
  const selectedClient = clients.find((client) => client.id === contract.clientId)
  const elevators = Array.isArray(selectedClient?.elevators) ? selectedClient.elevators : []
  const selectedElevator = elevators.find((elevator, index) =>
    getElevatorId(elevator, index) === contract.elevatorId,
  )
  const amounts = calculateContractAmounts(contract.priceHT, Number(contract.taxRate))
  const amendments = Array.isArray(contract.amendments) ? contract.amendments : []

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, saving])

  const changeType = (type) => {
    onChange((current) => ({
      ...current,
      type,
      clauses: getDefaultClauses(type, current.version),
      paymentTerms: defaultPaymentTerms(type),
      billingFrequency: type === 'installation' || type === 'modernisation'
        ? 'À la livraison'
        : 'Trimestriel',
    }))
  }

  const changeVersion = (version) => {
    onChange((current) => ({
      ...current,
      version,
      clauses: getDefaultClauses(current.type, version),
    }))
  }

  const changeClient = (clientId) => {
    const client = clients.find((item) => item.id === clientId)
    onChange((current) => ({
      ...current,
      clientId,
      clientName: client ? getClientName(client) : '',
      clientAddress: client?.address || '',
      clientIce: client?.ice || '',
      siteAddress: client?.address || '',
      elevatorId: '',
      elevatorReference: '',
      elevatorBrand: '',
      elevatorType: '',
      elevators: [],
      elevatorIds: [],
    }))
  }

  const changeElevator = (elevatorId) => {
    const elevator = elevators.find((item, index) => getElevatorId(item, index) === elevatorId)
    const elevatorData = elevator
      ? [{
          id: elevatorId,
          reference: elevator.reference || '',
          brand: elevator.brand || '',
          type: elevator.type || '',
        }]
      : []
    onChange((current) => ({
      ...current,
      elevatorId: elevator ? elevatorId : '',
      elevatorReference: elevator?.reference || '',
      elevatorBrand: elevator?.brand || '',
      elevatorType: elevator?.type || '',
      elevators: elevatorData,
      elevatorIds: elevator ? [elevatorId] : [],
    }))
  }

  const addAmendment = () => {
    const text = amendmentDraft.trim()
    if (!text) return
    setField('amendments', [
      ...amendments,
      { date: todayAsInputValue(), text },
    ])
    setAmendmentDraft('')
  }

  const removeAmendment = (indexToRemove) => {
    setField('amendments', amendments.filter((_, index) => index !== indexToRemove))
  }

  const currentTab = tabs.find((tab) => tab.id === activeTab) || tabs[0]
  const CurrentTabIcon = currentTab.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-2 backdrop-blur-sm sm:p-5">
      <section
        aria-describedby="contract-form-description"
        aria-labelledby="contract-form-title"
        aria-modal="true"
        className="my-auto flex max-h-[calc(100vh-1rem)] w-full max-w-6xl animate-slide-up flex-col overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl shadow-slate-950/30 sm:max-h-[calc(100vh-2.5rem)]"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-4 sm:px-7">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-900 text-white shadow-md shadow-blue-900/20">
              <ShieldCheck aria-hidden="true" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900" id="contract-form-title">
                {contract.id ? 'Voir / modifier le contrat' : 'Nouveau contrat'}
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500" id="contract-form-description">
                Complétez les quatre sections. Les champs marqués d’un astérisque sont obligatoires.
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

        <div className="grid min-h-0 flex-1 lg:grid-cols-[230px_minmax(0,1fr)]">
          <nav
            aria-label="Sections du formulaire de contrat"
            className="flex gap-2 overflow-x-auto border-b border-slate-100 bg-slate-50/70 p-3 lg:flex-col lg:border-b-0 lg:border-r lg:p-4"
            role="tablist"
          >
            {tabs.map((tab, index) => {
              const Icon = tab.icon
              const active = tab.id === activeTab
              return (
                <button
                  aria-controls={`contract-panel-${tab.id}`}
                  aria-selected={active}
                  className={`flex min-w-max items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition lg:w-full ${
                    active
                      ? 'bg-blue-900 text-white shadow-md shadow-blue-900/15'
                      : 'text-slate-600 hover:bg-white hover:text-blue-900'
                  }`}
                  id={`contract-tab-${tab.id}`}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-white/15' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>
                    {active ? <Check aria-hidden="true" size={14} /> : <Icon aria-hidden="true" size={15} />}
                  </span>
                  <span>{index + 1}. {tab.label}</span>
                </button>
              )
            })}
          </nav>

          <form
            className="flex min-h-0 flex-col"
            noValidate
            onSubmit={onSubmit}
          >
            <div
              aria-labelledby={`contract-tab-${activeTab}`}
              className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6"
              id={`contract-panel-${activeTab}`}
              role="tabpanel"
            >
              <div className="mb-5 flex items-center gap-2">
                <CurrentTabIcon aria-hidden="true" className="text-blue-800" size={18} />
                <h3 className="text-sm font-semibold text-slate-900">{currentTab.label}</h3>
              </div>

              {activeTab === 'general' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Référence du contrat" required>
                    <input
                      autoComplete="off"
                      className={inputClass}
                      maxLength={60}
                      onChange={(event) => setField('reference', event.target.value)}
                      required
                      value={contract.reference || ''}
                    />
                  </Field>
                  <Field label="Type de contrat" required>
                    <select
                      className={inputClass}
                      onChange={(event) => changeType(event.target.value)}
                      required
                      value={contract.type}
                    >
                      {contractTypes.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Version du document" required>
                    <select
                      className={inputClass}
                      onChange={(event) => changeVersion(event.target.value)}
                      required
                      value={contract.version}
                    >
                      {contractVersions.map((version) => (
                        <option key={version.value} value={version.value}>{version.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    hint={clientsLoading ? 'Chargement des clients…' : undefined}
                    label="Client"
                    required
                  >
                    <select
                      className={inputClass}
                      disabled={clientsLoading}
                      onChange={(event) => changeClient(event.target.value)}
                      required
                      value={selectedClient ? contract.clientId : ''}
                    >
                      <option value="">
                        {clientsLoading ? 'Chargement…' : 'Sélectionner un client'}
                      </option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>{getClientName(client)}</option>
                      ))}
                    </select>
                    {!clientsLoading && clients.length === 0 && (
                      <span className="mt-2 block text-xs text-amber-800">
                        Aucun client n’est disponible. <Link className="font-semibold underline" to="/clients">Créer un client</Link>
                      </span>
                    )}
                    {contract.clientId && !selectedClient && !clientsLoading && clients.length > 0 && (
                      <span className="mt-2 block text-xs text-red-700">
                        Le client enregistré n’existe plus. Sélectionnez un client actif.
                      </span>
                    )}
                  </Field>
                  <Field
                    hint={selectedClient && elevators.length === 0
                      ? 'Le parc de ce client est vide. Enregistrez son ascenseur dans sa fiche avant de créer le contrat.'
                      : selectedClient
                        ? `${elevators.length} équipement${elevators.length === 1 ? '' : 's'} dans le parc de ce client.`
                        : 'La liste est strictement limitée au parc du client sélectionné.'}
                    label="Ascenseur concerné"
                    required
                  >
                    <select
                      className={inputClass}
                      disabled={!selectedClient || elevators.length === 0}
                      onChange={(event) => changeElevator(event.target.value)}
                      required
                      value={selectedElevator ? contract.elevatorId : ''}
                    >
                      <option value="">
                        {!selectedClient
                          ? 'Sélectionnez un client d’abord'
                          : elevators.length === 0
                            ? 'Aucun ascenseur enregistré'
                            : 'Sélectionner un ascenseur'}
                      </option>
                      {elevators.map((elevator, index) => (
                        <option key={getElevatorId(elevator, index)} value={getElevatorId(elevator, index)}>
                          {getElevatorLabel(elevator)}
                        </option>
                      ))}
                    </select>
                    {selectedClient && elevators.length === 0 && (
                      <Link className="mt-2 inline-flex text-xs font-semibold text-blue-800 hover:text-blue-950" to="/clients">
                        Ouvrir le module Clients pour ajouter l’équipement
                      </Link>
                    )}
                  </Field>
                  <Field className="md:col-span-2" label="Objet du contrat" required>
                    <input
                      className={inputClass}
                      maxLength={180}
                      onChange={(event) => setField('subject', event.target.value)}
                      placeholder="Ex. Maintenance préventive de l’ascenseur du bâtiment A"
                      required
                      value={contract.subject || ''}
                    />
                  </Field>
                  <Field className="md:col-span-2" label="Périmètre des prestations" required>
                    <textarea
                      className={`${inputClass} min-h-28 resize-y`}
                      onChange={(event) => setField('scope', event.target.value)}
                      placeholder="Décrivez les prestations comprises dans le contrat."
                      required
                      value={contract.scope || ''}
                    />
                  </Field>
                  <Field className="md:col-span-2" label="Adresse du site d’exécution">
                    <input
                      className={inputClass}
                      onChange={(event) => setField('siteAddress', event.target.value)}
                      value={contract.siteAddress || ''}
                    />
                  </Field>
                  {selectedClient && (
                    <div className="md:col-span-2 flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-blue-950">
                      <span><strong>Client :</strong> {getClientName(selectedClient)}</span>
                      {selectedClient.ice && <span><strong>ICE :</strong> {selectedClient.ice}</span>}
                      {selectedElevator && (
                        <span><strong>Équipement :</strong> {getElevatorLabel(selectedElevator)}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'financial' && (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Montant total HT" required>
                      <div className="relative">
                        <input
                          className={`${inputClass} pr-16`}
                          inputMode="decimal"
                          min="0"
                          onChange={(event) => setField('priceHT', event.target.value)}
                          required
                          step="0.01"
                          type="number"
                          value={contract.priceHT}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                          {currency}
                        </span>
                      </div>
                    </Field>
                    <Field label="Taux de TVA" required>
                      <select
                        className={inputClass}
                        onChange={(event) => setField('taxRate', event.target.value)}
                        required
                        value={String(contract.taxRate)}
                      >
                        {taxRates.map((rate) => (
                          <option key={rate} value={rate}>{rate} %{rate === 0 ? ' · Exonéré' : ''}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Échéancier de facturation" required>
                      <select
                        className={inputClass}
                        onChange={(event) => setField('billingFrequency', event.target.value)}
                        required
                        value={contract.billingFrequency}
                      >
                        {billingFrequencies.map((frequency) => (
                          <option key={frequency} value={frequency}>{frequency}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Modalités de règlement" required>
                      <textarea
                        className={`${inputClass} min-h-24 resize-y`}
                        onChange={(event) => setField('paymentTerms', event.target.value)}
                        required
                        value={contract.paymentTerms || ''}
                      />
                    </Field>
                  </div>

                  <section aria-label="Récapitulatif financier" className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 shadow-inner shadow-blue-900/[0.03]">
                    <div className="mb-3 flex items-center gap-2">
                      <Banknote aria-hidden="true" className="text-blue-800" size={17} />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Récapitulatif</h4>
                    </div>
                    <dl className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl bg-white/80 p-3 ring-1 ring-slate-200/70">
                        <dt className="text-xs text-slate-500">Total HT</dt>
                        <dd className="mt-1 text-base font-semibold tabular-nums text-slate-900">
                          {contract.priceHT === '' ? '—' : formatCurrency(amounts.totalHT, currency)}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-white/80 p-3 ring-1 ring-slate-200/70">
                        <dt className="text-xs text-slate-500">TVA ({contract.taxRate || 0} %)</dt>
                        <dd className="mt-1 text-base font-semibold tabular-nums text-slate-900">
                          {contract.priceHT === '' ? '—' : formatCurrency(amounts.taxAmount, currency)}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-blue-900 p-3 text-white shadow-md shadow-blue-900/15">
                        <dt className="text-xs text-blue-100">Total TTC</dt>
                        <dd className="mt-1 text-lg font-bold tabular-nums">
                          {contract.priceHT === '' ? '—' : formatCurrency(amounts.totalTTC, currency)}
                        </dd>
                      </div>
                    </dl>
                    {amounts.error && (
                      <p className="mt-3 text-xs font-medium text-red-700" role="alert">{amounts.error}</p>
                    )}
                  </section>
                </div>
              )}

              {activeTab === 'validity' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Date de début" required>
                    <input
                      className={inputClass}
                      onChange={(event) => setField('startDate', event.target.value)}
                      required
                      type="date"
                      value={contract.startDate || ''}
                    />
                  </Field>
                  <Field label="Date d’échéance" required>
                    <input
                      className={inputClass}
                      min={contract.startDate || undefined}
                      onChange={(event) => setField('endDate', event.target.value)}
                      required
                      type="date"
                      value={contract.endDate || ''}
                    />
                  </Field>
                  <Field label="SLA · délai d’intervention garanti" required>
                    <select
                      className={inputClass}
                      onChange={(event) => setField('slaResponseTime', event.target.value)}
                      required
                      value={contract.slaResponseTime}
                    >
                      {slaOptions.map((option) => (
                        <option key={option} value={option}>Sous {option}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Durée de garantie">
                    <input
                      className={inputClass}
                      onChange={(event) => setField('warranty', event.target.value)}
                      placeholder="Ex. 12 mois"
                      value={contract.warranty || ''}
                    />
                  </Field>
                  <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 md:col-span-2">
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">Tacite reconduction</span>
                      <span className="mt-1 block text-xs text-slate-500">Renouveler automatiquement à l’échéance.</span>
                    </span>
                    <input
                      checked={contract.autoRenewal === true}
                      className="h-5 w-5 rounded border-slate-300 text-blue-800 focus:ring-blue-500"
                      onChange={(event) => setField('autoRenewal', event.target.checked)}
                      type="checkbox"
                    />
                  </label>
                  <Field
                    hint="De 0 à 24 mois avant l’échéance."
                    label="Préavis avant échéance (mois)"
                    required
                  >
                    <input
                      className={inputClass}
                      max="24"
                      min="0"
                      onChange={(event) => setField('noticeMonths', event.target.value)}
                      required
                      step="1"
                      type="number"
                      value={contract.noticeMonths}
                    />
                  </Field>
                  <Field label="État du contrat" required>
                    <select
                      className={inputClass}
                      onChange={(event) => setField('status', event.target.value)}
                      required
                      value={contract.status}
                    >
                      {['Brouillon', 'À signer', 'Actif', 'Terminé', 'Résilié'].map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs leading-5 text-amber-950 md:col-span-2">
                    <Wrench aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700" size={16} />
                    <p>
                      Le délai SLA constitue l’engagement de prise en charge indiqué aux conditions particulières.
                      Les contraintes d’accès, de sécurité et d’approvisionnement restent à préciser dans les clauses.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'clauses' && (
                <div className="space-y-5">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-5 text-blue-950">
                    Le modèle est prérempli selon le type et la version du contrat. Vous pouvez l’adapter avant
                    l’enregistrement ; un changement de type ou de version recharge le modèle correspondant.
                  </div>
                  <Field label="Clauses contractuelles" required>
                    <textarea
                      className={`${inputClass} min-h-[22rem] resize-y font-mono text-xs leading-6`}
                      onChange={(event) => setField('clauses', event.target.value)}
                      required
                      value={contract.clauses || ''}
                    />
                  </Field>
                  <Field label="Conditions générales de vente">
                    <textarea
                      className={`${inputClass} min-h-36 resize-y text-sm leading-6`}
                      onChange={(event) => setField('generalConditions', event.target.value)}
                      placeholder="Conditions générales récupérées des paramètres de la société…"
                      value={contract.generalConditions || ''}
                    />
                  </Field>

                  <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">Historique des avenants</h4>
                        <p className="mt-1 text-xs text-slate-500">
                          Ajoutez une note datée pour conserver les modifications apportées au contrat.
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                        {amendments.length} entrée{amendments.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    {amendments.length > 0 && (
                      <ul className="mt-4 space-y-2">
                        {amendments.map((amendment, index) => {
                          const text = typeof amendment === 'string'
                            ? amendment
                            : amendment.text || amendment.note || ''
                          const date = typeof amendment === 'string' ? '' : amendment.date || ''
                          return (
                            <li className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3" key={`${date}-${index}`}>
                              <div>
                                <p className="text-xs font-semibold text-slate-500">{date || `Avenant ${index + 1}`}</p>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{text}</p>
                              </div>
                              <button
                                aria-label={`Supprimer l’avenant ${index + 1}`}
                                className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-700"
                                onClick={() => removeAmendment(index)}
                                type="button"
                              >
                                <X aria-hidden="true" size={15} />
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    <div className="mt-4 space-y-2">
                      <textarea
                        className={`${inputClass} min-h-20 resize-y`}
                        onChange={(event) => setAmendmentDraft(event.target.value)}
                        placeholder="Note ou contenu de l’avenant…"
                        value={amendmentDraft}
                      />
                      <button
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!amendmentDraft.trim()}
                        onClick={addAmendment}
                        type="button"
                      >
                        <Plus aria-hidden="true" size={14} />
                        Ajouter à l’historique
                      </button>
                    </div>
                  </section>
                </div>
              )}
            </div>

            {error && (
              <p className="mx-4 mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-7" role="alert">
                {error}
              </p>
            )}

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-4 py-3.5 sm:px-7">
              <p className="text-xs text-slate-500">
                Section {tabs.findIndex((tab) => tab.id === activeTab) + 1} sur {tabs.length}
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
                {activeTab !== 'clauses' ? (
                  <button
                    className="rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-900/15 transition hover:bg-blue-950"
                    onClick={() => setActiveTab(tabs[tabs.findIndex((tab) => tab.id === activeTab) + 1].id)}
                    type="button"
                  >
                    Continuer
                  </button>
                ) : (
                  <button
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-900/15 transition hover:bg-blue-950 disabled:cursor-wait disabled:opacity-60"
                    disabled={saving}
                    type="submit"
                  >
                    {saving
                      ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                      : <Check aria-hidden="true" size={16} />}
                    {saving ? 'Enregistrement…' : contract.id ? 'Enregistrer les modifications' : 'Créer le contrat'}
                  </button>
                )}
              </div>
            </footer>
          </form>
        </div>
      </section>
    </div>
  )
}
