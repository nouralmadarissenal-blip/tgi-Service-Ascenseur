import { useMemo, useState } from 'react'
import {
  ArrowUpDown,
  CalendarDays,
  Clock3,
  LoaderCircle,
  MapPin,
  ShieldAlert,
  UserRound,
  Users,
  Wrench,
  X,
} from 'lucide-react'

const TYPES = [
  'Dépannage',
  'Maintenance Préventive',
  'Contrôle Technique',
  'Modernisation',
  'Installation',
]
const PRIORITIES = ['Normale', 'Haute', 'Critique']
const STATUSES = ['Planifiée', 'En cours', 'Terminée', 'Annulée']
const TABS = [
  { id: 'general', label: 'Informations générales', icon: MapPin },
  { id: 'planning', label: 'Planification & assignation', icon: CalendarDays },
  { id: 'report', label: 'Rapport technicien', icon: Wrench },
]
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-steel-500 focus:ring-4 focus:ring-steel-100 disabled:cursor-not-allowed disabled:bg-slate-50'

function getClientName(client) {
  return client.name || client.companyName || client.clientName || 'Client'
}

function getTechnicianName(technician) {
  return technician.name ||
    `${technician.firstName || ''} ${technician.lastName || ''}`.trim() ||
    'Technicien'
}

