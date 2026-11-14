import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileDown, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
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
import DataTablePagination from '../components/common/DataTablePagination'
import SortableTableHeader from '../components/common/SortableTableHeader'
import InventoryPdf from '../components/pdf/InventoryPdf'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'

const CATEGORIES = [
  'Mécanique',
  'Électrique',
  'Cabine',
  'Quincaillerie',
  'Câbles',
  'Électronique',
  'Moteur',
  'Autre',
]
const EMPTY_ITEM = {
  name: '',
  reference: '',
  category: 'Mécanique',
  location: '',
  quantity: '0',
  purchasePrice: '0',
  salePrice: '0',
  vatRate: '20',
  alertThreshold: '0',
}
function createStockReference() {
  return `TGI-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'

function isLowStock(item) {
  const quantity = Number(item.quantity)
  const threshold = Number(item.alertThreshold)
  return Number.isFinite(quantity) && Number.isFinite(threshold) && quantity <= threshold
}

function formatCurrency(value, currency = 'MAD') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: ['MAD', 'EUR', 'USD'].includes(currency) ? currency : 'MAD',
    maximumFractionDigits: 2,
  }).format(amount)
}

export default function Stock() {
  const { data: items, loading, error: loadError } = useFirestoreCollection('stock')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [stockLevelFilter, setStockLevelFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_ITEM)
  const [defaultVatRate, setDefaultVatRate] = useState(20)
  const [defaultCurrency, setDefaultCurrency] = useState('MAD')
  const [settingsError, setSettingsError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pdfRequest, setPdfRequest] = useState(null)
  const [exporting, setExporting] = useState(false)
  const pdfRef = useRef(null)

  useEffect(() => onSnapshot(
    doc(db, 'settings', 'company'),
    (snapshot) => {
      const settings = snapshot.exists() ? snapshot.data() : {}
      const vatRate = Number(settings.defaultVatRate)
      setDefaultVatRate(Number.isFinite(vatRate) && vatRate >= 0 && vatRate <= 100 ? vatRate : 20)
      setDefaultCurrency(['MAD', 'EUR', 'USD'].includes(settings.defaultCurrency) ? settings.defaultCurrency : 'MAD')
      setSettingsError('')
    },
    (snapshotError) => setSettingsError(snapshotError.message),
  ), [])

  const filteredItems = useMemo(() => {
    const search = query.trim().toLowerCase()
    return items
      .filter((item) =>
        [item.name, item.designation, item.reference, item.category, item.location]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search)) &&
          (!categoryFilter || item.category === categoryFilter) &&
          (!stockLevelFilter || (stockLevelFilter === 'critical' ? isLowStock(item) : !isLowStock(item))),
      )
      .sort((first, second) => (first.name || '').localeCompare(second.name || '', 'fr'))
  }, [categoryFilter, items, query, stockLevelFilter])
  const table = useDataTable(filteredItems)
  const lowStockCount = items.filter(isLowStock).length
  const exportColumns = [
    { label: 'Désignation', value: (item) => item.name || item.designation },
    { label: 'Référence TGI', value: (item) => item.reference || item.tgiReference },
    { label: 'Catégorie', key: 'category' },
    { label: 'Emplacement', key: 'location' },
    { label: 'Quantité', key: 'quantity' },
    { label: 'Seuil d’alerte', key: 'alertThreshold' },
    { label: 'Prix d’achat HT', value: (item) => item.purchasePrice ?? item.unitPrice },
    { label: 'Prix de vente HT', value: (item) => item.salePrice ?? item.unitPrice },
    { label: 'TVA (%)', value: (item) => item.vatRate ?? 20 },
    { label: 'État', value: (item) => isLowStock(item) ? 'Critique' : 'Disponible' },
  ]

  useEffect(() => {
    if (!pdfRequest || !pdfRef.current) return undefined
    let cancelled = false
    const exportPdf = async () => {
      try {
        const generatePdf = (await import('../utils/pdfEngine')).default
        await generatePdf(pdfRef.current, 'etat-inventaire.pdf', pdfRequest.company)
      } catch (exportError) {
        if (!cancelled) setError(exportError instanceof Error ? exportError.message : 'Impossible de générer l’état de l’inventaire.')
      } finally {
        if (!cancelled) {
          setExporting(false)
          setPdfRequest(null)
        }
      }
    }
    void exportPdf()
    return () => { cancelled = true }
  }, [pdfRequest])

  const openNew = () => {
    setEditingId(null)
    setForm({
      ...EMPTY_ITEM,
      reference: createStockReference(),
      vatRate: String(defaultVatRate),
    })
    setError('')
    setFormOpen(true)
  }

  const openEdit = (item) => {
    setEditingId(item.id)
    setForm({
      name: item.name || '',
      designation: item.designation || item.name || '',
      reference: item.reference || item.tgiReference || '',
      category: CATEGORIES.includes(item.category) ? item.category : 'Autre',
      location: item.location || '',
      quantity: String(item.quantity ?? 0),
      purchasePrice: String(item.purchasePrice ?? item.unitPrice ?? 0),
      salePrice: String(item.salePrice ?? item.unitPrice ?? 0),
      vatRate: String(item.vatRate ?? defaultVatRate),
      alertThreshold: String(item.alertThreshold ?? 0),
    })
    setError('')
    setFormOpen(true)
  }

  const saveItem = async (event) => {
    event.preventDefault()
    setError('')
    const quantity = Number(form.quantity)
    const purchasePrice = Number(form.purchasePrice)
    const salePrice = Number(form.salePrice)
    const vatRate = Number(form.vatRate)
    const alertThreshold = Number(form.alertThreshold)
    if (
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      !Number.isFinite(purchasePrice) ||
      purchasePrice < 0 ||
      !Number.isFinite(salePrice) ||
      salePrice < 0 ||
      !Number.isFinite(vatRate) ||
      vatRate < 0 ||
      vatRate > 100 ||
      !Number.isInteger(alertThreshold) ||
      alertThreshold < 0
    ) {
      setError('Vérifiez les quantités, les prix, le taux de TVA (0 à 100 %) et le seuil d’alerte.')
      return
    }

    setSaving(true)
    const reference = form.reference.trim() || createStockReference()
    const itemData = {
      name: form.name.trim(),
      designation: form.name.trim(),
      reference,
      tgiReference: reference,
      category: form.category,
      location: form.location.trim(),
      quantity,
      purchasePrice,
      salePrice,
      vatRate,
      unitPrice: salePrice,
      alertThreshold,
      updatedAt: serverTimestamp(),
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'stock', editingId), itemData)
      } else {
        await addDoc(collection(db, 'stock'), {
          ...itemData,
          createdAt: serverTimestamp(),
        })
      }
      setFormOpen(false)
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer cet article.',
      )
    } finally {
      setSaving(false)
    }
  }

  const exportInventory = async () => {
    setError('')
    setExporting(true)
    try {
      const settings = await getDoc(doc(db, 'settings', 'company'))
      setPdfRequest({ company: settings.exists() ? settings.data() : {} })
    } catch (exportError) {
      setExporting(false)
      setError(exportError instanceof Error ? exportError.message : 'Impossible de charger les paramètres société.')
    }
  }

  const removeItem = async (item) => {
    if (!window.confirm(`Supprimer « ${item.name} » de l’inventaire ?`)) return
    setError('')
    try {
      await deleteDoc(doc(db, 'stock', item.id))
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Impossible de supprimer cet article.',
      )
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
            Logistique
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Stock</h1>
          <p className="mt-2 text-sm text-slate-500">
            Suivez les pièces, les quantités disponibles et les seuils de réapprovisionnement.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            disabled={exporting}
            onClick={() => void exportInventory()}
            type="button"
          >
            <FileDown aria-hidden="true" size={18} />
            {exporting ? 'Génération…' : 'Exporter l’inventaire'}
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-800 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-900"
            onClick={openNew}
            type="button"
          >
            <Plus aria-hidden="true" size={18} />
            Ajouter une pièce
          </button>
        </div>
      </div>

      <section className="mt-8 overflow-hidden rounded-2xl border border-white bg-white/90 shadow-xl shadow-slate-900/[0.04] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Package aria-hidden="true" size={19} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Inventaire des pièces</p>
              <p className="text-xs text-slate-500">
                {items.length} article{items.length === 1 ? '' : 's'}
                {lowStockCount > 0 && (
                  <span className="ml-2 font-semibold text-red-600">
                    · {lowStockCount} sous le seuil
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="grid w-full gap-2 sm:max-w-2xl sm:grid-cols-3">
            <label className="relative block sm:col-span-1">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                onChange={(event) => {
                  setQuery(event.target.value)
                  table.setPage(1)
                }}
                placeholder="Rechercher une pièce…"
                type="search"
                value={query}
              />
            </label>
            <select
              aria-label="Filtrer par catégorie"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              onChange={(event) => { setCategoryFilter(event.target.value); table.setPage(1) }}
              value={categoryFilter}
            >
              <option value="">Toutes les catégories</option>
              {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select
              aria-label="Filtrer par niveau de stock"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              onChange={(event) => { setStockLevelFilter(event.target.value); table.setPage(1) }}
              value={stockLevelFilter}
            >
              <option value="">Tous les niveaux</option>
              <option value="critical">Critique / rupture</option>
              <option value="available">Stock disponible</option>
            </select>
          </div>
        </div>
        <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
          <DataTableExportToolbar columns={exportColumns} rows={table.sortedItems} title="Inventaire des pièces" />
        </div>

        {(loadError || settingsError || error) && (
          <p className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6" role="alert">
            {error || loadError || settingsError}
          </p>
        )}

        {loading ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">Chargement de l’inventaire…</p>
        ) : filteredItems.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-700">
              {query || categoryFilter || stockLevelFilter ? 'Aucune pièce ne correspond aux filtres.' : 'Aucune pièce dans l’inventaire.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-240 text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <SortableTableHeader className="px-6 py-3.5" columnKey="name" label="Pièce" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="reference" label="Référence TGI" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="category" label="Catégorie" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="location" label="Emplacement" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="quantity" label="Quantité" {...table} />
                  <th className="px-5 py-3.5">Achat / Vente HT</th>
                  <SortableTableHeader className="px-5 py-3.5" columnKey="vatRate" label="TVA" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="alertThreshold" label="Seuil" {...table} />
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((item) => {
                  const low = isLowStock(item)
                  return (
                    <tr className={`transition hover:bg-slate-50/70 ${low ? 'bg-red-50/30' : ''}`} key={item.id}>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                        <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          low ? 'bg-red-50 text-red-700 ring-1 ring-red-600/15' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15'
                        }`}>
                          {low ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                          {low
                            ? Number(item.quantity) <= 0 ? 'Rupture' : 'Critique'
                            : 'Stock OK'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{item.reference || item.tgiReference || '—'}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">{item.category || '—'}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">{item.location || '—'}</td>
                      <td className={`px-5 py-4 text-sm font-semibold ${low ? 'text-red-700' : 'text-slate-700'}`}>
                        {item.quantity}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                        {formatCurrency(item.purchasePrice ?? item.unitPrice, defaultCurrency)} / {formatCurrency(item.salePrice ?? item.unitPrice, defaultCurrency)}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{Number(item.vatRate ?? 20)} %</td>
                      <td className="px-5 py-4 text-sm text-slate-600">{item.alertThreshold}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <button
                            aria-label={`Modifier ${item.name}`}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            onClick={() => openEdit(item)}
                            type="button"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            aria-label={`Supprimer ${item.name}`}
                            className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                            onClick={() => void removeItem(item)}
                            type="button"
                          >
                            <Trash2 size={16} />
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
        {!loading && filteredItems.length > 0 && <DataTablePagination {...table} />}
      </section>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-6">
          <section aria-labelledby="stock-form-title" aria-modal="true" className="my-auto w-full max-w-xl rounded-2xl bg-white shadow-2xl" role="dialog">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7">
              <div>
                <h2 className="text-lg font-semibold text-slate-900" id="stock-form-title">
                  {editingId ? 'Modifier la pièce' : 'Nouvelle pièce'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">Les seuils sont inclus dans les alertes du tableau de bord.</p>
              </div>
              <button aria-label="Fermer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setFormOpen(false)} type="button">
                <X size={19} />
              </button>
            </div>
            <form className="space-y-4 px-5 py-5 sm:px-7" onSubmit={saveItem}>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">Désignation *</span>
                <input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required value={form.name} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">Référence TGI · générée ou manuelle</span>
                <div className="flex gap-2">
                  <input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} value={form.reference} />
                  <button
                    className="shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    onClick={() => setForm((current) => ({ ...current, reference: createStockReference() }))}
                    type="button"
                  >
                    Générer
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">Catégorie *</span>
                <select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} value={form.category}>
                  {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">Emplacement / rayon</span>
                <input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} placeholder="Ex. Rayon A · Étagère 2" value={form.location} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Quantité en stock *</span>
                  <input className={inputClass} min="0" onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} required step="1" type="number" value={form.quantity} />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Seuil minimum *</span>
                  <input className={inputClass} min="0" onChange={(event) => setForm((current) => ({ ...current, alertThreshold: event.target.value }))} required step="1" type="number" value={form.alertThreshold} />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Prix d’achat HT unitaire ({defaultCurrency}) *</span>
                  <input className={inputClass} min="0" onChange={(event) => setForm((current) => ({ ...current, purchasePrice: event.target.value }))} required step="0.01" type="number" value={form.purchasePrice} />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Prix de vente HT unitaire ({defaultCurrency}) *</span>
                  <input className={inputClass} min="0" onChange={(event) => setForm((current) => ({ ...current, salePrice: event.target.value }))} required step="0.01" type="number" value={form.salePrice} />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">TVA (%) *</span>
                  <input className={inputClass} max="100" min="0" onChange={(event) => setForm((current) => ({ ...current, vatRate: event.target.value }))} required step="0.01" type="number" value={form.vatRate} />
                </label>
              </div>
              {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setFormOpen(false)} type="button">
                  Annuler
                </button>
                <button className="rounded-xl bg-blue-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-60" disabled={saving} type="submit">
                  {saving ? 'Enregistrement…' : editingId ? 'Enregistrer' : 'Créer la pièce'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {pdfRequest && (
        <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 -z-10">
          <InventoryPdf company={pdfRequest.company} items={items} ref={pdfRef} />
        </div>
      )}
    </main>
  )
}
