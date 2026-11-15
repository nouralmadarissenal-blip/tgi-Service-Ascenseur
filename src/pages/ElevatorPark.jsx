import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowUpDown,
  Building2,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  Search,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react'
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import DataTableExportToolbar from '../components/common/DataTableExportToolbar'
import DataTablePagination from '../components/common/DataTablePagination'
import EmptyState from '../components/common/EmptyState'
import SortableTableHeader from '../components/common/SortableTableHeader'
import TableSkeleton from '../components/common/TableSkeleton'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'

const KNOWN_TYPES = ['Électrique', 'Hydraulique', 'Monte-charge']
const EDITABLE_STATUSES = ['En marche', 'En panne', 'En travaux', 'À l’arrêt']
const FILTER_STATUSES = ['En marche', 'En panne', 'En travaux / Maintenance', 'À l’arrêt', 'Non renseigné']
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-steel-500 focus:ring-4 focus:ring-steel-100 disabled:cursor-not-allowed disabled:bg-slate-50'

const statusStyles = {
  running: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  fault: 'border-red-300 bg-red-600 text-white shadow-sm shadow-red-900/20',
  maintenance: 'border-orange-200 bg-orange-100 text-orange-800',
  stopped: 'border-amber-200 bg-amber-50 text-amber-800',
  unknown: 'border-slate-200 bg-slate-100 text-slate-600',
}

function getClientName(client) {
  return client.name || client.companyName || client.clientName || 'Client sans nom'
}

function getStatusKey(status) {
  const normalized = String(status || '').trim().toLocaleLowerCase('fr')
  if (['en marche', 'en service', 'opérationnel', 'operationnel', 'fonctionnel'].includes(normalized)) {
    return 'running'
  }
  if (['en panne', 'panne', 'hors service', 'défaillant', 'defaillant'].includes(normalized)) {
    return 'fault'
  }
  if (['en travaux', 'maintenance', 'en maintenance', 'en travaux / maintenance'].includes(normalized)) {
    return 'maintenance'
  }
  if (["à l’arrêt", "à l'arrêt", 'arrêté', 'arrete'].includes(normalized)) {
    return 'stopped'
  }
  return 'unknown'
}

function getStatusLabel(status) {
  const key = getStatusKey(status)
  if (key === 'running') return 'En marche'
  if (key === 'fault') return 'En panne'
  if (key === 'maintenance') return 'En travaux / Maintenance'
  if (key === 'stopped') return 'À l’arrêt'
  return 'Non renseigné'
}

function getEditableStatus(status) {
  const key = getStatusKey(status)
  if (key === 'running') return 'En marche'
  if (key === 'fault') return 'En panne'
  if (key === 'maintenance') return 'En travaux'
  if (key === 'stopped') return 'À l’arrêt'
  return 'En marche'
}

function getStatusIcon(status) {
  const key = getStatusKey(status)
  if (key === 'running') return CheckCircle2
  if (key === 'fault') return AlertCircle
  if (key === 'maintenance') return Wrench
  if (key === 'stopped') return ShieldAlert
  return AlertCircle
}

function normalizeElevatorType(type) {
  const value = String(type || '').trim()
  return value || 'Non renseigné'
}

function Toast({ message, onDismiss }) {
  if (!message) return null
  return (
    <div
      className="fixed right-4 top-24 z-[70] flex max-w-sm items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-xl shadow-slate-900/10 animate-slide-up"
      role="status"
    >
      <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600" size={18} />
      <p className="flex-1 text-sm font-medium text-slate-800">{message}</p>
      <button
        aria-label="Fermer la notification"
        className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden="true" size={15} />
      </button>
    </div>
  )
}