function Field({ children, label, wide = false }) {
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function normalizeTechnicianIds(values) {
  if (Array.isArray(values.technicianIds) && values.technicianIds.length) {
    return [...new Set(values.technicianIds.filter(Boolean))]
  }
  return values.technicianId ? [values.technicianId] : []
}

export default function InterventionForm({
  clients,
  error,
  initialValues,
  onCancel,
  onSave,
  saving,
  technicians,
}) {
  const [form, setForm] = useState(initialValues)
  const [activeTab, setActiveTab] = useState('general')
  const [formError, setFormError] = useState('')
  const technicianIds = useMemo(() => normalizeTechnicianIds(form), [form])
  const selectedClient = clients.find((client) => client.id === form.clientId)
  const clientElevators = useMemo(
    () => Array.isArray(selectedClient?.elevators)
      ? selectedClient.elevators.map((elevator, index) => ({
          ...elevator,
          id: String(elevator.id || `elevator-${selectedClient.id}-${index}`),
        }))
      : [],
    [selectedClient],
  )
  const selectedElevator = clientElevators.find((elevator) => elevator.id === form.elevatorId)

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setFormError('')
  }

  const toggleTechnician = (technicianId) => {
    setForm((current) => {
      const currentIds = normalizeTechnicianIds(current)
      const nextIds = currentIds.includes(technicianId)
        ? currentIds.filter((id) => id !== technicianId)
        : [...currentIds, technicianId]
      return {
        ...current,
        technicianIds: nextIds,
        technicianId: nextIds[0] || '',
      }
    })
    setFormError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError('')

    const assignedTechnicians = technicians.filter((technician) => technicianIds.includes(technician.id))
    let validationError = ''
    let validationTab = 'general'
    if (!selectedClient) {
      validationError = 'Sélectionnez un client enregistré.'
    } else if (!form.elevatorId || !selectedElevator) {
      validationError = 'Sélectionnez un ascenseur du parc de ce client.'
    } else if (!TYPES.includes(form.type)) {
      validationError = 'Sélectionnez un type d’intervention valide.'
    } else if (!PRIORITIES.includes(form.priority)) {
      validationError = 'Sélectionnez un niveau d’urgence valide.'
    } else if (assignedTechnicians.length !== technicianIds.length || !technicianIds.length) {
      validationError = 'Affectez au moins un technicien disponible dans la liste.'
      validationTab = 'planning'
    } else if (!form.scheduledDate) {
      validationError = 'La date prévue est obligatoire.'
      validationTab = 'planning'
    } else if (!STATUSES.includes(form.status)) {
      validationError = 'Sélectionnez un statut valide.'
      validationTab = 'planning'
    }

    if (validationError) {
      setActiveTab(validationTab)
      setFormError(validationError)
      return
    }

    try {
      await onSave({
        ...form,
        technicianIds,
        technicianId: technicianIds[0],
      })
    } catch (saveError) {
      setFormError(
        saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer l’intervention.',
      )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
      <section
        aria-labelledby="intervention-form-title"
        aria-modal="true"
        className="my-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl animate-slide-up flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-steel-700">
              Bon d’intervention · {form.reference}
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold text-slate-900" id="intervention-form-title">
              {initialValues.id ? 'Modifier l’intervention' : 'Planifier une intervention'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Affectation, planification et compte rendu technique.
            </p>
          </div>
          <button
            aria-label="Fermer le formulaire"
            className="ml-3 shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            disabled={saving}
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        <div
          aria-label="Sections du bon d’intervention"
          className="grid shrink-0 grid-cols-3 gap-1 border-b border-slate-200 px-3 py-2 sm:px-6"
          role="tablist"
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              aria-controls={`intervention-panel-${id}`}
              aria-selected={activeTab === id}
              className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left text-xs font-semibold transition sm:px-3 ${
                activeTab === id
                  ? 'border-steel-100 bg-steel-50 text-steel-800 shadow-sm'
                  : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
              id={`intervention-tab-${id}`}
              key={id}
              onClick={() => setActiveTab(id)}
              role="tab"
              type="button"
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${activeTab === id ? 'bg-white text-steel-700 shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                <Icon aria-hidden="true" size={15} />
              </span>
              <span className="hidden truncate sm:block">{label}</span>
              <span className="truncate sm:hidden">{id === 'general' ? 'Général' : id === 'planning' ? 'Planning' : 'Rapport'}</span>
            </button>
          ))}
        </div>

        <form className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7" onSubmit={handleSubmit}>
          <section
            aria-labelledby={`intervention-tab-${activeTab}`}
            id={`intervention-panel-${activeTab}`}
            role="tabpanel"
            tabIndex={0}
          >
            {activeTab === 'general' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Client *">
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        clientId: event.target.value,
                        elevatorId: '',
                      }))
                    }
                    value={form.clientId}
                  >
                    <option value="">Sélectionner un client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>{getClientName(client)}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Ascenseur concerné *">
                  <select
                    className={inputClass}
                    disabled={!form.clientId || clientElevators.length === 0}
                    onChange={(event) => updateField('elevatorId', event.target.value)}
                    value={form.elevatorId}
                  >
                    <option value="">
                      {!form.clientId
                        ? 'Sélectionnez d’abord un client'
                        : clientElevators.length
                          ? 'Sélectionner un ascenseur'
                          : 'Aucun ascenseur dans le parc'}
                    </option>
                    {clientElevators.map((elevator, index) => (
                      <option key={elevator.id || index} value={elevator.id}>
                        {[elevator.reference, elevator.brand, elevator.type].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </select>
                  {form.clientId && clientElevators.length === 0 && (
                    <span className="mt-1.5 block text-xs leading-5 text-amber-700">
                      Ce client n’a aucun ascenseur détaillé. Ajoutez son équipement dans sa fiche avant de planifier l’intervention.
                    </span>
                  )}
                </Field>
                {selectedClient && (
                  <div className="sm:col-span-2 grid gap-2 rounded-xl border border-steel-100 bg-steel-50/60 p-3 text-xs text-slate-700 sm:grid-cols-2">
                    <p className="flex items-start gap-2">
                      <Users aria-hidden="true" className="mt-0.5 shrink-0 text-steel-700" size={14} />
                      <span>
                        <strong>{getClientName(selectedClient)}</strong>
                        {selectedClient.contactName && ` · ${selectedClient.contactName}`}
                      </span>
                    </p>
                    <p className="flex items-start gap-2">
                      <MapPin aria-hidden="true" className="mt-0.5 shrink-0 text-steel-700" size={14} />
                      <span>
                        {[selectedClient.address, selectedClient.city, selectedClient.postalCode]
                          .filter(Boolean)
                          .join(', ') || 'Adresse non renseignée'}
                      </span>
                    </p>
                  </div>
                )}
                <Field label="Type d’intervention *">
                  <select
                    className={inputClass}
                    onChange={(event) => updateField('type', event.target.value)}
                    value={form.type}
                  >
                    {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </Field>
                <Field label="Niveau d’urgence *">
                  <select
                    className={inputClass}
                    onChange={(event) => updateField('priority', event.target.value)}
                    value={form.priority}
                  >
                    {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                  </select>
                </Field>
                {selectedElevator && (
                  <div className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-950">
                    <ArrowUpDown aria-hidden="true" className="shrink-0 text-blue-700" size={17} />
                    <span>
                      Équipement sélectionné : <strong>{selectedElevator.reference}</strong>
                      {' · '}{selectedElevator.brand} · {selectedElevator.type}
                      {' · '}{selectedElevator.floors ?? '—'} niveaux
                    </span>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'planning' && (
              <div className="space-y-5">
                <fieldset>
                  <legend className="mb-2 text-xs font-semibold text-slate-700">
                    Technicien(s) assigné(s) *
                  </legend>
                  {technicians.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {technicians.map((technician) => {
                        const checked = technicianIds.includes(technician.id)
                        const availability = technician.status || technician.availability || 'Disponible'
                        return (
                          <label
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                              checked
                                ? 'border-steel-300 bg-steel-50 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                            key={technician.id}
                          >
                            <input
                              checked={checked}
                              className="h-4 w-4 accent-blue-700"
                              onChange={() => toggleTechnician(technician.id)}
                              type="checkbox"
                            />
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                              <UserRound aria-hidden="true" size={17} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-800">
                                {getTechnicianName(technician)}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-slate-500">
                                {technician.specialty || 'Technicien'} · {availability}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Aucun technicien n’est enregistré. Créez une fiche technicien avant l’assignation.
                    </p>
                  )}
                  {technicianIds.length > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      {technicianIds.length} technicien{technicianIds.length === 1 ? '' : 's'} sélectionné{technicianIds.length === 1 ? '' : 's'}
                    </p>
                  )}
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Date prévue *">
                    <div className="relative">
                      <CalendarDays
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        size={17}
                      />
                      <input
                        className={`${inputClass} pl-10`}
                        onChange={(event) => updateField('scheduledDate', event.target.value)}
                        type="date"
                        value={form.scheduledDate}
                      />
                    </div>
                  </Field>
                  <Field label="Heure prévue">
                    <div className="relative">
                      <Clock3
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        size={17}
                      />
                      <input
                        className={`${inputClass} pl-10`}
                        onChange={(event) => updateField('scheduledTime', event.target.value)}
                        type="time"
                        value={form.scheduledTime}
                      />
                    </div>
                  </Field>
                  <Field label="Statut *">
                    <select
                      className={inputClass}
                      onChange={(event) => updateField('status', event.target.value)}
                      value={form.status}
                    >
                      {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            )}

            {activeTab === 'report' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Description de la panne signalée" wide>
                  <textarea
                    className={`${inputClass} min-h-28 resize-y`}
                    maxLength={4000}
                    onChange={(event) => updateField('description', event.target.value)}
                    placeholder="Symptômes, contexte et éléments signalés par le client."
                    rows={5}
                    value={form.description}
                  />
                </Field>
                <Field label="Rapport / travaux effectués" wide>
                  <textarea
                    className={`${inputClass} min-h-36 resize-y`}
                    maxLength={8000}
                    onChange={(event) => updateField('actionsPerformed', event.target.value)}
                    placeholder="Diagnostic, réparations, réglages et essais de sécurité réalisés."
                    rows={6}
                    value={form.actionsPerformed}
                  />
                </Field>
                <Field label="Pièces remplacées" wide>
                  <textarea
                    className={`${inputClass} min-h-20 resize-y`}
                    maxLength={3000}
                    onChange={(event) => updateField('replacedPartsText', event.target.value)}
                    placeholder="Référence, désignation et quantité, si applicable."
                    rows={3}
                    value={form.replacedPartsText}
                  />
                </Field>
                <Field label="Heure de début réelle">
                  <input
                    className={inputClass}
                    onChange={(event) => updateField('actualStartTime', event.target.value)}
                    type="time"
                    value={form.actualStartTime}
                  />
                </Field>
                <Field label="Heure de fin réelle">
                  <input
                    className={inputClass}
                    onChange={(event) => updateField('actualEndTime', event.target.value)}
                    type="time"
                    value={form.actualEndTime}
                  />
                </Field>
                <div className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                  <ShieldAlert aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
                  <p>Les pièces sont enregistrées comme déclaration sur la fiche. Leur sortie de stock reste gérée par le flux commercial.</p>
                </div>
              </div>
            )}
          </section>

          {(formError || error) && (
            <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {formError || error}
            </p>
          )}

          <footer className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-between">
            <div className="text-xs text-slate-500">
              Référence : <strong className="text-slate-700">{form.reference}</strong>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
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
                {saving
                  ? 'Enregistrement…'
                  : initialValues.id
                    ? 'Enregistrer les modifications'
                    : 'Créer l’intervention'}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}
