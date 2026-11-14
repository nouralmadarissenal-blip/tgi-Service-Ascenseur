import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileDown,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import DataTableExportToolbar from '../components/common/DataTableExportToolbar'
import ClientPdf from '../components/pdf/ClientPdf'
import DataTablePagination from '../components/common/DataTablePagination'
import SortableTableHeader from '../components/common/SortableTableHeader'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'

const CLIENT_TYPES = ['Syndic', 'Promoteur Immobilier', 'Entreprise', 'Particulier']
const CONTRACT_TYPES = ['Garantie', 'Maintenance', 'Aucun']
const CONTRACT_STATUSES = ['Actif', 'Suspendu', 'Aucun']
const ELEVATOR_TYPES = ['Électrique', 'Hydraulique']
const ELEVATOR_STATUSES = ['En service', 'À l’arrêt', 'En travaux']
const TABS = [
  { id: 'identity', label: 'Identité & contact' },
  { id: 'location', label: 'Localisation' },
  { id: 'elevators', label: 'Parc d’ascenseurs' },
  { id: 'contract', label: 'Contrat & finance' },
]
const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'

function createEmptyElevator() {
  return {
    id: `elevator-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    reference: '',
    brand: '',
    type: 'Électrique',
    floors: '',
    status: 'En service',
  }
}

function createEmptyClient() {
  return {
    name: '',
    clientType: 'Entreprise',
    contactName: '',
    phone: '',
    phone2: '',
    email: '',
    address: '',
    city: '',
    postalCode: '',
    ice: '',
    rc: '',
    if: '',
    patente: '',
    elevators: [],
    undetailedElevatorCount: 0,
    elevatorCount: 0,
    elevatorBrands: '',
    contractType: 'Aucun',
    contractStatus: 'Aucun',
    contractEndDate: '',
    currentBalance: '0',
    notes: '',
  }
}

function getClientName(client) {
  return client.name || client.companyName || client.clientName || 'Client sans nom'
}

function getLegacyElevatorCount(client) {
  if (
    client.undetailedElevatorCount != null &&
    Number.isFinite(Number(client.undetailedElevatorCount))
  ) {
    return Math.max(0, Number(client.undetailedElevatorCount))
  }
  const elevatorCount = Math.max(0, Number(client.elevatorCount) || 0)
  const detailedCount = Array.isArray(client.elevators) ? client.elevators.length : 0
  return Math.max(0, elevatorCount - detailedCount)
}

function getElevatorCount(client) {
  const detailedCount = Array.isArray(client.elevators) ? client.elevators.length : 0
  return detailedCount + getLegacyElevatorCount(client)
}

function formatClientCurrency(value, currency = 'MAD') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: ['MAD', 'EUR', 'USD'].includes(currency) ? currency : 'MAD',
    maximumFractionDigits: 2,
  }).format(amount)
}

function getClientBalance(client, documents) {
  const invoices = documents.filter(
    (invoice) => invoice.type === 'invoice' && invoice.clientId === client.id,
  )
  return invoices.length
    ? invoices.reduce((total, invoice) => {
        const remaining = invoice.remainingAmount == null
          ? Number(invoice.totalTTC || 0) - Number(invoice.paidAmount || 0)
          : Number(invoice.remainingAmount)
        return total + Math.max(0, remaining)
      }, 0)
    : Number(client.currentBalance || 0)
}

function getClientForm(client) {
  const form = createEmptyClient()
  const hasElevators = Array.isArray(client.elevators)
  const elevators = hasElevators
    ? client.elevators.map((elevator, index) => ({
        ...createEmptyElevator(),
        ...elevator,
        id: elevator.id || `elevator-${client.id}-${index}`,
        reference: elevator.reference || '',
        brand: elevator.brand || '',
        type: elevator.type || 'Électrique',
        floors: elevator.floors == null ? '' : String(elevator.floors),
        status: elevator.status || 'En service',
      }))
    : []
  const elevatorCount = Math.max(0, Number(client.elevatorCount) || 0)
  const undetailedElevatorCount = hasElevators
    ? Math.max(
        getLegacyElevatorCount(client),
        elevatorCount - elevators.length,
      )
    : elevatorCount

  return {
    ...form,
    ...Object.fromEntries(
      Object.keys(form).map((field) => [field, client[field] ?? form[field]]),
    ),
    name: getClientName(client) === 'Client sans nom' ? '' : getClientName(client),
    clientType: CLIENT_TYPES.includes(client.clientType) ? client.clientType : 'Entreprise',
    phone: client.phone || client.phone1 || '',
    elevators,
    undetailedElevatorCount,
    elevatorCount: elevators.length + undetailedElevatorCount,
    currentBalance: String(client.currentBalance ?? 0),
    contractType: CONTRACT_TYPES.includes(client.contractType) ? client.contractType : 'Aucun',
    contractStatus: CONTRACT_STATUSES.includes(client.contractStatus) ? client.contractStatus : 'Aucun',
    contractEndDate: client.contractEndDate || '',
  }
}

function Field({ label, children, wide = false }) {
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function TextInput({ value, onChange, type = 'text', required = false, ...props }) {
  return (
    <input
      className={fieldClass}
      onChange={onChange}
      required={required}
      type={type}
      value={value}
      {...props}
    />
  )
}

function SelectInput({ value, onChange, options, ...props }) {
  return (
    <select className={fieldClass} onChange={onChange} value={value} {...props}>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  )
}

const elevatorStatusClass = {
  'En service': 'bg-emerald-50 text-emerald-700',
  'À l’arrêt': 'bg-amber-50 text-amber-700',
  'En travaux': 'bg-blue-50 text-blue-700',
}

export default function Clients() {
  const { data: clients, loading, error: loadError } = useFirestoreCollection('clients')
  const { data: sales, error: salesError } = useFirestoreCollection('sales')
  const { data: legacySales, error: legacySalesError } = useFirestoreCollection('salesDocuments')
  const salesDocuments = useMemo(() => [...sales, ...legacySales], [sales, legacySales])
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [contractStatusFilter, setContractStatusFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [activeTab, setActiveTab] = useState('identity')
  const [form, setForm] = useState(createEmptyClient)
  const [saving, setSaving] = useState(false)
  const [exportingId, setExportingId] = useState(null)
  const [expandedClientId, setExpandedClientId] = useState(null)
  const [pdfRequest, setPdfRequest] = useState(null)
  const [actionError, setActionError] = useState('')
  const [companySettings, setCompanySettings] = useState({})
  const [settingsError, setSettingsError] = useState('')
  const pdfRef = useRef(null)

  useEffect(() => onSnapshot(
    doc(db, 'settings', 'company'),
    (snapshot) => {
      setCompanySettings(snapshot.exists() ? snapshot.data() : {})
      setSettingsError('')
    },
    (snapshotError) => setSettingsError(snapshotError.message),
  ), [])

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return clients
      .filter((client) =>
        [
          getClientName(client),
          client.contactName,
          client.email,
          client.phone,
          client.phone1,
          client.phone2,
          client.ice,
          client.clientType,
          client.contractType,
          client.contractStatus,
          client.city,
          ...(Array.isArray(client.elevators)
            ? client.elevators.flatMap((elevator) => [
                elevator.reference,
                elevator.brand,
                elevator.type,
              ])
            : []),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
      )
      .filter((client) => !typeFilter || client.clientType === typeFilter)
      .filter(
        (client) =>
          !contractStatusFilter ||
          (client.contractStatus || 'Aucun') === contractStatusFilter,
      )
      .map((client) => ({
        ...client,
        __clientName: getClientName(client),
        __elevatorCount: getElevatorCount(client),
        __balance: getClientBalance(client, salesDocuments),
      }))
      .sort((first, second) => first.__clientName.localeCompare(second.__clientName, 'fr'))
  }, [clients, query, typeFilter, contractStatusFilter, salesDocuments])
  const table = useDataTable(filteredClients)
  const exportColumns = [
    { label: 'Client', value: (client) => client.__clientName },
    { label: 'Type', key: 'clientType' },
    { label: 'Responsable', key: 'contactName' },
    { label: 'Téléphone', value: (client) => client.phone || client.phone1 || client.phone2 },
    { label: 'Email', key: 'email' },
    { label: 'Ville', key: 'city' },
    { label: 'Ascenseurs', value: (client) => client.__elevatorCount },
    { label: 'Statut contrat', value: (client) => client.contractStatus || 'Aucun' },
    { label: 'Solde restant', value: (client) => client.__balance },
  ]

  const updateFormField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const updateElevator = (index, field, value) => {
    setForm((current) => ({
      ...current,
      elevators: current.elevators.map((elevator, itemIndex) =>
        itemIndex === index ? { ...elevator, [field]: value } : elevator,
      ),
    }))
  }

  const openNewClient = () => {
    setEditingId(null)
    setForm(createEmptyClient())
    setActiveTab('identity')
    setActionError('')
    setFormOpen(true)
  }

  const openEditClient = (client) => {
    setEditingId(client.id)
    setForm(getClientForm(client))
    setActiveTab('identity')
    setActionError('')
    setFormOpen(true)
  }

  const saveClient = async (event) => {
    event.preventDefault()
    setActionError('')
    const currentBalance = Number(form.currentBalance)
    const undetailedElevatorCount = Number(form.undetailedElevatorCount)
    const elevators = form.elevators.map((elevator) => ({
      ...elevator,
      reference: String(elevator.reference || '').trim(),
      brand: String(elevator.brand || '').trim(),
      floors: Number(elevator.floors),
    }))
    const invalidElevator = elevators.find(
      (elevator) =>
        !elevator.reference ||
        !elevator.brand ||
        !ELEVATOR_TYPES.includes(elevator.type) ||
        !Number.isInteger(elevator.floors) ||
        elevator.floors < 1 ||
        !ELEVATOR_STATUSES.includes(elevator.status),
    )

    if (
      !String(form.name || '').trim() ||
      !CLIENT_TYPES.includes(form.clientType) ||
      !Number.isFinite(currentBalance) ||
      currentBalance < 0 ||
      !Number.isInteger(undetailedElevatorCount) ||
      undetailedElevatorCount < 0 ||
      invalidElevator
    ) {
      setActionError(
        invalidElevator
          ? 'Chaque ascenseur doit avoir un repère, une marque, un type, un nombre de niveaux valide et un état.'
          : !String(form.name || '').trim()
            ? 'Le nom du client ou de la résidence est obligatoire.'
            : 'Vérifiez le type de client, le solde et le nombre d’équipements existants non détaillés.',
      )
      setActiveTab(
        invalidElevator
          ? 'elevators'
          : !String(form.name || '').trim() || !CLIENT_TYPES.includes(form.clientType)
            ? 'identity'
            : 'contract',
      )
      return
    }

    setSaving(true)
    const trimmedForm = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [
        key,
        typeof value === 'string' ? value.trim() : value,
      ]),
    )
    const elevatorBrands = [...new Set([
      ...String(trimmedForm.elevatorBrands || '')
        .split(',')
        .map((brand) => brand.trim())
        .filter(Boolean),
      ...elevators.map((elevator) => elevator.brand),
    ])]
    const clientData = {
      ...trimmedForm,
      phone1: trimmedForm.phone,
      elevators,
      elevatorCount: elevators.length + undetailedElevatorCount,
      undetailedElevatorCount,
      elevatorBrands: elevatorBrands.join(', '),
      currentBalance,
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'clients', editingId), {
          ...clientData,
          updatedAt: serverTimestamp(),
        })
      } else {
        await addDoc(collection(db, 'clients'), {
          ...clientData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
      setFormOpen(false)
      setForm(createEmptyClient())
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : 'Impossible d’enregistrer le client.',
      )
    } finally {
      setSaving(false)
    }
  }

  const removeClient = async (client) => {
    if (!window.confirm(`Supprimer la fiche de ${getClientName(client)} ?`)) return
    setActionError('')
    try {
      await deleteDoc(doc(db, 'clients', client.id))
      if (expandedClientId === client.id) setExpandedClientId(null)
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Impossible de supprimer le client.',
      )
    }
  }

  const exportClient = async (client) => {
    setExportingId(client.id)
    setActionError('')
    try {
      const companySnapshot = await getDoc(doc(db, 'settings', 'company'))
      const company = companySnapshot.exists() ? companySnapshot.data() : {}
      const invoices = salesDocuments.filter(
        (invoice) => invoice.type === 'invoice' && invoice.clientId === client.id,
      )
      const filename = `fiche-client-${getClientName(client)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()}.pdf`
      setPdfRequest({ client, company, invoices, filename })
    } catch (exportError) {
      setActionError(
        exportError instanceof Error
          ? exportError.message
          : 'Impossible de charger les paramètres société pour le PDF.',
      )
      setExportingId(null)
    }
  }

  useEffect(() => {
    if (!pdfRequest || !pdfRef.current) return undefined
    let cancelled = false
    const generate = async () => {
      try {
        const { default: generatePdf } = await import('../utils/pdfEngine')
        await generatePdf(pdfRef.current, pdfRequest.filename, pdfRequest.company)
      } catch (exportError) {
        if (!cancelled) {
          setActionError(
            exportError instanceof Error
              ? exportError.message
              : 'Impossible de générer la fiche PDF.',
          )
        }
      } finally {
        if (!cancelled) {
          setExportingId(null)
          setPdfRequest(null)
        }
      }
    }
    void generate()
    return () => {
      cancelled = true
    }
  }, [pdfRequest])

  const pageError = actionError || loadError || salesError || legacySalesError || settingsError

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
            Répertoire & parc technique
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Clients</h1>
          <p className="mt-2 text-sm text-slate-500">
            Gérez les contacts, contrats et ascenseurs de chaque site.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-800 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-900"
          onClick={openNewClient}
          type="button"
        >
          <Plus aria-hidden="true" size={18} />
          Nouveau client
        </button>
      </div>

      <section className="mt-8 overflow-hidden rounded-2xl border border-white bg-white/90 shadow-xl shadow-slate-900/[0.04] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Users size={19} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Tous les clients</p>
              <p className="text-xs text-slate-500">
                {clients.length} fiche{clients.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="grid w-full gap-2 sm:max-w-2xl sm:grid-cols-[minmax(190px,1fr)_180px_170px]">
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
                placeholder="Rechercher un client ou un ascenseur…"
                type="search"
                value={query}
              />
            </label>
            <select
              aria-label="Filtrer par type de client"
              className={fieldClass}
              onChange={(event) => {
                setTypeFilter(event.target.value)
                table.setPage(1)
              }}
              value={typeFilter}
            >
              <option value="">Tous les types</option>
              {CLIENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select
              aria-label="Filtrer par statut du contrat"
              className={fieldClass}
              onChange={(event) => {
                setContractStatusFilter(event.target.value)
                table.setPage(1)
              }}
              value={contractStatusFilter}
            >
              <option value="">Tous les statuts</option>
              {CONTRACT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
        </div>
        <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
          <DataTableExportToolbar columns={exportColumns} rows={table.sortedItems} title="Liste des clients" />
        </div>

        {pageError && (
          <p
            className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6"
            role="alert"
          >
            {pageError}
          </p>
        )}

        {loading ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">Chargement des clients…</p>
        ) : filteredClients.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-700">
              {query || typeFilter || contractStatusFilter
                ? 'Aucun client ne correspond à la recherche et aux filtres.'
                : 'Aucun client pour le moment.'}
            </p>
            {!query && !typeFilter && !contractStatusFilter && (
              <button
                className="mt-3 text-sm font-semibold text-blue-700 hover:text-blue-900"
                onClick={openNewClient}
                type="button"
              >
                Ajouter votre premier client
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <SortableTableHeader className="px-6 py-3.5" columnKey="__clientName" label="Client" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="contactName" label="Contact" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="city" label="Ville" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__elevatorCount" label="Ascenseurs" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="contractStatus" label="Statut contrat" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__balance" label="Solde" {...table} />
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((client) => {
                  const expanded = expandedClientId === client.id
                  const elevators = Array.isArray(client.elevators) ? client.elevators : []
                  const balance = client.__balance
                  return (
                    <Fragment key={client.id}>
                      <tr className="transition hover:bg-slate-50/70">
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-slate-900">{getClientName(client)}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {client.clientType || 'Entreprise'} · {client.contractType || 'Aucun'}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm text-slate-700">{client.contactName || '—'}</p>
                          <p className="mt-1 text-xs text-slate-500">{client.phone || client.phone1 || client.phone2 || '—'}</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">{client.city || '—'}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-slate-700">{getElevatorCount(client)}</td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            client.contractStatus === 'Actif'
                              ? 'bg-emerald-50 text-emerald-700'
                              : client.contractStatus === 'Suspendu'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                          }`}>
                            {client.contractStatus === 'Actif'
                              ? <CheckCircle2 className="mr-1 inline" size={13} />
                              : client.contractStatus === 'Suspendu'
                                ? <AlertCircle className="mr-1 inline" size={13} />
                                : null}
                            {client.contractStatus || 'Aucun'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                          {formatClientCurrency(balance, companySettings.defaultCurrency)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-1">
                            <button
                              aria-controls={`client-details-${client.id}`}
                              aria-expanded={expanded}
                              aria-label={`${expanded ? 'Masquer' : 'Voir'} le parc de ${getClientName(client)}`}
                              className={`rounded-lg p-2 transition ${expanded ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-blue-50 hover:text-blue-700'}`}
                              onClick={() => setExpandedClientId(expanded ? null : client.id)}
                              title={expanded ? 'Masquer les détails' : 'Voir les détails'}
                              type="button"
                            >
                              <ChevronDown className={`transition-transform ${expanded ? 'rotate-180' : ''}`} size={17} />
                            </button>
                            <button
                              aria-label={`Générer la fiche PDF de ${getClientName(client)}`}
                              className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                              disabled={exportingId === client.id}
                              onClick={() => void exportClient(client)}
                              title="Générer la fiche PDF"
                              type="button"
                            >
                              <FileDown size={17} />
                            </button>
                            <button
                              aria-label={`Modifier ${getClientName(client)}`}
                              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                              onClick={() => openEditClient(client)}
                              title="Modifier"
                              type="button"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              aria-label={`Supprimer ${getClientName(client)}`}
                              className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                              onClick={() => void removeClient(client)}
                              title="Supprimer"
                              type="button"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr id={`client-details-${client.id}`} className="bg-slate-50/80">
                          <td className="px-6 py-5" colSpan={7}>
                            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(240px,.7fr)]">
                              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                                  <div>
                                    <h3 className="text-sm font-semibold text-slate-900">Parc d’ascenseurs</h3>
                                    <p className="mt-0.5 text-xs text-slate-500">
                                      {elevators.length} équipement{elevators.length === 1 ? '' : 's'} détaillé{elevators.length === 1 ? '' : 's'}
                                    </p>
                                  </div>
                                  <button
                                    className="text-xs font-semibold text-blue-700 hover:text-blue-900"
                                    onClick={() => openEditClient(client)}
                                    type="button"
                                  >
                                    Gérer le parc
                                  </button>
                                </div>
                                {elevators.length ? (
                                  <div className="overflow-x-auto">
                                    <table className="w-full min-w-[620px] text-left text-xs">
                                      <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                                        <tr>
                                          <th className="px-4 py-2.5">Repère</th>
                                          <th className="px-4 py-2.5">Marque</th>
                                          <th className="px-4 py-2.5">Type</th>
                                          <th className="px-4 py-2.5">Niveaux</th>
                                          <th className="px-4 py-2.5">État</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {elevators.map((elevator, index) => (
                                          <tr key={elevator.id || `${client.id}-elevator-${index}`}>
                                            <td className="px-4 py-3 font-semibold text-slate-800">{elevator.reference || '—'}</td>
                                            <td className="px-4 py-3 text-slate-600">{elevator.brand || '—'}</td>
                                            <td className="px-4 py-3 text-slate-600">{elevator.type || '—'}</td>
                                            <td className="px-4 py-3 text-slate-600">{elevator.floors ?? '—'}</td>
                                            <td className="px-4 py-3">
                                              <span className={`rounded-full px-2 py-1 font-medium ${elevatorStatusClass[elevator.status] || 'bg-slate-100 text-slate-600'}`}>
                                                {elevator.status || '—'}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <p className="px-4 py-5 text-xs text-slate-500">
                                    Aucun équipement détaillé. {getLegacyElevatorCount(client) > 0 && `${getLegacyElevatorCount(client)} ascenseur(s) historique(s) restent à détailler.`}
                                  </p>
                                )}
                                {getLegacyElevatorCount(client) > 0 && elevators.length > 0 && (
                                  <p className="border-t border-slate-100 px-4 py-3 text-xs text-amber-700">
                                    {getLegacyElevatorCount(client)} équipement(s) historique(s) non détaillé(s).
                                  </p>
                                )}
                              </div>
                              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                                <h3 className="text-sm font-semibold text-slate-900">Informations du site</h3>
                                <p className="flex gap-2 text-xs leading-5 text-slate-600">
                                  <MapPin className="mt-0.5 shrink-0 text-slate-400" size={15} />
                                  {[
                                    client.address,
                                    client.city,
                                    client.postalCode,
                                  ].filter(Boolean).join(', ') || 'Adresse non renseignée'}
                                </p>
                                <p className="flex gap-2 text-xs leading-5 text-slate-600">
                                  <Phone className="mt-0.5 shrink-0 text-slate-400" size={15} />
                                  {[client.phone || client.phone1, client.phone2].filter(Boolean).join(' · ') || 'Téléphone non renseigné'}
                                </p>
                                <p className="flex gap-2 break-all text-xs leading-5 text-slate-600">
                                  <Mail className="mt-0.5 shrink-0 text-slate-400" size={15} />
                                  {client.email || 'E-mail non renseigné'}
                                </p>
                                <div className="border-t border-slate-100 pt-3 text-xs text-slate-600">
                                  <p>Contrat : <strong>{client.contractType || 'Aucun'}</strong></p>
                                  <p className="mt-1">Échéance : <strong>{client.contractEndDate || '—'}</strong></p>
                                  <p className="mt-1">Solde : <strong>{formatClientCurrency(balance, companySettings.defaultCurrency)}</strong></p>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filteredClients.length > 0 && <DataTablePagination {...table} />}
      </section>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-6">
          <section
            aria-labelledby="client-form-title"
            aria-modal="true"
            className="my-auto w-full max-w-5xl rounded-2xl bg-white shadow-2xl"
            role="dialog"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7">
              <div>
                <h2 className="text-lg font-semibold text-slate-900" id="client-form-title">
                  {editingId ? 'Modifier le client' : 'Nouveau client'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Coordonnées, parc technique et situation contractuelle.
                </p>
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

            <div aria-label="Sections du formulaire client" className="flex gap-1 overflow-x-auto border-b border-slate-100 px-4 pt-3 sm:px-7" role="tablist">
              {TABS.map((tab) => (
                <button
                  aria-selected={activeTab === tab.id}
                  className={`whitespace-nowrap rounded-t-lg border-b-2 px-3 py-3 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                    activeTab === tab.id
                      ? 'border-blue-700 text-blue-800'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                  id={`client-tab-${tab.id}`}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form
              className="max-h-[calc(100vh-240px)] overflow-y-auto px-5 py-5 sm:px-7"
              onSubmit={saveClient}
            >
              <section aria-labelledby={`client-tab-${activeTab}`} role="tabpanel">
                {activeTab === 'identity' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Type de client *">
                      <SelectInput
                        onChange={(event) => updateFormField('clientType', event.target.value)}
                        options={CLIENT_TYPES}
                        value={form.clientType}
                      />
                    </Field>
                    <Field label="Nom de la résidence / raison sociale *">
                      <TextInput
                        autoFocus
                        onChange={(event) => updateFormField('name', event.target.value)}
                        required
                        value={form.name}
                      />
                    </Field>
                    <Field label="Nom du responsable">
                      <TextInput
                        onChange={(event) => updateFormField('contactName', event.target.value)}
                        value={form.contactName}
                      />
                    </Field>
                    <Field label="Téléphone 1">
                      <TextInput
                        onChange={(event) => updateFormField('phone', event.target.value)}
                        type="tel"
                        value={form.phone}
                      />
                    </Field>
                    <Field label="Téléphone 2">
                      <TextInput
                        onChange={(event) => updateFormField('phone2', event.target.value)}
                        type="tel"
                        value={form.phone2}
                      />
                    </Field>
                    <Field label="E-mail">
                      <TextInput
                        onChange={(event) => updateFormField('email', event.target.value)}
                        type="email"
                        value={form.email}
                      />
                    </Field>
                    <Field label="ICE">
                      <TextInput onChange={(event) => updateFormField('ice', event.target.value)} value={form.ice} />
                    </Field>
                    <Field label="Registre de commerce (RC)">
                      <TextInput onChange={(event) => updateFormField('rc', event.target.value)} value={form.rc} />
                    </Field>
                    <Field label="Identifiant fiscal (IF)">
                      <TextInput onChange={(event) => updateFormField('if', event.target.value)} value={form.if} />
                    </Field>
                    <Field label="Patente">
                      <TextInput onChange={(event) => updateFormField('patente', event.target.value)} value={form.patente} />
                    </Field>
                    <Field label="Notes" wide>
                      <textarea
                        className={`${fieldClass} min-h-24 resize-y`}
                        onChange={(event) => updateFormField('notes', event.target.value)}
                        placeholder="Informations complémentaires"
                        value={form.notes}
                      />
                    </Field>
                  </div>
                )}

                {activeTab === 'location' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Adresse exacte de l’immeuble / site" wide>
                      <TextInput
                        onChange={(event) => updateFormField('address', event.target.value)}
                        value={form.address}
                      />
                    </Field>
                    <Field label="Ville">
                      <TextInput onChange={(event) => updateFormField('city', event.target.value)} value={form.city} />
                    </Field>
                    <Field label="Code postal">
                      <TextInput onChange={(event) => updateFormField('postalCode', event.target.value)} value={form.postalCode} />
                    </Field>
                  </div>
                )}

                {activeTab === 'elevators' && (
                  <div className="space-y-4">
                    <div className="flex flex-col justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 sm:flex-row sm:items-center">
                      <div>
                        <p className="text-sm font-semibold text-blue-950">Parc d’ascenseurs</p>
                        <p className="mt-1 text-xs leading-5 text-blue-800">
                          {form.elevators.length} équipement(s) détaillé(s)
                          {Number(form.undetailedElevatorCount) > 0 &&
                            ` · ${form.undetailedElevatorCount} équipement(s) historique(s) non détaillé(s)`}
                        </p>
                      </div>
                      <button
                        className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-blue-800 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-900 sm:self-auto"
                        onClick={() => {
                          setForm((current) => ({
                            ...current,
                            elevators: [...current.elevators, createEmptyElevator()],
                          }))
                        }}
                        type="button"
                      >
                        <Plus size={15} />
                        Ajouter un ascenseur
                      </button>
                    </div>

                    {Number(form.undetailedElevatorCount) > 0 && (
                      <Field label="Ascenseurs existants non détaillés">
                        <TextInput
                          min="0"
                          onChange={(event) => {
                            const count = event.target.value
                            updateFormField('undetailedElevatorCount', count === '' ? '' : Number(count))
                          }}
                          step="1"
                          type="number"
                          value={form.undetailedElevatorCount}
                        />
                      </Field>
                    )}

                    {form.elevators.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center">
                        <p className="text-sm font-medium text-slate-700">Aucun équipement détaillé</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Ajoutez un ascenseur pour renseigner son repère, sa marque et son état.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {form.elevators.map((elevator, index) => (
                          <section
                            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                            key={elevator.id || index}
                          >
                            <div className="mb-4 flex items-center justify-between">
                              <h3 className="text-sm font-semibold text-slate-900">
                                Ascenseur {index + 1}
                              </h3>
                              <button
                                aria-label={`Retirer l’ascenseur ${index + 1}`}
                                className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                                onClick={() => {
                                  setForm((current) => ({
                                    ...current,
                                    elevators: current.elevators.filter((_, itemIndex) => itemIndex !== index),
                                  }))
                                }}
                                type="button"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                              <Field label="Repère / numéro *">
                                <TextInput
                                  onChange={(event) => updateElevator(index, 'reference', event.target.value)}
                                  placeholder="Ascenseur A, Bloc B…"
                                  required
                                  value={elevator.reference}
                                />
                              </Field>
                              <Field label="Marque *">
                                <TextInput
                                  onChange={(event) => updateElevator(index, 'brand', event.target.value)}
                                  placeholder="Otis, Schindler, TGI…"
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
                              <Field label="Nombre d’arrêts / niveaux *">
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
                        onChange={(event) => updateFormField('contractType', event.target.value)}
                        options={CONTRACT_TYPES}
                        value={form.contractType}
                      />
                    </Field>
                    <Field label="Statut du contrat">
                      <SelectInput
                        onChange={(event) => updateFormField('contractStatus', event.target.value)}
                        options={CONTRACT_STATUSES}
                        value={form.contractStatus}
                      />
                    </Field>
                    <Field label="Date d’échéance du contrat">
                      <TextInput
                        onChange={(event) => updateFormField('contractEndDate', event.target.value)}
                        type="date"
                        value={form.contractEndDate}
                      />
                    </Field>
                    <Field label={`Solde actuel / impayés (${companySettings.defaultCurrency || 'MAD'})`}>
                      <TextInput
                        min="0"
                        onChange={(event) => updateFormField('currentBalance', event.target.value)}
                        required
                        step="0.01"
                        type="number"
                        value={form.currentBalance}
                      />
                    </Field>
                    <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                      Le solde affiché dans le tableau et la fiche PDF est calculé à partir des factures ouvertes lorsqu’elles existent. Sinon, le solde saisi ici est utilisé.
                    </div>
                  </div>
                )}
              </section>

              {pageError && (
                <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                  {actionError || pageError}
                </p>
              )}
              <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  onClick={() => setFormOpen(false)}
                  type="button"
                >
                  Annuler
                </button>
                <button
                  className="rounded-xl bg-blue-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-60"
                  disabled={saving}
                  type="submit"
                >
                  {saving
                    ? 'Enregistrement…'
                    : editingId
                      ? 'Enregistrer les modifications'
                      : 'Créer le client'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {pdfRequest && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: 0,
            left: '-10000px',
            zIndex: -1,
            width: '190mm',
            pointerEvents: 'none',
          }}
        >
          <ClientPdf
            client={pdfRequest.client}
            company={pdfRequest.company}
            invoices={pdfRequest.invoices}
            ref={pdfRef}
          />
        </div>
      )}
    </main>
  )
}
