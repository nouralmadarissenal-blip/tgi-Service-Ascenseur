import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Clock3, FileDown, Plus, Search, Pencil, Trash2, Wrench, X } from 'lucide-react'
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
import { useAuth } from '../context/AuthContext'
import DataTableExportToolbar from '../components/common/DataTableExportToolbar'
import DataTablePagination from '../components/common/DataTablePagination'
import SortableTableHeader from '../components/common/SortableTableHeader'
import TechnicianPdf from '../components/pdf/TechnicianPdf'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'

const EMPTY_TECHNICIAN = {
  name: '',
  cin: '',
  cnss: '',
  phone: '',
  email: '',
  specialty: 'Polyvalent',
  hourlyRate: '',
  hireDate: '',
  status: 'Disponible',
}

const SPECIALTIES = ['Mécanique', 'Électrique', 'Polyvalent']
const STATUSES = ['Disponible', 'En mission', 'En congé', 'Maladie']
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'

const availabilityStyle = {
  Disponible: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  'En mission': 'bg-blue-50 text-blue-700 ring-blue-600/20',
  'En congé': 'bg-amber-50 text-amber-700 ring-amber-600/20',
  Maladie: 'bg-rose-50 text-rose-700 ring-rose-600/20',
}

function technicianStatus(technician) {
  const status = technician.status || technician.availability
  if (status === 'En mission' || status === 'En intervention') return 'En mission'
  if (status === 'En congé' || status === 'Inactif') return 'En congé'
  if (status === 'Maladie') return 'Maladie'
  return 'Disponible'
}

function technicianName(technician) {
  return technician.name || `${technician.firstName || ''} ${technician.lastName || ''}`.trim() || 'Technicien'
}

function technicianInitials(technician) {
  const name = technicianName(technician)
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toLocaleUpperCase('fr'))
    .join('') || 'T'
}

