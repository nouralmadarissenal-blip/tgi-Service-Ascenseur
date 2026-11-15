import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileDown,
  LoaderCircle,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import DataTableExportToolbar from '../components/common/DataTableExportToolbar'
import DataTablePagination from '../components/common/DataTablePagination'
import EmptyState from '../components/common/EmptyState'
import SortableTableHeader from '../components/common/SortableTableHeader'
import TableSkeleton from '../components/common/TableSkeleton'
import InterventionForm from '../components/interventions/InterventionForm'
import InterventionPdf from '../components/pdf/InterventionPdf'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'

const STATUSES = ['Planifiée', 'En cours', 'Terminée', 'Annulée']
const PRIORITIES = ['Normale', 'Haute', 'Critique']
const TYPES = [
  'Dépannage',
  'Maintenance Préventive',
  'Contrôle Technique',
  'Modernisation',
  'Installation',
]
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-steel-500 focus:ring-4 focus:ring-steel-100'

const statusStyles = {
  Planifiée: 'border-amber-200 bg-amber-50 text-amber-800',
  'En cours': 'border-blue-200 bg-blue-50 text-blue-800',
  Terminée: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Annulée: 'border-slate-200 bg-slate-100 text-slate-600',
}

const priorityStyles = {
  Normale: 'border-slate-200 bg-slate-100 text-slate-700',
  Haute: 'border-orange-200 bg-orange-100 text-orange-800',
  Critique: 'border-red-300 bg-red-600 text-white shadow-sm shadow-red-900/20',
}

