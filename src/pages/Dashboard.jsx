import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  PackageX,
  TrendingUp,
  Wallet,
  Wrench,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link } from 'react-router-dom'
import { getContractTermState as getContractExpiryState } from '../utils/contractTermState'
import useFirestoreCollection from '../hooks/useFirestoreCollection'

const closedStatuses = new Set([
  'closed',
  'clôturée',
  'cloturee',
  'completed',
  'terminée',
  'terminee',
  'resolved',
  'facturée',
  'facturee',
  'validée',
  'validee',
])
const inProgressStatuses = new Set(['en cours', 'in progress', 'in_progress', 'ongoing'])
const paidStatuses = new Set(['paid', 'payé', 'payee', 'réglé', 'réglée', 'settled'])
const monthNames = [
  'Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin',
  'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.',
]

function normalizedStatus(value) {
  return String(value || '').trim().toLowerCase()
}

function asDate(value) {
  if (value && typeof value.toDate === 'function') return value.toDate()
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  if (typeof value === 'number') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

function formatCurrency(value, compact = false) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(amount)
}

function formatDate(value) {
  const date = asDate(value)
  return date ? date.toLocaleDateString('fr-FR') : 'Date non renseignée'
}

function displayClient(client) {
  return client?.name || client?.companyName || client?.clientName || 'Client non renseigné'
}

function getInvoiceBalance(invoice) {
  const storedBalance = Number(invoice.remainingAmount)
  if (invoice.remainingAmount !== undefined && invoice.remainingAmount !== null && Number.isFinite(storedBalance)) {
    return Math.max(0, storedBalance)
  }
  return Math.max(0, Number(invoice.totalTTC || 0) - Number(invoice.paidAmount || 0))
}

function getInvoiceRevenue(invoice) {
  const total = Number(invoice.totalHT ?? invoice.totalTTC ?? 0)
  return Number.isFinite(total) ? total : 0
}

function createRevenueSeries(invoices, now) {
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1)
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      monthLabel: `${monthNames[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`,
      revenue: 0,
    }
  })

  invoices.forEach((invoice) => {
    const date = asDate(invoice.issueDate || invoice.createdAt)
    if (!date) return
    const month = months.find(
      (entry) => entry.year === date.getFullYear() && entry.month === date.getMonth(),
    )
    if (month) month.revenue += getInvoiceRevenue(invoice)
  })
  return months
}

function getRevenueTrend(series) {
  const current = series[series.length - 1]?.revenue || 0
  const previous = series[series.length - 2]?.revenue || 0
  if (previous === 0) {
    return {
      label: current === 0 ? 'Stable' : 'Nouveau',
      isPositive: current >= previous,
    }
  }
  const percentage = Math.round(((current - previous) / previous) * 100)
  return {
    label: `${percentage > 0 ? '+' : ''}${percentage} %`,
    isPositive: percentage >= 0,
  }
}

function MetricCard({ title, value, detail, icon: Icon, tone, trend }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white bg-white/90 p-5 shadow-lg shadow-slate-900/[0.04] ring-1 ring-slate-200/70 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/[0.08]">
      <div aria-hidden="true" className={`absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-50 blur-2xl ${tone.split(' ')[0]}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-3 truncate text-2xl font-semibold tracking-tight text-slate-950 sm:text-[1.7rem]">{value}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${tone}`}>
          <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
        </span>
      </div>
      {trend && (
        <div className="relative mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3">
          {trend.isPositive
            ? <ArrowUpRight aria-hidden="true" className="text-emerald-600" size={15} />
            : <ArrowDownRight aria-hidden="true" className="text-rose-600" size={15} />}
          <span className={`text-xs font-semibold ${trend.isPositive ? 'text-emerald-700' : 'text-rose-700'}`}>
            {trend.label}
          </span>
          <span className="text-xs text-slate-400">vs mois précédent</span>
        </div>
      )}
    </article>
  )
}

function RevenueTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3.5 py-3 shadow-xl backdrop-blur">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