export default function Technicians() {
  const { role } = useAuth()
  const canViewHourlyRate = role === 'SuperAdmin' || role === 'Directeur'
  const { data: technicians, loading, error: loadError } =
    useFirestoreCollection('technicians')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [specialtyFilter, setSpecialtyFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_TECHNICIAN)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pdfRequest, setPdfRequest] = useState(null)
  const [exportingId, setExportingId] = useState('')
  const pdfRef = useRef(null)

  const filteredTechnicians = useMemo(() => {
    const search = query.trim().toLowerCase()
    return technicians
      .filter((technician) =>
        [technicianName(technician), technician.cin, technician.cnss, technician.phone, technician.email, technician.specialty, technicianStatus(technician)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search)) &&
          (!statusFilter || technicianStatus(technician) === statusFilter) &&
          (!specialtyFilter || technician.specialty === specialtyFilter),
      )
      .map((technician) => ({
        ...technician,
        __name: technicianName(technician),
        __status: technicianStatus(technician),
      }))
      .sort((first, second) => first.__name.localeCompare(second.__name, 'fr'))
  }, [technicians, query, specialtyFilter, statusFilter])
  const table = useDataTable(filteredTechnicians)
  const exportColumns = [
    { label: 'Technicien', value: (technician) => technician.__name },
    { label: 'CIN', key: 'cin' },
    { label: 'CNSS', key: 'cnss' },
    { label: 'Téléphone', key: 'phone' },
    { label: 'Email', key: 'email' },
    { label: 'Spécialité', key: 'specialty' },
    { label: 'Date d’embauche', key: 'hireDate' },
    { label: 'Statut', value: (technician) => technician.__status },
    ...(canViewHourlyRate ? [{ label: 'Taux horaire (MAD/h)', key: 'hourlyRate' }] : []),
  ]

  useEffect(() => {
    if (!pdfRequest || !pdfRef.current) return undefined
    let cancelled = false
    const exportPdf = async () => {
      try {
        const generatePdf = (await import('../utils/pdfEngine')).default
        await generatePdf(
          pdfRef.current,
          `fiche-technicien-${pdfRequest.technician.id}.pdf`,
          pdfRequest.company,
        )
      } catch (exportError) {
        if (!cancelled) {
          setError(exportError instanceof Error ? exportError.message : 'Impossible de générer la fiche PDF.')
        }
      } finally {
        if (!cancelled) {
          setExportingId('')
          setPdfRequest(null)
        }
      }
    }
    void exportPdf()
    return () => { cancelled = true }
  }, [pdfRequest])

  const openNew = () => {
    setEditingId(null)
    setForm(EMPTY_TECHNICIAN)
    setError('')
    setFormOpen(true)
  }

  const openEdit = (technician) => {
    setEditingId(technician.id)
    setForm({
      name: technicianName(technician) === 'Technicien' ? '' : technicianName(technician),
      cin: technician.cin || '',
      cnss: technician.cnss || '',
      phone: technician.phone || '',
      email: technician.email || '',
      specialty: SPECIALTIES.includes(technician.specialty) ? technician.specialty : 'Polyvalent',
      hourlyRate: technician.hourlyRate == null ? '' : String(technician.hourlyRate),
      hireDate: technician.hireDate || '',
      status: technicianStatus(technician),
    })
    setError('')
    setFormOpen(true)
  }

  const saveTechnician = async (event) => {
    event.preventDefault()
    const existingTechnician = technicians.find((technician) => technician.id === editingId)
    const enteredHourlyRate = form.hourlyRate === '' ? 0 : Number(form.hourlyRate)
    if (canViewHourlyRate && (!Number.isFinite(enteredHourlyRate) || enteredHourlyRate < 0)) {
      setError('Le taux horaire doit être un montant positif valide.')
      return
    }
    const name = form.name.trim()
    if (!name) {
      setError('Le nom complet du technicien est obligatoire.')
      return
    }
    setSaving(true)
    setError('')
    const [firstName = '', ...lastNameParts] = name.split(/\s+/)
    const technicianData = {
      ...form,
      name,
      firstName,
      lastName: lastNameParts.join(' '),
      cin: form.cin.trim(),
      cnss: form.cnss.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      specialty: form.specialty.trim(),
      hourlyRate: canViewHourlyRate
        ? enteredHourlyRate
        : Number(existingTechnician?.hourlyRate || 0),
      status: form.status,
      availability: form.status,
      updatedAt: serverTimestamp(),
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'technicians', editingId), technicianData)
      } else {
        await addDoc(collection(db, 'technicians'), {
          ...technicianData,
          createdAt: serverTimestamp(),
        })
      }
      setFormOpen(false)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Impossible d’enregistrer le technicien.',
      )
    } finally {
      setSaving(false)
    }
  }

  const exportTechnician = async (technician) => {
    setError('')
    setExportingId(technician.id)
    try {
      const companySnapshot = await getDoc(doc(db, 'settings', 'company'))
      setPdfRequest({
        technician: canViewHourlyRate ? technician : { ...technician, hourlyRate: null },
        company: companySnapshot.exists() ? companySnapshot.data() : {},
      })
    } catch (exportError) {
      setExportingId('')
      setError(exportError instanceof Error ? exportError.message : 'Impossible de charger les paramètres société.')
    }
  }

  const removeTechnician = async (technician) => {
    if (!window.confirm(`Supprimer la fiche de ${technician.name} ?`)) return
    setError('')
    try {
      await deleteDoc(doc(db, 'technicians', technician.id))
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Impossible de supprimer ce technicien.',
      )
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
            Équipe terrain
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Techniciens
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Gérez les coordonnées, spécialités et disponibilités de votre équipe.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-800 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-900"
          onClick={openNew}
          type="button"
        >
          <Plus aria-hidden="true" size={18} />
          Ajouter un technicien
        </button>
      </div>

      <section className="mt-8 overflow-hidden rounded-2xl border border-white bg-white/90 shadow-xl shadow-slate-900/[0.04] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Wrench aria-hidden="true" size={19} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Équipe technique</p>
              <p className="text-xs text-slate-500">
                {technicians.length} technicien{technicians.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="grid w-full gap-2 sm:max-w-2xl sm:grid-cols-[minmax(190px,1fr)_170px_170px]">
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
                placeholder="Rechercher un technicien…"
                type="search"
                value={query}
              />
            </label>
            <select aria-label="Filtrer par statut" className={inputClass} onChange={(event) => { setStatusFilter(event.target.value); table.setPage(1) }} value={statusFilter}>
              <option value="">Tous les statuts</option>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select aria-label="Filtrer par spécialité" className={inputClass} onChange={(event) => { setSpecialtyFilter(event.target.value); table.setPage(1) }} value={specialtyFilter}>
              <option value="">Toutes les spécialités</option>
              {SPECIALTIES.map((specialty) => <option key={specialty} value={specialty}>{specialty}</option>)}
            </select>
          </div>
        </div>
        <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
          <DataTableExportToolbar columns={exportColumns} rows={table.sortedItems} title="Liste des techniciens" />
        </div>

        {(loadError || error) && (
          <p
            className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6"
            role="alert"
          >
            {error || loadError}
          </p>
        )}

        {loading ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">
            Chargement de l’équipe…
          </p>
        ) : filteredTechnicians.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-700">
              {query || statusFilter || specialtyFilter ? 'Aucun technicien ne correspond aux filtres.' : 'Aucun technicien enregistré.'}
            </p>
            {!query && !statusFilter && !specialtyFilter && (
              <button
                className="mt-3 text-sm font-semibold text-blue-700 hover:text-blue-900"
                onClick={openNew}
                type="button"
              >
                Ajouter le premier technicien
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-180 text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <SortableTableHeader className="px-6 py-3.5" columnKey="__name" label="Technicien" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="cin" label="CIN" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="phone" label="Contact" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="specialty" label="Spécialité" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__status" label="Statut" {...table} />
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((technician) => (
                  <tr className="transition hover:bg-slate-50/70" key={technician.id}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 text-xs font-bold text-blue-800 ring-1 ring-blue-200">
                          {technicianInitials(technician)}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{technicianName(technician)}</p>
                          <p className="mt-1 text-xs text-slate-500">{technician.hireDate || 'Date d’embauche non renseignée'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{technician.cin || '—'}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      <span className="block">{technician.phone || '—'}</span>
                      <span className="block text-xs text-slate-400">{technician.email || '—'}</span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      <span>{technician.specialty || '—'}</span>
                      {canViewHourlyRate && (
                        <span className="mt-1 block text-xs text-slate-400">
                          {Number(technician.hourlyRate || 0)} MAD / h
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                          availabilityStyle[technicianStatus(technician)]
                        }`}
                      >
                        {technician.__status === 'Disponible'
                          ? <CheckCircle2 className="mr-1 inline" size={13} />
                          : technician.__status === 'En mission'
                            ? <Clock3 className="mr-1 inline" size={13} />
                            : technician.__status === 'Maladie'
                              ? <AlertTriangle className="mr-1 inline" size={13} />
                              : <AlertCircle className="mr-1 inline" size={13} />}
                        {technician.__status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <button
                          aria-label={`Générer la fiche PDF de ${technicianName(technician)}`}
                          className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                          disabled={exportingId === technician.id}
                          onClick={() => void exportTechnician(technician)}
                          type="button"
                        >
                          <FileDown size={16} />
                        </button>
                        <button
                          aria-label={`Modifier ${technicianName(technician)}`}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          onClick={() => openEdit(technician)}
                          type="button"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          aria-label={`Supprimer ${technicianName(technician)}`}
                          className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                          onClick={() => void removeTechnician(technician)}
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
        {!loading && filteredTechnicians.length > 0 && <DataTablePagination {...table} />}
      </section>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-6">
          <section
            aria-labelledby="technician-form-title"
            aria-modal="true"
            className="my-auto w-full max-w-xl rounded-2xl bg-white shadow-2xl"
            role="dialog"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7">
              <div>
                <h2 className="text-lg font-semibold text-slate-900" id="technician-form-title">
                  {editingId ? 'Modifier le technicien' : 'Nouveau technicien'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">Renseignez les informations de l’équipe.</p>
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
            <form className="space-y-4 px-5 py-5 sm:px-7" onSubmit={saveTechnician}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Nom complet *</span>
                  <input
                    autoComplete="name"
                    className={inputClass}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    value={form.name}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">CIN</span>
                  <input
                    className={inputClass}
                    onChange={(event) => setForm((current) => ({ ...current, cin: event.target.value }))}
                    value={form.cin}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">N° CNSS</span>
                  <input
                    className={inputClass}
                    onChange={(event) => setForm((current) => ({ ...current, cnss: event.target.value }))}
                    value={form.cnss}
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">Téléphone</span>
                <input
                  autoComplete="tel"
                  className={inputClass}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  type="tel"
                  value={form.phone}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">E-mail</span>
                <input
                  autoComplete="email"
                  className={inputClass}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  type="email"
                  value={form.email}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">Spécialité *</span>
                <select
                  className={inputClass}
                  onChange={(event) => setForm((current) => ({ ...current, specialty: event.target.value }))}
                  required
                  value={form.specialty}
                >
                  {SPECIALTIES.map((specialty) => <option key={specialty} value={specialty}>{specialty}</option>)}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                {canViewHourlyRate && (
                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">Taux horaire (MAD)</span>
                    <input
                      className={inputClass}
                      min="0"
                      onChange={(event) => setForm((current) => ({ ...current, hourlyRate: event.target.value }))}
                      step="0.01"
                      type="number"
                      value={form.hourlyRate}
                    />
                  </label>
                )}
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Date d’embauche</span>
                  <input
                    className={inputClass}
                    onChange={(event) => setForm((current) => ({ ...current, hireDate: event.target.value }))}
                    type="date"
                    value={form.hireDate}
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">Statut *</span>
                <select
                  className={inputClass}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                  value={form.status}
                >
                  {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
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
                  {saving ? 'Enregistrement…' : editingId ? 'Enregistrer' : 'Créer le technicien'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {pdfRequest && (
        <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 -z-10">
          <TechnicianPdf company={pdfRequest.company} ref={pdfRef} technician={pdfRequest.technician} />
        </div>
      )}
    </main>
  )
}
