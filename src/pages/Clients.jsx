import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpDown,
  Building,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  FileDown,
  LoaderCircle,
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
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import ClientForm from '../components/clients/ClientForm'
import ClientPdf from '../components/pdf/ClientPdf'
import DataTableExportToolbar from '../components/common/DataTableExportToolbar'
import DataTablePagination from '../components/common/DataTablePagination'
import EmptyState from '../components/common/EmptyState'
import SortableTableHeader from '../components/common/SortableTableHeader'
import TableSkeleton from '../components/common/TableSkeleton'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'

const CLIENT_TYPES = ['Syndic', 'Entreprise', 'Particulier']
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-steel-500 focus:ring-4 focus:ring-steel-100'

function getClientName(client) {
  return client.name || client.companyName || client.clientName || 'Client sans nom'
}

function normalizeClientType(type) {
  if (type === 'Promoteur Immobilier') return 'Entreprise'
  return CLIENT_TYPES.includes(type) ? type : 'Entreprise'
}

function getLegacyElevatorCount(client) {
  if (
    client.undetailedElevatorCount != null &&
    Number.isFinite(Number(client.undetailedElevatorCount))
  ) {
    return Math.max(0, Number(client.undetailedElevatorCount))
  }
  const total = Math.max(0, Number(client.elevatorCount) || 0)
  const detailed = Array.isArray(client.elevators) ? client.elevators.length : 0
  return Math.max(0, total - detailed)
}

function getElevatorCount(client) {
  const detailed = Array.isArray(client.elevators) ? client.elevators.length : 0
  return detailed + getLegacyElevatorCount(client)
}

function getRemainingAmount(invoice) {
  const remaining = invoice.remainingAmount == null
    ? Number(invoice.totalTTC || 0) - Number(invoice.paidAmount || 0)
    : Number(invoice.remainingAmount)
  return Number.isFinite(remaining) ? Math.max(0, remaining) : 0
}

function getClientBalance(client, documents) {
  const invoices = documents.filter(
    (documentData) => documentData.type === 'invoice' && documentData.clientId === client.id,
  )
  if (invoices.length) {
    return invoices.reduce((total, invoice) => total + getRemainingAmount(invoice), 0)
  }
  const balance = Number(client.currentBalance)
  return Number.isFinite(balance) ? Math.max(0, balance) : 0
}

function formatCurrency(value, currency = 'MAD') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  const supportedCurrency = ['MAD', 'EUR', 'USD'].includes(currency) ? currency : 'MAD'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: supportedCurrency,
    maximumFractionDigits: 2,
  }).format(amount)
}

function safeFilename(value) {
  return String(value || 'client')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'client'
}

const elevatorStatusClass = {
  'En marche': 'bg-emerald-50 text-emerald-700',
  'En service': 'bg-emerald-50 text-emerald-700',
  'En panne': 'bg-red-50 text-red-700',
  Panne: 'bg-red-50 text-red-700',
  'À l’arrêt': 'bg-amber-50 text-amber-700',
  "À l'arrêt": 'bg-amber-50 text-amber-700',
  'En travaux': 'bg-orange-50 text-orange-800',
}