export default function Dashboard() {
  const clients = useFirestoreCollection('clients')
  const interventions = useFirestoreCollection('interventions')
  const sales = useFirestoreCollection('sales')
  const legacySales = useFirestoreCollection('salesDocuments')
  const stock = useFirestoreCollection('stock')
  const legacyReceivables = useFirestoreCollection('recouvrements')
  const contracts = useFirestoreCollection('contracts')

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const clientById = new Map(clients.data.map((client) => [client.id, client]))
  const invoices = [
    ...sales.data.map((document) => ({ ...document, sourceCollection: 'sales' })),
    ...legacySales.data.map((document) => ({ ...document, sourceCollection: 'salesDocuments' })),
  ].filter((document) => document.type === 'invoice')
  const revenueSeries = createRevenueSeries(invoices, now)
  const yearRevenue = invoices.reduce((sum, invoice) => {
    const date = asDate(invoice.issueDate || invoice.createdAt)
    return date?.getFullYear() === now.getFullYear() ? sum + getInvoiceRevenue(invoice) : sum
  }, 0)
  const totalOutstanding = invoices.reduce((sum, invoice) => sum + getInvoiceBalance(invoice), 0)
  const revenueTrend = getRevenueTrend(revenueSeries)
  const activeInterventions = interventions.data.filter((intervention) =>
    inProgressStatuses.has(normalizedStatus(intervention.status)),
  )
  const unfinishedInterventions = interventions.data.filter((intervention) => {
    const status = normalizedStatus(intervention.status)
    return intervention.closed !== true &&
      intervention.completed !== true &&
      !closedStatuses.has(status)
  })
  const outOfStockItems = stock.data.filter((item) => Number(item.quantity) <= 0)
  const lowStockItems = stock.data.filter((item) => {
    const quantity = Number(item.quantity)
    const threshold = Number(item.alertThreshold)
    return Number.isFinite(quantity) && Number.isFinite(threshold) && quantity <= threshold
  })
  const overdueInvoices = invoices.filter((invoice) => {
    const dueDate = asDate(invoice.dueDate)
    return dueDate && dueDate < today && getInvoiceBalance(invoice) > 0
  })
  const overduePayments = legacyReceivables.data.filter((payment) => {
    const status = normalizedStatus(payment.status)
    const dueDate = asDate(payment.dueDate || payment.dateEcheance)
    return !paidStatuses.has(status) && dueDate && dueDate < today &&
      payment.paid !== true && payment.paye !== true
  })
  const expiredContracts = contracts.data.filter(
    (contract) => getContractExpiryState(contract, today) === 'expired',
  )
  const expiringContracts = contracts.data.filter(
    (contract) => getContractExpiryState(contract, today) === 'expiring',
  )
  const renewalNoticeContracts = contracts.data.filter(
    (contract) => getContractExpiryState(contract, today) === 'renewal',
  )

  const sources = [clients, interventions, sales, legacySales, stock, legacyReceivables, contracts]
  const collectionError = sources.map((source) => source.error).find(Boolean)
  const isLoading = sources.some((source) => source.loading)
  const criticalAlertCount =
    overdueInvoices.length +
    overduePayments.length +
    expiredContracts.length +
    expiringContracts.length +
    renewalNoticeContracts.length +
    unfinishedInterventions.length +
    lowStockItems.length

  return (
    <main className="relative isolate min-h-full overflow-hidden bg-gray-50 px-4 py-8 sm:px-8 sm:py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
        <img alt="" className="h-auto w-[min(70vw,560px)] object-contain opacity-5" src="/logo.jpeg" />
      </div>
      <div className="relative z-10 mx-auto max-w-7xl">
        <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 px-6 py-7 text-white shadow-xl shadow-blue-950/15 sm:px-9 sm:py-9">
          <div aria-hidden="true" className="absolute -right-14 -top-20 -z-10 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
          <div aria-hidden="true" className="absolute bottom-[-8rem] right-1/4 -z-10 h-64 w-64 rounded-full bg-indigo-400/20 blur-3xl" />
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">
                <TrendingUp aria-hidden="true" size={15} /> Vue d’ensemble
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Bonjour, voici votre activité.</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100/80">
                Vos indicateurs financiers et opérationnels en un seul regard.
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 shadow-inner backdrop-blur-xl">
              <p className="text-[11px] font-medium uppercase tracking-wider text-blue-100/70">Aujourd’hui</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </section>

        {collectionError && (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            Erreur de chargement des données : {collectionError}
          </p>
        )}

        <section aria-label="Indicateurs clés" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            detail={`Factures HT émises en ${now.getFullYear()}`}
            icon={CircleDollarSign}
            title="Chiffre d’affaires"
            tone="bg-blue-50 text-blue-700 ring-blue-100"
            trend={revenueTrend}
            value={isLoading ? '—' : formatCurrency(yearRevenue, true)}
          />
          <MetricCard
            detail={`${overdueInvoices.length} facture${overdueInvoices.length === 1 ? '' : 's'} échue${overdueInvoices.length === 1 ? '' : 's'}`}
            icon={Wallet}
            title="Total impayés"
            tone="bg-rose-50 text-rose-700 ring-rose-100"
            value={isLoading ? '—' : formatCurrency(totalOutstanding, true)}
          />
          <MetricCard
            detail={`${unfinishedInterventions.length} intervention${unfinishedInterventions.length === 1 ? '' : 's'} à terminer`}
            icon={Wrench}
            title="Interventions en cours"
            tone="bg-amber-50 text-amber-700 ring-amber-100"
            value={isLoading ? '—' : activeInterventions.length}
          />
          <MetricCard
            detail={`${lowStockItems.length} pièce${lowStockItems.length === 1 ? '' : 's'} au seuil ou en dessous`}
            icon={PackageX}
            title="Pièces en rupture"
            tone="bg-violet-50 text-violet-700 ring-violet-100"
            value={isLoading ? '—' : outOfStockItems.length}
          />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.8fr)]">
          <article className="rounded-2xl border border-white bg-white p-5 shadow-lg shadow-slate-900/[0.04] ring-1 ring-slate-200/70 sm:p-7">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Performance</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Revenus mensuels</h2>
                <p className="mt-1 text-xs text-slate-500">Factures émises · 12 derniers mois · montants HT</p>
              </div>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 ring-1 ring-blue-100">
                <Banknote aria-hidden="true" size={14} /> {now.getFullYear()}
              </span>
            </div>
            <div className="mt-6 h-64 w-full">
              {isLoading ? (
                <div className="h-full animate-pulse rounded-xl bg-slate-100" />
              ) : (
                <ResponsiveContainer height="100%" width="100%">
                  <LineChart data={revenueSeries} margin={{ top: 8, right: 12, left: 2, bottom: 0 }}>
                    <CartesianGrid stroke="#e9eef5" strokeDasharray="4 5" vertical={false} />
                    <XAxis axisLine={false} dataKey="monthLabel" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} tickMargin={12} />
                    <YAxis
                      axisLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickFormatter={(value) => formatCurrency(value, true)}
                      tickLine={false}
                      width={62}
                    />
                    <Tooltip content={<RevenueTooltip />} cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }} />
                    <Line
                      activeDot={{ r: 5, fill: '#2563eb', stroke: '#fff', strokeWidth: 3 }}
                      dataKey="revenue"
                      dot={{ r: 3, fill: '#fff', stroke: '#2563eb', strokeWidth: 2 }}
                      stroke="#2563eb"
                      strokeLinecap="round"
                      strokeWidth={3}
                      type="monotone"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-white bg-white p-5 shadow-lg shadow-slate-900/[0.04] ring-1 ring-slate-200/70 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <ClipboardCheck aria-hidden="true" size={19} />
              </span>
              <div>
                <h2 className="font-semibold tracking-tight text-slate-900">Activité suivie</h2>
                <p className="mt-1 text-xs text-slate-500">État du portefeuille</p>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              {[
                { label: 'Clients actifs', value: clients.data.length, icon: CircleDollarSign, tone: 'text-blue-700 bg-blue-50' },
                { label: 'Interventions ouvertes', value: unfinishedInterventions.length, icon: Wrench, tone: 'text-amber-700 bg-amber-50' },
                { label: 'Articles sous le seuil', value: lowStockItems.length, icon: Boxes, tone: 'text-violet-700 bg-violet-50' },
              ].map(({ label, value, icon: Icon, tone }) => (
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3" key={label}>
                  <div className="flex items-center gap-3">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
                      <Icon aria-hidden="true" size={16} />
                    </span>
                    <span className="text-sm font-medium text-slate-600">{label}</span>
                  </div>
                  <span className="text-lg font-semibold text-slate-900">{isLoading ? '—' : value}</span>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-rose-200/80 bg-white shadow-lg shadow-rose-950/[0.04]">
          <div className="flex flex-col gap-3 border-b border-rose-100 bg-gradient-to-r from-rose-50 via-orange-50/70 to-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-rose-700 ring-1 ring-rose-200/70">
                <Banknote aria-hidden="true" size={20} />
              </span>
              <div>
                <h2 className="font-semibold text-slate-950">Alertes critiques</h2>
                <p className="mt-0.5 text-xs text-slate-500">À traiter en priorité</p>
              </div>
            </div>
            <span className="w-fit rounded-full bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-800 ring-1 ring-rose-200">
              {isLoading ? '…' : criticalAlertCount} alerte{criticalAlertCount === 1 ? '' : 's'}
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-6">
              <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : criticalAlertCount === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <ClipboardCheck aria-hidden="true" size={22} />
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-800">Aucune alerte critique</p>
              <p className="mt-1 text-xs text-slate-500">Les paiements, contrats, interventions et niveaux de stock sont à jour.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {overdueInvoices.map((invoice) => {
                const client = clientById.get(invoice.clientId)
                const email = client?.email
                const reminderSubject = encodeURIComponent(`Relance de paiement – facture ${invoice.number || ''}`)
                const reminderBody = encodeURIComponent(
                  `Bonjour ${displayClient(client)},\n\nSauf erreur de notre part, la facture ${invoice.number || ''} d’un solde de ${formatCurrency(getInvoiceBalance(invoice))} est arrivée à échéance le ${formatDate(invoice.dueDate)}.\n\nNous vous remercions de procéder à son règlement.\n\nCordialement,\nTGI Ascenseurs`,
                )
                return (
                  <article className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7" key={`invoice-${invoice.id}`}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
                        <ArrowDownRight aria-hidden="true" size={18} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Facture dépassée · {invoice.clientName || displayClient(client)}</p>
                        <p className="mt-1 text-xs text-slate-500">{invoice.number} · Échéance {formatDate(invoice.dueDate)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 pl-12 sm:pl-0">
                      <span className="text-sm font-bold text-rose-700">{formatCurrency(getInvoiceBalance(invoice))}</span>
                      {email ? (
                        <a className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-800" href={`mailto:${encodeURIComponent(email)}?subject=${reminderSubject}&body=${reminderBody}`}>
                          Relancer
                        </a>
                      ) : (
                        <Link className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-800" to={invoice.sourceCollection === 'sales' ? '/invoices' : '/collections'}>
                          Voir la facture
                        </Link>
                      )}
                    </div>
                  </article>
                )
              })}

              {expiredContracts.map((contract) => (
                <article className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7" key={`contract-expired-${contract.id}`}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
                      <FileText aria-hidden="true" size={17} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Contrat expiré · {contract.clientName || 'Client'}</p>
                      <p className="mt-1 text-xs text-slate-500">{contract.reference || 'Sans référence'} · Échéance {formatDate(contract.endDate)}</p>
                    </div>
                  </div>
                  <Link className="pl-12 text-xs font-semibold text-blue-700 hover:text-blue-900 sm:pl-0" to="/contracts">Voir le contrat</Link>
                </article>
              ))}

              {renewalNoticeContracts.map((contract) => (
                <article className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7" key={`contract-renewal-${contract.id}`}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-700">
                      <FileText aria-hidden="true" size={17} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Préavis de reconduction · {contract.clientName || 'Client'}</p>
                      <p className="mt-1 text-xs text-slate-500">{contract.reference || 'Sans référence'} · échéance {formatDate(contract.endDate)} · préavis {Number(contract.noticeMonths) || 0} mois</p>
                    </div>
                  </div>
                  <Link className="pl-12 text-xs font-semibold text-blue-700 hover:text-blue-900 sm:pl-0" to="/contracts">Examiner le renouvellement</Link>
                </article>
              ))}

              {expiringContracts.map((contract) => (
                <article className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7" key={`contract-expiring-${contract.id}`}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                      <FileText aria-hidden="true" size={17} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Contrat bientôt à terme · {contract.clientName || 'Client'}</p>
                      <p className="mt-1 text-xs text-slate-500">{contract.reference || 'Sans référence'} · Échéance {formatDate(contract.endDate)}</p>
                    </div>
                  </div>
                  <Link className="pl-12 text-xs font-semibold text-blue-700 hover:text-blue-900 sm:pl-0" to="/contracts">Voir le contrat</Link>
                </article>
              ))}

              {overduePayments.map((payment) => (
                <article className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7" key={`legacy-payment-${payment.id}`}>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Échéance en retard · {payment.clientName || 'Client'}</p>
                    <p className="mt-1 text-xs text-slate-500">Réf. {payment.reference || 'Recouvrement'} · {formatDate(payment.dueDate || payment.dateEcheance)}</p>
                  </div>
                  <Link className="text-xs font-semibold text-blue-700 hover:text-blue-900" to="/collections">Ouvrir le recouvrement</Link>
                </article>
              ))}

              {unfinishedInterventions.map((intervention) => {
                const client = clientById.get(intervention.clientId)
                return (
                  <article className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7" key={`intervention-${intervention.id}`}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                        <Wrench aria-hidden="true" size={17} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Intervention non terminée · {intervention.title || intervention.reference || 'Sans référence'}</p>
                        <p className="mt-1 text-xs text-slate-500">{intervention.clientName || displayClient(client)} · {intervention.status || 'Statut non renseigné'}</p>
                      </div>
                    </div>
                    <Link className="pl-12 text-xs font-semibold text-blue-700 hover:text-blue-900 sm:pl-0" to="/interventions">Voir l’intervention</Link>
                  </article>
                )
              })}

              {lowStockItems.map((item) => (
                <article className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7" key={`stock-${item.id}`}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-700">
                      <Boxes aria-hidden="true" size={17} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Stock critique · {item.name || 'Pièce sans nom'}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.quantity} disponible(s) · seuil d’alerte {item.alertThreshold}</p>
                    </div>
                  </div>
                  <Link className="pl-12 text-xs font-semibold text-blue-700 hover:text-blue-900 sm:pl-0" to="/stock">Gérer le stock</Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
