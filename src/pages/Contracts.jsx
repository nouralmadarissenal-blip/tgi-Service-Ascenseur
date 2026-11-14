import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, FileDown, FilePlus2, FileText, Pencil, Search, ShieldCheck, Trash2 } from 'lucide-react'
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
import EmptyState from '../components/common/EmptyState'
import { getContractTermState } from '../utils/contractTermState'
import DataTableExportToolbar from '../components/common/DataTableExportToolbar'
import DataTablePagination from '../components/common/DataTablePagination'
import SortableTableHeader from '../components/common/SortableTableHeader'
import TableSkeleton from '../components/common/TableSkeleton'
import ContractForm from '../components/contracts/ContractForm'
import ContractPdf from '../components/pdf/ContractPdf'
import { getDefaultClauses } from '../components/contracts/contractClauses'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'

function createContractReference() {
  const date = new Date()
  return `TGI-${date.getFullYear()}-${String(Date.now()).slice(-6)}`
}

function createEmptyContract(companySettings = {}) {
  const type = 'installation'
  const version = 'complete'
  return {
    reference: createContractReference(),
    type,
    version,
    clientId: '',
    clientName: '',
    clientAddress: '',
    clientIce: '',
    elevatorId: '',
    elevatorReference: '',
    elevatorBrand: '',
    elevatorType: '',
    subject: '',
    siteAddress: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    priceHT: '',
    taxRate: String(companySettings.defaultVatRate ?? 20),
    warranty: '',
    responseTime: '',
    slaResponseTime: '4h',
    billingFrequency: type === 'installation' ? 'Unique' : 'Trimestriel',
    autoRenewal: false,
    noticeMonths: '3',
    amendments: [],
    scope: '',
    paymentTerms: '30 % à la commande, solde à la réception des travaux.',
    generalConditions: companySettings.defaultTermsAndConditions || '',
    status: 'Brouillon',
    clauses: getDefaultClauses(type, version),
  }
}

function clientName(client) {
  return client?.name || client?.companyName || client?.clientName || 'Client supprimé'
}

function getContractStatus(contract) {
  const status = contract.status || 'Brouillon'
  const termState = getContractTermState(contract)
  if (termState === 'expired') return 'Expiré'
  if (termState === 'renewal') return 'Préavis de renouvellement'
  if (termState === 'expiring') return 'Bientôt à terme'
  return status
}

function formatCurrency(value, currency = 'MAD') {
  if (value === null || value === undefined || value === '') return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: ['MAD', 'EUR', 'USD'].includes(currency) ? currency : 'MAD',
    maximumFractionDigits: 2,
  }).format(amount)
}

