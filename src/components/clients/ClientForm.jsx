import { useState } from 'react'
import {
  ArrowUpDown,
  CircleDollarSign,
  Landmark,
  LoaderCircle,
  MapPin,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react'

const CLIENT_TYPES = ['Syndic', 'Entreprise', 'Particulier']
const CONTRACT_TYPES = ['Garantie', 'Maintenance', 'Aucun']
const CONTRACT_STATUSES = ['Actif', 'Suspendu', 'Aucun']
const ELEVATOR_TYPES = ['Électrique', 'Hydraulique', 'Monte-charge']
const ELEVATOR_STATUSES = ['En marche', 'En panne', 'À l’arrêt', 'En travaux']
const FORM_TABS = [
  { id: 'identity', label: 'Identité & contact', icon: Users },
  { id: 'address', label: 'Adresse', icon: MapPin },
  { id: 'elevators', label: 'Parc d’ascenseurs', icon: ArrowUpDown },
  { id: 'contract', label: 'Contrat & finance', icon: Landmark },
]
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-steel-500 focus:ring-4 focus:ring-steel-100'

function createId() {
  return `elevator-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeClientType(type) {
  if (type === 'Promoteur Immobilier') return 'Entreprise'
  return CLIENT_TYPES.includes(type) ? type : 'Entreprise'
}

function normalizeElevatorStatus(status) {
  if (status === 'En service') return 'En marche'
  if (status === 'Panne' || status === 'Hors service') return 'En panne'
  if (status === "À l'arrêt") return 'À l’arrêt'
  return ELEVATOR_STATUSES.includes(status) ? status : 'En marche'
}

function getLegacyElevatorCount(client) {
  if (client.undetailedElevatorCount != null && Number.isFinite(Number(client.undetailedElevatorCount))) {
    return Math.max(0, Number(client.undetailedElevatorCount))
  }
  const total = Math.max(0, Number(client.elevatorCount) || 0)
  const detailed = Array.isArray(client.elevators) ? client.elevators.length : 0
  return Math.max(0, total - detailed)
}

function getInitialForm(client) {
  if (!client) {
    return {
      clientType: 'Entreprise',
      name: '',
      contactName: '',
      phone: '',
      phone2: '',
      whatsapp: '',
      email: '',
      ice: '',
      rc: '',
      address: '',
      postalCode: '',
      city: '',
      elevators: [],
      undetailedElevatorCount: 0,
      elevatorBrands: '',
      notes: '',
      contractType: 'Aucun',
      contractStatus: 'Aucun',
      contractEndDate: '',
      currentBalance: '0',
    }
  }

  const elevators = Array.isArray(client.elevators)
    ? client.elevators.map((elevator, index) => ({
        ...elevator,
        id: elevator.id || `elevator-${client.id}-${index}`,
        reference: elevator.reference || '',
        brand: elevator.brand || '',
        type: ELEVATOR_TYPES.includes(elevator.type) ? elevator.type : 'Électrique',
        floors: elevator.floors == null ? '' : String(elevator.floors),
        status: normalizeElevatorStatus(elevator.status),
      }))
    : []

  return {
    ...client,
    clientType: normalizeClientType(client.clientType),
    name: client.name || client.companyName || client.clientName || '',
    contactName: client.contactName || client.contactPerson || '',
    phone: client.phone || client.phone1 || '',
    phone2: client.phone2 || '',
    whatsapp: client.whatsapp || client.whatsappPro || '',
    email: client.email || '',
    ice: client.ice || '',
    rc: client.rc || '',
    address: client.address || '',
    postalCode: client.postalCode || '',
    city: client.city || '',
    elevators,
    undetailedElevatorCount: getLegacyElevatorCount(client),
    elevatorBrands: client.elevatorBrands || '',
    notes: client.notes || '',
    contractType: CONTRACT_TYPES.includes(client.contractType) ? client.contractType : 'Aucun',
    contractStatus: CONTRACT_STATUSES.includes(client.contractStatus)
      ? client.contractStatus
      : 'Aucun',
    contractEndDate: client.contractEndDate || '',
    currentBalance: String(client.currentBalance ?? 0),
  }
}

function Field({ children, label, wide = false }) {
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function TextInput({ className = '', ...props }) {
  return <input className={`${inputClass} ${className}`} {...props} />
}

function SelectInput({ options, ...props }) {
  return (
    <select className={inputClass} {...props}>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  )
}

export default function ClientForm({ client, companySettings, onCancel, onSave, saving }) {
  const [form, setForm] = useState(() => getInitialForm(client))
  const [activeTab, setActiveTab] = useState('identity')
  const [formError, setFormError] = useState('')

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setFormError('')
  }

  const updateElevator = (index, field, value) => {
    setForm((current) => ({
      ...current,
      elevators: current.elevators.map((elevator, itemIndex) =>
        itemIndex === index ? { ...elevator, [field]: value } : elevator,
      ),
    }))
    setFormError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError('')

    const name = String(form.name || '').trim()
    const phone = String(form.phone || '').trim()
    const email = String(form.email || '').trim()
    const elevators = form.elevators.map((elevator) => ({
      ...elevator,
      id: String(elevator.id || createId()),
      reference: String(elevator.reference || '').trim(),
      brand: String(elevator.brand || '').trim(),
      floors: Number(elevator.floors),
    }))
    const references = elevators.map((elevator) => elevator.reference.toLocaleLowerCase('fr'))
    const duplicateReferences = new Set(references).size !== references.length
    const invalidElevator = elevators.some((elevator) =>
      !elevator.reference ||
      !elevator.brand ||
      !ELEVATOR_TYPES.includes(elevator.type) ||
      !Number.isSafeInteger(elevator.floors) ||
      elevator.floors < 1 ||
      !ELEVATOR_STATUSES.includes(elevator.status),
    )
    const legacyCount = Number(form.undetailedElevatorCount)
    const currentBalance = Number(form.currentBalance)

    let validationError = ''
    let validationTab = 'identity'
    if (!name) {
      validationError = 'Le nom du client ou la raison sociale est obligatoire.'
    } else if (!phone) {
      validationError = 'Le numéro de téléphone est obligatoire.'
    } else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      validationError = 'Saisissez une adresse e-mail valide ou laissez le champ vide.'
    } else if (
      !Number.isSafeInteger(legacyCount) ||
      legacyCount < 0
    ) {
      validationError = 'Le nombre d’ascenseurs historiques doit être un entier positif.'
      validationTab = 'elevators'
    } else if (invalidElevator) {
      validationError = 'Chaque ascenseur doit avoir un repère, une marque, un type, un nombre de niveaux valide et un état.'
      validationTab = 'elevators'
    } else if (duplicateReferences) {
      validationError = 'Chaque ascenseur doit avoir un repère unique pour ce client.'
      validationTab = 'elevators'
    } else if (
      !Number.isFinite(currentBalance) ||
      currentBalance < 0 ||
      !Number.isSafeInteger(Math.round(currentBalance * 100))
    ) {
      validationError = 'Le solde client doit être un montant positif valide.'
      validationTab = 'contract'
    }

    if (validationError) {
      setActiveTab(validationTab)
      setFormError(validationError)
      return
    }

    try {
      await onSave({
        ...form,
        name,
        phone,
        email,
        elevators,
        undetailedElevatorCount: legacyCount,
      })
    } catch (saveError) {
      setFormError(
        saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer le client.',
      )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
      <section
        aria-labelledby="client-form-title"
        aria-modal="true"
        className="my-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl animate-slide-up flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-5 py-4 sm:px-7">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-steel-700">
              Fiche CRM
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900" id="client-form-title">
              {client ? 'Modifier le client' : 'Nouveau client'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Coordonnées complètes et parc technique du site.
            </p>
          </div>
          <button
            aria-label="Fermer le formulaire"
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            disabled={saving}
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        <div
          aria-label="Sections du formulaire client"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 px-3 pt-2 sm:px-6"
          role="tablist"
        >
          {FORM_TABS.map(({ id, label, icon: Icon }) => (
            <button
              aria-controls={`client-panel-${id}`}
              aria-selected={activeTab === id}
              className={`inline-flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 py-3 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                activeTab === id
                  ? 'border-steel-700 text-steel-800'
                  : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
              id={`client-tab-${id}`}
              key={id}
              onClick={() => setActiveTab(id)}
              role="tab"
              type="button"
            >
              <Icon aria-hidden="true" size={15} />
              {label}
            </button>
          ))}
        </div>

        <form className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7" onSubmit={handleSubmit}>
          <section
            aria-labelledby={`client-tab-${activeTab}`}
            id={`client-panel-${activeTab}`}
            role="tabpanel"
            tabIndex={0}
          >
            {activeTab === 'identity' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Type de client *">
                  <SelectInput
                    onChange={(event) => updateField('clientType', event.target.value)}
                    options={CLIENT_TYPES}
                    value={form.clientType}
                  />
                </Field>
                <Field label="Raison sociale / nom complet *">
                  <TextInput
                    autoComplete="organization"
                    autoFocus
                    maxLength={160}
                    onChange={(event) => updateField('name', event.target.value)}
                    required
                    value={form.name}
                  />
                </Field>
                <Field label="Gérant / personne à contacter">
                  <TextInput
                    autoComplete="name"
                    maxLength={120}
                    onChange={(event) => updateField('contactName', event.target.value)}
                    value={form.contactName}
                  />
                </Field>
                <Field label="Téléphone principal *">
                  <TextInput
                    autoComplete="tel"
                    maxLength={40}
                    onChange={(event) => updateField('phone', event.target.value)}
                    required
                    type="tel"
                    value={form.phone}
                  />
                </Field>
                <Field label="WhatsApp">
                  <TextInput
                    autoComplete="tel"
                    maxLength={40}
                    onChange={(event) => updateField('whatsapp', event.target.value)}
                    type="tel"
                    value={form.whatsapp}
                  />
                </Field>
                <Field label="Téléphone secondaire">
                  <TextInput
                    autoComplete="tel"
                    maxLength={40}
                    onChange={(event) => updateField('phone2', event.target.value)}
                    type="tel"
                    value={form.phone2}
                  />
                </Field>
                <Field label="Adresse e-mail">
                  <TextInput
                    autoComplete="email"
                    maxLength={160}
                    onChange={(event) => updateField('email', event.target.value)}
                    type="email"
                    value={form.email}
                  />
                </Field>
                {form.clientType === 'Entreprise' && (
                  <>
                    <Field label="ICE">
                      <TextInput
                        maxLength={40}
                        onChange={(event) => updateField('ice', event.target.value)}
                        value={form.ice}
                      />
                    </Field>
                    <Field label="Registre de commerce (RC)">
                      <TextInput
                        maxLength={40}
                        onChange={(event) => updateField('rc', event.target.value)}
                        value={form.rc}
                      />
                    </Field>
                    <Field label="Identifiant fiscal (IF)">
                      <TextInput
                        maxLength={40}
                        onChange={(event) => updateField('if', event.target.value)}
                        value={form.if || ''}
                      />
                    </Field>
                    <Field label="Patente">
                      <TextInput
                        maxLength={40}
                        onChange={(event) => updateField('patente', event.target.value)}
                        value={form.patente || ''}
                      />
                    </Field>
                  </>
                )}
                <Field label="Notes complémentaires" wide>
                  <textarea
                    className={`${inputClass} min-h-24 resize-y`}
                    maxLength={2000}
                    onChange={(event) => updateField('notes', event.target.value)}
                    placeholder="Informations utiles sur le client ou le site"
                    value={form.notes}
                  />
                </Field>
              </div>
            )}

            {activeTab === 'address' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Adresse complète" wide>
                  <textarea
                    className={`${inputClass} min-h-24 resize-y`}
                    maxLength={300}
                    onChange={(event) => updateField('address', event.target.value)}
                    placeholder="Rue, numéro, résidence, quartier…"
                    value={form.address}
                  />
                </Field>
                <Field label="Ville">
                  <TextInput
                    autoComplete="address-level2"
                    maxLength={100}
                    onChange={(event) => updateField('city', event.target.value)}
                    value={form.city}
                  />
                </Field>
                <Field label="Code postal">
                  <TextInput
                    autoComplete="postal-code"
                    maxLength={20}
                    onChange={(event) => updateField('postalCode', event.target.value)}
                    value={form.postalCode}
                  />
                </Field>
              </div>
            )}

            {activeTab === 'elevators' && (
              <div className="space-y-4">
                <div className="flex flex-col justify-between gap-3 rounded-xl border border-steel-100 bg-steel-50/70 p-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Parc d’ascenseurs</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {form.elevators.length} équipement(s) détaillé(s)
                    </p>
                  </div>
                  <button
                    className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-steel-700 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-steel-800 sm:self-auto"
                    onClick={() => {
                      setForm((current) => ({
                        ...current,
                        elevators: [
                          ...current.elevators,
                          {
                            id: createId(),
                            reference: '',
                            brand: '',
                            type: 'Électrique',
                            floors: '',
                            status: 'En marche',
                          },
                        ],
                      }))
                      setFormError('')
                    }}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={15} />
                    Ajouter un ascenseur
                  </button>
                </div>

                {Number(form.undetailedElevatorCount) > 0 && (
                  <Field label="Ascenseurs historiques non détaillés">
                    <TextInput
                      min="0"
                      onChange={(event) =>
                        updateField(
                          'undetailedElevatorCount',
                          event.target.value === '' ? '' : Number(event.target.value),
                        )
                      }
                      step="1"
                      type="number"
                      value={form.undetailedElevatorCount}
                    />
                  </Field>
                )}

                {form.elevators.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center">
                    <ArrowUpDown aria-hidden="true" className="mx-auto text-steel-600" size={25} />
                    <p className="mt-3 text-sm font-medium text-slate-700">Aucun ascenseur détaillé</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Ajoutez un équipement pour enregistrer son repère et ses caractéristiques.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {form.elevators.map((elevator, index) => (
                      <section
                        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                        key={elevator.id}
                      >
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-900">
                            Ascenseur {index + 1}
                          </h3>
                          <button
                            aria-label={`Supprimer l’ascenseur ${index + 1}`}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-700"
                            onClick={() => {
                              setForm((current) => ({
                                ...current,
                                elevators: current.elevators.filter((_, itemIndex) => itemIndex !== index),
                              }))
                              setFormError('')
                            }}
                            type="button"
                          >
                            <Trash2 aria-hidden="true" size={16} />
                          </button>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          <Field label="Repère *">
                            <TextInput
                              maxLength={80}
                              onChange={(event) => updateElevator(index, 'reference', event.target.value)}
                              placeholder="ASC-01"
                              required
                              value={elevator.reference}
                            />
                          </Field>
                          <Field label="Marque *">
                            <TextInput
                              maxLength={80}
                              onChange={(event) => updateElevator(index, 'brand', event.target.value)}
                              placeholder="Otis, Schindler…"
                              required
                              value={elevator.brand}
                            />
                          </Field>
                          <Field label="Type *">
                            <SelectInput
                              onChange={(event) => updateElevator(index, 'type', event.target.value)}
                              options={ELEVATOR_TYPES}
                              value={elevator.type}
                            />
                          </Field>
                          <Field label="Nombre de niveaux *">
                            <TextInput
                              min="1"
                              onChange={(event) => updateElevator(index, 'floors', event.target.value)}
                              required
                              step="1"
                              type="number"
                              value={elevator.floors}
                            />
                          </Field>
                          <Field label="État actuel *">
                            <SelectInput
                              onChange={(event) => updateElevator(index, 'status', event.target.value)}
                              options={ELEVATOR_STATUSES}
                              value={elevator.status}
                            />
                          </Field>
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'contract' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Type de contrat actuel">
                  <SelectInput
                    onChange={(event) => updateField('contractType', event.target.value)}
                    options={CONTRACT_TYPES}
                    value={form.contractType || 'Aucun'}
                  />
                </Field>
                <Field label="Statut du contrat">
                  <SelectInput
                    onChange={(event) => updateField('contractStatus', event.target.value)}
                    options={CONTRACT_STATUSES}
                    value={form.contractStatus || 'Aucun'}
                  />
                </Field>
                <Field label="Date d’échéance du contrat">
                  <TextInput
                    onChange={(event) => updateField('contractEndDate', event.target.value)}
                    type="date"
                    value={form.contractEndDate || ''}
                  />
                </Field>
                <Field label={`Solde actuel / impayés (${companySettings?.defaultCurrency || 'MAD'})`}>
                  <TextInput
                    min="0"
                    onChange={(event) => updateField('currentBalance', event.target.value)}
                    required
                    step="0.01"
                    type="number"
                    value={form.currentBalance}
                  />
                </Field>
                <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                  Le solde affiché dans le tableau et la fiche PDF est calculé à partir des factures ouvertes lorsqu’elles existent. Sinon, le solde saisi ici est utilisé.
                  <CircleDollarSign aria-hidden="true" className="ml-2 inline text-steel-700" size={15} />
                </div>
              </div>
            )}
          </section>

          {formError && (
            <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {formError}
            </p>
          )}

          <footer className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <button
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              disabled={saving}
              onClick={onCancel}
              type="button"
            >
              Annuler
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving && <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />}
              {saving ? 'Enregistrement…' : client ? 'Enregistrer les modifications' : 'Créer le client'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