function createReference() {
  return `INT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
}

function getLocalDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function createEmptyIntervention() {
  return {
    reference: createReference(),
    clientId: '',
    elevatorId: '',
    technicianId: '',
    technicianIds: [],
    scheduledDate: getLocalDate(),
    scheduledTime: '09:00',
    actualStartTime: '',
    actualEndTime: '',
    type: 'Dépannage',
    priority: 'Normale',
    status: 'Planifiée',
    description: '',
    actionsPerformed: '',
    replacedPartsText: '',
    timeSpent: '',
  }
}

function getClientName(client) {
  return client?.name || client?.companyName || client?.clientName || 'Client supprimé'
}

function getTechnicianName(technician) {
  return technician?.name ||
    `${technician?.firstName || ''} ${technician?.lastName || ''}`.trim() ||
    'Technicien supprimé'
}

function getTechnicianIds(intervention) {
  if (Array.isArray(intervention.technicianIds) && intervention.technicianIds.length) {
    return [...new Set(intervention.technicianIds.filter(Boolean))]
  }
  return intervention.technicianId ? [intervention.technicianId] : []
}

function getClientElevators(client) {
  return Array.isArray(client?.elevators)
    ? client.elevators.map((elevator, index) => ({
        ...elevator,
        id: String(elevator.id || `elevator-${client.id}-${index}`),
      }))
    : []
}

function normalizeStatus(status) {
  const normalized = String(status || '').trim().toLocaleLowerCase('fr')
  if (['terminée', 'terminee', 'validée', 'validee', 'facturée', 'facturee', 'completed', 'closed'].includes(normalized)) {
    return 'Terminée'
  }
  if (['annulée', 'annulee', 'cancelled', 'canceled'].includes(normalized)) return 'Annulée'
  if (['en cours', 'in progress', 'in_progress', 'ongoing', 'en attente de pièce'].includes(normalized)) {
    return 'En cours'
  }
  return 'Planifiée'
}

function normalizePriority(priority) {
  const normalized = String(priority || '').trim().toLocaleLowerCase('fr')
  if (['critique', 'critical', 'urgent'].includes(normalized)) return 'Critique'
  if (['haute', 'high', 'élevée', 'elevee'].includes(normalized)) return 'Haute'
  return 'Normale'
}

function normalizeType(type) {
  const normalized = String(type || '').trim().toLocaleLowerCase('fr')
  if (normalized.includes('maintenance')) return 'Maintenance Préventive'
  if (normalized.includes('contrôle') || normalized.includes('controle') || normalized.includes('expertise')) {
    return 'Contrôle Technique'
  }
  if (normalized.includes('modernisation')) return 'Modernisation'
  if (normalized.includes('installation')) return 'Installation'
  return 'Dépannage'
}

function getTypeLabel(type) {
  if (type === 'Dépannage') return 'Panne'
  if (type === 'Maintenance Préventive' || type === 'Contrôle Technique') return 'Maintenance'
  return type
}

function getScheduledParts(intervention) {
  const source = intervention.scheduledAt || intervention.scheduledDate || intervention.date || ''
  const text = String(source)
  const scheduledDate = intervention.scheduledDate || text.slice(0, 10)
  const scheduledTime =
    intervention.scheduledTime ||
    (text.includes('T') ? text.slice(11, 16) : '') ||
    intervention.arrivalTime ||
    '09:00'
  const hasNewScheduleField = Boolean(intervention.scheduledTime)
  return {
    scheduledDate,
    scheduledTime,
    actualStartTime:
      intervention.actualStartTime ||
      intervention.startTime ||
      (hasNewScheduleField ? intervention.arrivalTime : '') ||
      '',
    actualEndTime: intervention.actualEndTime || intervention.endTime || intervention.departureTime || '',
  }
}

function getPartsText(intervention) {
  if (typeof intervention.replacedParts === 'string') {
    return intervention.replacedParts || intervention.replacedPartsText || ''
  }
  if (intervention.replacedPartsText) return intervention.replacedPartsText
  const parts = Array.isArray(intervention.replacedParts)
    ? intervention.replacedParts
    : Array.isArray(intervention.parts)
      ? intervention.parts
      : []
  return parts
    .map((part) => [
      part.reference || '',
      part.name || part.designation || '',
      part.quantity == null ? '' : `Qté : ${part.quantity}`,
    ].filter(Boolean).join(' · '))
    .filter(Boolean)
    .join('\n')
}

function getInterventionForm(intervention) {
  return {
    ...createEmptyIntervention(),
    ...intervention,
    reference: intervention.reference || createReference(),
    ...getScheduledParts(intervention),
    technicianIds: getTechnicianIds(intervention),
    technicianId: getTechnicianIds(intervention)[0] || '',
    type: normalizeType(intervention.type || intervention.title || intervention.taskType),
    priority: normalizePriority(intervention.priority || intervention.urgency),
    status: normalizeStatus(intervention.status),
    description: intervention.description || intervention.notes || '',
    actionsPerformed: intervention.actionsPerformed || intervention.workPerformed || '',
    replacedPartsText: getPartsText(intervention),
    timeSpent: String(intervention.timeSpent ?? ''),
  }
}

function getCalculatedHours(startTime, endTime, fallback = 0) {
  if (!startTime || !endTime) {
    const hours = Number(fallback)
    return Number.isFinite(hours) && hours >= 0 ? hours : 0
  }
  const [startHour, startMinute] = startTime.split(':').map(Number)
  const [endHour, endMinute] = endTime.split(':').map(Number)
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return 0
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute)
  if (minutes < 0) minutes += 24 * 60
  return Math.round((minutes / 60) * 100) / 100
}

function formatScheduledDate(intervention) {
  const { scheduledDate, scheduledTime } = getScheduledParts(intervention)
  if (!scheduledDate) return '—'
  const date = new Date(`${scheduledDate}T00:00:00`)
  const formattedDate = Number.isNaN(date.getTime())
    ? scheduledDate
    : date.toLocaleDateString('fr-FR')
  return scheduledTime ? `${formattedDate} · ${scheduledTime}` : formattedDate
}

function formatTechnicianNames(intervention, technicianById) {
  const names = getTechnicianIds(intervention)
    .map((id) => technicianById.get(id))
    .filter(Boolean)
    .map(getTechnicianName)
  if (names.length) return names.join(', ')
  return intervention.technicianName || 'Technicien non renseigné'
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
        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden="true" size={15} />
      </button>
    </div>
  )
}

export default function Interventions() {
  const { data: interventions, loading, error: interventionsError } =
    useFirestoreCollection('interventions')
  const { data: clients, loading: clientsLoading, error: clientsError } =
    useFirestoreCollection('clients')
  const { data: technicians, loading: techniciansLoading, error: techniciansError } =
    useFirestoreCollection('technicians')
  const [query, setQuery] = useState('')
  const [technicianFilter, setTechnicianFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [initialValues, setInitialValues] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [pageError, setPageError] = useState('')
  const [notice, setNotice] = useState('')
  const [pdfRequest, setPdfRequest] = useState(null)
  const [exportingId, setExportingId] = useState('')
  const pdfRef = useRef(null)

  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  )
  const technicianById = useMemo(
    () => new Map(technicians.map((technician) => [technician.id, technician])),
    [technicians],
  )
  const assignmentsLoading = clientsLoading || techniciansLoading
  const dataLoading = loading || assignmentsLoading

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const filteredInterventions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fr')
    return interventions
      .map((intervention) => {
        const client = clientById.get(intervention.clientId)
        const assignedNames = formatTechnicianNames(intervention, technicianById)
        const scheduled = getScheduledParts(intervention)
        const elevator = (Array.isArray(client?.elevators) ? client.elevators : [])
          .find((item) => item.id === intervention.elevatorId)
        return {
          ...intervention,
          __clientName: intervention.clientName || getClientName(client),
          __elevatorReference:
            elevator?.reference ||
            intervention.elevatorReference ||
            intervention.elevatorIdentifier ||
            '—',
          __elevatorBrand: elevator?.brand || intervention.elevatorBrand || '',
          __technicianName: assignedNames,
          __technicianIds: getTechnicianIds(intervention),
          __scheduledDate: scheduled.scheduledDate,
          __scheduledLabel: formatScheduledDate(intervention),
          __type: getTypeLabel(normalizeType(intervention.type || intervention.title || intervention.taskType)),
          __priority: normalizePriority(intervention.priority || intervention.urgency),
          __status: normalizeStatus(intervention.status),
        }
      })
      .filter((intervention) =>
        (!technicianFilter || intervention.__technicianIds.includes(technicianFilter)) &&
        (!statusFilter || intervention.__status === statusFilter) &&
        (!dateFilter || intervention.__scheduledDate === dateFilter),
      )
      .filter((intervention) => {
        if (!normalizedQuery) return true
        return [
          intervention.reference,
          intervention.__clientName,
          intervention.__elevatorReference,
          intervention.__elevatorBrand,
          intervention.__technicianName,
          intervention.__type,
          intervention.__priority,
          intervention.__status,
          intervention.description,
          intervention.actionsPerformed,
          intervention.replacedPartsText,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('fr').includes(normalizedQuery))
      })
  }, [
    clientById,
    dateFilter,
    interventions,
    query,
    statusFilter,
    technicianById,
    technicianFilter,
  ])
  const table = useDataTable(filteredInterventions)

  const summary = useMemo(() => ({
    total: interventions.length,
    planned: interventions.filter((item) => normalizeStatus(item.status) === 'Planifiée').length,
    inProgress: interventions.filter((item) => normalizeStatus(item.status) === 'En cours').length,
    critical: interventions.filter((item) => normalizePriority(item.priority || item.urgency) === 'Critique').length,
  }), [interventions])

  const exportColumns = [
    { label: 'N° Fiche', value: (item) => item.reference || item.id },
    { label: 'Date & heure', value: (item) => item.__scheduledLabel },
    { label: 'Client', value: (item) => item.__clientName },
    { label: 'Ascenseur (repère)', value: (item) => item.__elevatorReference },
    { label: 'Technicien(s)', value: (item) => item.__technicianName },
    { label: 'Type', value: (item) => item.__type },
    { label: 'Urgence', value: (item) => item.__priority },
    { label: 'Statut', value: (item) => item.__status },
  ]

  const clearFilters = () => {
    setQuery('')
    setTechnicianFilter('')
    setStatusFilter('')
    setDateFilter('')
    table.setPage(1)
  }

  const openNew = () => {
    setInitialValues(createEmptyIntervention())
    setPageError('')
    setFormOpen(true)
  }

  const openEdit = (intervention) => {
    setInitialValues(getInterventionForm(intervention))
    setPageError('')
    setFormOpen(true)
  }

  const saveIntervention = async (form) => {
    setSaving(true)
    setPageError('')
    try {
      const client = clientById.get(form.clientId)
      if (!client) throw new Error('Sélectionnez un client enregistré.')
      const elevators = getClientElevators(client)
      const elevator = elevators.find((item) => item.id === form.elevatorId)
      if (!elevator) throw new Error('Sélectionnez un ascenseur du parc actuel de ce client.')

      const technicianIds = [...new Set(
        (Array.isArray(form.technicianIds) ? form.technicianIds : [form.technicianId])
          .filter(Boolean),
      )]
      const assignedTechnicians = technicianIds
        .map((id) => technicianById.get(id))
        .filter(Boolean)
      if (!technicianIds.length || assignedTechnicians.length !== technicianIds.length) {
        throw new Error('Affectez au moins un technicien valide à l’intervention.')
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.scheduledDate || '')) {
        throw new Error('La date prévue est obligatoire et doit être valide.')
      }
      if (!TYPES.includes(form.type) || !PRIORITIES.includes(form.priority) || !STATUSES.includes(form.status)) {
        throw new Error('Vérifiez le type, le niveau d’urgence et le statut de l’intervention.')
      }

      const assignedNames = assignedTechnicians.map(getTechnicianName)
      const startTime = String(form.actualStartTime || '').trim()
      const endTime = String(form.actualEndTime || '').trim()
      const scheduledTime = String(form.scheduledTime || '').trim()
      const completed = form.status === 'Terminée'
      const closed = completed || form.status === 'Annulée'
      const interventionData = {
        reference: String(form.reference || '').trim() || createReference(),
        clientId: client.id,
        clientName: getClientName(client),
        clientContact: client.contactName || client.contactPerson || '',
        clientPhone: client.phone || client.phone1 || '',
        clientAddress: [client.address, client.city, client.postalCode].filter(Boolean).join(', '),
        technicianId: technicianIds[0],
        technicianIds,
        technicianName: assignedNames.join(', '),
        technicianNames: assignedNames,
        elevatorId: elevator.id,
        elevatorReference: String(elevator.reference || ''),
        elevatorIdentifier: String(elevator.reference || ''),
        elevatorBrand: String(elevator.brand || ''),
        elevatorType: String(elevator.type || ''),
        elevatorSnapshot: { ...elevator },
        scheduledDate: form.scheduledDate,
        scheduledTime,
        scheduledAt: scheduledTime ? `${form.scheduledDate}T${scheduledTime}` : form.scheduledDate,
        actualStartTime: startTime,
        actualEndTime: endTime,
        arrivalTime: startTime,
        departureTime: endTime,
        type: form.type,
        title: form.type,
        taskType: form.type,
        priority: form.priority,
        urgency: form.priority,
        description: String(form.description || '').trim(),
        notes: String(form.description || '').trim(),
        actionsPerformed: String(form.actionsPerformed || '').trim(),
        workPerformed: String(form.actionsPerformed || '').trim(),
        replacedParts: [],
        parts: [],
        replacedPartsText: String(form.replacedPartsText || '').trim(),
        timeSpent: getCalculatedHours(startTime, endTime, form.timeSpent),
        status: form.status,
        closed,
        completed,
        updatedAt: serverTimestamp(),
      }

      if (form.id) {
        await updateDoc(doc(db, 'interventions', form.id), interventionData)
      } else {
        await addDoc(collection(db, 'interventions'), {
          ...interventionData,
          createdAt: serverTimestamp(),
        })
      }
      setFormOpen(false)
      setInitialValues(null)
      setNotice(form.id ? 'L’intervention a été mise à jour.' : 'L’intervention a été planifiée.')
    } finally {
      setSaving(false)
    }
  }

  const exportIntervention = async (intervention) => {
    setPageError('')
    setExportingId(intervention.id)
    try {
      const settings = await getDoc(doc(db, 'settings', 'company'))
      const client = clientById.get(intervention.clientId) || {
        name: intervention.clientName,
        address: intervention.clientAddress,
        contactName: intervention.clientContact,
        phone: intervention.clientPhone,
        elevators: [],
      }
      const elevator = getClientElevators(client)
        .find((item) => item.id === intervention.elevatorId)
      const interventionForPdf = {
        ...intervention,
        clientName: intervention.clientName || getClientName(client),
        technicianName: formatTechnicianNames(intervention, technicianById),
        technicianNames: getTechnicianIds(intervention)
          .map((id) => technicianById.get(id))
          .filter(Boolean)
          .map(getTechnicianName),
        elevatorReference:
          elevator?.reference ||
          intervention.elevatorReference ||
          intervention.elevatorIdentifier,
        elevatorBrand: elevator?.brand || intervention.elevatorBrand,
        priority: normalizePriority(intervention.priority || intervention.urgency),
        scheduledDate: getScheduledParts(intervention).scheduledDate,
        scheduledTime: getScheduledParts(intervention).scheduledTime,
        actualStartTime:
          intervention.actualStartTime ||
          (intervention.scheduledTime ? intervention.arrivalTime : ''),
        actualEndTime:
          intervention.actualEndTime ||
          intervention.departureTime ||
          '',
        replacedPartsText: getPartsText(intervention),
      }
      const assignedTechnicians = getTechnicianIds(intervention)
        .map((id) => technicianById.get(id))
        .filter(Boolean)
      setPdfRequest({
        intervention: interventionForPdf,
        client,
        technician: assignedTechnicians[0] || {},
        technicians: assignedTechnicians,
        company: settings.exists() ? settings.data() : {},
      })
    } catch (exportError) {
      setExportingId('')
      setPageError(
        exportError instanceof Error
          ? exportError.message
          : 'Impossible de préparer le PDF de l’intervention.',
      )
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteDoc(doc(db, 'interventions', deleteTarget.id))
      setDeleteTarget(null)
      setNotice(`La fiche ${deleteTarget.reference || ''} a été supprimée.`)
    } catch (removeError) {
      setDeleteError(
        removeError instanceof Error ? removeError.message : 'Impossible de supprimer cette intervention.',
      )
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    if (!pdfRequest || !pdfRef.current) return undefined
    let active = true
    const generatePdf = async () => {
      try {
        const { default: generatePdfDocument } = await import('../utils/pdfEngine')
        const filename = `${String(pdfRequest.intervention.reference || pdfRequest.intervention.id || 'intervention')
          .replace(/[^a-zA-Z0-9_-]+/g, '-')}.pdf`
        await generatePdfDocument(pdfRef.current, filename, pdfRequest.company)
      } catch (exportError) {
        if (active) {
          setPageError(
            exportError instanceof Error
              ? exportError.message
              : 'Impossible de générer le bon d’intervention.',
          )
        }
      } finally {
        if (active) {
          setExportingId('')
          setPdfRequest(null)
        }
      }
    }
    void generatePdf()
    return () => {
      active = false
    }
  }, [pdfRequest])

  const activeFilters = Boolean(query || technicianFilter || statusFilter || dateFilter)
  const pageLoadError = interventionsError || clientsError || techniciansError
  const criticalCount = summary.critical

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <Toast message={notice} onDismiss={() => setNotice('')} />

      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel-700">
            Opérations terrain
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Interventions
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Planifiez les missions, affectez les équipes et suivez leur compte rendu.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:-translate-y-0.5 hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
          disabled={assignmentsLoading}
          onClick={openNew}
          type="button"
        >
          {assignmentsLoading
            ? <LoaderCircle aria-hidden="true" className="animate-spin" size={18} />
            : <Plus aria-hidden="true" size={18} />}
          Planifier une intervention
        </button>
      </header>

      <section aria-label="Synthèse des interventions" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total des fiches', value: summary.total, icon: Wrench, tone: 'bg-steel-50 text-steel-700' },
          { label: 'Planifiées', value: summary.planned, icon: CalendarDays, tone: 'bg-amber-50 text-amber-700' },
          { label: 'En cours', value: summary.inProgress, icon: Clock3, tone: 'bg-blue-50 text-blue-700' },
          { label: 'Urgences critiques', value: criticalCount, icon: ShieldAlert, tone: 'bg-red-50 text-red-700' },
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
              <Wrench aria-hidden="true" size={19} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Planning des interventions</h2>
              <p className="text-xs text-slate-500">
                {filteredInterventions.length} fiche{filteredInterventions.length === 1 ? '' : 's'} affichée{filteredInterventions.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(190px,1fr)_200px_180px_170px]">
            <label className="relative block">
              <span className="sr-only">Rechercher une intervention</span>
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
                placeholder="Rechercher une fiche, un client…"
                type="search"
                value={query}
              />
            </label>
            <select
              aria-label="Filtrer par technicien"
              className={inputClass}
              onChange={(event) => {
                setTechnicianFilter(event.target.value)
                table.setPage(1)
              }}
              value={technicianFilter}
            >
              <option value="">Tous les techniciens</option>
              {technicians.map((technician) => (
                <option key={technician.id} value={technician.id}>{getTechnicianName(technician)}</option>
              ))}
            </select>
            <select
              aria-label="Filtrer par statut"
              className={inputClass}
              onChange={(event) => {
                setStatusFilter(event.target.value)
                table.setPage(1)
              }}
              value={statusFilter}
            >
              <option value="">Tous les statuts</option>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <label>
              <span className="sr-only">Filtrer par date prévue</span>
              <input
                aria-label="Filtrer par date prévue"
                className={inputClass}
                onChange={(event) => {
                  setDateFilter(event.target.value)
                  table.setPage(1)
                }}
                type="date"
                value={dateFilter}
              />
            </label>
          </div>
          <DataTableExportToolbar
            columns={exportColumns}
            rows={table.sortedItems}
            title="Liste des interventions"
          />
        </div>

        {(pageLoadError || pageError) && (
          <p className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6" role="alert">
            {pageError || pageLoadError}
          </p>
        )}

        {dataLoading ? (
          <TableSkeleton columns={9} minWidth={1280} />
        ) : filteredInterventions.length === 0 ? (
          <EmptyState
            actionLabel={activeFilters ? 'Effacer les filtres' : 'Créer une intervention'}
            description={activeFilters
              ? 'Aucune intervention ne correspond aux critères sélectionnés.'
              : 'Planifiez une mission, affectez un technicien et choisissez un ascenseur du parc client.'}
            icon={Wrench}
            onAction={activeFilters ? clearFilters : openNew}
            title={activeFilters ? 'Aucune intervention trouvée' : 'Aucune intervention enregistrée'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <SortableTableHeader className="px-5 py-3.5" columnKey="reference" label="N° Fiche" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__scheduledDate" label="Date & heure" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__clientName" label="Client" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__elevatorReference" label="Ascenseur (repère)" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__technicianName" label="Technicien(s)" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__type" label="Type" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__priority" label="Urgence" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__status" label="Statut" {...table} />
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((intervention) => {
                  const status = intervention.__status
                  const priority = intervention.__priority
                  return (
                    <Fragment key={intervention.id}>
                      <tr className="transition hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-5 py-4">
                          <p className="text-sm font-semibold text-slate-900">
                            {intervention.reference || `INT-${intervention.id.slice(-6)}`}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                          {intervention.__scheduledLabel}
                        </td>
                        <td className="px-5 py-4">
                          <p className="max-w-48 truncate text-sm font-medium text-slate-800">
                            {intervention.__clientName}
                          </p>
                          {intervention.clientContact && (
                            <p className="mt-1 max-w-48 truncate text-xs text-slate-500">
                              {intervention.clientContact}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-slate-800">
                            {intervention.__elevatorReference}
                          </p>
                          {intervention.__elevatorBrand && (
                            <p className="mt-1 text-xs text-slate-500">{intervention.__elevatorBrand}</p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex max-w-52 items-center gap-1.5 text-sm text-slate-700">
                            <Users aria-hidden="true" className="shrink-0 text-slate-400" size={15} />
                            <span className="truncate">{intervention.__technicianName}</span>
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="whitespace-nowrap rounded-full border border-steel-100 bg-steel-50 px-2.5 py-1 text-xs font-semibold text-steel-800">
                            {intervention.__type}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${priorityStyles[priority]}`}>
                            {priority === 'Critique' && <AlertCircle aria-hidden="true" className="mr-1 inline" size={13} />}
                            {priority}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[status]}`}>
                            {status === 'Terminée'
                              ? <CheckCircle2 aria-hidden="true" size={13} />
                              : status === 'En cours'
                                ? <Clock3 aria-hidden="true" size={13} />
                                : status === 'Annulée'
                                  ? <X aria-hidden="true" size={13} />
                                  : <CalendarDays aria-hidden="true" size={13} />}
                            {status}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-1">
                            <button
                              aria-label={`Exporter la fiche PDF ${intervention.reference || ''}`}
                              className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-wait disabled:opacity-50"
                              disabled={exportingId === intervention.id}
                              onClick={() => void exportIntervention(intervention)}
                              title="Exporter la fiche PDF"
                              type="button"
                            >
                              {exportingId === intervention.id
                                ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                                : <FileDown aria-hidden="true" size={16} />}
                            </button>
                            <button
                              aria-label={`Voir ou modifier la fiche ${intervention.reference || ''}`}
                              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-steel-700 transition hover:bg-steel-50"
                              onClick={() => openEdit(intervention)}
                              title="Voir / Modifier"
                              type="button"
                            >
                              <Wrench aria-hidden="true" size={15} />
                              <span className="hidden xl:inline">Voir / Modifier</span>
                            </button>
                            <button
                              aria-label={`Supprimer la fiche ${intervention.reference || ''}`}
                              className="rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-700"
                              onClick={() => {
                                setDeleteError('')
                                setDeleteTarget(intervention)
                              }}
                              title="Supprimer"
                              type="button"
                            >
                              <Trash2 aria-hidden="true" size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!dataLoading && filteredInterventions.length > 0 && <DataTablePagination {...table} />}
      </section>

      {formOpen && initialValues && (
        <InterventionForm
          clients={clients}
          error=""
          initialValues={initialValues}
          onCancel={() => {
            if (!saving) {
              setFormOpen(false)
              setInitialValues(null)
            }
          }}
          onSave={saveIntervention}
          saving={saving}
          technicians={technicians}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section
            aria-describedby="delete-intervention-description"
            aria-labelledby="delete-intervention-title"
            aria-modal="true"
            className="w-full max-w-md animate-slide-up rounded-2xl border border-white/70 bg-white p-6 shadow-2xl"
            role="alertdialog"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-700">
              <Trash2 aria-hidden="true" size={20} />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900" id="delete-intervention-title">
              Supprimer cette fiche ?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600" id="delete-intervention-description">
              La fiche <strong>{deleteTarget.reference || 'sans numéro'}</strong> sera supprimée. Cette action est irréversible.
            </p>
            {deleteError && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {deleteError}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                type="button"
              >
                Annuler
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
                disabled={deleting}
                onClick={() => void confirmDelete()}
                type="button"
              >
                {deleting && <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />}
                {deleting ? 'Suppression…' : 'Supprimer la fiche'}
              </button>
            </div>
          </section>
        </div>
      )}

      {pdfRequest && (
        <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 -z-10">
          <InterventionPdf
            client={pdfRequest.client}
            company={pdfRequest.company}
            intervention={pdfRequest.intervention}
            ref={pdfRef}
            technician={pdfRequest.technician}
            technicians={pdfRequest.technicians}
          />
        </div>
      )}
    </main>
  )
}
