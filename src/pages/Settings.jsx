import { useEffect, useRef, useState } from 'react'
import {
  Building2,
  Check,
  ImagePlus,
  Landmark,
  LoaderCircle,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

const DEFAULT_SETTINGS = {
  companyName: 'TGI Ascenseurs',
  legalName: '',
  legalForm: 'SARL',
  capital: '',
  address: '',
  city: '',
  postalCode: '',
  phone: '',
  mobileEmergency: '',
  whatsapp: '',
  email: '',
  website: '',
  ice: '',
  rc: '',
  if: '',
  patente: '',
  cnss: '',
  bankName: '',
  rib: '',
  swiftBic: '',
  logoBase64: '',
  logoUrl: '/logo.jpeg',
  stampBase64: '',
  autoStampEnabled: false,
  documentFooter: '',
  defaultTermsAndConditions: '',
  defaultVatRate: 20,
  defaultCurrency: 'MAD',
  defaultQuoteValidityMonths: 3,
  invoicePrefix: 'FAC-',
  quotePrefix: 'DEV-',
  deliveryNotePrefix: 'BL-',
  purchaseOrderPrefix: 'BC-',
}

const TABS = [
  { id: 'general', label: 'Informations générales', icon: Building2 },
  { id: 'legal', label: 'Légal & bancaire', icon: Landmark },
  { id: 'visual', label: 'Identité visuelle', icon: ImagePlus },
  { id: 'documents', label: 'Documents & finance', icon: Settings2 },
]

const LEGAL_FORMS = ['SARL', 'SARL AU', 'SA', 'SNC', 'SCS', 'SCA', 'Auto-entrepreneur', 'Autre']
const CURRENCIES = ['MAD', 'EUR', 'USD']
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_IMAGE_BYTES = 700 * 1024
const MAX_IMAGE_DATA_CHARACTERS = 900 * 1024
const PREFIX_FIELDS = ['invoicePrefix', 'quotePrefix', 'deliveryNotePrefix', 'purchaseOrderPrefix']

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-steel-500 focus:ring-4 focus:ring-steel-100'

function stringValue(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function normalizeSettings(savedSettings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    companyName: stringValue(savedSettings.companyName, DEFAULT_SETTINGS.companyName),
    legalName: stringValue(savedSettings.legalName),
    legalForm: LEGAL_FORMS.includes(savedSettings.legalForm)
      ? savedSettings.legalForm
      : DEFAULT_SETTINGS.legalForm,
    capital: stringValue(savedSettings.capital),
    address: stringValue(savedSettings.address),
    city: stringValue(savedSettings.city),
    postalCode: stringValue(savedSettings.postalCode),
    phone: stringValue(savedSettings.phone ?? savedSettings.phone1 ?? savedSettings.telephoneFixed),
    mobileEmergency: stringValue(
      savedSettings.mobileEmergency ?? savedSettings.emergencyMobile ?? savedSettings.phone2,
    ),
    whatsapp: stringValue(savedSettings.whatsapp ?? savedSettings.whatsappPro),
    email: stringValue(savedSettings.email),
    website: stringValue(savedSettings.website),
    ice: stringValue(savedSettings.ice),
    rc: stringValue(savedSettings.rc),
    if: stringValue(savedSettings.if),
    patente: stringValue(savedSettings.patente),
    cnss: stringValue(savedSettings.cnss),
    bankName: stringValue(savedSettings.bankName),
    rib: stringValue(savedSettings.rib),
    swiftBic: stringValue(savedSettings.swiftBic),
    logoBase64: stringValue(savedSettings.logoBase64),
    logoUrl: stringValue(savedSettings.logoUrl, DEFAULT_SETTINGS.logoUrl),
    stampBase64: stringValue(savedSettings.stampBase64),
    autoStampEnabled: savedSettings.autoStampEnabled === true,
    documentFooter: stringValue(savedSettings.documentFooter),
    defaultTermsAndConditions: stringValue(savedSettings.defaultTermsAndConditions),
    defaultVatRate: savedSettings.defaultVatRate ?? DEFAULT_SETTINGS.defaultVatRate,
    defaultCurrency: CURRENCIES.includes(savedSettings.defaultCurrency)
      ? savedSettings.defaultCurrency
      : DEFAULT_SETTINGS.defaultCurrency,
    defaultQuoteValidityMonths:
      savedSettings.defaultQuoteValidityMonths ?? DEFAULT_SETTINGS.defaultQuoteValidityMonths,
    invoicePrefix: stringValue(savedSettings.invoicePrefix, DEFAULT_SETTINGS.invoicePrefix),
    quotePrefix: stringValue(savedSettings.quotePrefix, DEFAULT_SETTINGS.quotePrefix),
    deliveryNotePrefix: stringValue(
      savedSettings.deliveryNotePrefix,
      DEFAULT_SETTINGS.deliveryNotePrefix,
    ),
    purchaseOrderPrefix: stringValue(
      savedSettings.purchaseOrderPrefix,
      DEFAULT_SETTINGS.purchaseOrderPrefix,
    ),
  }
}

function TextField({
  className = '',
  form,
  label,
  name,
  onChange,
  placeholder = '',
  type = 'text',
  ...inputProps
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      <input
        className={inputClass}
        id={`company-${name}`}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        value={form[name] ?? ''}
        {...inputProps}
      />
    </label>
  )
}

function TextAreaField({ className = '', form, label, name, onChange, rows = 4, ...inputProps }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      <textarea
        className={`${inputClass} resize-y`}
        id={`company-${name}`}
        name={name}
        onChange={onChange}
        rows={rows}
        value={form[name] ?? ''}
        {...inputProps}
      />
    </label>
  )
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Le fichier image n’a pas pu être converti en base64.'))
      }
    }
    reader.onerror = () => reject(new Error('Impossible de lire le fichier image.'))
    reader.readAsDataURL(file)
  })
}