function Toast({ notice, onDismiss }) {
  if (!notice) return null
  return (
    <div
      className="fixed right-4 top-24 z-[70] flex max-w-sm items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-xl shadow-slate-900/10 animate-slide-up"
      role="status"
    >
      <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600" size={18} />
      <p className="flex-1 text-sm font-medium text-slate-800">{notice}</p>
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

export default function Clients() {
  const { data: clients, loading: clientsLoading, error: clientsError } =
    useFirestoreCollection('clients')
  const { data: sales, loading: salesLoading, error: salesError } =
    useFirestoreCollection('sales')
  const { data: legacySales, loading: legacySalesLoading, error: legacySalesError } =
    useFirestoreCollection('salesDocuments')
  const salesDocuments = useMemo(() => [...sales, ...legacySales], [sales, legacySales])
  const dataLoading = clientsLoading || salesLoading || legacySalesLoading
  const [companySettings, setCompanySettings] = useState({})
  const [settingsError, setSettingsError] = useState('')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [formClient, setFormClient] = useState(null)
  const [saving, setSaving] = useState(false)
  const [clientToDelete, setClientToDelete] = useState(null)
  const [deletingId, setDeletingId] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [expandedClientId, setExpandedClientId] = useState('')
  const [exportingId, setExportingId] = useState('')
  const [pdfRequest, setPdfRequest] = useState(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const pdfRef = useRef(null)

  useEffect(() => onSnapshot(
    doc(db, 'settings', 'company'),
    (snapshot) => {
      setCompanySettings(snapshot.exists() ? snapshot.data() : {})
      setSettingsError('')
    },
    (snapshotError) => setSettingsError(snapshotError.message),
  ), [])

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fr')
    return clients
      .map((client) => ({
        ...client,
        __clientName: getClientName(client),
        __clientType: normalizeClientType(client.clientType),
        __phone: client.phone || client.phone1 || client.phone2 || '',
        __elevatorCount: getElevatorCount(client),
        __balance: getClientBalance(client, salesDocuments),
      }))
      .filter((client) => !typeFilter || client.__clientType === typeFilter)
      .filter((client) => {
        if (!normalizedQuery) return true
        const elevatorValues = Array.isArray(client.elevators)
          ? client.elevators.flatMap((elevator) => [
              elevator.reference,
              elevator.brand,
              elevator.type,
              elevator.status,
            ])
          : []
        return [
          client.__clientName,
          client.__clientType,
          client.contactName,
          client.__phone,
          client.whatsapp,
          client.email,
          client.address,
          client.city,
          client.postalCode,
          client.ice,
          ...elevatorValues,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('fr').includes(normalizedQuery))
      })
  }, [clients, query, salesDocuments, typeFilter])
  const table = useDataTable(filteredClients)

  const summary = useMemo(() => ({
    clientCount: clients.length,
    elevatorCount: clients.reduce((total, client) => total + getElevatorCount(client), 0),
    activeContracts: clients.filter((client) => client.contractStatus === 'Actif').length,
    balance: clients.reduce(
      (total, client) => total + getClientBalance(client, salesDocuments),
      0,
    ),
  }), [clients, salesDocuments])

  const exportColumns = [
    { label: 'Type', value: (client) => client.__clientType },
    { label: 'Raison sociale / nom', value: (client) => client.__clientName },
    { label: 'Téléphone', value: (client) => client.__phone },
    { label: 'E-mail', key: 'email' },
    { label: 'Ville', key: 'city' },
    { label: 'Nombre d’ascenseurs', value: (client) => client.__elevatorCount },
  ]

  const openCreateForm = () => {
    setFormClient(null)
    setFormOpen(true)
    setActionError('')
  }

  const openEditForm = (client) => {
    setFormClient(client)
    setFormOpen(true)
    setActionError('')
  }

  const saveClient = async (formData) => {
    setSaving(true)
    setActionError('')
    const data = { ...formData }
    delete data.id
    delete data.createdAt
    delete data.updatedAt
    delete data.__clientName
    delete data.__clientType
    delete data.__phone
    delete data.__elevatorCount
    delete data.__balance

    const elevators = formData.elevators.map((elevator) => ({
      ...elevator,
      id: String(elevator.id),
      reference: String(elevator.reference).trim(),
      brand: String(elevator.brand).trim(),
      floors: Number(elevator.floors),
    }))
    const currentBalance = Number(formData.currentBalance)
    const normalizedBalance =
      Number.isFinite(currentBalance) && currentBalance >= 0
        ? Math.round(currentBalance * 100) / 100
        : 0
    const knownBrands = String(formData.elevatorBrands || '')
      .split(',')
      .map((brand) => brand.trim())
      .filter(Boolean)
    const brandsByKey = new Map(
      [...knownBrands, ...elevators.map((elevator) => elevator.brand)]
        .filter(Boolean)
        .map((brand) => [brand.toLocaleLowerCase('fr'), brand]),
    )
    const clientData = {
      ...data,
      name: String(formData.name).trim(),
      clientType: normalizeClientType(formData.clientType),
      phone: String(formData.phone).trim(),
      phone1: String(formData.phone).trim(),
      phone2: String(formData.phone2 || '').trim(),
      whatsapp: String(formData.whatsapp || '').trim(),
      email: String(formData.email || '').trim(),
      elevators,
      elevatorCount: elevators.length + formData.undetailedElevatorCount,
      undetailedElevatorCount: formData.undetailedElevatorCount,
      elevatorBrands: [...brandsByKey.values()].join(', '),
      currentBalance: normalizedBalance,
      contractType: formData.contractType || 'Aucun',
      contractStatus: formData.contractStatus || 'Aucun',
    }

    try {
      if (formClient?.id) {
        await updateDoc(doc(db, 'clients', formClient.id), {
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
      setFormClient(null)
      setNotice(formClient ? 'La fiche client a été mise à jour.' : 'Le client a été créé.')
    } catch (saveError) {
      const message = saveError instanceof Error
        ? saveError.message
        : 'Impossible d’enregistrer le client.'
      setActionError(message)
      throw saveError
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!clientToDelete?.id) return
    setDeletingId(clientToDelete.id)
    setDeleteError('')
    try {
      await deleteDoc(doc(db, 'clients', clientToDelete.id))
      setExpandedClientId((current) => current === clientToDelete.id ? '' : current)
      setClientToDelete(null)
      setNotice('La fiche client a été supprimée.')
    } catch (removeError) {
      setDeleteError(
        removeError instanceof Error ? removeError.message : 'Impossible de supprimer le client.',
      )
    } finally {
      setDeletingId('')
    }
  }

  const exportClient = (client) => {
    setActionError('')
    setExportingId(client.id)
    const invoices = salesDocuments.filter(
      (invoice) => invoice.type === 'invoice' && invoice.clientId === client.id,
    )
    setPdfRequest({
      client,
      company: companySettings,
      invoices,
      filename: `fiche-client-${safeFilename(client.__clientName || getClientName(client))}.pdf`,
    })
  }

  useEffect(() => {
    if (!pdfRequest || !pdfRef.current) return undefined
    let active = true
    const generate = async () => {
      try {
        const { default: generatePdf } = await import('../utils/pdfEngine')
        await generatePdf(pdfRef.current, pdfRequest.filename, pdfRequest.company)
      } catch (exportError) {
        if (active) {
          setActionError(
            exportError instanceof Error
              ? exportError.message
              : 'Impossible de générer la fiche PDF du client.',
          )
        }
      } finally {
        if (active) {
          setExportingId('')
          setPdfRequest(null)
        }
      }
    }
    void generate()
    return () => {
      active = false
    }
  }, [pdfRequest])

  const pageError = actionError || clientsError || salesError || legacySalesError || settingsError

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <Toast notice={notice} onDismiss={() => setNotice('')} />

      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel-700">
            Répertoire & parc technique
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Clients</h1>
          <p className="mt-2 text-sm text-slate-500">
            Gérez les contacts et les ascenseurs de chaque résidence ou entreprise.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:-translate-y-0.5 hover:bg-blue-800"
          onClick={openCreateForm}
          type="button"
        >
          <Plus aria-hidden="true" size={18} />
          Nouveau client
        </button>
      </header>

      <section
        aria-label="Synthèse du portefeuille clients"
        className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {[
          { label: 'Clients suivis', value: summary.clientCount, icon: Building, tone: 'bg-steel-50 text-steel-700' },
          { label: 'Ascenseurs au parc', value: summary.elevatorCount, icon: ArrowUpDown, tone: 'bg-amber-50 text-amber-700' },
          { label: 'Contrats actifs', value: summary.activeContracts, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
          {
            label: 'Solde restant',
            value: formatCurrency(summary.balance, companySettings.defaultCurrency),
            icon: CircleDollarSign,
            tone: 'bg-orange-50 text-orange-700',
          },
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
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-steel-50 text-steel-700">
                <Users aria-hidden="true" size={19} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Répertoire clients</h2>
                <p className="text-xs text-slate-500">
                  {filteredClients.length} résultat{filteredClients.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="grid w-full gap-2 sm:max-w-2xl sm:grid-cols-[minmax(190px,1fr)_190px]">
              <label className="relative block">
                <span className="sr-only">Rechercher un client</span>
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
                  placeholder="Rechercher nom, contact, ville…"
                  type="search"
                  value={query}
                />
              </label>
              <select
                aria-label="Filtrer par type de client"
                className={inputClass}
                onChange={(event) => {
                  setTypeFilter(event.target.value)
                  table.setPage(1)
                }}
                value={typeFilter}
              >
                <option value="">Tous les types</option>
                {CLIENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
          </div>
          <DataTableExportToolbar
            columns={exportColumns}
            rows={table.sortedItems}
            title="Liste des clients"
          />
        </div>

        {pageError && (
          <p className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6" role="alert">
            {pageError}
          </p>
        )}

        {dataLoading ? (
          <TableSkeleton columns={7} minWidth={1080} />
        ) : filteredClients.length === 0 ? (
          <EmptyState
            actionLabel={query || typeFilter ? 'Effacer les filtres' : 'Créer une fiche client'}
            description={query || typeFilter
              ? 'Aucun résultat ne correspond à ces critères. Modifiez la recherche ou réinitialisez les filtres.'
              : 'Ajoutez un client pour enregistrer ses coordonnées et son parc d’ascenseurs.'}
            icon={Building}
            onAction={() => {
              if (query || typeFilter) {
                setQuery('')
                setTypeFilter('')
                table.setPage(1)
              } else {
                openCreateForm()
              }
            }}
            title={query || typeFilter ? 'Aucun client trouvé' : 'Aucun client enregistré'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__clientType" label="Type" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__clientName" label="Raison sociale / nom" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__phone" label="Téléphone" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="email" label="E-mail" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="city" label="Ville" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__elevatorCount" label="Ascenseurs" {...table} />
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((client) => {
                  const expanded = expandedClientId === client.id
                  const elevators = Array.isArray(client.elevators) ? client.elevators : []
                  const TypeIcon = client.__clientType === 'Particulier' ? Users : Building
                  return (
                    <Fragment key={client.id}>
                      <tr className="transition hover:bg-slate-50/80">
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-steel-100 bg-steel-50 px-2.5 py-1 text-xs font-semibold text-steel-800">
                            <TypeIcon aria-hidden="true" size={13} />
                            {client.__clientType}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="max-w-64 truncate text-sm font-semibold text-slate-900">
                            {client.__clientName}
                          </p>
                          {client.contactName && (
                            <p className="mt-1 max-w-64 truncate text-xs text-slate-500">
                              {client.contactName}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                          {client.__phone || '—'}
                        </td>
                        <td className="px-5 py-4">
                          <span className="block max-w-56 truncate text-sm text-slate-600">
                            {client.email || '—'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">{client.city || '—'}</td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                            <ArrowUpDown aria-hidden="true" className="text-amber-600" size={15} />
                            {client.__elevatorCount}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-1">
                            <button
                              aria-controls={`client-elevators-${client.id}`}
                              aria-expanded={expanded}
                              aria-label={`${expanded ? 'Masquer' : 'Voir'} le parc de ${client.__clientName}`}
                              className={`rounded-lg p-2 transition ${expanded ? 'bg-steel-50 text-steel-700' : 'text-slate-500 hover:bg-steel-50 hover:text-steel-700'}`}
                              onClick={() => setExpandedClientId(expanded ? '' : client.id)}
                              title={expanded ? 'Masquer le parc' : 'Voir le parc'}
                              type="button"
                            >
                              <ChevronDown
                                aria-hidden="true"
                                className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                                size={17}
                              />
                            </button>
                            <button
                              aria-label={`Exporter la fiche PDF de ${client.__clientName}`}
                              className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-wait disabled:opacity-50"
                              disabled={exportingId === client.id}
                              onClick={() => exportClient(client)}
                              title="Exporter la fiche PDF"
                              type="button"
                            >
                              {exportingId === client.id
                                ? <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
                                : <FileDown aria-hidden="true" size={17} />}
                            </button>
                            <button
                              aria-label={`Voir ou modifier ${client.__clientName}`}
                              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-steel-700 transition hover:bg-steel-50"
                              onClick={() => openEditForm(client)}
                              title="Voir / Modifier"
                              type="button"
                            >
                              <Pencil aria-hidden="true" size={15} />
                              <span className="hidden xl:inline">Voir / Modifier</span>
                            </button>
                            <button
                              aria-label={`Supprimer ${client.__clientName}`}
                              className="rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-700"
                              onClick={() => {
                                setDeleteError('')
                                setClientToDelete(client)
                              }}
                              title="Supprimer"
                              type="button"
                            >
                              <Trash2 aria-hidden="true" size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-50/80">
                          <td className="px-5 py-5" colSpan={7}>
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(240px,.7fr)]">
                              <section
                                aria-label={`Parc d’ascenseurs de ${client.__clientName}`}
                                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                                id={`client-elevators-${client.id}`}
                              >
                                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                                  <div>
                                    <h3 className="text-sm font-semibold text-slate-900">Parc d’ascenseurs</h3>
                                    <p className="mt-0.5 text-xs text-slate-500">
                                      {client.__elevatorCount} équipement(s) au total
                                    </p>
                                  </div>
                                  <button
                                    className="text-xs font-semibold text-steel-700 hover:text-steel-900"
                                    onClick={() => openEditForm(client)}
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
                                            <td className="px-4 py-3 font-semibold text-slate-800">
                                              {elevator.reference || '—'}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{elevator.brand || '—'}</td>
                                            <td className="px-4 py-3 text-slate-600">{elevator.type || '—'}</td>
                                            <td className="px-4 py-3 text-slate-600">{elevator.floors ?? '—'}</td>
                                            <td className="px-4 py-3">
                                              <span className={`rounded-full px-2 py-1 font-medium ${elevatorStatusClass[elevator.status] || 'bg-slate-100 text-slate-600'}`}>
                                                {elevator.status === 'En service' ? 'En marche' : elevator.status || '—'}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <p className="px-4 py-5 text-xs text-slate-500">
                                    Aucun équipement détaillé n’est enregistré.
                                  </p>
                                )}
                                {getLegacyElevatorCount(client) > 0 && (
                                  <p className="border-t border-slate-100 px-4 py-3 text-xs text-amber-700">
                                    {getLegacyElevatorCount(client)} ascenseur(s) historique(s) restent à détailler.
                                  </p>
                                )}
                              </section>
                              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                                <h3 className="text-sm font-semibold text-slate-900">Coordonnées du site</h3>
                                <p className="flex gap-2 text-xs leading-5 text-slate-600">
                                  <MapPin aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400" size={15} />
                                  {[client.address, client.city, client.postalCode].filter(Boolean).join(', ') || 'Adresse non renseignée'}
                                </p>
                                <p className="flex gap-2 text-xs leading-5 text-slate-600">
                                  <Phone aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400" size={15} />
                                  {client.__phone || 'Téléphone non renseigné'}
                                </p>
                                <p className="flex gap-2 break-all text-xs leading-5 text-slate-600">
                                  <Mail aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400" size={15} />
                                  {client.email || 'E-mail non renseigné'}
                                </p>
                                {client.ice && (
                                  <p className="text-xs text-slate-600">ICE : <strong>{client.ice}</strong></p>
                                )}
                                <p className="border-t border-slate-100 pt-3 text-xs text-slate-600">
                                  Solde restant :{' '}
                                  <strong>{formatCurrency(client.__balance, companySettings.defaultCurrency)}</strong>
                                </p>
                              </section>
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
        {!dataLoading && filteredClients.length > 0 && <DataTablePagination {...table} />}
      </section>

      {formOpen && (
        <ClientForm
          client={formClient}
          companySettings={companySettings}
          onCancel={() => {
            if (!saving) {
              setFormOpen(false)
              setFormClient(null)
            }
          }}
          onSave={saveClient}
          saving={saving}
        />
      )}

      {clientToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section
            aria-describedby="delete-client-description"
            aria-labelledby="delete-client-title"
            aria-modal="true"
            className="w-full max-w-md animate-slide-up rounded-2xl border border-white/70 bg-white p-6 shadow-2xl"
            role="alertdialog"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-700">
              <Trash2 aria-hidden="true" size={20} />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900" id="delete-client-title">
              Supprimer cette fiche client ?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600" id="delete-client-description">
              La fiche de <strong>{getClientName(clientToDelete)}</strong> sera supprimée. Cette action est irréversible.
            </p>
            {deleteError && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {deleteError}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                disabled={Boolean(deletingId)}
                onClick={() => setClientToDelete(null)}
                type="button"
              >
                Annuler
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
                disabled={Boolean(deletingId)}
                onClick={() => void confirmDelete()}
                type="button"
              >
                {deletingId && <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />}
                {deletingId ? 'Suppression…' : 'Supprimer le client'}
              </button>
            </div>
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