function ElevatorStatusModal({ elevator, onCancel, onSave, saving, error }) {
  const [status, setStatus] = useState(() => getEditableStatus(elevator.status))

  const handleSubmit = (event) => {
    event.preventDefault()
    void onSave(status)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <section
        aria-describedby="elevator-status-description"
        aria-labelledby="elevator-status-title"
        aria-modal="true"
        className="w-full max-w-lg animate-slide-up overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-steel-700">
              Parc d’ascenseurs
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900" id="elevator-status-title">
              Modifier l’état
            </h2>
            <p className="mt-1 text-xs text-slate-500" id="elevator-status-description">
              {elevator.reference} · {elevator.clientName}
            </p>
          </div>
          <button
            aria-label="Fermer"
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            disabled={saving}
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <form className="space-y-5 p-5 sm:p-6" onSubmit={handleSubmit}>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Équipement</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {elevator.reference} · {elevator.brand || 'Marque non renseignée'}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {[elevator.type, elevator.city, elevator.address].filter(Boolean).join(' · ') || 'Informations complémentaires non renseignées'}
            </p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Nouvel état *</span>
            <select
              className={inputClass}
              onChange={(event) => setStatus(event.target.value)}
              value={status}
            >
              {EDITABLE_STATUSES.map((option) => (
                <option key={option} value={option}>{option === 'En travaux' ? 'En travaux / Maintenance' : option}</option>
              ))}
            </select>
          </label>
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
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
              disabled={saving || status === getEditableStatus(elevator.status)}
              type="submit"
            >
              {saving && <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />}
              {saving ? 'Mise à jour…' : 'Enregistrer l’état'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}

export default function ElevatorPark() {
  const { data: clients, loading, error: loadError } = useFirestoreCollection('clients')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selectedElevator, setSelectedElevator] = useState(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [pageError, setPageError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const elevators = useMemo(
    () => clients.flatMap((client) =>
      (Array.isArray(client.elevators) ? client.elevators : []).map((elevator, index) => {
        const address = String(client.address || '').trim()
        const city = String(client.city || '').trim()
        return {
          ...elevator,
          id: String(elevator.id || `${client.id}-elevator-${index}`),
          elevatorId: elevator.id == null ? '' : String(elevator.id),
          clientId: client.id,
          clientName: getClientName(client),
          clientAddress: address,
          city,
          addressLabel: [address, city].filter(Boolean).join(', ') || 'Adresse non renseignée',
          reference: String(elevator.reference || `ASC-${String(index + 1).padStart(2, '0')}`),
          brand: String(elevator.brand || ''),
          type: normalizeElevatorType(elevator.type),
          floors: elevator.floors ?? '',
          status: String(elevator.status || ''),
          statusLabel: getStatusLabel(elevator.status),
          statusKey: getStatusKey(elevator.status),
          elevatorIndex: index,
          identityReference: String(elevator.reference || ''),
        }
      }),
    ),
    [clients],
  )

  const types = useMemo(
    () => [...new Set([...KNOWN_TYPES, ...elevators.map((elevator) => elevator.type)]
      .filter((type) => type && type !== 'Non renseigné'))]
      .sort((first, second) => first.localeCompare(second, 'fr')),
    [elevators],
  )

  const filteredElevators = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fr')
    return elevators
      .filter((elevator) =>
        (!statusFilter || elevator.statusLabel === statusFilter) &&
        (!clientFilter || elevator.clientId === clientFilter) &&
        (!typeFilter || elevator.type === typeFilter),
      )
      .filter((elevator) => {
        if (!normalizedQuery) return true
        return [
          elevator.reference,
          elevator.clientName,
          elevator.addressLabel,
          elevator.brand,
          elevator.type,
          elevator.floors,
          elevator.statusLabel,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('fr').includes(normalizedQuery))
      })
  }, [clientFilter, elevators, query, statusFilter, typeFilter])
  const table = useDataTable(filteredElevators)

  const summary = useMemo(() => ({
    total: elevators.length,
    running: elevators.filter((elevator) => elevator.statusKey === 'running').length,
    fault: elevators.filter((elevator) => elevator.statusKey === 'fault').length,
    maintenance: elevators.filter((elevator) => elevator.statusKey === 'maintenance').length,
  }), [elevators])

  const exportColumns = [
    { label: 'Repère', key: 'reference' },
    { label: 'Client propriétaire', key: 'clientName' },
    { label: 'Adresse / Ville', key: 'addressLabel' },
    { label: 'Marque', key: 'brand' },
    { label: 'Type', key: 'type' },
    { label: 'Niveaux', key: 'floors' },
    { label: 'État actuel', key: 'statusLabel' },
  ]

  const clearFilters = () => {
    setQuery('')
    setStatusFilter('')
    setClientFilter('')
    setTypeFilter('')
    table.setPage(1)
  }

  const openStatusModal = (elevator) => {
    setSelectedElevator(elevator)
    setModalError('')
  }

  const saveStatus = async (nextStatus) => {
    if (!selectedElevator || !EDITABLE_STATUSES.includes(nextStatus)) {
      setModalError('Sélectionnez un état valide.')
      return
    }

    setSaving(true)
    setModalError('')
    setPageError('')
    try {
      const clientRef = doc(db, 'clients', selectedElevator.clientId)
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(clientRef)
        if (!snapshot.exists()) {
          throw new Error('Le client propriétaire de cet ascenseur n’existe plus.')
        }
        const currentElevators = snapshot.data().elevators
        if (!Array.isArray(currentElevators)) {
          throw new Error('Le parc d’ascenseurs de ce client a été modifié. Rechargez la page.')
        }

        let targetIndex = currentElevators.findIndex(
          (item) => selectedElevator.elevatorId && String(item.id || '') === selectedElevator.elevatorId,
        )
        if (
          targetIndex < 0 &&
          currentElevators[selectedElevator.elevatorIndex] &&
          String(currentElevators[selectedElevator.elevatorIndex].reference || '') === selectedElevator.identityReference
        ) {
          targetIndex = selectedElevator.elevatorIndex
        }
        if (targetIndex < 0 && !selectedElevator.elevatorId) {
          const matchingIndexes = currentElevators
            .map((item, index) => ({ item, index }))
            .filter(({ item }) =>
              String(item.reference || '') === selectedElevator.identityReference &&
              String(item.brand || '') === selectedElevator.brand,
            )
          if (matchingIndexes.length === 1) targetIndex = matchingIndexes[0].index
        }
        if (targetIndex < 0) {
          throw new Error('Cet ascenseur a changé depuis le chargement. Rechargez la page puis réessayez.')
        }

        const updatedElevators = currentElevators.map((item, index) =>
          index === targetIndex ? { ...item, status: nextStatus } : item,
        )
        transaction.update(clientRef, {
          elevators: updatedElevators,
          updatedAt: serverTimestamp(),
        })
      })
      setSelectedElevator(null)
      setNotice(`État de ${selectedElevator.reference} mis à jour : ${nextStatus}.`)
    } catch (saveError) {
      setModalError(
        saveError instanceof Error ? saveError.message : 'Impossible de mettre à jour l’état.',
      )
    } finally {
      setSaving(false)
    }
  }

  const activeFilters = Boolean(query || statusFilter || clientFilter || typeFilter)

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <Toast message={notice} onDismiss={() => setNotice('')} />

      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel-700">
            Asset management · Exploitation
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Parc d’Ascenseurs
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Vue centralisée des équipements liés aux clients et à leurs sites.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-xl border border-steel-100 bg-white/80 px-3.5 py-2.5 text-xs font-semibold text-steel-800 shadow-sm sm:self-auto">
          <Building2 aria-hidden="true" size={16} />
          {summary.total} équipement{summary.total === 1 ? '' : 's'}
        </div>
      </header>

      <section aria-label="Synthèse du parc" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Équipements recensés', value: summary.total, icon: Building2, tone: 'bg-steel-50 text-steel-700' },
          { label: 'En marche', value: summary.running, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
          { label: 'En panne', value: summary.fault, icon: AlertCircle, tone: 'bg-red-50 text-red-700' },
          { label: 'En travaux / maintenance', value: summary.maintenance, icon: Wrench, tone: 'bg-orange-50 text-orange-700' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <article
            className="rounded-2xl border border-white bg-white/85 p-4 shadow-sm ring-1 ring-slate-200/70 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md"
            key={label}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
                <Icon aria-hidden="true" size={18} />
              </span>
            </div>
            <p className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{value}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-white bg-white/90 shadow-xl shadow-slate-900/[0.04] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="space-y-4 border-b border-slate-100 p-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-steel-50 text-steel-700">
              <ArrowUpDown aria-hidden="true" size={19} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Inventaire des équipements</h2>
              <p className="text-xs text-slate-500">
                {filteredElevators.length} équipement{filteredElevators.length === 1 ? '' : 's'} affiché{filteredElevators.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(190px,1fr)_190px_220px_200px]">
            <label className="relative block">
              <span className="sr-only">Rechercher dans le parc</span>
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={17}
              />
              <input
                className={`${inputClass} pl-10`}
                onChange={(event) => {
                  setQuery(event.target.value)
                  table.setPage(1)
                }}
                placeholder="Rechercher repère, marque, adresse…"
                type="search"
                value={query}
              />
            </label>
            <select
              aria-label="Filtrer par état"
              className={inputClass}
              onChange={(event) => {
                setStatusFilter(event.target.value)
                table.setPage(1)
              }}
              value={statusFilter}
            >
              <option value="">Tous les états</option>
              {FILTER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select
              aria-label="Filtrer par client"
              className={inputClass}
              onChange={(event) => {
                setClientFilter(event.target.value)
                table.setPage(1)
              }}
              value={clientFilter}
            >
              <option value="">Tous les clients</option>
              {[...clients]
                .sort((first, second) => getClientName(first).localeCompare(getClientName(second), 'fr'))
                .map((client) => (
                  <option key={client.id} value={client.id}>{getClientName(client)}</option>
                ))}
            </select>
            <select
              aria-label="Filtrer par type d’ascenseur"
              className={inputClass}
              onChange={(event) => {
                setTypeFilter(event.target.value)
                table.setPage(1)
              }}
              value={typeFilter}
            >
              <option value="">Tous les types</option>
              {types.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <DataTableExportToolbar
            columns={exportColumns}
            rows={table.sortedItems}
            title="Parc global des ascenseurs"
          />
        </div>

        {(pageError || loadError) && (
          <p className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6" role="alert">
            {pageError || loadError}
          </p>
        )}

        {loading ? (
          <TableSkeleton columns={8} minWidth={1180} />
        ) : filteredElevators.length === 0 ? (
          <EmptyState
            actionLabel={activeFilters ? 'Effacer les filtres' : undefined}
            description={activeFilters
              ? 'Aucun ascenseur ne correspond aux critères sélectionnés.'
              : clients.length
                ? 'Les fiches clients ne contiennent pas encore d’ascenseurs détaillés.'
                : 'Ajoutez des clients et renseignez leur parc d’ascenseurs pour voir les équipements ici.'}
            icon={Building2}
            onAction={activeFilters ? clearFilters : undefined}
            title={activeFilters ? 'Aucun ascenseur trouvé' : 'Parc vide'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <SortableTableHeader className="px-5 py-3.5" columnKey="reference" label="Repère" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="clientName" label="Client propriétaire" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="addressLabel" label="Adresse / Ville" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="brand" label="Marque" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="type" label="Type" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="floors" label="Niveaux" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="statusLabel" label="État actuel" {...table} />
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((elevator) => {
                  const StatusIcon = getStatusIcon(elevator.status)
                  return (
                    <Fragment key={`${elevator.clientId}:${elevator.id}:${elevator.elevatorIndex}`}>
                      <tr className="transition hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-5 py-4">
                          <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-steel-50 text-steel-700">
                              <ArrowUpDown aria-hidden="true" size={15} />
                            </span>
                            {elevator.reference}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="max-w-52 truncate text-sm font-semibold text-slate-800">
                            {elevator.clientName}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex max-w-64 items-start gap-1.5 text-xs leading-5 text-slate-600">
                            <MapPin aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400" size={14} />
                            <span>{elevator.addressLabel}</span>
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">{elevator.brand || '—'}</td>
                        <td className="px-5 py-4">
                          <span className="whitespace-nowrap rounded-full border border-steel-100 bg-steel-50 px-2.5 py-1 text-xs font-semibold text-steel-800">
                            {elevator.type}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                          {elevator.floors === '' ? '—' : elevator.floors}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[elevator.statusKey]}`}>
                            <StatusIcon aria-hidden="true" size={13} />
                            {elevator.statusLabel}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-steel-200 hover:bg-steel-50 hover:text-steel-800"
                            onClick={() => openStatusModal(elevator)}
                            type="button"
                          >
                            <Wrench aria-hidden="true" size={14} />
                            <span>Changer l’état</span>
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filteredElevators.length > 0 && <DataTablePagination {...table} />}
      </section>

      {selectedElevator && (
        <ElevatorStatusModal
          elevator={selectedElevator}
          error={modalError}
          onCancel={() => {
            if (!saving) {
              setSelectedElevator(null)
              setModalError('')
            }
          }}
          onSave={saveStatus}
          saving={saving}
        />
      )}
    </main>
  )
}
