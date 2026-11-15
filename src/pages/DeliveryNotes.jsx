import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  FilePlus2,
  FileText,
  LoaderCircle,
  Package,
  PackageCheck,
  Pencil,
  Search,
  ShieldAlert,
  Truck,
  XCircle,
} from 'lucide-react'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase/config'
import EmptyState from '../components/common/EmptyState'
import DataTableExportToolbar from '../components/common/DataTableExportToolbar'
import DataTablePagination from '../components/common/DataTablePagination'
import SortableTableHeader from '../components/common/SortableTableHeader'
import TableSkeleton from '../components/common/TableSkeleton'
import DeliveryNoteForm from '../components/delivery/DeliveryNoteForm'
import DeliveryNotePdf from '../components/delivery/DeliveryNotePdf'
import useDataTable from '../hooks/useDataTable'
import useFirestoreCollection from '../hooks/useFirestoreCollection'

const STATUSES = ['Brouillon', 'Validé & Livré', 'Annulé']
const UNITS = ['Pièce', 'Mètre', 'Litre']
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-steel-500 focus:ring-4 focus:ring-steel-100'

function localDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function inputDate(value, fallback = '') {
  if (value && typeof value.toDate === 'function') {
    const date = value.toDate()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : fallback
}

function formatDate(value) {
  const dateValue = inputDate(value)
  if (!dateValue) return '—'
  const date = new Date(`${dateValue}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR')
}

function createId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `delivery-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function clientName(client) {
  return client?.name || client?.companyName || client?.clientName || 'Client'
}

function clientAddress(client) {
  return [client?.address, client?.city, client?.postalCode].filter(Boolean).join(', ')
}

function createEmptyForm() {
  return {
    clientId: '',
    deliveryDate: localDate(),
    linkedDocumentKey: '',
    linkedDocumentCollection: '',
    linkedDocumentId: '',
    linkedDocumentNumber: '',
    linkedDocumentType: '',
    linkedDocumentReference: '',
    carrierName: '',
    deliveryAddress: '',
    notes: '',
    items: [{
      id: createId(),
      stockId: '',
      reference: '',
      designation: '',
      quantity: '1',
      unit: 'Pièce',
    }],
  }
}

function mapNoteToForm(note) {
  const items = (Array.isArray(note.items) ? note.items : []).map((line) => ({
    id: createId(),
    stockId: line.stockId || '',
    reference: line.reference || '',
    designation: line.name || line.designation || '',
    quantity: String(line.quantity ?? 1),
    unit: UNITS.includes(line.unit) ? line.unit : 'Pièce',
  }))
  const linkedDocumentCollection = note.linkedDocumentCollection || ''
  const linkedDocumentId = note.linkedDocumentId || ''
  return {
    clientId: note.clientId || '',
    deliveryDate: inputDate(note.deliveryDate, localDate()),
    linkedDocumentKey: linkedDocumentCollection && linkedDocumentId
      ? `${linkedDocumentCollection}:${linkedDocumentId}`
      : '',
    linkedDocumentCollection,
    linkedDocumentId,
    linkedDocumentNumber: note.linkedDocumentNumber || '',
    linkedDocumentType: note.linkedDocumentType || '',
    linkedDocumentReference: note.linkedDocumentReference || '',
    carrierName: note.carrierName || '',
    deliveryAddress: note.deliveryAddress || '',
    notes: note.notes || '',
    items: items.length ? items : createEmptyForm().items,
  }
}

function formatDocumentNumber(prefix, year, sequence) {
  return `${prefix}-${year}-${String(sequence).padStart(3, '0')}`
}

function normalizePrefix(value) {
  return String(value || 'BL').trim().replace(/-+$/, '') || 'BL'
}

function getStatus(note) {
  if (STATUSES.includes(note.status)) return note.status
  const status = String(note.status || '').trim().toLowerCase()
  if (note.stockDeducted === true || ['delivered', 'validé & livré', 'validé', 'livré', 'livree', 'livrée'].includes(status)) {
    return 'Validé & Livré'
  }
  if (['cancelled', 'canceled', 'annulé', 'annule'].includes(status)) return 'Annulé'
  return 'Brouillon'
}

function getStatusStyle(status) {
  if (status === 'Validé & Livré') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'Annulé') return 'border-red-200 bg-red-50 text-red-800'
  return 'border-slate-200 bg-slate-100 text-slate-700'
}

function getStatusIcon(status) {
  if (status === 'Validé & Livré') return BadgeCheck
  if (status === 'Annulé') return ShieldAlert
  return FileText
}

function safeFilename(value) {
  return String(value || 'bon-de-livraison')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'bon-de-livraison'
}

function linkedDocumentLabel(document) {
  return document.type === 'invoice' ? 'Facture' : 'Devis'
}

export default function DeliveryNotes() {
  const { role, user } = useAuth()
  const { data: clients, loading: clientsLoading, error: clientsError } = useFirestoreCollection('clients')
  const { data: stock, loading: stockLoading, error: stockError } = useFirestoreCollection('stock')
  const { data: notes, loading: notesLoading, error: notesError } = useFirestoreCollection('delivery_notes')
  const { data: quotes, loading: quotesLoading, error: quotesError } = useFirestoreCollection('quotes')
  const { data: sales, loading: salesLoading, error: salesError } = useFirestoreCollection('sales')
  const [company, setCompany] = useState({})
  const [settingsError, setSettingsError] = useState('')
  const [form, setForm] = useState(createEmptyForm)
  const [editingNote, setEditingNote] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [validatingId, setValidatingId] = useState('')
  const [cancellingId, setCancellingId] = useState('')
  const [exportingId, setExportingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pdfRequest, setPdfRequest] = useState(null)
  const [numberPreview, setNumberPreview] = useState('')
  const [numberPreviewLoading, setNumberPreviewLoading] = useState(false)
  const [numberPreviewError, setNumberPreviewError] = useState('')
  const pdfRef = useRef(null)

  useEffect(() => onSnapshot(
    doc(db, 'settings', 'company'),
    (snapshot) => {
      setCompany(snapshot.exists() ? snapshot.data() : {})
      setSettingsError('')
    },
    (snapshotError) => setSettingsError(snapshotError.message),
  ), [])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const clientsById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients])
  const stockById = useMemo(() => new Map(stock.map((item) => [item.id, item])), [stock])

  const linkedDocuments = useMemo(() => {
    const quoteDocuments = quotes.map((quote) => ({
      ...quote,
      key: `quotes:${quote.id}`,
      collectionName: 'quotes',
      type: 'quote',
      label: 'Devis',
    }))
    const salesDocuments = sales
      .filter((document) => ['quote', 'invoice'].includes(document.type))
      .map((document) => ({
        ...document,
        key: `sales:${document.id}`,
        collectionName: 'sales',
        label: linkedDocumentLabel(document),
      }))
    return [...quoteDocuments, ...salesDocuments]
      .filter((document) => document.number && document.clientId)
      .sort((first, second) => String(second.issueDate || '').localeCompare(String(first.issueDate || '')))
  }, [quotes, sales])

  const linePreviews = useMemo(() => form.items.map((line) => {
    const stockItem = stockById.get(line.stockId)
    const quantity = Number(line.quantity)
    let lineError = ''
    if (!line.stockId || !stockItem) lineError = 'Sélectionnez un article existant dans le stock.'
    else if (!String(line.designation || '').trim()) lineError = 'La désignation est obligatoire.'
    else if (!Number.isSafeInteger(quantity) || quantity <= 0) lineError = 'La quantité doit être un entier positif.'
    else if (!UNITS.includes(line.unit)) lineError = 'Sélectionnez une unité valide.'
    const currentQuantity = Number(stockItem?.quantity)
    const availableQuantity = Number.isSafeInteger(currentQuantity) && currentQuantity >= 0
      ? currentQuantity
      : null
    return {
      error: lineError,
      stockItem,
      quantity,
      availableQuantity,
      overStock: !lineError && availableQuantity !== null && quantity > availableQuantity,
    }
  }), [form.items, stockById])

  const deliveryNotes = useMemo(() => notes.map((note) => {
    const client = clientsById.get(note.clientId)
    const related = note.linkedDocumentNumber ||
      linkedDocuments.find((document) =>
        document.collectionName === note.linkedDocumentCollection &&
        document.id === note.linkedDocumentId,
      )?.number ||
      note.linkedDocumentReference ||
      '—'
    return {
      ...note,
      __clientName: note.clientName || clientName(client),
      __linkedDocument: related,
      __status: getStatus(note),
      __date: inputDate(note.deliveryDate),
    }
  }), [notes, clientsById, linkedDocuments])

  const filteredNotes = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('fr')
    return deliveryNotes
      .filter((note) => !clientFilter || note.clientId === clientFilter)
      .filter((note) => !statusFilter || note.__status === statusFilter)
      .filter((note) =>
        [note.number, note.__clientName, note.__linkedDocument, note.__status]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('fr').includes(search)),
      )
  }, [deliveryNotes, query, clientFilter, statusFilter])
  const table = useDataTable(filteredNotes)
  const exportColumns = [
    { label: 'N° BL', key: 'number' },
    { label: 'Date', value: (note) => formatDate(note.deliveryDate) },
    { label: 'Client', key: '__clientName' },
    { label: 'Document lié', key: '__linkedDocument' },
    { label: 'Statut', key: '__status' },
  ]

  useEffect(() => {
    if (!formOpen || !isValidDate(form.deliveryDate)) return undefined
    if (
      editingNote?.number &&
      inputDate(editingNote.deliveryDate).slice(0, 4) === form.deliveryDate.slice(0, 4)
    ) {
      return undefined
    }
    let active = true
    getDoc(doc(db, 'salesCounters', `deliveryNote-${form.deliveryDate.slice(0, 4)}`))
      .then((snapshot) => {
        if (!active) return
        const current = Number(snapshot.data()?.value || 0)
        if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) {
          throw new Error('Le compteur des bons de livraison est invalide.')
        }
        setNumberPreviewError('')
        setNumberPreview(formatDocumentNumber(
          normalizePrefix(company.deliveryNotePrefix),
          form.deliveryDate.slice(0, 4),
          current + 1,
        ))
      })
      .catch((previewError) => {
        if (active) {
          setNumberPreview('')
          setNumberPreviewError(previewError instanceof Error ? previewError.message : 'Impossible de charger le numéro prévisionnel.')
        }
      })
      .finally(() => {
        if (active) setNumberPreviewLoading(false)
      })
    return () => { active = false }
  }, [company.deliveryNotePrefix, editingNote, form.deliveryDate, formOpen])

  useEffect(() => {
    if (!pdfRequest || !pdfRef.current) return undefined
    let active = true
    const exportPdf = async () => {
      try {
        const generate = (await import('../utils/pdfEngine')).default
        await generate(pdfRef.current, `${safeFilename(pdfRequest.note.number)}.pdf`, company)
      } catch (pdfError) {
        if (active) setError(pdfError instanceof Error ? pdfError.message : 'Impossible de générer le PDF du BL.')
      } finally {
        if (active) {
          setExportingId('')
          setPdfRequest(null)
        }
      }
    }
    void exportPdf()
    return () => { active = false }
  }, [pdfRequest, company])

  const openNew = () => {
    setEditingNote(null)
    setForm(createEmptyForm())
    setNumberPreview('')
    setNumberPreviewError('')
    setNumberPreviewLoading(true)
    setError('')
    setNotice('')
    setFormOpen(true)
  }

  const openEdit = (note) => {
    if (note.__status !== 'Brouillon' || note.stockDeducted === true) {
      setError('Seul un bon de livraison en brouillon non validé peut être modifié.')
      return
    }
    setEditingNote(note)
    setForm(mapNoteToForm(note))
    setNumberPreview(note.number || '')
    setNumberPreviewError('')
    setNumberPreviewLoading(false)
    setError('')
    setNotice('')
    setFormOpen(true)
  }

  const setField = (name, value) => {
    if (name === 'deliveryDate') {
      const reuseExistingNumber = editingNote?.number &&
        isValidDate(value) &&
        inputDate(editingNote.deliveryDate).slice(0, 4) === value.slice(0, 4)
      setNumberPreview(reuseExistingNumber ? editingNote.number : '')
      setNumberPreviewError('')
      setNumberPreviewLoading(isValidDate(value) && !reuseExistingNumber)
    }
    setForm((current) => ({ ...current, [name]: value }))
  }

  const selectClient = (clientId) => {
    const client = clientsById.get(clientId)
    setForm((current) => {
      const linkedClient = linkedDocuments.find((document) =>
        document.collectionName === current.linkedDocumentCollection &&
        document.id === current.linkedDocumentId,
      )
      const keepLinkedDocument = current.linkedDocumentKey
        ? linkedClient?.clientId === clientId
        : true
      return {
        ...current,
        clientId,
        deliveryAddress: clientAddress(client),
        linkedDocumentKey: keepLinkedDocument ? current.linkedDocumentKey : '',
        linkedDocumentCollection: keepLinkedDocument ? current.linkedDocumentCollection : '',
        linkedDocumentId: keepLinkedDocument ? current.linkedDocumentId : '',
        linkedDocumentNumber: keepLinkedDocument ? current.linkedDocumentNumber : '',
        linkedDocumentType: keepLinkedDocument ? current.linkedDocumentType : '',
        linkedDocumentReference: keepLinkedDocument ? current.linkedDocumentReference : '',
      }
    })
  }

  const selectLinkedDocument = (key) => {
    const document = linkedDocuments.find((item) => item.key === key)
    if (!document) {
      setForm((current) => ({
        ...current,
        linkedDocumentKey: '',
        linkedDocumentCollection: '',
        linkedDocumentId: '',
        linkedDocumentNumber: '',
        linkedDocumentType: '',
        linkedDocumentReference: '',
      }))
      return
    }
    const linkedClient = clientsById.get(document.clientId)
    setForm((current) => ({
      ...current,
      clientId: document.clientId,
      deliveryAddress: clientAddress(linkedClient) || current.deliveryAddress,
      linkedDocumentKey: document.key,
      linkedDocumentCollection: document.collectionName,
      linkedDocumentId: document.id,
      linkedDocumentNumber: document.number || '',
      linkedDocumentType: document.type,
      linkedDocumentReference: `${document.label} ${document.number}`,
    }))
  }

  const updateLine = (lineIndex, changes) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line, index) => index === lineIndex
        ? { ...line, ...changes }
        : line),
    }))
  }

  const selectStockItem = (lineIndex, stockId) => {
    const item = stockById.get(stockId)
    updateLine(lineIndex, {
      stockId,
      reference: item?.reference || item?.tgiReference || '',
      designation: item?.name || item?.designation || '',
    })
  }

  const addLine = () => {
    setForm((current) => ({
      ...current,
      items: [...current.items, {
        id: createId(),
        stockId: '',
        reference: '',
        designation: '',
        quantity: '1',
        unit: 'Pièce',
      }],
    }))
  }

  const removeLine = (lineIndex) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, index) => index !== lineIndex),
    }))
  }

  const saveDraft = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    const selectedClient = clientsById.get(form.clientId)
    if (!selectedClient) {
      setError('Sélectionnez un client valide.')
      return
    }
    if (!isValidDate(form.deliveryDate)) {
      setError('Renseignez une date de livraison valide.')
      return
    }
    if (!String(form.deliveryAddress || '').trim()) {
      setError('L’adresse de livraison est obligatoire.')
      return
    }
    if (!form.items.length || linePreviews.some((preview) => preview.error)) {
      setError('Ajoutez au moins un article et vérifiez les lignes, quantités et unités.')
      return
    }
    if (editingNote && (editingNote.__status !== 'Brouillon' || editingNote.stockDeducted === true)) {
      setError('Un BL validé ou annulé ne peut pas être modifié.')
      return
    }

    setSaving(true)
    const isEditing = Boolean(editingNote)
    const noteRef = isEditing
      ? doc(db, 'delivery_notes', editingNote.id)
      : doc(collection(db, 'delivery_notes'))
    const settingsRef = doc(db, 'settings', 'company')
    const sequenceRef = doc(db, 'salesCounters', `deliveryNote-${form.deliveryDate.slice(0, 4)}`)
    const stockIds = [...new Set(form.items.map((line) => line.stockId))]
    const stockRefs = stockIds.map((id) => doc(db, 'stock', id))
    const linkedDocRef = form.linkedDocumentCollection && form.linkedDocumentId
      ? doc(db, form.linkedDocumentCollection, form.linkedDocumentId)
      : null
    const reuseNumber = isEditing &&
      editingNote.number &&
      inputDate(editingNote.deliveryDate).slice(0, 4) === form.deliveryDate.slice(0, 4)

    try {
      const saved = await runTransaction(db, async (transaction) => {
        const refs = [settingsRef]
        if (!reuseNumber) refs.push(sequenceRef)
        refs.push(doc(db, 'clients', form.clientId))
        if (isEditing) refs.push(noteRef)
        if (linkedDocRef) refs.push(linkedDocRef)
        refs.push(...stockRefs)
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)))
        let index = 0
        const settingsSnapshot = snapshots[index++]
        const counterSnapshot = reuseNumber ? null : snapshots[index++]
        const clientSnapshot = snapshots[index++]
        const existingSnapshot = isEditing ? snapshots[index++] : null
        const linkedSnapshot = linkedDocRef ? snapshots[index++] : null
        const stockSnapshots = snapshots.slice(index)
        const stockAtSave = new Map(stockIds.map((id, stockIndex) => [id, stockSnapshots[stockIndex]]))
        if (!clientSnapshot.exists()) throw new Error('Le client n’existe plus. Actualisez la page.')
        const client = { ...clientSnapshot.data(), id: clientSnapshot.id }
        if (isEditing && !existingSnapshot?.exists()) throw new Error('Ce bon a été supprimé. Actualisez la liste.')
        if (isEditing && (existingSnapshot.data().stockDeducted === true || getStatus(existingSnapshot.data()) !== 'Brouillon')) {
          throw new Error('Seul un brouillon non validé peut être modifié.')
        }
        let linkedDocument = null
        if (linkedDocRef) {
          if (!linkedSnapshot?.exists()) throw new Error('Le document lié n’existe plus.')
          linkedDocument = linkedSnapshot.data()
          if (!['quote', 'invoice'].includes(linkedDocument.type)) {
            throw new Error('Seuls un devis ou une facture peuvent être liés à ce BL.')
          }
          if (linkedDocument.clientId !== client.id) {
            throw new Error('Le document lié appartient à un autre client.')
          }
        }
        const resolvedLines = form.items.map((line) => {
          const itemSnapshot = stockAtSave.get(line.stockId)
          if (!line.stockId || !itemSnapshot?.exists()) {
            throw new Error('Un article sélectionné n’existe plus dans l’inventaire.')
          }
          const item = itemSnapshot.data()
          const quantity = Number(line.quantity)
          const unit = String(line.unit || '')
          const designation = String(line.designation || '').trim()
          if (!Number.isSafeInteger(quantity) || quantity <= 0) {
            throw new Error(`La quantité de « ${designation || item.name || 'l’article'} » doit être un entier positif.`)
          }
          if (!UNITS.includes(unit)) throw new Error('Une unité de livraison est invalide.')
          if (!designation) throw new Error('La désignation de chaque article est obligatoire.')
          return {
            stockId: line.stockId,
            reference: item.reference || item.tgiReference || line.reference || '',
            name: designation,
            designation,
            quantity,
            unit,
          }
        })
        let number = reuseNumber ? editingNote.number : ''
        if (!reuseNumber) {
          const currentSequence = Number(counterSnapshot?.data()?.value || 0)
          if (!Number.isSafeInteger(currentSequence) || currentSequence < 0 || currentSequence >= Number.MAX_SAFE_INTEGER) {
            throw new Error('Le compteur des bons de livraison est invalide ou a atteint sa limite.')
          }
          number = formatDocumentNumber(
            normalizePrefix(settingsSnapshot.exists() ? settingsSnapshot.data().deliveryNotePrefix : ''),
            form.deliveryDate.slice(0, 4),
            currentSequence + 1,
          )
          transaction.set(sequenceRef, { value: currentSequence + 1, updatedAt: serverTimestamp() })
        }
        const data = {
          type: 'deliveryNote',
          number,
          clientId: client.id,
          clientName: clientName(client),
          clientAddress: client.address || '',
          clientCity: client.city || '',
          clientPostalCode: client.postalCode || '',
          clientPhone: client.phone || client.phone1 || '',
          clientEmail: client.email || '',
          clientIce: client.ice || '',
          deliveryDate: form.deliveryDate,
          linkedDocumentCollection: linkedDocRef ? form.linkedDocumentCollection : '',
          linkedDocumentId: linkedDocRef ? form.linkedDocumentId : '',
          linkedDocumentNumber: linkedDocRef
            ? linkedDocument.number || form.linkedDocumentNumber || ''
            : '',
          linkedDocumentType: linkedDocRef ? linkedDocument.type : '',
          linkedDocumentReference: String(form.linkedDocumentReference || '').trim(),
          carrierName: String(form.carrierName || '').trim(),
          deliveryAddress: String(form.deliveryAddress || '').trim(),
          notes: String(form.notes || '').trim(),
          items: resolvedLines,
          status: 'Brouillon',
          stockDeducted: false,
          updatedAt: serverTimestamp(),
        }
        if (isEditing) transaction.update(noteRef, data)
        else transaction.set(noteRef, { ...data, createdAt: serverTimestamp() })
        return { ...data, id: noteRef.id }
      })
      setFormOpen(false)
      setEditingNote(null)
      setNotice(`Bon de livraison ${saved.number} enregistré en brouillon.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer ce bon de livraison.')
    } finally {
      setSaving(false)
    }
  }

  const validateDelivery = async (note) => {
    if (!['Directeur', 'SuperAdmin'].includes(role)) {
      setError('Seul le Directeur ou le SuperAdmin peut valider une livraison.')
      return
    }
    if (note.__status !== 'Brouillon' || note.stockDeducted === true) {
      setError('Ce bon ne peut pas être livré une seconde fois.')
      return
    }
    if (!window.confirm(`Valider le BL ${note.number || ''} et décrémenter le stock ? Cette opération ne peut être effectuée qu’une fois.`)) {
      return
    }
    setError('')
    setNotice('')
    setValidatingId(note.id)
    try {
      await runTransaction(db, async (transaction) => {
        const noteRef = doc(db, 'delivery_notes', note.id)
        const noteSnapshot = await transaction.get(noteRef)
        if (!noteSnapshot.exists()) throw new Error('Ce bon de livraison n’existe plus.')
        const currentNote = noteSnapshot.data()
        if (getStatus(currentNote) !== 'Brouillon') {
          throw new Error('Ce bon a déjà été validé ou annulé.')
        }
        if (currentNote.stockDeducted === true) {
          throw new Error('Le stock a déjà été décrémenté pour ce bon.')
        }
        const requiredByStock = new Map()
        for (const line of currentNote.items || []) {
          const stockId = String(line.stockId || '')
          const quantity = Number(line.quantity)
          if (!stockId || !Number.isSafeInteger(quantity) || quantity <= 0) {
            throw new Error('Une ligne du BL est invalide (article ou quantité manquante).')
          }
          if (!UNITS.includes(line.unit)) throw new Error(`L’unité de « ${line.name || line.designation || stockId} » est invalide.`)
          const total = (requiredByStock.get(stockId) || 0) + quantity
          if (!Number.isSafeInteger(total)) throw new Error('Une quantité cumulée dépasse la limite prise en charge.')
          requiredByStock.set(stockId, total)
        }
        if (!requiredByStock.size) throw new Error('Ce bon ne contient aucun article à livrer.')
        const stockIds = [...requiredByStock.keys()]
        const stockRefs = stockIds.map((id) => doc(db, 'stock', id))
        const stockSnapshots = await Promise.all(stockRefs.map((ref) => transaction.get(ref)))
        const updates = stockSnapshots.map((snapshot, index) => {
          const stockId = stockIds[index]
          if (!snapshot.exists()) throw new Error(`L’article ${stockId} n’existe plus dans le stock.`)
          const item = snapshot.data()
          const currentQuantity = Number(item.quantity)
          const requested = requiredByStock.get(stockId)
          const itemName = item.name || item.designation || stockId
          if (!Number.isSafeInteger(currentQuantity) || currentQuantity < 0) {
            throw new Error(`La quantité actuelle de « ${itemName} » est invalide.`)
          }
          if (currentQuantity < requested) {
            throw new Error(`Stock insuffisant pour « ${itemName} » : ${currentQuantity} disponible(s), ${requested} demandé(s).`)
          }
          return { ref: stockRefs[index], quantity: currentQuantity - requested }
        })
        updates.forEach((update) => {
          transaction.update(update.ref, { quantity: update.quantity, updatedAt: serverTimestamp() })
        })
        transaction.update(noteRef, {
          status: 'Validé & Livré',
          stockDeducted: true,
          deliveredAt: serverTimestamp(),
          deliveredBy: user?.uid || null,
          updatedAt: serverTimestamp(),
        })
      })
      setNotice(`BL ${note.number || ''} validé ; le stock a été décrémenté.`)
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Impossible de valider ce bon de livraison.')
    } finally {
      setValidatingId('')
    }
  }

  const cancelNote = async (note) => {
    if (note.__status !== 'Brouillon' || note.stockDeducted === true) {
      setError('Seul un brouillon non livré peut être annulé.')
      return
    }
    if (!window.confirm(`Annuler le bon ${note.number || ''} ? Cette action est définitive.`)) return
    setError('')
    setCancellingId(note.id)
    try {
      await runTransaction(db, async (transaction) => {
        const noteRef = doc(db, 'delivery_notes', note.id)
        const snapshot = await transaction.get(noteRef)
        if (!snapshot.exists()) throw new Error('Ce bon de livraison n’existe plus.')
        const currentNote = snapshot.data()
        if (getStatus(currentNote) !== 'Brouillon' || currentNote.stockDeducted === true) {
          throw new Error('Le statut de ce bon ne permet plus son annulation.')
        }
        transaction.update(noteRef, {
          status: 'Annulé',
          cancelledAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      })
      setNotice(`BL ${note.number || ''} annulé.`)
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Impossible d’annuler ce bon.')
    } finally {
      setCancellingId('')
    }
  }

  const exportNote = (note) => {
    const client = clientsById.get(note.clientId) || {
      name: note.clientName,
      address: note.clientAddress,
      city: note.clientCity,
      postalCode: note.clientPostalCode,
      phone: note.clientPhone,
      email: note.clientEmail,
      ice: note.clientIce,
    }
    setError('')
    setExportingId(note.id)
    setPdfRequest({ note, client })
  }

  const clearFilters = () => {
    setQuery('')
    setClientFilter('')
    setStatusFilter('')
    table.setPage(1)
  }

  const pageError = clientsError || stockError || notesError || quotesError || salesError || settingsError || error
  const isLoading = clientsLoading || stockLoading || notesLoading || quotesLoading || salesLoading
  const hasFilters = Boolean(query || clientFilter || statusFilter)

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      {notice && (
        <div className="fixed right-4 top-4 z-[60] flex max-w-[calc(100vw-2rem)] items-start gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 shadow-xl" role="status">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          {notice}
        </div>
      )}

      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel-700">Logistique & stock</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Bons de livraison</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Préparez les sorties de stock, reliez-les aux documents commerciaux et validez la livraison.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-steel-800 to-steel-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-steel-900/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
          disabled={clientsLoading || stockLoading || clients.length === 0 || stock.length === 0}
          onClick={openNew}
          type="button"
        >
          <FilePlus2 aria-hidden="true" size={18} />
          Nouveau bon de livraison
        </button>
      </header>

      {pageError && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          {pageError}
          <button aria-label="Fermer le message" className="ml-auto shrink-0 rounded-md p-1 hover:bg-red-100" onClick={() => setError('')} type="button">
            <XCircle aria-hidden="true" size={16} />
          </button>
        </p>
      )}

      <section className="mt-8 overflow-hidden rounded-2xl border border-white bg-white/90 shadow-xl shadow-slate-900/[0.04] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:px-6 sm:py-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-steel-50 text-steel-800">
              <Truck aria-hidden="true" size={19} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Suivi des livraisons</h2>
              <p className="text-xs text-slate-500">{filteredNotes.length} résultat{filteredNotes.length === 1 ? '' : 's'} sur {deliveryNotes.length}</p>
            </div>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 xl:max-w-4xl xl:grid-cols-[minmax(190px,1fr)_minmax(190px,1fr)_180px]">
            <label className="relative block">
              <span className="sr-only">Rechercher un bon de livraison</span>
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                className={`${inputClass} pl-10`}
                onChange={(event) => {
                  setQuery(event.target.value)
                  table.setPage(1)
                }}
                placeholder="N°, client ou document…"
                type="search"
                value={query}
              />
            </label>
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
              {clients.map((client) => <option key={client.id} value={client.id}>{clientName(client)}</option>)}
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
          </div>
        </div>

        <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
          <DataTableExportToolbar columns={exportColumns} rows={table.sortedItems} title="Bons de livraison" />
        </div>

        {isLoading ? (
          <TableSkeleton columns={5} minWidth={900} />
        ) : filteredNotes.length === 0 ? (
          <EmptyState
            actionLabel={hasFilters ? 'Effacer les filtres' : clients.length > 0 && stock.length > 0 ? 'Créer un BL' : 'Compléter les données'}
            description={hasFilters
              ? 'Aucun bon de livraison ne correspond aux filtres actifs.'
              : clients.length > 0 && stock.length > 0
                ? 'Créez un bon de livraison pour préparer les articles destinés à un client.'
                : 'Ajoutez au moins un client et un article de stock avant de créer un BL.'}
            icon={Package}
            onAction={() => {
              if (hasFilters) clearFilters()
              else if (clients.length > 0 && stock.length > 0) openNew()
              else setError('Ajoutez un client et un article au stock avant de créer un bon de livraison.')
            }}
            title={hasFilters ? 'Aucun BL trouvé' : 'Aucun bon de livraison'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <SortableTableHeader className="px-5 py-3.5" columnKey="number" label="N° BL" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__date" label="Date" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__clientName" label="Client" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__linkedDocument" label="Document lié" {...table} />
                  <SortableTableHeader className="px-5 py-3.5" columnKey="__status" label="Statut" {...table} />
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.pageItems.map((note) => {
                  const StatusIcon = getStatusIcon(note.__status)
                  const editable = note.__status === 'Brouillon' && note.stockDeducted !== true
                  const canValidate = editable
                  return (
                    <tr className="transition hover:bg-steel-50/40" key={note.id}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-900">{note.number || 'Sans numéro'}</p>
                        {note.stockDeducted === true && (
                          <p className="mt-1 text-[11px] text-emerald-700">Stock décrémenté</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays aria-hidden="true" className="text-slate-400" size={14} />
                          {formatDate(note.deliveryDate)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-slate-700">{note.__clientName}</p>
                        {note.clientIce && <p className="mt-1 text-xs text-slate-500">ICE · {note.clientIce}</p>}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{note.__linkedDocument}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex animate-slide-up items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyle(note.__status)}`}>
                          <StatusIcon aria-hidden="true" size={13} />
                          {note.__status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <button
                            aria-label={`Modifier ${note.number || 'le bon'}`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!editable}
                            onClick={() => openEdit(note)}
                            title={editable ? 'Modifier le brouillon' : 'Seul un brouillon peut être modifié'}
                            type="button"
                          >
                            <Pencil aria-hidden="true" size={16} />
                          </button>
                          <button
                            aria-label={`Exporter ${note.number || 'le BL'} en PDF`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-800 disabled:opacity-50"
                            disabled={Boolean(exportingId)}
                            onClick={() => exportNote(note)}
                            title="Exporter le bon de livraison en PDF"
                            type="button"
                          >
                            {exportingId === note.id
                              ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                              : <FileText aria-hidden="true" size={16} />}
                          </button>
                          {canValidate && (
                            <button
                              aria-label={`Valider et livrer ${note.number || 'le BL'}`}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-40"
                              disabled={Boolean(validatingId || cancellingId)}
                              onClick={() => void validateDelivery(note)}
                              title="Valider & livrer : le stock sera décrémenté"
                              type="button"
                            >
                              {validatingId === note.id
                                ? <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />
                                : <PackageCheck aria-hidden="true" size={14} />}
                              <span className="hidden 2xl:inline">Valider & livrer</span>
                            </button>
                          )}
                          {editable && (
                            <button
                              aria-label={`Annuler ${note.number || 'le BL'}`}
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                              disabled={Boolean(cancellingId || validatingId)}
                              onClick={() => void cancelNote(note)}
                              title="Annuler le brouillon"
                              type="button"
                            >
                              {cancellingId === note.id
                                ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                                : <XCircle aria-hidden="true" size={16} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && filteredNotes.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3 sm:px-6">
            <DataTablePagination {...table} />
          </div>
        )}
      </section>

      {formOpen && (
        <DeliveryNoteForm
          clients={clients}
          editingNote={editingNote}
          error={error}
          form={form}
          linkedDocuments={linkedDocuments}
          linePreviews={linePreviews}
          numberPreview={numberPreview}
          numberPreviewError={numberPreviewError}
          numberPreviewLoading={numberPreviewLoading}
          onAddLine={addLine}
          onCancel={() => {
            if (saving) return
            setFormOpen(false)
            setNumberPreviewLoading(false)
            setError('')
          }}
          onSelectClient={selectClient}
          onSelectLinkedDocument={selectLinkedDocument}
          onSelectStock={selectStockItem}
          onRemoveLine={removeLine}
          onSetField={setField}
          onSubmit={(event) => void saveDraft(event)}
          onUpdateLine={updateLine}
          saving={saving}
          stock={stock}
          stockLoading={stockLoading}
        />
      )}

      {pdfRequest && (
        <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 z-[-1] w-[190mm] bg-white">
          <DeliveryNotePdf client={pdfRequest.client} company={company} note={pdfRequest.note} ref={pdfRef} />
        </div>
      )}
    </main>
  )
}