function isHttpWebsite(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export default function Settings() {
  const [form, setForm] = useState(DEFAULT_SETTINGS)
  const [activeTab, setActiveTab] = useState('general')
  const [logoPreview, setLogoPreview] = useState(DEFAULT_SETTINGS.logoUrl)
  const [stampPreview, setStampPreview] = useState('')
  const [readingMedia, setReadingMedia] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const hasLocalChanges = useRef(false)
  const toastTimeout = useRef(null)

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'settings', 'company'),
      (snapshot) => {
        if (!hasLocalChanges.current) {
          const nextSettings = normalizeSettings(snapshot.exists() ? snapshot.data() : {})
          setForm(nextSettings)
          setLogoPreview(nextSettings.logoBase64 || nextSettings.logoUrl)
          setStampPreview(nextSettings.stampBase64)
        }
        setError('')
        setLoading(false)
      },
      (snapshotError) => {
        setError(`Impossible de charger les paramètres : ${snapshotError.message}`)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!notice) return undefined
    toastTimeout.current = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(toastTimeout.current)
  }, [notice])

  useEffect(() => () => window.clearTimeout(toastTimeout.current), [])

  const updateField = (event) => {
    const { name, value, type, checked } = event.target
    hasLocalChanges.current = true
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
    setError('')
    setNotice('')
  }

  const selectImage = async (field, event) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    if (!IMAGE_TYPES.includes(file.type)) {
      setError('Les images doivent être au format PNG, JPEG ou WebP.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Chaque image ne doit pas dépasser 700 Ko.')
      return
    }

    setReadingMedia(field)
    setError('')
    setNotice('')
    try {
      const dataUrl = await readAsDataUrl(file)
      const otherImage = field === 'logoBase64' ? form.stampBase64 : form.logoBase64
      if (dataUrl.length + otherImage.length > MAX_IMAGE_DATA_CHARACTERS) {
        throw new Error('La taille combinée des images dépasse la limite autorisée pour Firestore.')
      }

      hasLocalChanges.current = true
      setForm((current) => ({
        ...current,
        [field]: dataUrl,
        ...(field === 'logoBase64' ? { logoUrl: '' } : {}),
      }))
      if (field === 'logoBase64') setLogoPreview(dataUrl)
      else setStampPreview(dataUrl)
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : 'Impossible de charger cette image.')
    } finally {
      setReadingMedia('')
    }
  }

  const clearImage = (field) => {
    hasLocalChanges.current = true
    setForm((current) => ({
      ...current,
      [field]: '',
      ...(field === 'logoBase64' ? { logoUrl: '' } : {}),
      ...(field === 'stampBase64' ? { autoStampEnabled: false } : {}),
    }))
    if (field === 'logoBase64') setLogoPreview('')
    else setStampPreview('')
    setError('')
    setNotice('')
  }

  const setValidationError = (message, tab) => {
    setError(message)
    setActiveTab(tab)
  }

  const saveSettings = async (event) => {
    event.preventDefault()
    if (saving || readingMedia) return
    setError('')
    setNotice('')

    const companyName = String(form.companyName || '').trim()
    const legalName = String(form.legalName || '').trim()
    const legalForm = String(form.legalForm || '')
    const email = String(form.email || '').trim()
    const website = String(form.website || '').trim()
    const rib = String(form.rib || '').replace(/\s/g, '')
    const swiftBic = String(form.swiftBic || '').trim()
    const defaultVatRate = Number(form.defaultVatRate)
    const quoteValidity = Number(form.defaultQuoteValidityMonths)

    if (!companyName || !legalName || !LEGAL_FORMS.includes(legalForm)) {
      setValidationError('La raison sociale, le nom de l’entreprise et une forme juridique valide sont obligatoires.', 'general')
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setValidationError('Saisissez une adresse e-mail de contact valide.', 'general')
      return
    }
    if (website && !isHttpWebsite(website)) {
      setValidationError('Le site Web doit être une adresse HTTP ou HTTPS valide.', 'general')
      return
    }
    if (
      form.defaultVatRate === '' ||
      !Number.isFinite(defaultVatRate) ||
      defaultVatRate < 0 ||
      defaultVatRate > 100
    ) {
      setValidationError('Le taux de TVA doit être compris entre 0 et 100 %.', 'documents')
      return
    }
    if (
      !Number.isSafeInteger(quoteValidity) ||
      quoteValidity < 1 ||
      quoteValidity > 36
    ) {
      setValidationError('La validité des devis doit être comprise entre 1 et 36 mois.', 'documents')
      return
    }
    if (!CURRENCIES.includes(form.defaultCurrency)) {
      setValidationError('Sélectionnez une monnaie prise en charge.', 'documents')
      return
    }
    if (rib && !/^\d{24}$/.test(rib)) {
      setValidationError('Le RIB doit contenir exactement 24 chiffres.', 'legal')
      return
    }
    if (swiftBic && !/^[A-Za-z0-9]{8}(?:[A-Za-z0-9]{3})?$/.test(swiftBic)) {
      setValidationError('Le code SWIFT/BIC doit contenir 8 ou 11 caractères alphanumériques.', 'legal')
      return
    }
    if (PREFIX_FIELDS.some((field) => !/^[A-Za-z0-9-]{1,12}$/.test(String(form[field] || '').trim()))) {
      setValidationError('Chaque préfixe doit contenir de 1 à 12 lettres, chiffres ou tirets.', 'documents')
      return
    }
    if (form.autoStampEnabled && !form.stampBase64) {
      setValidationError('Importez une signature ou un cachet avant d’activer son ajout automatique.', 'visual')
      return
    }
    if (form.logoBase64.length + form.stampBase64.length > MAX_IMAGE_DATA_CHARACTERS) {
      setValidationError('La taille combinée du logo et du cachet dépasse la limite autorisée.', 'visual')
      return
    }

    setSaving(true)
    try {
      const trimmedSettings = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [
          key,
          typeof value === 'string' ? value.trim() : value,
        ]),
      )
      const settingsToSave = {
        ...trimmedSettings,
        companyName,
        legalName,
        legalForm,
        email,
        website,
        rib,
        swiftBic,
        defaultVatRate,
        defaultQuoteValidityMonths: quoteValidity,
        phone1: trimmedSettings.phone,
        telephoneFixed: trimmedSettings.phone,
        phone2: trimmedSettings.mobileEmergency,
        emergencyMobile: trimmedSettings.mobileEmergency,
        whatsappPro: trimmedSettings.whatsapp,
        updatedAt: serverTimestamp(),
      }

      await setDoc(doc(db, 'settings', 'company'), settingsToSave, { merge: true })
      const normalizedSavedSettings = normalizeSettings(settingsToSave)
      hasLocalChanges.current = false
      setForm(normalizedSavedSettings)
      setLogoPreview(normalizedSavedSettings.logoBase64 || normalizedSavedSettings.logoUrl)
      setStampPreview(normalizedSavedSettings.stampBase64)
      setNotice('Les paramètres de la société ont été enregistrés.')
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? `Impossible d’enregistrer les paramètres : ${saveError.message}`
          : 'Impossible d’enregistrer les paramètres de la société.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-full bg-slate-50 px-4 py-10 sm:px-8">
        <div className="mx-auto max-w-6xl animate-pulse rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <div className="h-4 w-36 rounded bg-slate-200" />
          <div className="mt-4 h-8 w-64 rounded bg-slate-200" />
          <div className="mt-8 h-12 rounded-xl bg-slate-100" />
          <div className="mt-6 h-72 rounded-xl bg-slate-100" />
        </div>
      </main>
    )
  }

  const activeTabConfig = TABS.find((tab) => tab.id === activeTab) || TABS[0]
  const ActiveTabIcon = activeTabConfig.icon

  return (
    <main className="min-h-full bg-slate-50 px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-steel-700">
              Administration · Configuration
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Paramètres de la société
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Gérez les coordonnées, l’identité visuelle et les règles financières utilisées dans les documents TGI.
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
            <ShieldCheck aria-hidden="true" className="text-emerald-600" size={16} />
            Accès SuperAdmin
          </div>
        </header>

        <form className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5" onSubmit={saveSettings}>
          <div className="border-b border-slate-200 bg-slate-50/80 p-2 sm:p-3">
            <div aria-label="Onglets des paramètres société" className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4" role="tablist">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  aria-controls="settings-panel"
                  aria-selected={activeTab === id}
                  className={`flex min-h-12 items-center gap-2.5 rounded-xl px-3 py-3 text-left text-xs font-semibold transition duration-200 sm:text-sm ${
                    activeTab === id
                      ? 'bg-white text-steel-800 shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'
                  }`}
                  id={`settings-tab-${id}`}
                  key={id}
                  onClick={() => {
                    setActiveTab(id)
                    setError('')
                  }}
                  role="tab"
                  type="button"
                >
                  <Icon aria-hidden="true" size={17} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <section
            aria-labelledby={`settings-tab-${activeTabConfig.id}`}
            aria-live="polite"
            className="min-h-[460px] p-5 transition-opacity duration-200 sm:p-8"
            id="settings-panel"
            key={activeTabConfig.id}
            role="tabpanel"
            tabIndex={0}
          >
            <div className="mb-6 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-steel-50 text-steel-700">
                <ActiveTabIcon aria-hidden="true" size={19} />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-900">{activeTabConfig.label}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Les modifications sont appliquées aux prochains documents après enregistrement.
                </p>
              </div>
            </div>

            {activeTabConfig.id === 'general' && (
              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextField
                  form={form}
                  label="Nom de l’entreprise *"
                  name="companyName"
                  onChange={updateField}
                  placeholder="TGI Ascenseurs"
                  required
                />
                <TextField
                  form={form}
                  label="Raison sociale *"
                  name="legalName"
                  onChange={updateField}
                  placeholder="Raison sociale enregistrée"
                  required
                />
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Forme juridique *</span>
                  <select
                    className={inputClass}
                    id="company-legalForm"
                    name="legalForm"
                    onChange={updateField}
                    required
                    value={form.legalForm}
                  >
                    {LEGAL_FORMS.map((legalForm) => (
                      <option key={legalForm} value={legalForm}>{legalForm}</option>
                    ))}
                  </select>
                </label>
                <TextField
                  form={form}
                  label="Capital social"
                  name="capital"
                  onChange={updateField}
                  placeholder="Ex. 1 000 000 MAD"
                />
                <TextField
                  className="sm:col-span-2"
                  form={form}
                  label="Siège social"
                  name="address"
                  onChange={updateField}
                  placeholder="N°, rue, quartier"
                />
                <TextField form={form} label="Ville" name="city" onChange={updateField} />
                <TextField
                  form={form}
                  label="Code postal"
                  name="postalCode"
                  onChange={updateField}
                  inputMode="numeric"
                />
                <TextField
                  form={form}
                  label="Téléphone"
                  name="phone"
                  onChange={updateField}
                  placeholder="+212 5 00 00 00 00"
                  type="tel"
                />
                <TextField
                  form={form}
                  label="Mobile d’urgence · dépannage"
                  name="mobileEmergency"
                  onChange={updateField}
                  placeholder="+212 6 00 00 00 00"
                  type="tel"
                />
                <TextField
                  form={form}
                  label="WhatsApp professionnel"
                  name="whatsapp"
                  onChange={updateField}
                  placeholder="+212 6 00 00 00 00"
                  type="tel"
                />
                <TextField
                  form={form}
                  label="E-mail de contact"
                  name="email"
                  onChange={updateField}
                  placeholder="contact@entreprise.ma"
                  type="email"
                />
                <TextField
                  form={form}
                  label="Site Web"
                  name="website"
                  onChange={updateField}
                  placeholder="https://www.entreprise.ma"
                  type="url"
                />
              </div>
            )}

            {activeTabConfig.id === 'legal' && (
              <div className="space-y-8">
                <section>
                  <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Identifiants légaux et fiscaux
                  </h3>
                  <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                    <TextField form={form} label="ICE" name="ice" onChange={updateField} placeholder="Identifiant commun de l’entreprise" />
                    <TextField form={form} label="Registre de commerce · RC" name="rc" onChange={updateField} placeholder="Numéro RC" />
                    <TextField form={form} label="Identifiant fiscal · IF" name="if" onChange={updateField} placeholder="Numéro IF" />
                    <TextField form={form} label="Taxe professionnelle · Patente" name="patente" onChange={updateField} placeholder="Numéro de patente" />
                    <TextField form={form} label="CNSS" name="cnss" onChange={updateField} placeholder="Numéro CNSS" />
                  </div>
                </section>
                <section className="border-t border-slate-100 pt-6">
                  <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Coordonnées bancaires
                  </h3>
                  <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                    <TextField form={form} label="Nom de la banque" name="bankName" onChange={updateField} placeholder="Banque" />
                    <TextField
                      form={form}
                      label="RIB · 24 chiffres"
                      name="rib"
                      onChange={updateField}
                      placeholder="000000000000000000000000"
                      inputMode="numeric"
                      maxLength={24}
                    />
                    <TextField
                      form={form}
                      label="SWIFT / BIC"
                      name="swiftBic"
                      onChange={updateField}
                      placeholder="8 ou 11 caractères"
                      maxLength={11}
                    />
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Les coordonnées bancaires sont utilisées dans les documents financiers lorsqu’elles sont renseignées.
                  </p>
                </section>
              </div>
            )}

            {activeTabConfig.id === 'visual' && (
              <div className="space-y-6">
                <div className="grid gap-5 lg:grid-cols-2">
                  {[
                    {
                      field: 'logoBase64',
                      title: 'Logo de l’entreprise',
                      preview: logoPreview,
                      description: 'Le logo officiel /logo.jpeg est proposé par défaut. Vous pouvez importer une version personnalisée.',
                      alt: 'Aperçu du logo de l’entreprise',
                    },
                    {
                      field: 'stampBase64',
                      title: 'Signature / cachet',
                      preview: stampPreview,
                      description: 'Le cachet peut être inséré dans les emplacements prévus des documents PDF.',
                      alt: 'Aperçu du cachet ou de la signature',
                    },
                  ].map(({ field, title, preview, description, alt }) => (
                    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5" key={field}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
                        </div>
                        {preview && (
                          <button
                            aria-label={`Supprimer ${title.toLowerCase()}`}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-200"
                            onClick={() => clearImage(field)}
                            type="button"
                          >
                            <Trash2 aria-hidden="true" size={16} />
                          </button>
                        )}
                      </div>
                      <div className="mt-4 flex min-h-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white p-4">
                        {preview ? (
                          <img
                            alt={alt}
                            className="max-h-32 max-w-full object-contain"
                            src={preview}
                            onError={() => setError(`Impossible d’afficher l’aperçu : ${title.toLowerCase()}.`)}
                          />
                        ) : (
                          <div className="text-center">
                            <ImagePlus aria-hidden="true" className="mx-auto text-slate-300" size={28} />
                            <p className="mt-2 text-xs font-medium text-slate-500">Aucune image sélectionnée</p>
                          </div>
                        )}
                      </div>
                      <label className="mt-4 block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                          Importer une image · PNG, JPEG ou WebP · 700 Ko maximum
                        </span>
                        <input
                          accept="image/png,image/jpeg,image/webp"
                          className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-steel-50 file:px-3 file:py-2 file:font-semibold file:text-steel-800 hover:file:bg-steel-100 disabled:opacity-50"
                          disabled={Boolean(readingMedia)}
                          onChange={(event) => void selectImage(field, event)}
                          type="file"
                        />
                      </label>
                      {readingMedia === field && (
                        <p className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-steel-700" role="status">
                          <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />
                          Conversion de l’image…
                        </p>
                      )}
                    </section>
                  ))}
                </div>

                <label className={`flex items-start gap-3 rounded-xl border p-4 transition ${
                  form.stampBase64 ? 'border-steel-200 bg-steel-50/60' : 'border-slate-200 bg-slate-50'
                }`}>
                  <input
                    checked={form.autoStampEnabled}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-steel-700 focus:ring-steel-600"
                    disabled={!form.stampBase64}
                    name="autoStampEnabled"
                    onChange={updateField}
                    type="checkbox"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">
                      Apposer automatiquement le cachet sur les PDF
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      Activé uniquement lorsqu’une image de signature ou de cachet est enregistrée.
                    </span>
                  </span>
                </label>
              </div>
            )}

            {activeTabConfig.id === 'documents' && (
              <div className="space-y-7">
                <section>
                  <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Calculs et préférences financières
                  </h3>
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    <TextField
                      form={form}
                      label="Taux de TVA par défaut (%)"
                      max="100"
                      min="0"
                      name="defaultVatRate"
                      onChange={updateField}
                      required
                      step="0.01"
                      type="number"
                    />
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-700">Monnaie par défaut</span>
                      <select
                        className={inputClass}
                        id="company-defaultCurrency"
                        name="defaultCurrency"
                        onChange={updateField}
                        value={form.defaultCurrency}
                      >
                        <option value="MAD">MAD · Dirham marocain</option>
                        <option value="EUR">EUR · Euro</option>
                        <option value="USD">USD · Dollar américain</option>
                      </select>
                    </label>
                    <TextField
                      form={form}
                      label="Validité des devis par défaut (mois)"
                      max="36"
                      min="1"
                      name="defaultQuoteValidityMonths"
                      onChange={updateField}
                      required
                      step="1"
                      type="number"
                    />
                  </div>
                </section>

                <section className="border-t border-slate-100 pt-6">
                  <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Numérotation des documents
                  </h3>
                  <p className="mb-4 text-xs text-slate-500">
                    Les numéros utilisent le format préfixe-année-séquence (ex. FAC-2026-0001).
                  </p>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <TextField form={form} label="Préfixe des factures" maxLength={12} name="invoicePrefix" onChange={updateField} required placeholder="FAC-" />
                    <TextField form={form} label="Préfixe des devis" maxLength={12} name="quotePrefix" onChange={updateField} required placeholder="DEV-" />
                    <TextField form={form} label="Préfixe des bons de livraison" maxLength={12} name="deliveryNotePrefix" onChange={updateField} required placeholder="BL-" />
                    <TextField form={form} label="Préfixe des bons de commande" maxLength={12} name="purchaseOrderPrefix" onChange={updateField} required placeholder="BC-" />
                  </div>
                </section>

                <section className="grid gap-5 border-t border-slate-100 pt-6 lg:grid-cols-2">
                  <div>
                    <TextAreaField
                      form={form}
                      label="Texte légal du pied de page des documents"
                      maxLength={1200}
                      name="documentFooter"
                      onChange={updateField}
                      placeholder="Mentions légales, adresse et conditions de règlement…"
                      rows={5}
                    />
                    <p className="mt-1 text-right text-xs text-slate-400">{form.documentFooter.length}/1200</p>
                  </div>
                  <div>
                    <TextAreaField
                      form={form}
                      label="Conditions générales de vente par défaut"
                      maxLength={10000}
                      name="defaultTermsAndConditions"
                      onChange={updateField}
                      placeholder="Conditions proposées par défaut dans les devis et contrats…"
                      rows={5}
                    />
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Modèle utilisé pour les devis et contrats, modifiable avant émission.
                    </p>
                  </div>
                </section>
              </div>
            )}

            {error && (
              <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
          </section>

          <footer className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <ShieldCheck aria-hidden="true" className="text-emerald-600" size={16} />
              Configuration réservée au SuperAdmin
            </p>
            <button
              className="inline-flex min-w-48 items-center justify-center gap-2 rounded-xl bg-steel-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-steel-800 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-steel-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving || Boolean(readingMedia)}
              type="submit"
            >
              {saving
                ? <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
                : <Save aria-hidden="true" size={17} />}
              {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
            </button>
          </footer>
        </form>

        {notice && (
          <div
            className="fixed right-4 top-4 z-[70] flex max-w-sm items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg sm:right-8 sm:top-8"
            role="status"
          >
            <Check aria-hidden="true" className="shrink-0 text-emerald-600" size={17} />
            {notice}
          </div>
        )}
      </div>
    </main>
  )
}
