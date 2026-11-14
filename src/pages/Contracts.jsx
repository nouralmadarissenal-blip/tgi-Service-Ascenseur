import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  FileDown,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
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
import { calculateContractAmounts } from '../utils/contractFinancials'
import { exportRowsToCsv } from '../utils/tableExports'

const CONTRACT_TYPES = ['installation', 'intervention', 'modernisation']
const BILLING_FREQUENCIES = ['Mensuel', 'Trimestriel', 'Annuel', 'À la livraison']
const SLA_OPTIONS = ['2h', '4h', '12h', '24h']
const TAX_RATES = [0, 14, 20]

const statusClass = {
  Brouillon: 'bg-slate-100 text-slate-700',
  'À signer': 'bg-amber-50 text-amber-800',
  Actif: 'bg-emerald-50 text-emerald-800',
  Terminé: 'bg-blue-50 text-blue-800',
  Résilié: 'bg-red-50 text-red-800',
  Expiré: 'bg-red-100 text-red-900',
  'Bientôt à terme': 'bg-orange-50 text-orange-800',
  'Préavis de renouvellement': 'bg-amber-100 text-amber-900',
}

function createContractReference() {
  const date = new Date()
  return `TGI-${date.getFullYear()}-${String(Date.now()).slice(-6)}`
}

function todayAsInputValue() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function normalizeContractType(type) {
  if (type === 'installation') return 'installation'
  if (type === 'modernisation' || type === 'modernization') return 'modernisation'
  return 'intervention'
}

function contractTypeLabel(type) {
  const normalizedType = normalizeContractType(type)
  if (normalizedType === 'installation') return 'Installation'
  if (normalizedType === 'modernisation') return 'Modernisation'
  return 'Maintenance'
}

function normalizeTaxRate(value, fallback = 20) {
  const rate = Number(value)
  return TAX_RATES.includes(rate) ? String(rate) : String(fallback)
}

function normalizeBillingFrequency(value, type) {
  if (value === 'Unique') return 'À la livraison'
  if (BILLING_FREQUENCIES.includes(value)) return value
  return type === 'installation' || type === 'modernisation'
    ? 'À la livraison'
    : 'Trimestriel'
}

function getClientName(client) {
  return client?.name || client?.companyName || client?.clientName || 'Client supprimé'
}

function getElevatorId(elevator, index) {
  return String(elevator.id || elevator.reference || `elevator-${index}`)
}

function getElevatorLabel(elevator) {
  if (!elevator || typeof elevator !== 'object') return ''
  return [elevator.reference || 'Ascenseur', elevator.brand, elevator.type]
    .filter(Boolean)
    .join(' · ')
}

function getContractElevatorLabel(contract, client) {
  if (Array.isArray(contract.elevators) && contract.elevators.length > 0) {
    return contract.elevators
      .map((elevator) => getElevatorLabel(elevator))
      .filter(Boolean)
      .join(' / ')
  }
  const clientElevators = Array.isArray(client?.elevators) ? client.elevators : []
  const linkedElevator = clientElevators.find((elevator, index) =>
    getElevatorId(elevator, index) === contract.elevatorId,
  )
  if (linkedElevator) return getElevatorLabel(linkedElevator)
  return [contract.elevatorReference, contract.elevatorBrand, contract.elevatorType]
    .filter(Boolean)
    .join(' · ') || '—'
}

function getContractStatus(contract) {
  const status = contract.status || 'Brouillon'
  const termState = getContractTermState(contract)
  if (termState === 'expired') return 'Expiré'
  if (termState === 'renewal') return 'Préavis de renouvellement'
  if (termState === 'expiring') return 'Bientôt à terme'
  return status
}

function parseDate(value) {
  if (value && typeof value.toDate === 'function') return value.toDate()
  if (value instanceof Date) return value
  if (typeof value !== 'string' || !value) return null
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isValidInputDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
}

function formatDate(value) {
  const date = parseDate(value)
  return date ? date.toLocaleDateString('fr-FR') : '—'
}

function formatCurrency(value, currency = 'MAD') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: ['MAD', 'EUR', 'USD'].includes(currency) ? currency : 'MAD',
    minimumFractionDigits: 2,
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

