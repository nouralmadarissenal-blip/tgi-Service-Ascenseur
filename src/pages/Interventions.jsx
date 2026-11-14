import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ClipboardList,
  FileDown,
  Plus,
  Search,
  Pencil,
  Trash2,
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
import SortableTableHeader from '../components/common/SortableTableHeader'
import InterventionPdf from '../components/pdf/InterventionPdf'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'

const STATUSES = ['Planifiée', 'En cours', 'En attente de pièce', 'Terminée', 'Validée']
const INTERVENTION_TYPES = [
  'Maintenance préventive',
  'Dépannage',
  'Installation',
  'Expertise',
]
const STEPS = [
  { title: 'Localisation & affectation', description: 'Client, équipement, technicien et horaires' },
  { title: 'Diagnostic & travaux', description: 'Nature de la mission et résolution' },
  { title: 'Pièces de rechange', description: 'Déclarer les pièces utilisées' },
  { title: 'Clôture', description: 'État de l’intervention' },
]
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'

const statusStyle = {
  Planifiée: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  'En attente': 'bg-amber-50 text-amber-700 ring-amber-600/20',
  'En attente de pièce': 'bg-orange-50 text-orange-700 ring-orange-600/20',
  'En cours': 'bg-blue-50 text-blue-700 ring-blue-600/20',
  Terminée: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Validée: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
  Facturée: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
}

