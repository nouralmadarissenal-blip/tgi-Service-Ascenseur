import { useState } from 'react'
import { Plus } from 'lucide-react'
import { getDefaultClauses } from './contractClauses'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'

const contractTypes = [
  { value: 'installation', label: 'Contrat d’installation' },
  { value: 'intervention', label: 'Contrat de maintenance' },
]

const contractVersions = [
  { value: 'simple', label: 'Version simple' },
  { value: 'complete', label: 'Version complète (clauses détaillées)' },
]

function defaultPaymentTerms(type) {
  return type === 'installation'
    ? '30 % à la commande, solde à la réception des travaux.'
    : 'Facturation selon la périodicité définie aux conditions particulières.'
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

export default function ContractForm({
  clients,
  contract,
  error,
  onCancel,
  onChange,
  onSubmit,
  saving,
}) {
  const [amendmentDraft, setAmendmentDraft] = useState('')
  const setField = (name, value) => onChange((current) => ({ ...current, [name]: value }))

  const changeType = (type) => {
    onChange((current) => ({
      ...current,
      type,
      clauses: getDefaultClauses(type, current.version),
      paymentTerms: defaultPaymentTerms(type),
      billingFrequency: type === 'installation' ? 'Unique' : 'Trimestriel',
    }))
  }

  const changeVersion = (version) => {
    onChange((current) => ({
      ...current,
      version,
      clauses: getDefaultClauses(current.type, version),
    }))
  }

  const amendments = Array.isArray(contract.amendments) ? contract.amendments : []

  const addAmendment = () => {
    const text = amendmentDraft.trim()
    if (!text) return
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    setField('amendments', [...amendments, { date, text }])
    setAmendmentDraft('')
  }

  const selectedClient = clients.find((client) => client.id === contract.clientId)
  const elevators = Array.isArray(selectedClient?.elevators) ? selectedClient.elevators : []
  const selectedElevator = elevators.find((elevator, index) =>
    getElevatorId(elevator, index) === contract.elevatorId ||
    (contract.elevatorReference && elevator.reference === contract.elevatorReference),
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-6">
      <section
        aria-labelledby="contract-form-title"
        aria-modal="true"
        className="my-auto w-full max-w-4xl rounded-2xl border border-white bg-white/95 shadow-2xl shadow-slate-950/25 backdrop-blur-xl"
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7">
          <div>
            <h2 className="text-lg font-semibold text-slate-900" id="contract-form-title">
              {contract.id ? 'Modifier le contrat' : 'Nouveau contrat'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Choisissez le type et le niveau de détail du document.
            </p>
          </div>
          <button
            aria-label="Fermer"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            onClick={onCancel}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <form className="max-h-[calc(100vh-160px)] space-y-5 overflow-y-auto px-5 py-5 sm:px-7" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Type de contrat *</span>
              <select className={inputClass} onChange={(event) => changeType(event.target.value)} value={contract.type}>
                {contractTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Version *</span>
              <select className={inputClass} onChange={(event) => changeVersion(event.target.value)} value={contract.version}>
                {contractVersions.map((version) => <option key={version.value} value={version.value}>{version.label}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Référence *</span>
              <input className={inputClass} onChange={(event) => setField('reference', event.target.value)} required value={contract.reference} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Client *</span>
              <select
                className={inputClass}
                onChange={(event) => {
                  const client = clients.find((item) => item.id === event.target.value)
                  onChange((current) => ({
                    ...current,
                    clientId: event.target.value,
                    siteAddress: client?.address || '',
                    elevatorId: '',
                    elevatorReference: '',
                    elevatorBrand: '',
                    elevatorType: '',
                  }))
                }}
                required
                value={contract.clientId}
              >
                <option value="">Sélectionner un client</option>
                {!selectedClient && contract.clientId && (
                  <option value={contract.clientId}>{contract.clientName || 'Client associé au contrat'}</option>
                )}
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{getClientName(client)}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Ascenseur concerné</span>
              <select
                className={inputClass}
                disabled={!selectedClient || elevators.length === 0}
                onChange={(event) => {
                  const elevator = elevators.find((item, index) => getElevatorId(item, index) === event.target.value)
                  onChange((current) => ({
                    ...current,
                    elevatorId: elevator ? event.target.value : '',
                    elevatorReference: elevator?.reference || '',
                    elevatorBrand: elevator?.brand || '',
                    elevatorType: elevator?.type || '',
                  }))
                }}
                required={elevators.length > 0}
                value={contract.elevatorId || ''}
              >
                <option value="">
                  {!selectedClient ? 'Sélectionnez un client d’abord' : 'Sélectionner un ascenseur'}
                </option>
                {contract.elevatorId && !selectedElevator && (
                  <option value={contract.elevatorId}>
                    {contract.elevatorReference || 'Ascenseur associé au contrat'}
                  </option>
                )}
                {elevators.map((elevator, index) => (
                  <option key={getElevatorId(elevator, index)} value={getElevatorId(elevator, index)}>
                    {getElevatorLabel(elevator)}
                  </option>
                ))}
              </select>
              {selectedClient && elevators.length === 0 && (
                <span className="mt-1 block text-xs text-slate-500">
                  Aucun ascenseur n’est enregistré dans le parc de ce client.
                </span>
              )}
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Objet / équipement *</span>
              <input
                className={inputClass}
                onChange={(event) => setField('subject', event.target.value)}
                placeholder="Ex. Installation d’un ascenseur électrique"
                required
                value={contract.subject}
              />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Adresse du site</span>
              <input className={inputClass} onChange={(event) => setField('siteAddress', event.target.value)} value={contract.siteAddress} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Date de début *</span>
              <input className={inputClass} onChange={(event) => setField('startDate', event.target.value)} required type="date" value={contract.startDate} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Date de fin *</span>
              <input className={inputClass} min={contract.startDate || undefined} onChange={(event) => setField('endDate', event.target.value)} required type="date" value={contract.endDate} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Montant total HT (MAD) *</span>
              <input className={inputClass} min="0" onChange={(event) => setField('priceHT', event.target.value)} required step="0.01" type="number" value={contract.priceHT} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">TVA (%)</span>
              <input className={inputClass} max="100" min="0" onChange={(event) => setField('taxRate', event.target.value)} step="0.01" type="number" value={contract.taxRate} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Durée de garantie</span>
              <input className={inputClass} onChange={(event) => setField('warranty', event.target.value)} placeholder="Ex. 12 mois" value={contract.warranty} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Délai de prise en charge</span>
              <input className={inputClass} onChange={(event) => setField('responseTime', event.target.value)} placeholder="Ex. sous 24 heures ouvrées" value={contract.responseTime} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">SLA · délai maximum garanti *</span>
              <input className={inputClass} onChange={(event) => setField('slaResponseTime', event.target.value)} placeholder="Ex. 2h, 4h ou 24h" required value={contract.slaResponseTime || ''} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Échéancier de facturation *</span>
              <select className={inputClass} onChange={(event) => setField('billingFrequency', event.target.value)} required value={contract.billingFrequency || 'Trimestriel'}>
                {['Unique', 'Mensuel', 'Trimestriel', 'Annuel'].map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <input checked={contract.autoRenewal === true} className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500" onChange={(event) => setField('autoRenewal', event.target.checked)} type="checkbox" />
              <span className="text-sm font-medium text-slate-700">Tacite reconduction</span>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Préavis avant échéance (mois) *</span>
              <input className={inputClass} max="24" min="0" onChange={(event) => setField('noticeMonths', event.target.value)} required step="1" type="number" value={contract.noticeMonths ?? '3'} />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Périmètre des prestations *</span>
              <textarea
                className={`${inputClass} min-h-24 resize-y`}
                onChange={(event) => setField('scope', event.target.value)}
                required
                value={contract.scope}
              />
            </label>
            <section className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Historique des avenants</h3>
                  <p className="mt-1 text-xs text-slate-500">Journalisez les modifications apportées après création du contrat.</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  {amendments.length} entrée{amendments.length === 1 ? '' : 's'}
                </span>
              </div>
              {amendments.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {amendments.map((amendment, index) => {
                    const text = typeof amendment === 'string'
                      ? amendment
                      : amendment.text || amendment.note || ''
                    const date = typeof amendment === 'string' ? '' : amendment.date || ''
                    return (
                      <li className="rounded-lg border border-slate-200 bg-white px-3 py-2.5" key={`${date}-${index}`}>
                        <p className="text-xs font-semibold text-slate-500">{date || `Avenant ${index + 1}`}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{text}</p>
                      </li>
                    )
                  })}
                </ul>
              )}
              <div className="mt-3 space-y-2">
                <textarea className={`${inputClass} min-h-20 resize-y`} onChange={(event) => setAmendmentDraft(event.target.value)} placeholder="Note ou contenu de l’avenant…" value={amendmentDraft} />
                <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50" disabled={!amendmentDraft.trim()} onClick={addAmendment} type="button">
                  <Plus size={14} /> Ajouter à l’historique
                </button>
              </div>
            </section>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Modalités de règlement *</span>
              <textarea
                className={`${inputClass} min-h-20 resize-y`}
                onChange={(event) => setField('paymentTerms', event.target.value)}
                required
                value={contract.paymentTerms}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">État du contrat</span>
              <select className={inputClass} onChange={(event) => setField('status', event.target.value)} value={contract.status}>
                {['Brouillon', 'À signer', 'Actif', 'Terminé', 'Résilié'].map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <div className="flex items-end text-xs leading-5 text-slate-500">
              Modèle à adapter et à faire valider avant signature.
            </div>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Clauses contractuelles · modifiables
              </span>
              <textarea
                className={`${inputClass} min-h-72 resize-y font-mono text-xs leading-6`}
                onChange={(event) => setField('clauses', event.target.value)}
                required
                value={contract.clauses}
              />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Conditions générales de vente · modifiables
              </span>
              <textarea
                className={`${inputClass} min-h-40 resize-y text-xs leading-6`}
                onChange={(event) => setField('generalConditions', event.target.value)}
                placeholder="Conditions préremplies depuis les paramètres de la société…"
                value={contract.generalConditions || ''}
              />
            </label>
          </div>

          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              onClick={onCancel}
              type="button"
            >
              Annuler
            </button>
            <button
              className="rounded-xl bg-blue-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? 'Enregistrement…' : contract.id ? 'Enregistrer' : 'Créer le contrat'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