function createEmptyContract(companySettings = {}) {
  const type = 'intervention'
  const version = 'complete'
  const configuredRate = normalizeTaxRate(companySettings.defaultVatRate)
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
    elevators: [],
    elevatorIds: [],
    subject: '',
    siteAddress: '',
    startDate: todayAsInputValue(),
    endDate: '',
    priceHT: '',
    taxRate: configuredRate,
    taxAmount: 0,
    priceTTC: 0,
    warranty: '',
    responseTime: '',
    slaResponseTime: '4h',
    billingFrequency: 'Trimestriel',
    autoRenewal: false,
    noticeMonths: '3',
    amendments: [],
    scope: '',
    paymentTerms: 'Facturation selon la périodicité définie aux conditions particulières.',
    generalConditions: companySettings.defaultTermsAndConditions || '',
    status: 'Brouillon',
    clauses: getDefaultClauses(type, version),
  }
}

function getStatusIcon(status) {
  if (status === 'Actif') return CheckCircle2
  if (status === 'Expiré' || status === 'Résilié') return AlertCircle
  return FileText
}

export default function Contracts() {
  const navigate = useNavigate()
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
  const [formError, setFormError] = useState('')
  const [pageError, setPageError] = useState('')
  const [notice, setNotice] = useState('')
  const [companySettings, setCompanySettings] = useState({})
  const pdfRef = useRef(null)

  useEffect(() => onSnapshot(
    doc(db, 'settings', 'company'),
    (snapshot) => {
      setCompanySettings(snapshot.exists() ? snapshot.data() : {})
      setPageError('')
    },
    (settingsError) => setPageError(settingsError.message),
  ), [])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  )

  const allContracts = useMemo(() => contracts.map((contract) => {
    const client = clientById.get(contract.clientId)
    const financials = calculateContractAmounts(contract.priceHT, contract.taxRate)
    return {
      ...contract,
      __clientName: contract.clientName || getClientName(client),
      __elevatorLabel: getContractElevatorLabel(contract, client),
      __typeLabel: contractTypeLabel(contract.type),
      __typeKey: normalizeContractType(contract.type),
      __contractStatus: getContractStatus(contract),
      __amountTTC: financials.valid ? financials.totalTTC : null,
    }
  }), [contracts, clientById])

  const filteredContracts = useMemo(() => {
    const search = query.trim().toLowerCase()
    return allContracts.filter((contract) => {
      const matchesSearch = [
        contract.reference,
        contract.__clientName,
        contract.__elevatorLabel,
        contract.__typeLabel,
        contract.version,
        contract.__contractStatus,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
      return matchesSearch &&
        (!typeFilter || contract.__typeKey === typeFilter) &&
        (!statusFilter || contract.__contractStatus === statusFilter)
    })
  }, [allContracts, query, typeFilter, statusFilter])

  const table = useDataTable(filteredContracts)
  const exportColumns = [
    { label: 'N° Contrat', key: 'reference' },
    { label: 'Client', value: (contract) => contract.__clientName },
    { label: 'Ascenseur(s)', value: (contract) => contract.__elevatorLabel },
    { label: 'Type', value: (contract) => contract.__typeLabel },
    { label: 'Version', value: (contract) => contract.version === 'complete' ? 'Complète' : 'Simple' },
    { label: 'Date de début', value: (contract) => formatDate(contract.startDate) },
    { label: 'Date de fin', value: (contract) => formatDate(contract.endDate) },
    { label: 'Montant HT', value: (contract) => formatCurrency(contract.priceHT, companySettings.defaultCurrency) },
    { label: 'TVA', value: (contract) => `${Number(contract.taxRate) || 0} %` },
    { label: 'Montant TTC', value: (contract) => formatCurrency(contract.__amountTTC, companySettings.defaultCurrency) },
    { label: 'SLA garanti', value: (contract) => contract.slaResponseTime || contract.responseTime || '—' },
    { label: 'Échéancier', key: 'billingFrequency' },
    { label: 'Reconduction tacite', value: (contract) => contract.autoRenewal ? 'Oui' : 'Non' },
    { label: 'État', value: (contract) => contract.__contractStatus },
  ]

  const stats = useMemo(() => ({
    active: allContracts.filter((contract) => contract.__contractStatus === 'Actif').length,
    expiring: allContracts.filter((contract) =>
      ['Bientôt à terme', 'Préavis de renouvellement'].includes(contract.__contractStatus),
    ).length,
    expired: allContracts.filter((contract) => contract.__contractStatus === 'Expiré').length,
  }), [allContracts])

  const resetFilters = () => {
    setQuery('')
    setTypeFilter('')
    setStatusFilter('')
    table.setPage(1)
  }

  const openNew = () => {
    setEditingId(null)
    setForm(createEmptyContract(companySettings))
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (contract) => {
    const type = normalizeContractType(contract.type || 'installation')
    const version = contract.version === 'simple' ? 'simple' : 'complete'
    const client = clientById.get(contract.clientId)
    const clientElevators = Array.isArray(client?.elevators) ? client.elevators : []
    const matchingElevator = clientElevators.find((elevator, index) =>
      getElevatorId(elevator, index) === contract.elevatorId ||
      Boolean(contract.elevatorReference && elevator.reference === contract.elevatorReference),
    )
    const elevatorId = matchingElevator
      ? getElevatorId(matchingElevator, clientElevators.indexOf(matchingElevator))
      : ''
    const defaults = createEmptyContract(companySettings)
    const billingFrequency = normalizeBillingFrequency(contract.billingFrequency, type)
    const rate = normalizeTaxRate(contract.taxRate, Number(defaults.taxRate))
    const normalizedContract = {
      ...defaults,
      ...contract,
      id: contract.id,
      type,
      version,
      reference: contract.reference || createContractReference(),
      clientId: client ? contract.clientId : '',
      clientName: client ? getClientName(client) : contract.clientName || '',
      elevatorId,
      elevatorReference: matchingElevator?.reference || contract.elevatorReference || '',
      elevatorBrand: matchingElevator?.brand || contract.elevatorBrand || '',
      elevatorType: matchingElevator?.type || contract.elevatorType || '',
      elevators: matchingElevator
        ? [{
            id: elevatorId,
            reference: matchingElevator.reference || '',
            brand: matchingElevator.brand || '',
            type: matchingElevator.type || '',
          }]
        : [],
      elevatorIds: elevatorId ? [elevatorId] : [],
      subject: contract.subject || '',
      siteAddress: contract.siteAddress || client?.address || contract.clientAddress || '',
      priceHT: contract.priceHT == null ? '' : String(contract.priceHT),
      taxRate: rate,
      startDate: contract.startDate || '',
      endDate: contract.endDate || '',
      slaResponseTime: SLA_OPTIONS.includes(contract.slaResponseTime)
        ? contract.slaResponseTime
        : SLA_OPTIONS.includes(contract.responseTime) ? contract.responseTime : '24h',
      billingFrequency,
      autoRenewal: contract.autoRenewal === true,
      noticeMonths: String(contract.noticeMonths ?? 3),
      amendments: Array.isArray(contract.amendments) ? contract.amendments : [],
      scope: contract.scope || '',
      paymentTerms: contract.paymentTerms || defaults.paymentTerms,
      generalConditions: contract.generalConditions ?? companySettings.defaultTermsAndConditions ?? '',
      status: contract.status || 'Brouillon',
      clauses: contract.clauses || getDefaultClauses(type, version),
    }
    setEditingId(contract.id)
    setForm(normalizedContract)
    setFormError('')
    setFormOpen(true)
  }

  const saveContract = async (event) => {
    event.preventDefault()
    setFormError('')

    const type = normalizeContractType(form.type)
    const price = calculateContractAmounts(form.priceHT, Number(form.taxRate))
    const taxRate = Number(form.taxRate)
    const noticeMonths = Number(form.noticeMonths)
    const localClient = clientById.get(form.clientId)
    const localElevators = Array.isArray(localClient?.elevators) ? localClient.elevators : []
    const localElevator = localElevators.find((elevator, index) =>
      getElevatorId(elevator, index) === form.elevatorId,
    )
    const valid =
      CONTRACT_TYPES.includes(type) &&
      Boolean(localClient) &&
      Boolean(localElevator) &&
      Boolean(String(form.reference || '').trim()) &&
      Boolean(String(form.subject || '').trim()) &&
      Boolean(String(form.scope || '').trim()) &&
      Boolean(String(form.paymentTerms || '').trim()) &&
      Boolean(String(form.clauses || '').trim()) &&
      Boolean(isValidInputDate(form.startDate)) &&
      Boolean(isValidInputDate(form.endDate)) &&
      form.endDate >= form.startDate &&
      price.valid &&
      TAX_RATES.includes(taxRate) &&
      SLA_OPTIONS.includes(form.slaResponseTime) &&
      BILLING_FREQUENCIES.includes(form.billingFrequency) &&
      ['simple', 'complete'].includes(form.version) &&
      ['Brouillon', 'À signer', 'Actif', 'Terminé', 'Résilié'].includes(form.status) &&
      Number.isInteger(noticeMonths) &&
      noticeMonths >= 0 &&
      noticeMonths <= 24

    if (!valid) {
      const message = !localClient
        ? 'Sélectionnez un client enregistré.'
        : !localElevator
          ? 'Sélectionnez un ascenseur appartenant au parc du client choisi.'
          : price.error
            ? `Montant ou calcul financier invalide : ${price.error}`
            : 'Vérifiez les champs obligatoires, les dates, le montant, la TVA, le SLA, l’échéancier et le préavis (0 à 24 mois).'
      setFormError(message)
      return
    }

    setSaving(true)
    const contractReference = form.reference.trim()
    const contractRef = editingId
      ? doc(db, 'contracts', editingId)
      : doc(collection(db, 'contracts'))
    const clientRef = doc(db, 'clients', form.clientId)

    try {
      await runTransaction(db, async (transaction) => {
        const clientSnapshot = await transaction.get(clientRef)
        if (!clientSnapshot.exists()) {
          throw new Error('Le client sélectionné n’existe plus. Actualisez la liste et réessayez.')
        }

        const latestClient = { ...clientSnapshot.data(), id: clientSnapshot.id }
        const latestElevators = Array.isArray(latestClient.elevators) ? latestClient.elevators : []
        const latestElevator = latestElevators.find((elevator, index) =>
          getElevatorId(elevator, index) === form.elevatorId,
        )
        if (!latestElevator) {
          throw new Error('Cet ascenseur ne figure plus dans le parc du client. Sélectionnez un équipement à jour.')
        }

        const elevatorSnapshot = {
          id: form.elevatorId,
          reference: latestElevator.reference || '',
          brand: latestElevator.brand || '',
          type: latestElevator.type || '',
        }
        const contractData = {
          reference: contractReference,
          type,
          version: form.version,
          clientId: latestClient.id,
          clientName: getClientName(latestClient),
          clientAddress: latestClient.address || '',
          clientIce: latestClient.ice || '',
          elevatorId: form.elevatorId,
          elevatorIds: [form.elevatorId],
          elevatorReference: elevatorSnapshot.reference,
          elevatorBrand: elevatorSnapshot.brand,
          elevatorType: elevatorSnapshot.type,
          elevators: [elevatorSnapshot],
          subject: form.subject.trim(),
          siteAddress: String(form.siteAddress || '').trim() || latestClient.address || '',
          startDate: form.startDate,
          endDate: form.endDate,
          priceHT: price.totalHT,
          taxRate,
          taxAmount: price.taxAmount,
          priceTTC: price.totalTTC,
          warranty: String(form.warranty || '').trim(),
          responseTime: form.slaResponseTime,
          slaResponseTime: form.slaResponseTime,
          billingFrequency: form.billingFrequency,
          autoRenewal: form.autoRenewal === true,
          noticeMonths,
          amendments: Array.isArray(form.amendments) ? form.amendments : [],
          scope: form.scope.trim(),
          paymentTerms: form.paymentTerms.trim(),
          generalConditions: String(form.generalConditions || '').trim(),
          status: form.status,
          clauses: form.clauses.trim(),
          updatedAt: serverTimestamp(),
        }

        if (editingId) {
          transaction.update(contractRef, contractData)
        } else {
          transaction.set(contractRef, {
            ...contractData,
            createdAt: serverTimestamp(),
          })
        }
      })

      setFormOpen(false)
      setEditingId(null)
      setNotice(editingId ? 'Contrat mis à jour avec succès.' : 'Contrat créé avec succès.')
      setFormError('')
    } catch (saveError) {
      setFormError(
        saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer le contrat.',
      )
    } finally {
      setSaving(false)
    }
  }

  const removeContract = async (contract) => {
    if (!window.confirm(`Supprimer le contrat ${contract.reference || ''} ?`)) return
    setPageError('')
    try {
      await deleteDoc(doc(db, 'contracts', contract.id))
      setNotice('Contrat supprimé.')
    } catch (deleteError) {
      setPageError(
        deleteError instanceof Error ? deleteError.message : 'Impossible de supprimer ce contrat.',
      )
    }
  }

  const exportContract = async (contract) => {
    setPageError('')
    const client = clientById.get(contract.clientId)
    if (!client && !contract.clientName) {
      setPageError('Le client associé à ce contrat est introuvable.')
      return
    }

    setExportingId(contract.id)
    try {
      const companySnapshot = await getDoc(doc(db, 'settings', 'company'))
      setPdfRequest({
        contract,
        client: client || {
          name: contract.clientName,
          address: contract.clientAddress,
          ice: contract.clientIce,
        },
        company: companySnapshot.exists() ? companySnapshot.data() : {},
      })
    } catch (exportError) {
      setPageError(
        exportError instanceof Error
          ? exportError.message
          : 'Impossible de charger les informations société pour le PDF.',
      )
      setExportingId(null)
    }
  }

  const exportContractCsv = (contract) => {
    setPageError('')
    try {
      exportRowsToCsv(
        [contract],
        exportColumns,
        `${safeFilename(contract.reference || 'contrat')}.csv`,
      )
    } catch (exportError) {
      setPageError(
        exportError instanceof Error ? exportError.message : 'Impossible de créer le fichier CSV.',
      )
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
          setPageError(
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

  const hasFilters = Boolean(query || typeFilter || statusFilter)
  const currentError = pageError || contractsError || clientsError

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      {notice && (
        <div className="fixed right-4 top-4 z-[60] flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 shadow-xl" role="status">
          <CheckCircle2 aria-hidden="true" size={17} />
          {notice}
        </div>
      )}

      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-800">
            Engagements & maintenance
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Contrats
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Pilotez les contrats de maintenance, d’installation et de modernisation de votre parc.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-900 to-blue-800 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
          disabled={clientsLoading || clients.length === 0}
          onClick={openNew}
          type="button"
        >
          <FilePlus2 aria-hidden="true" size={18} />
          Nouveau contrat
        </button>
      </div>

      <section aria-label="Synthèse des contrats" className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Contrats actifs', value: stats.active, icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'À échéance / préavis', value: stats.expiring, icon: AlertCircle, color: 'text-orange-700', bg: 'bg-orange-50' },
          { label: 'Contrats expirés', value: stats.expired, icon: ShieldCheck, color: 'text-red-700', bg: 'bg-red-50' },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div className="flex items-center gap-3 rounded-2xl border border-white bg-white/80 p-4 shadow-lg shadow-slate-900/[0.03] ring-1 ring-slate-200/70 backdrop-blur-xl" key={item.label}>
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.bg} ${item.color}`}>
                <Icon aria-hidden="true" size={19} />
              </span>
              <div>
                <p className="text-xs font-medium text-slate-500">{item.label}</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{item.value}</p>
              </div>
            </div>
          )
        })}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-white bg-white/90 shadow-xl shadow-slate-900/[0.04] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-800">
              <ShieldCheck aria-hidden="true" size={19} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Gestion des contrats</p>
              <p className="text-xs text-slate-500">
                {filteredContracts.length} résultat{filteredContracts.length === 1 ? '' : 's'} sur {contracts.length}
              </p>
            </div>
          </div>
          <div className="grid w-full gap-2 sm:max-w-3xl sm:grid-cols-[minmax(190px,1fr)_170px_190px]">
            <label className="relative block">
              <span className="sr-only">Rechercher un contrat</span>
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={17}
              />
              <input
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                onChange={(event) => {
                  setQuery(event.target.value)
                  table.setPage(1)
                }}
                placeholder="Rechercher un contrat…"
                type="search"
                value={query}
              />
            </label>
            <select
              aria-label="Filtrer par type de contrat"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              onChange={(event) => {
                setTypeFilter(event.target.value)
                table.setPage(1)
              }}
              value={typeFilter}
            >
              <option value="">Tous les types</option>
              <option value="intervention">Maintenance</option>
              <option value="installation">Installation</option>
              <option value="modernisation">Modernisation</option>
            </select>
            <select
              aria-label="Filtrer par état du contrat"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              onChange={(event) => {
                setStatusFilter(event.target.value)
                table.setPage(1)
              }}
              value={statusFilter}
            >
              <option value="">Tous les états</option>
              {Object.keys(statusClass).map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
          <DataTableExportToolbar
            columns={exportColumns}
            rows={table.sortedItems}
            title="Liste des contrats"
          />
        </div>

        {currentError && (
          <p className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6" role="alert">
            {currentError}
          </p>
        )}

        {loading ? (
          <TableSkeleton columns={7} minWidth={1050} />
        ) : filteredContracts.length === 0 ? (
          <EmptyState
            actionLabel={hasFilters ? 'Effacer les filtres' : clients.length > 0 ? 'Créer un contrat' : 'Créer un client'}
            description={hasFilters
              ? 'Aucun contrat ne correspond à ces critères ; vous pouvez réinitialiser les filtres.'
              : clients.length > 0
                ? 'Associez un contrat à un client et à un ascenseur de son parc pour suivre sa durée et ses engagements.'
                : 'Ajoutez d’abord un client et son parc d’ascenseurs pour créer un contrat.'}
            icon={ShieldCheck}
            onAction={() => {
              if (hasFilters) resetFilters()
              else if (clients.length > 0) openNew()
              else navigate('/clients')
            }}
            title={hasFilters ? 'Aucun contrat trouvé' : 'Aucun contrat enregistré'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <SortableTableHeader className="px-5 py-3.5" columnKey="reference" label="N° Contrat" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__clientName" label="Client" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__elevatorLabel" label="Ascenseur(s)" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__typeLabel" label="Type" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="endDate" label="Date de fin" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__amountTTC" label="Montant TTC" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__contractStatus" label="Statut" {...table} />
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((contract) => {
                  const StatusIcon = getStatusIcon(contract.__contractStatus)
                  const animatedStatus = ['Expiré', 'Bientôt à terme', 'Préavis de renouvellement']
                    .includes(contract.__contractStatus)
                  return (
                    <tr className="transition hover:bg-blue-50/30" key={contract.id}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-900">
                          {contract.reference || 'Sans référence'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Début · {formatDate(contract.startDate)}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-700">
                        {contract.__clientName}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        {contract.__elevatorLabel}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-slate-700">{contract.__typeLabel}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {contract.version === 'complete' ? 'Version complète' : 'Version simple'}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                        {formatDate(contract.endDate)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold tabular-nums text-slate-800">
                        {contract.__amountTTC === null
                          ? '—'
                          : formatCurrency(contract.__amountTTC, companySettings.defaultCurrency)}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${animatedStatus ? 'animate-pulse motion-reduce:animate-none' : ''} ${statusClass[contract.__contractStatus] || statusClass.Brouillon}`}>
                          <StatusIcon aria-hidden="true" size={13} />
                          {contract.__contractStatus}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <button
                            aria-label={`Exporter le contrat ${contract.reference || ''} en PDF`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-800 disabled:cursor-wait disabled:opacity-50"
                            disabled={Boolean(exportingId)}
                            onClick={() => void exportContract(contract)}
                            title={exportingId === contract.id ? 'Génération du PDF…' : 'Exporter ce contrat en PDF'}
                            type="button"
                          >
                            {exportingId === contract.id
                              ? <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
                              : <FileDown aria-hidden="true" size={17} />}
                          </button>
                          <button
                            aria-label={`Exporter le contrat ${contract.reference || ''} en CSV`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                            onClick={() => exportContractCsv(contract)}
                            title="Exporter ce contrat en CSV"
                            type="button"
                          >
                            <FileSpreadsheet aria-hidden="true" size={17} />
                          </button>
                          <button
                            aria-label={`Voir ou modifier le contrat ${contract.reference || ''}`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                            onClick={() => openEdit(contract)}
                            title="Voir / modifier"
                            type="button"
                          >
                            <Pencil aria-hidden="true" size={16} />
                          </button>
                          <button
                            aria-label={`Supprimer le contrat ${contract.reference || ''}`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-700"
                            onClick={() => void removeContract(contract)}
                            title="Supprimer"
                            type="button"
                          >
                            <Trash2 aria-hidden="true" size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filteredContracts.length > 0 && <DataTablePagination {...table} />}
      </section>

      {formOpen && (
        <ContractForm
          clients={clients}
          clientsLoading={clientsLoading}
          contract={form}
          currency={companySettings.defaultCurrency || 'MAD'}
          error={formError}
          onCancel={() => {
            if (!saving) setFormOpen(false)
          }}
          onChange={setForm}
          onSubmit={saveContract}
          saving={saving}
        />
      )}

      {pdfRequest && (
        <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 -z-10">
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