function safeFilename(value) {
  return String(value || 'contrat')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

const statusClass = {
  Brouillon: 'bg-slate-100 text-slate-600',
  'À signer': 'bg-amber-50 text-amber-700',
  Actif: 'bg-emerald-50 text-emerald-700',
  Terminé: 'bg-blue-50 text-blue-700',
  Résilié: 'bg-red-50 text-red-700',
  Expiré: 'bg-red-50 text-red-700',
  'Bientôt à terme': 'bg-amber-50 text-amber-700',
  'Préavis de renouvellement': 'bg-orange-50 text-orange-800',
}
const BILLING_FREQUENCIES = ['Unique', 'Mensuel', 'Trimestriel', 'Annuel']

export default function Contracts() {
  const { data: contracts, loading, error: contractsError } =
    useFirestoreCollection('contracts')
  const { data: clients, loading: clientsLoading, error: clientsError } =
    useFirestoreCollection('clients')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(createEmptyContract)
  const [saving, setSaving] = useState(false)
  const [exportingId, setExportingId] = useState(null)
  const [pdfRequest, setPdfRequest] = useState(null)
  const [error, setError] = useState('')
  const [companySettings, setCompanySettings] = useState({})
  const pdfRef = useRef(null)

  useEffect(() => onSnapshot(
    doc(db, 'settings', 'company'),
    (snapshot) => setCompanySettings(snapshot.exists() ? snapshot.data() : {}),
    (settingsError) => setError(settingsError.message),
  ), [])

  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  )

  const filteredContracts = useMemo(() => {
    const search = query.trim().toLowerCase()
    return contracts
      .filter((contract) =>
        [
          contract.reference,
          contract.clientName,
          contract.type,
          contract.version,
          getContractStatus(contract),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search)) &&
          (!typeFilter || contract.type === typeFilter) &&
          (!statusFilter || getContractStatus(contract) === statusFilter),
      )
      .map((contract) => ({
        ...contract,
        __clientName: contract.clientName || clientName(clientById.get(contract.clientId)),
        __contractStatus: getContractStatus(contract),
      }))
      .sort((first, second) => String(second.reference || '').localeCompare(String(first.reference || ''), 'fr'))
  }, [contracts, query, typeFilter, statusFilter, clientById])
  const table = useDataTable(filteredContracts)
  const exportColumns = [
    { label: 'Référence', key: 'reference' },
    { label: 'Client', value: (contract) => contract.__clientName },
    { label: 'Type', value: (contract) => contract.type === 'installation' ? 'Installation' : 'Maintenance' },
    { label: 'Version', value: (contract) => contract.version === 'complete' ? 'Complète' : 'Simple' },
    { label: 'Début', key: 'startDate' },
    { label: 'Échéance', key: 'endDate' },
    { label: 'Montant HT', key: 'priceHT' },
    { label: 'SLA garanti', value: (contract) => contract.slaResponseTime || contract.responseTime },
    { label: 'Échéancier', key: 'billingFrequency' },
    { label: 'Reconduction tacite', value: (contract) => contract.autoRenewal ? 'Oui' : 'Non' },
    { label: 'Préavis (mois)', key: 'noticeMonths' },
    { label: 'État', value: (contract) => contract.__contractStatus },
  ]

  const openNew = () => {
    setEditingId(null)
    setForm(createEmptyContract(companySettings))
    setError('')
    setFormOpen(true)
  }

  const openEdit = (contract) => {
    const type = contract.type || 'installation'
    const version = contract.version || 'complete'
    const client = clientById.get(contract.clientId)
    const elevators = Array.isArray(client?.elevators) ? client.elevators : []
    const matchingElevator = elevators.find((elevator) =>
      elevator.reference && elevator.reference === contract.elevatorReference,
    )
    const defaults = createEmptyContract(companySettings)
    setEditingId(contract.id)
    setForm({
      ...defaults,
      ...contract,
      type,
      version,
      reference: contract.reference || createContractReference(),
      elevatorId: contract.elevatorId || (
        matchingElevator
          ? String(matchingElevator.id || matchingElevator.reference || '')
          : ''
      ),
      paymentTerms: contract.paymentTerms || defaults.paymentTerms,
      clauses: contract.clauses || getDefaultClauses(type, version),
      generalConditions: contract.generalConditions ?? companySettings.defaultTermsAndConditions ?? '',
      priceHT: contract.priceHT == null ? '' : String(contract.priceHT),
      taxRate: contract.taxRate == null ? String(companySettings.defaultVatRate ?? 20) : String(contract.taxRate),
      startDate: contract.startDate || '',
      endDate: contract.endDate || '',
      slaResponseTime: contract.slaResponseTime || contract.responseTime || '4h',
      billingFrequency: BILLING_FREQUENCIES.includes(contract.billingFrequency)
        ? contract.billingFrequency
        : type === 'installation' ? 'Unique' : 'Trimestriel',
      autoRenewal: contract.autoRenewal === true,
      noticeMonths: String(contract.noticeMonths ?? 3),
      amendments: Array.isArray(contract.amendments) ? contract.amendments : [],
    })
    setError('')
    setFormOpen(true)
  }

  const saveContract = async (event) => {
    event.preventDefault()
    setError('')
    const client = clientById.get(form.clientId)
    if (!client) {
      setError('Sélectionnez un client valide pour ce contrat.')
      return
    }
    const clientElevators = Array.isArray(client.elevators) ? client.elevators : []
    if (clientElevators.length > 0 && !form.elevatorId) {
      setError('Sélectionnez l’ascenseur concerné parmi les équipements du client.')
      return
    }
    const elevator = clientElevators.find((item, index) =>
      String(item.id || item.reference || `elevator-${index}`) === form.elevatorId,
    )
    if (form.elevatorId && !elevator && clientElevators.length > 0) {
      setError('L’ascenseur sélectionné n’appartient plus au parc de ce client. Sélectionnez-le à nouveau.')
      return
    }
    if (!elevator && !String(form.elevatorReference || '').trim()) {
      setError('Renseignez le repère de l’ascenseur concerné avant d’enregistrer le contrat.')
      return
    }
    const priceHT = form.priceHT === '' ? null : Number(form.priceHT)
    const taxRate = form.taxRate === '' ? 0 : Number(form.taxRate)
    const noticeMonths = Number(form.noticeMonths)
    if (
      (priceHT !== null && (!Number.isFinite(priceHT) || priceHT < 0)) ||
      !Number.isFinite(taxRate) ||
      taxRate < 0 ||
      taxRate > 100 ||
      !Number.isSafeInteger(Math.round((priceHT ?? 0) * 100)) ||
      !String(form.slaResponseTime || '').trim() ||
      !BILLING_FREQUENCIES.includes(form.billingFrequency) ||
      !Number.isInteger(noticeMonths) ||
      noticeMonths < 0 ||
      noticeMonths > 24 ||
      !form.startDate ||
      !form.endDate ||
      form.endDate < form.startDate ||
      priceHT === null ||
      !String(form.reference || '').trim() ||
      !String(form.subject || '').trim() ||
      !String(form.paymentTerms || '').trim() ||
      !String(form.clauses || '').trim()
    ) {
      setError('Vérifiez le montant, les dates, les modalités, les clauses, le SLA, l’échéancier, le préavis (0 à 24 mois) et le taux de TVA (0 à 100 %).')
      return
    }

    setSaving(true)
    const contractFields = { ...form }
    delete contractFields.id
    const contractData = {
      ...contractFields,
      reference: form.reference.trim(),
      clientName: clientName(client),
      clientAddress: client.address || '',
      clientIce: client.ice || '',
      elevatorId: elevator ? form.elevatorId : '',
      elevatorReference: elevator?.reference || String(form.elevatorReference || '').trim(),
      elevatorBrand: elevator?.brand || String(form.elevatorBrand || '').trim(),
      elevatorType: elevator?.type || String(form.elevatorType || '').trim(),
      priceHT,
      taxRate,
      slaResponseTime: form.slaResponseTime.trim(),
      billingFrequency: form.billingFrequency,
      autoRenewal: form.autoRenewal === true,
      noticeMonths,
      amendments: Array.isArray(form.amendments) ? form.amendments : [],
      updatedAt: serverTimestamp(),
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'contracts', editingId), contractData)
      } else {
        await addDoc(collection(db, 'contracts'), {
          ...contractData,
          createdAt: serverTimestamp(),
        })
      }
      setFormOpen(false)
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer le contrat.',
      )
    } finally {
      setSaving(false)
    }
  }

  const removeContract = async (contract) => {
    if (!window.confirm(`Supprimer le contrat ${contract.reference || ''} ?`)) return
    setError('')
    try {
      await deleteDoc(doc(db, 'contracts', contract.id))
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Impossible de supprimer ce contrat.',
      )
    }
  }

  const exportContract = async (contract) => {
    setError('')
    const client = clientById.get(contract.clientId)
    if (!client && !contract.clientName) {
      setError('Le client associé à ce contrat est introuvable.')
      return
    }

    setExportingId(contract.id)
    try {
      const companySnapshot = await getDoc(doc(db, 'settings', 'company'))
      const company = companySnapshot.exists() ? companySnapshot.data() : {}
      setPdfRequest({
        contract,
        client: client || {
          name: contract.clientName,
          address: contract.clientAddress,
          ice: contract.clientIce,
        },
        company,
      })
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : 'Impossible de charger les informations société pour le PDF.',
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
        await generatePdf(
          pdfRef.current,
          `${safeFilename(pdfRequest.contract.reference)}.pdf`,
          pdfRequest.company,
        )
      } catch (exportError) {
        if (!cancelled) {
          setError(
            exportError instanceof Error
              ? exportError.message
              : 'Impossible de générer le PDF du contrat.',
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

  const formError = clientsError || error

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
            Engagements & maintenance
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Contrats
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Préparez, gérez et exportez les contrats de vos clients.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-800 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={clientsLoading}
          onClick={openNew}
          type="button"
        >
          <FilePlus2 aria-hidden="true" size={18} />
          Nouveau contrat
        </button>
      </div>

      <section className="mt-8 overflow-hidden rounded-2xl border border-white bg-white/90 shadow-xl shadow-slate-900/[0.04] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <ShieldCheck aria-hidden="true" size={19} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Gestion des contrats</p>
              <p className="text-xs text-slate-500">
                {contracts.length} contrat{contracts.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="grid w-full gap-2 sm:max-w-2xl sm:grid-cols-[minmax(190px,1fr)_170px_190px]">
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
                placeholder="Rechercher un contrat…"
                type="search"
                value={query}
              />
            </label>
            <select aria-label="Filtrer par type de contrat" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" onChange={(event) => { setTypeFilter(event.target.value); table.setPage(1) }} value={typeFilter}>
              <option value="">Tous les types</option>
              <option value="installation">Installation</option>
              <option value="intervention">Maintenance</option>
            </select>
            <select aria-label="Filtrer par état du contrat" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" onChange={(event) => { setStatusFilter(event.target.value); table.setPage(1) }} value={statusFilter}>
              <option value="">Tous les états</option>
              {Object.keys(statusClass).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
        </div>
        <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
          <DataTableExportToolbar columns={exportColumns} rows={table.sortedItems} title="Liste des contrats" />
        </div>

        {(contractsError || formError) && (
          <p
            className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6"
            role="alert"
          >
            {formError || contractsError}
          </p>
        )}

        {loading ? (
          <TableSkeleton columns={6} minWidth={880} />
        ) : filteredContracts.length === 0 ? (
          <EmptyState
            actionLabel={query || typeFilter || statusFilter ? 'Effacer les filtres' : 'Créer un contrat'}
            description={query || typeFilter || statusFilter
              ? 'Aucun contrat ne correspond à ces critères ; vous pouvez réinitialiser les filtres.'
              : 'Associez un contrat à un client et à un équipement pour suivre sa durée et ses engagements.'}
            icon={ShieldCheck}
            onAction={() => {
              if (query || typeFilter || statusFilter) {
                setQuery('')
                setTypeFilter('')
                setStatusFilter('')
                table.setPage(1)
              } else {
                openNew()
              }
            }}
            title={query || typeFilter || statusFilter ? 'Aucun contrat trouvé' : 'Aucun contrat enregistré'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-220 text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <SortableTableHeader className="px-6 py-3.5" columnKey="reference" label="Référence" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__clientName" label="Client" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="type" label="Type / version" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="priceHT" label="Montant HT" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__contractStatus" label="État" {...table} />
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((contract) => (
                  <tr className="transition hover:bg-slate-50/70" key={contract.id}>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-900">
                        {contract.reference || 'Sans référence'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Du {contract.startDate ? new Date(`${contract.startDate}T00:00:00`).toLocaleDateString('fr-FR') : '—'}
                        {' · '}au {contract.endDate ? new Date(`${contract.endDate}T00:00:00`).toLocaleDateString('fr-FR') : '—'}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {contract.__clientName}
                      {contract.elevatorReference && (
                        <span className="mt-1 block text-xs text-slate-500">
                          {contract.elevatorReference}{contract.elevatorBrand ? ` · ${contract.elevatorBrand}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-slate-700">
                        {contract.type === 'installation' ? 'Installation' : 'Maintenance'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {contract.version === 'complete' ? 'Version complète' : 'Version simple'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                      {formatCurrency(contract.priceHT, companySettings.defaultCurrency)}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[contract.__contractStatus] || statusClass.Brouillon}`}>
                        {contract.__contractStatus === 'Actif'
                          ? <CheckCircle2 className="mr-1" size={13} />
                          : contract.__contractStatus === 'Expiré'
                            ? <AlertCircle className="mr-1" size={13} />
                            : <FileText className="mr-1" size={13} />}
                        {contract.__contractStatus}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <button
                          aria-label={`Générer le PDF ${contract.reference || ''}`}
                          className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                          disabled={Boolean(exportingId)}
                          onClick={() => void exportContract(contract)}
                          title={exportingId === contract.id ? 'Génération…' : 'Générer PDF'}
                          type="button"
                        >
                          <FileDown size={17} />
                        </button>
                        <button
                          aria-label={`Modifier le contrat ${contract.reference || ''}`}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          onClick={() => openEdit(contract)}
                          type="button"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          aria-label={`Supprimer le contrat ${contract.reference || ''}`}
                          className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                          onClick={() => void removeContract(contract)}
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
        {!loading && filteredContracts.length > 0 && <DataTablePagination {...table} />}
      </section>

      {formOpen && (
        <ContractForm
          clients={clients}
          contract={form}
          error={formError}
          onCancel={() => setFormOpen(false)}
          onChange={setForm}
          onSubmit={saveContract}
          saving={saving}
        />
      )}

      {pdfRequest && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-[-10000px] top-0 -z-10"
        >
          <ContractPdf
            client={pdfRequest.client}
            company={pdfRequest.company}
            contract={pdfRequest.contract}
            ref={pdfRef}
          />
        </div>
      )}
    </main>
  )
}