function createReference() {
  return `BT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
}

function createEmptyPart() {
  return {
    id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    stockId: '',
    name: '',
    reference: '',
    quantity: '1',
  }
}

function createEmptyIntervention() {
  return {
    reference: createReference(),
    clientId: '',
    elevatorId: '',
    legacyElevatorIdentifier: '',
    legacyElevatorBrand: '',
    technicianId: '',
    scheduledDate: new Date().toISOString().slice(0, 10),
    arrivalTime: '09:00',
    departureTime: '',
    type: 'Dépannage',
    description: '',
    actionsPerformed: '',
    parts: [],
    legacyPartsText: '',
    timeSpent: '',
    status: 'Planifiée',
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

function getPartsFromIntervention(intervention, stock) {
  const savedParts = Array.isArray(intervention.replacedParts)
    ? intervention.replacedParts
    : Array.isArray(intervention.parts)
      ? intervention.parts
      : []
  return savedParts.flatMap((part, index) => {
    const stockItem = stock.find((item) =>
      item.id === part.stockId || (!part.stockId && item.id === part.id),
    )
    if (!stockItem) return []
    return [{
      id: part.id || `part-${intervention.id}-${index}`,
      stockId: stockItem.id,
      name: part.name || part.designation || stockItem.name || '',
      reference: part.reference || stockItem.reference || '',
      quantity: String(part.quantity ?? 1),
    }]
  })
}

function getLegacyPartsText(intervention, stock) {
  if (typeof intervention.replacedParts === 'string') {
    return intervention.replacedParts || intervention.replacedPartsText || ''
  }
  const savedParts = Array.isArray(intervention.replacedParts)
    ? intervention.replacedParts
    : Array.isArray(intervention.parts)
      ? intervention.parts
      : []
  const unlinkedParts = savedParts
    .filter((part) => !stock.some((item) =>
      item.id === part.stockId || (!part.stockId && item.id === part.id),
    ))
    .map((part) => [
      part.reference || part.name || part.designation || 'Pièce historique',
      part.quantity ? `Qté : ${part.quantity}` : '',
    ].filter(Boolean).join(' — '))
  return [intervention.replacedPartsText, ...unlinkedParts]
    .filter(Boolean)
    .join('\n')
}

function getInterventionForm(intervention, stock) {
  const scheduledValue = intervention.scheduledAt || intervention.scheduledDate || intervention.date || ''
  const scheduledText = String(scheduledValue)
  const scheduledDate = intervention.scheduledDate || scheduledText.slice(0, 10)
  const savedStatus = intervention.status === 'Facturée'
    ? 'Validée'
    : intervention.status === 'En attente'
      ? 'Planifiée'
      : STATUSES.includes(intervention.status)
        ? intervention.status
        : 'Planifiée'
  const savedType = INTERVENTION_TYPES.includes(intervention.type)
    ? intervention.type
    : intervention.type?.toLowerCase().includes('maintenance')
      ? 'Maintenance préventive'
      : intervention.type?.toLowerCase().includes('installation')
        ? 'Installation'
        : intervention.type?.toLowerCase().includes('expertise')
          ? 'Expertise'
          : 'Dépannage'
  return {
    ...createEmptyIntervention(),
    ...intervention,
    reference: intervention.reference || createReference(),
    clientId: intervention.clientId || '',
    technicianId: intervention.technicianId || '',
    elevatorId: intervention.elevatorId || '',
    legacyElevatorIdentifier:
      intervention.elevatorIdentifier && !intervention.elevatorId
        ? intervention.elevatorIdentifier
        : '',
    legacyElevatorBrand:
      intervention.elevatorBrand && !intervention.elevatorId
        ? intervention.elevatorBrand
        : '',
    scheduledDate,
    arrivalTime:
      intervention.arrivalTime ||
      (scheduledText.includes('T') ? scheduledText.slice(11, 16) : ''),
    departureTime: intervention.departureTime || '',
    type: savedType,
    description: intervention.description || intervention.notes || intervention.title || '',
    actionsPerformed: intervention.actionsPerformed || intervention.workPerformed || '',
    parts: getPartsFromIntervention(intervention, stock),
    legacyPartsText: getLegacyPartsText(intervention, stock),
    timeSpent: String(intervention.timeSpent ?? ''),
    status: savedStatus,
  }
}

function formatScheduledDate(intervention) {
  const value = intervention.scheduledDate || intervention.scheduledAt || intervention.date
  if (!value) return '—'
  const date = String(value).slice(0, 10)
  const parsed = new Date(`${date}T00:00:00`)
  const dateText = Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('fr-FR')
  const time = intervention.arrivalTime ||
    (String(value).includes('T') ? String(value).slice(11, 16) : '')
  return time ? `${dateText} · ${time}` : dateText
}

function getInterventionParts(intervention) {
  if (Array.isArray(intervention.replacedParts)) return intervention.replacedParts
  if (Array.isArray(intervention.parts)) return intervention.parts
  return []
}

function getInterventionStatus(intervention) {
  if (intervention.status === 'En attente') return 'Planifiée'
  if (intervention.status === 'Facturée') return 'Validée'
  return STATUSES.includes(intervention.status) ? intervention.status : 'Planifiée'
}

function Field({ label, children, wide = false }) {
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function getCalculatedHours(arrivalTime, departureTime, fallback = 0) {
  if (!arrivalTime || !departureTime) return Number(fallback) || 0
  const [arrivalHour, arrivalMinute] = arrivalTime.split(':').map(Number)
  const [departureHour, departureMinute] = departureTime.split(':').map(Number)
  if (![arrivalHour, arrivalMinute, departureHour, departureMinute].every(Number.isFinite)) {
    return Number(fallback) || 0
  }
  let minutes =
    departureHour * 60 + departureMinute - (arrivalHour * 60 + arrivalMinute)
  if (minutes < 0) minutes += 24 * 60
  return Math.round((minutes / 60) * 100) / 100
}

export default function Interventions() {
  const { data: interventions, loading, error: loadError } =
    useFirestoreCollection('interventions')
  const {
    data: clients,
    loading: clientsLoading,
    error: clientsError,
  } = useFirestoreCollection('clients')
  const {
    data: technicians,
    loading: techniciansLoading,
    error: techniciansError,
  } = useFirestoreCollection('technicians')
  const { data: stock, loading: stockLoading, error: stockError } =
    useFirestoreCollection('stock')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [activeStep, setActiveStep] = useState(0)
  const [form, setForm] = useState(createEmptyIntervention)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pdfRequest, setPdfRequest] = useState(null)
  const [exportingId, setExportingId] = useState('')
  const pdfRef = useRef(null)

  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  )
  const stockById = useMemo(
    () => new Map(stock.map((item) => [item.id, item])),
    [stock],
  )
  const filteredInterventions = useMemo(() => {
    const search = query.trim().toLowerCase()
    return interventions
      .filter((intervention) =>
        [
          intervention.reference,
          intervention.title,
          intervention.type,
          intervention.description,
          intervention.elevatorBrand,
          intervention.elevatorIdentifier,
          intervention.actionsPerformed,
          intervention.clientName,
          intervention.technicianName,
          intervention.status,
          ...getInterventionParts(intervention).flatMap((part) => [
            part.name,
            part.designation,
            part.reference,
          ]),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search)) &&
          (!typeFilter || intervention.type === typeFilter) &&
          (!statusFilter || getInterventionStatus(intervention) === statusFilter),
      )
      .map((intervention) => ({
        ...intervention,
        __scheduledDate: String(intervention.scheduledDate || intervention.scheduledAt || intervention.date || ''),
        __clientName: intervention.clientName || getClientName(clientById.get(intervention.clientId)),
        __technicianName: intervention.technicianName || getTechnicianName(
          technicians.find((technician) => technician.id === intervention.technicianId),
        ),
        __status: getInterventionStatus(intervention),
      }))
      .sort((first, second) => first.__scheduledDate.localeCompare(second.__scheduledDate))
  }, [interventions, query, typeFilter, statusFilter, clientById, technicians])
  const table = useDataTable(filteredInterventions)
  const exportColumns = [
    { label: 'N° bon de travail', value: (intervention) => intervention.reference || intervention.id },
    { label: 'Date prévue', value: (intervention) => intervention.__scheduledDate },
    { label: 'Client', value: (intervention) => intervention.__clientName },
    { label: 'Ascenseur', value: (intervention) => [intervention.elevatorReference || intervention.elevatorIdentifier, intervention.elevatorBrand].filter(Boolean).join(' - ') },
    { label: 'Technicien', value: (intervention) => intervention.__technicianName },
    { label: 'Type', key: 'type' },
    { label: 'Statut', value: (intervention) => intervention.__status },
  ]

  useEffect(() => {
    if (!pdfRequest || !pdfRef.current) return undefined
    let cancelled = false
    const exportPdf = async () => {
      try {
        const generatePdf = (await import('../utils/pdfEngine')).default
        await generatePdf(
          pdfRef.current,
          `${pdfRequest.intervention.reference || pdfRequest.intervention.id}.pdf`,
          pdfRequest.company,
        )
      } catch (exportError) {
        if (!cancelled) {
          setError(
            exportError instanceof Error
              ? exportError.message
              : 'Impossible de générer le bon de travail.',
          )
        }
      } finally {
        if (!cancelled) {
          setExportingId('')
          setPdfRequest(null)
        }
      }
    }
    void exportPdf()
    return () => {
      cancelled = true
    }
  }, [pdfRequest])

  const openNew = () => {
    setEditingId(null)
    setForm(createEmptyIntervention())
    setActiveStep(0)
    setError('')
    setFormOpen(true)
  }

  const openEdit = (intervention) => {
    setEditingId(intervention.id)
    setForm(getInterventionForm(intervention, stock))
    setActiveStep(0)
    setError('')
    setFormOpen(true)
  }

  const updatePart = (index, field, value) => {
    setForm((current) => ({
      ...current,
      parts: current.parts.map((part, partIndex) => {
        if (partIndex !== index) return part
        if (field !== 'stockId') return { ...part, [field]: value }
        const selectedStock = stockById.get(value)
        return {
          ...part,
          stockId: value,
          name: selectedStock?.name || selectedStock?.designation || '',
          reference: selectedStock?.reference || selectedStock?.tgiReference || '',
        }
      }),
    }))
  }

  const validateForm = () => {
    const client = clientById.get(form.clientId)
    const technician = technicians.find((item) => item.id === form.technicianId)
    if (!client || !technician) {
      setError('Sélectionnez un client et un technicien valides.')
      setActiveStep(0)
      return null
    }
    if (!form.scheduledDate) {
      setError('La date prévue est obligatoire.')
      setActiveStep(0)
      return null
    }
    if (!INTERVENTION_TYPES.includes(form.type)) {
      setError('Sélectionnez un type de mission valide.')
      setActiveStep(1)
      return null
    }
    if (!String(form.description || '').trim()) {
      setError('La description de la panne ou de la tâche est obligatoire.')
      setActiveStep(1)
      return null
    }
    const invalidPart = form.parts.find((part) => {
      const quantity = Number(part.quantity)
      return !stockById.has(part.stockId) || !Number.isInteger(quantity) || quantity <= 0
    })
    if (invalidPart) {
      setError('Chaque ligne de pièce doit être liée à un article du stock et avoir une quantité entière supérieure à zéro.')
      setActiveStep(2)
      return null
    }
    if (!STATUSES.includes(form.status)) {
      setError('Sélectionnez un état d’intervention valide.')
      setActiveStep(3)
      return null
    }
    const elevator = (Array.isArray(client.elevators) ? client.elevators : [])
      .find((item) => item.id === form.elevatorId)
    if (form.elevatorId && !elevator) {
      setError('L’ascenseur sélectionné n’appartient plus au parc de ce client.')
      setActiveStep(0)
      return null
    }
    return { client, technician, elevator }
  }

  const saveIntervention = async (event) => {
    event.preventDefault()
    setError('')
    const assignment = validateForm()
    if (!assignment) return

    setSaving(true)
    const { client, technician, elevator } = assignment
    const usedParts = form.parts.map((part) => {
      const stockItem = stockById.get(part.stockId)
      return {
        id: part.id,
        stockId: stockItem.id,
        name: stockItem.name || stockItem.designation || part.name,
        designation: stockItem.name || stockItem.designation || part.name,
        reference: stockItem.reference || stockItem.tgiReference || part.reference,
        quantity: Number(part.quantity),
      }
    })
    const scheduledAt = form.arrivalTime
      ? `${form.scheduledDate}T${form.arrivalTime}`
      : form.scheduledDate
    const interventionData = {
      reference: String(form.reference || '').trim() || createReference(),
      clientId: client.id,
      clientName: getClientName(client),
      clientContact: client.contactName || client.contactPerson || '',
      clientPhone: client.phone || client.phone1 || '',
      clientAddress: [client.address, client.city, client.postalCode].filter(Boolean).join(', '),
      technicianId: technician.id,
      technicianName: getTechnicianName(technician),
      elevatorId: elevator?.id || '',
      elevatorReference: elevator?.reference || form.legacyElevatorIdentifier.trim(),
      elevatorIdentifier: elevator?.reference || form.legacyElevatorIdentifier.trim(),
      elevatorBrand: elevator?.brand || form.legacyElevatorBrand.trim(),
      elevatorType: elevator?.type || '',
      elevatorSnapshot: elevator ? { ...elevator } : null,
      scheduledDate: form.scheduledDate,
      scheduledAt,
      arrivalTime: form.arrivalTime,
      departureTime: form.departureTime,
      type: form.type,
      title: form.type,
      taskType: form.type,
      description: form.description.trim(),
      actionsPerformed: form.actionsPerformed.trim(),
      workPerformed: form.actionsPerformed.trim(),
      timeSpent: getCalculatedHours(form.arrivalTime, form.departureTime, form.timeSpent),
      replacedParts: usedParts,
      parts: usedParts,
      replacedPartsText: form.legacyPartsText.trim(),
      status: form.status,
      updatedAt: serverTimestamp(),
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'interventions', editingId), interventionData)
      } else {
        await addDoc(collection(db, 'interventions'), {
          ...interventionData,
          createdAt: serverTimestamp(),
        })
      }
      setFormOpen(false)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Impossible d’enregistrer l’intervention.',
      )
    } finally {
      setSaving(false)
    }
  }

  const exportIntervention = async (intervention) => {
    setError('')
    setExportingId(intervention.id)
    try {
      const settings = await getDoc(doc(db, 'settings', 'company'))
      const client = clientById.get(intervention.clientId) || {
        name: intervention.clientName,
        address: intervention.clientAddress,
        contactName: intervention.clientContact,
        phone: intervention.clientPhone,
      }
      const elevator = (Array.isArray(client.elevators) ? client.elevators : [])
        .find((item) => item.id === intervention.elevatorId)
      setPdfRequest({
        intervention: {
          ...intervention,
          clientName: intervention.clientName || getClientName(client),
          technicianName: intervention.technicianName || 'Technicien non renseigné',
          elevatorReference:
            elevator?.reference ||
            intervention.elevatorReference ||
            intervention.elevatorIdentifier,
          elevatorBrand: elevator?.brand || intervention.elevatorBrand,
          replacedParts: getInterventionParts(intervention),
          replacedPartsText:
            typeof intervention.replacedParts === 'string'
              ? intervention.replacedParts
              : intervention.replacedPartsText || '',
        },
        client,
        technician: technicians.find((item) => item.id === intervention.technicianId) || {},
        stock,
        company: settings.exists() ? settings.data() : {},
      })
    } catch (exportError) {
      setExportingId('')
      setError(
        exportError instanceof Error
          ? exportError.message
          : 'Impossible de charger les paramètres société.',
      )
    }
  }

  const removeIntervention = async (intervention) => {
    if (!window.confirm(`Supprimer le bon de travail ${intervention.reference || ''} ?`)) return
    setError('')
    try {
      await deleteDoc(doc(db, 'interventions', intervention.id))
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Impossible de supprimer cette intervention.',
      )
    }
  }

  const formLoading = clientsLoading || techniciansLoading || stockLoading
  const missingAssignments = clients.length === 0 || technicians.length === 0
  const assignmentError = clientsError || techniciansError
  const pageError = loadError || assignmentError || error
  const selectedClient = clientById.get(form.clientId)
  const clientElevators = Array.isArray(selectedClient?.elevators)
    ? selectedClient.elevators
    : []
  const selectedElevator = clientElevators.find((elevator) => elevator.id === form.elevatorId)
  const statusHeading = form.status || 'Planifiée'

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
            Opérations terrain
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Interventions
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Planifiez les missions, consignez les travaux et suivez leur clôture.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-800 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-900"
          onClick={openNew}
          type="button"
        >
          <Plus aria-hidden="true" size={18} />
          Planifier une intervention
        </button>
      </div>

      <section className="mt-8 overflow-hidden rounded-2xl border border-white bg-white/90 shadow-xl shadow-slate-900/[0.04] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <ClipboardList aria-hidden="true" size={19} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Planning des interventions</p>
              <p className="text-xs text-slate-500">
                {interventions.length} bon{interventions.length === 1 ? '' : 's'} de travail
              </p>
            </div>
          </div>
          <div className="grid w-full gap-2 sm:max-w-3xl sm:grid-cols-[minmax(190px,1fr)_190px_190px]">
            <label className="relative block">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={17}
              />
              <input
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                onChange={(event) => {
                  setQuery(event.target.value)
                  table.setPage(1)
                }}
                placeholder="Rechercher une intervention…"
                type="search"
                value={query}
              />
            </label>
            <select aria-label="Filtrer par type" className={inputClass} onChange={(event) => { setTypeFilter(event.target.value); table.setPage(1) }} value={typeFilter}>
              <option value="">Tous les types</option>
              {INTERVENTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select aria-label="Filtrer par statut" className={inputClass} onChange={(event) => { setStatusFilter(event.target.value); table.setPage(1) }} value={statusFilter}>
              <option value="">Tous les statuts</option>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
        </div>
        <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
          <DataTableExportToolbar columns={exportColumns} rows={table.sortedItems} title="Liste des interventions" />
        </div>

        {stockError && (
          <p className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mx-6">
            Le stock n’a pas pu être chargé ; l’ajout de pièces est indisponible : {stockError}
          </p>
        )}
        {pageError && (
          <p
            className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6"
            role="alert"
          >
            {pageError}
          </p>
        )}
        {loading ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">
            Chargement des interventions…
          </p>
        ) : filteredInterventions.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-700">
              {query || typeFilter || statusFilter ? 'Aucun résultat pour cette recherche.' : 'Aucune intervention planifiée.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <SortableTableHeader className="px-6 py-3.5" columnKey="reference" label="Bon / mission" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__clientName" label="Client & ascenseur" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__technicianName" label="Technicien" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__scheduledDate" label="Date & heure" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__status" label="État" {...table} />
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((intervention) => (
                  <tr className="transition hover:bg-slate-50/70" key={intervention.id}>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-900">
                        {intervention.type || intervention.title || 'Mission terrain'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {intervention.reference || `Intervention ${intervention.id.slice(-6)}`}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      <p>{intervention.clientName || getClientName(clientById.get(intervention.clientId))}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {[intervention.elevatorReference || intervention.elevatorIdentifier, intervention.elevatorBrand]
                          .filter(Boolean)
                          .join(' · ') || 'Ascenseur non précisé'}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {intervention.technicianName || 'Technicien non renseigné'}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                      {formatScheduledDate(intervention)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                          statusStyle[intervention.__status] || statusStyle.Planifiée
                        }`}
                      >
                        {intervention.__status === 'Terminée' || intervention.__status === 'Validée'
                          ? <CheckCircle2 className="mr-1 inline" size={13} />
                          : intervention.__status === 'En attente de pièce'
                            ? <AlertCircle className="mr-1 inline" size={13} />
                            : <Clock3 className="mr-1 inline" size={13} />}
                        {intervention.__status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <button
                          aria-label={`Générer le bon de travail ${intervention.reference || intervention.id}`}
                          className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                          disabled={exportingId === intervention.id}
                          onClick={() => void exportIntervention(intervention)}
                          type="button"
                        >
                          <FileDown size={16} />
                        </button>
                        <button
                          aria-label={`Modifier ${intervention.reference || 'l’intervention'}`}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          onClick={() => openEdit(intervention)}
                          type="button"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          aria-label={`Supprimer ${intervention.reference || 'l’intervention'}`}
                          className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                          onClick={() => void removeIntervention(intervention)}
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filteredInterventions.length > 0 && <DataTablePagination {...table} />}
      </section>

      {pdfRequest && (
        <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 -z-10">
          <InterventionPdf
            client={pdfRequest.client}
            company={pdfRequest.company}
            intervention={pdfRequest.intervention}
            ref={pdfRef}
            stock={pdfRequest.stock}
            technician={pdfRequest.technician}
          />
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-6">
          <section
            aria-labelledby="intervention-form-title"
            aria-modal="true"
            className="my-auto w-full max-w-4xl rounded-2xl bg-white shadow-2xl"
            role="dialog"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                  Bon de travail · {form.reference}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900" id="intervention-form-title">
                  {editingId ? 'Modifier l’intervention' : 'Planifier une intervention'}
                </h2>
              </div>
              <button
                aria-label="Fermer"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setFormOpen(false)}
                type="button"
              >
                <X size={19} />
              </button>
            </div>

            {formLoading ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500">
                Chargement des clients, techniciens et pièces…
              </p>
            ) : assignmentError ? (
              <div className="px-6 py-8">
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                  Impossible de charger les clients ou les techniciens : {assignmentError}
                </p>
                <div className="mt-5 flex justify-end">
                  <button
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={() => setFormOpen(false)}
                    type="button"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            ) : missingAssignments ? (
              <div className="px-6 py-8">
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Ajoutez au moins un client et un technicien avant de planifier une intervention.
                </p>
                <div className="mt-5 flex justify-end">
                  <button
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={() => setFormOpen(false)}
                    type="button"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div aria-label="Étapes de l’intervention" className="grid grid-cols-2 border-b border-slate-100 px-4 py-3 sm:grid-cols-4 sm:px-7" role="tablist">
                  {STEPS.map((step, index) => (
                    <button
                      aria-selected={activeStep === index}
                      className={`flex items-center gap-2 rounded-lg px-2 py-2 text-left transition sm:px-3 ${
                        activeStep === index ? 'bg-blue-50 text-blue-800' : 'text-slate-500 hover:bg-slate-50'
                      }`}
                      key={step.title}
                      onClick={() => setActiveStep(index)}
                      role="tab"
                      type="button"
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        activeStep === index ? 'bg-blue-800 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-semibold sm:text-xs">{step.title}</span>
                        <span className="hidden truncate text-[10px] text-slate-400 lg:block">{step.description}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <form className="px-5 py-5 sm:px-7" onSubmit={saveIntervention}>
                  <section aria-label={STEPS[activeStep].title} className="min-h-[280px]">
                    {activeStep === 0 && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Client *">
                          <select
                            className={inputClass}
                            onChange={(event) => setForm((current) => ({
                              ...current,
                              clientId: event.target.value,
                              elevatorId: '',
                              legacyElevatorIdentifier: '',
                              legacyElevatorBrand: '',
                            }))}
                            required
                            value={form.clientId}
                          >
                            <option value="">Sélectionner un client</option>
                            {clients.map((client) => (
                              <option key={client.id} value={client.id}>{getClientName(client)}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Ascenseur concerné">
                          <select
                            className={inputClass}
                            disabled={!form.clientId || clientElevators.length === 0}
                            onChange={(event) => setForm((current) => ({
                              ...current,
                              elevatorId: event.target.value,
                              legacyElevatorIdentifier: '',
                              legacyElevatorBrand: '',
                            }))}
                            value={form.elevatorId}
                          >
                            <option value="">
                              {!form.clientId
                                ? 'Sélectionnez d’abord un client'
                                : clientElevators.length
                                  ? 'Sélectionner un ascenseur'
                                  : 'Aucun équipement détaillé'}
                            </option>
                            {clientElevators.map((elevator, index) => (
                              <option key={elevator.id || index} value={elevator.id}>
                                {[elevator.reference, elevator.brand].filter(Boolean).join(' · ')}
                              </option>
                            ))}
                          </select>
                          {form.clientId && clientElevators.length === 0 && (
                            <span className="mt-1.5 block text-xs text-amber-700">
                              Détaillez d’abord le parc depuis le module Clients ou saisissez un repère historique ci-dessous.
                            </span>
                          )}
                        </Field>
                        {form.clientId && !selectedElevator && clientElevators.length === 0 && (
                          <>
                            <Field label="Repère historique de l’ascenseur">
                              <input
                                className={inputClass}
                                onChange={(event) => setForm((current) => ({ ...current, legacyElevatorIdentifier: event.target.value }))}
                                placeholder="Ascenseur A, Bloc B…"
                                value={form.legacyElevatorIdentifier}
                              />
                            </Field>
                            <Field label="Marque historique">
                              <input
                                className={inputClass}
                                onChange={(event) => setForm((current) => ({ ...current, legacyElevatorBrand: event.target.value }))}
                                placeholder="Otis, Schindler…"
                                value={form.legacyElevatorBrand}
                              />
                            </Field>
                          </>
                        )}
                        {selectedElevator && (
                          <div className="sm:col-span-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900">
                            Équipement sélectionné : <strong>{selectedElevator.reference}</strong>
                            {' · '}{selectedElevator.brand} · {selectedElevator.type}
                            {' · '}{selectedElevator.floors} niveaux · {selectedElevator.status}
                          </div>
                        )}
                        <Field label="Technicien affecté *">
                          <select
                            className={inputClass}
                            onChange={(event) => setForm((current) => ({ ...current, technicianId: event.target.value }))}
                            required
                            value={form.technicianId}
                          >
                            <option value="">Sélectionner un technicien</option>
                            {technicians.map((technician) => (
                              <option key={technician.id} value={technician.id}>
                                {getTechnicianName(technician)} · {technician.status || technician.availability || 'Disponible'}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Date prévue *">
                          <div className="relative">
                            <CalendarDays
                              aria-hidden="true"
                              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                              size={17}
                            />
                            <input
                              className={`${inputClass} pl-10`}
                              onChange={(event) => setForm((current) => ({ ...current, scheduledDate: event.target.value }))}
                              required
                              type="date"
                              value={form.scheduledDate}
                            />
                          </div>
                        </Field>
                        <Field label="Heure d’arrivée">
                          <input
                            className={inputClass}
                            onChange={(event) => setForm((current) => ({ ...current, arrivalTime: event.target.value }))}
                            type="time"
                            value={form.arrivalTime}
                          />
                        </Field>
                        <Field label="Heure de départ">
                          <input
                            className={inputClass}
                            onChange={(event) => setForm((current) => ({ ...current, departureTime: event.target.value }))}
                            type="time"
                            value={form.departureTime}
                          />
                        </Field>
                      </div>
                    )}

                    {activeStep === 1 && (
                      <div className="space-y-4">
                        <Field label="Type de mission *">
                          <select
                            className={inputClass}
                            onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
                            value={form.type}
                          >
                            {INTERVENTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                          </select>
                        </Field>
                        <Field label="Description de la panne signalée / symptômes *" wide>
                          <textarea
                            className={`${inputClass} min-h-28 resize-y`}
                            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                            placeholder="Décrivez les symptômes, le contexte et les contrôles à effectuer."
                            required
                            rows={5}
                            value={form.description}
                          />
                        </Field>
                        <Field label="Travaux effectués / résolution" wide>
                          <textarea
                            className={`${inputClass} min-h-36 resize-y`}
                            onChange={(event) => setForm((current) => ({ ...current, actionsPerformed: event.target.value }))}
                            placeholder="Décrivez les actions, réparations, réglages et essais réalisés."
                            rows={6}
                            value={form.actionsPerformed}
                          />
                        </Field>
                      </div>
                    )}

                    {activeStep === 2 && (
                      <div className="space-y-4">
                        <div className="flex flex-col justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 sm:flex-row sm:items-center">
                          <div>
                            <h3 className="text-sm font-semibold text-blue-950">Pièces déclarées sur le bon</h3>
                            <p className="mt-1 text-xs leading-5 text-blue-800">
                              Cette déclaration ne modifie pas les quantités du stock. La sortie sera suivie par le document de vente / livraison.
                            </p>
                          </div>
                          <button
                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-800 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-900 disabled:opacity-50"
                            disabled={!stock.length}
                            onClick={() => setForm((current) => ({
                              ...current,
                              parts: [...current.parts, createEmptyPart()],
                            }))}
                            type="button"
                          >
                            <Plus size={15} />
                            Ajouter une pièce
                          </button>
                        </div>
                        {!stock.length && !stockError && (
                          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                            Aucun article n’est disponible dans le stock.
                          </p>
                        )}
                        {form.parts.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center">
                            <p className="text-sm font-medium text-slate-700">Aucune pièce déclarée</p>
                            <p className="mt-1 text-xs text-slate-500">Cette étape reste facultative si aucune pièce n’a été utilisée.</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {form.parts.map((part, index) => {
                              const stockItem = stockById.get(part.stockId)
                              return (
                                <div className="grid items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_140px_40px]" key={part.id || index}>
                                  <Field label={`Article de stock · ligne ${index + 1}`}>
                                    <select
                                      className={inputClass}
                                      onChange={(event) => updatePart(index, 'stockId', event.target.value)}
                                      required
                                      value={part.stockId}
                                    >
                                      <option value="">Sélectionner une pièce</option>
                                      {stock.map((item) => (
                                        <option key={item.id} value={item.id}>
                                          {[item.reference || item.tgiReference, item.name || item.designation]
                                            .filter(Boolean)
                                            .join(' · ')}
                                          {' · Stock : '}{item.quantity ?? 0}
                                        </option>
                                      ))}
                                    </select>
                                    {stockItem && (
                                      <span className="mt-1.5 block text-xs text-slate-500">
                                        {stockItem.reference || stockItem.tgiReference || 'Sans référence'} · stock actuel {stockItem.quantity ?? 0} (non décrémenté ici)
                                      </span>
                                    )}
                                  </Field>
                                  <Field label="Quantité utilisée">
                                    <input
                                      className={inputClass}
                                      min="1"
                                      onChange={(event) => updatePart(index, 'quantity', event.target.value)}
                                      required
                                      step="1"
                                      type="number"
                                      value={part.quantity}
                                    />
                                  </Field>
                                  <button
                                    aria-label={`Retirer la ligne de pièce ${index + 1}`}
                                    className="mb-0.5 flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                                    onClick={() => setForm((current) => ({
                                      ...current,
                                      parts: current.parts.filter((_, partIndex) => partIndex !== index),
                                    }))}
                                    type="button"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {form.legacyPartsText && (
                          <Field label="Ancienne déclaration libre (conservée)">
                            <textarea
                              className={`${inputClass} min-h-20 resize-y`}
                              onChange={(event) => setForm((current) => ({ ...current, legacyPartsText: event.target.value }))}
                              rows={3}
                              value={form.legacyPartsText}
                            />
                          </Field>
                        )}
                      </div>
                    )}

                    {activeStep === 3 && (
                      <div className="space-y-5">
                        <Field label="Statut de l’intervention *">
                          <select
                            className={inputClass}
                            onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                            value={form.status}
                          >
                            {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        </Field>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Récapitulatif du bon de travail</p>
                          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                            <div>
                              <dt className="text-xs text-slate-500">Référence</dt>
                              <dd className="mt-1 font-semibold text-slate-900">{form.reference}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-slate-500">État</dt>
                              <dd className="mt-1 font-semibold text-slate-900">{statusHeading}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-slate-500">Client</dt>
                              <dd className="mt-1 font-semibold text-slate-900">{selectedClient ? getClientName(selectedClient) : 'À sélectionner'}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-slate-500">Ascenseur</dt>
                              <dd className="mt-1 font-semibold text-slate-900">
                                {selectedElevator
                                  ? `${selectedElevator.reference} · ${selectedElevator.brand}`
                                  : form.legacyElevatorIdentifier || 'Non précisé'}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs text-slate-500">Technicien</dt>
                              <dd className="mt-1 font-semibold text-slate-900">
                                {getTechnicianName(technicians.find((item) => item.id === form.technicianId))}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs text-slate-500">Date & horaires</dt>
                              <dd className="mt-1 font-semibold text-slate-900">
                                {form.scheduledDate || '—'} · {form.arrivalTime || '—'} – {form.departureTime || '—'}
                              </dd>
                            </div>
                            <div className="sm:col-span-2">
                              <dt className="text-xs text-slate-500">Pièces déclarées</dt>
                              <dd className="mt-1 font-semibold text-slate-900">
                                {form.parts.length} ligne(s) · sans mouvement de stock
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </div>
                    )}
                  </section>

                  {error && (
                    <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <button
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                      disabled={activeStep === 0 || saving}
                      onClick={() => {
                        setError('')
                        setActiveStep((current) => Math.max(0, current - 1))
                      }}
                      type="button"
                    >
                      Précédent
                    </button>
                    <div className="flex gap-3">
                      <button
                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                        onClick={() => setFormOpen(false)}
                        type="button"
                      >
                        Annuler
                      </button>
                      {activeStep < STEPS.length - 1 ? (
                        <button
                          className="rounded-xl bg-blue-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-900"
                          onClick={() => {
                            setError('')
                            setActiveStep((current) => Math.min(STEPS.length - 1, current + 1))
                          }}
                          type="button"
                        >
                          Étape suivante
                        </button>
                      ) : (
                        <button
                          className="rounded-xl bg-blue-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-900 disabled:opacity-60"
                          disabled={saving}
                          type="submit"
                        >
                          {saving
                            ? 'Enregistrement…'
                            : editingId
                              ? 'Enregistrer les modifications'
                              : 'Créer le bon de travail'}
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
