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

const initialSettings = {
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

const tabs = [
  { id: 'general', label: 'Entreprise', icon: Building2 },
  { id: 'legal', label: 'Légal & banque', icon: Landmark },
  { id: 'documents', label: 'Identité visuelle', icon: ImagePlus },
  { id: 'preferences', label: 'Documents & finance', icon: Settings2 },
]
const legalForms = ['SARL', 'SARL AU', 'SA', 'SNC', 'SCS', 'SCA', 'Auto-entrepreneur', 'Autre']
const allowedImageTypes = ['image/png', 'image/jpeg', 'image/webp']
const supportedCurrencies = ['MAD', 'EUR', 'USD']
const maxImageBytes = 700 * 1024
const maxCombinedImageCharacters = 900 * 1024
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition duration-200 placeholder:text-slate-400 focus:border-steel-500 focus:ring-4 focus:ring-steel-100 disabled:cursor-not-allowed disabled:bg-slate-50'

function TextField({ className = '', form, label, name, onChange, placeholder = '', type = 'text', ...props }) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      <input
        className={inputClass}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        value={form[name] ?? ''}
        {...props}
      />
    </label>
  )
}

function TextAreaField({ className = '', form, label, name, onChange, rows = 4, ...props }) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      <textarea
        className={`${inputClass} resize-y`}
        name={name}
        onChange={onChange}
        rows={rows}
        value={form[name] ?? ''}
        {...props}
      />
    </label>
  )
}

function getSettingsForm(savedSettings = {}) {
  return {
    ...initialSettings,
    ...savedSettings,
    logoUrl: typeof savedSettings.logoUrl === 'string'
      ? savedSettings.logoUrl
      : initialSettings.logoUrl,
    logoBase64: typeof savedSettings.logoBase64 === 'string' ? savedSettings.logoBase64 : '',
    stampBase64: typeof savedSettings.stampBase64 === 'string' ? savedSettings.stampBase64 : '',
    legalName: savedSettings.legalName || '',
    companyName: savedSettings.companyName || initialSettings.companyName,
    legalForm: savedSettings.legalForm || initialSettings.legalForm,
    documentFooter: typeof savedSettings.documentFooter === 'string' ? savedSettings.documentFooter : '',
    defaultTermsAndConditions: typeof savedSettings.defaultTermsAndConditions === 'string'
      ? savedSettings.defaultTermsAndConditions
      : '',
    phone: savedSettings.phone || savedSettings.phone1 || savedSettings.telephoneFixed || '',
    mobileEmergency:
      savedSettings.mobileEmergency || savedSettings.emergencyMobile || savedSettings.phone2 || '',
    whatsapp: savedSettings.whatsapp || savedSettings.whatsappPro || '',
    defaultVatRate: savedSettings.defaultVatRate ?? initialSettings.defaultVatRate,
    defaultCurrency: supportedCurrencies.includes(savedSettings.defaultCurrency)
      ? savedSettings.defaultCurrency
      : initialSettings.defaultCurrency,
    defaultQuoteValidityMonths:
      savedSettings.defaultQuoteValidityMonths ?? initialSettings.defaultQuoteValidityMonths,
    invoicePrefix: savedSettings.invoicePrefix || initialSettings.invoicePrefix,
    quotePrefix: savedSettings.quotePrefix || initialSettings.quotePrefix,
    deliveryNotePrefix: savedSettings.deliveryNotePrefix || initialSettings.deliveryNotePrefix,
    purchaseOrderPrefix: savedSettings.purchaseOrderPrefix || initialSettings.purchaseOrderPrefix,
    autoStampEnabled: savedSettings.autoStampEnabled === true,
  }
}

export default function Settings() {
  const [form, setForm] = useState(initialSettings)
  const [activeTab, setActiveTab] = useState('general')
  const [logoPreview, setLogoPreview] = useState('')
  const [stampPreview, setStampPreview] = useState('')
  const [readingMedia, setReadingMedia] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const toastTimeout = useRef(null)
  const hasLocalChanges = useRef(false)

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'settings', 'company'),
      (snapshot) => {
        const savedSettings = snapshot.exists() ? snapshot.data() : {}
        const nextForm = getSettingsForm(savedSettings)
        if (!hasLocalChanges.current) {
          setForm(nextForm)
          setLogoPreview(nextForm.logoBase64 || nextForm.logoUrl)
          setStampPreview(nextForm.stampBase64)
        }
        setError('')
        setLoading(false)
      },
      (snapshotError) => {
        setError(snapshotError.message)
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

  const selectImage = (field, event) => {
    const selectedFile = event.target.files?.[0]
    event.target.value = ''
    if (!selectedFile) return

    if (!allowedImageTypes.includes(selectedFile.type)) {
      setError('Les images doivent être au format PNG, JPEG ou WebP.')
      return
    }
    if (selectedFile.size > maxImageBytes) {
      setError('Chaque image ne doit pas dépasser 700 Ko.')
      return
    }

    hasLocalChanges.current = true
    setError('')
    setNotice('')
    setReadingMedia(field)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setError('Le fichier image n’a pas pu être converti en base64.')
      } else {
        const otherImage = field === 'logoBase64' ? form.stampBase64 : form.logoBase64
        if (reader.result.length + otherImage.length > maxCombinedImageCharacters) {
          setError('La taille combinée du logo et du cachet dépasse la limite Firestore autorisée.')
        } else {
          setForm((current) => ({
            ...current,
            [field]: reader.result,
            ...(field === 'logoBase64' ? { logoUrl: '' } : {}),
          }))
          if (field === 'logoBase64') setLogoPreview(reader.result)
          else setStampPreview(reader.result)
        }
      }
      setReadingMedia('')
    }
    reader.onerror = () => {
      setError('Impossible de lire le fichier image.')
      setReadingMedia('')
    }
    reader.readAsDataURL(selectedFile)
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

  const saveSettings = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    if (
      !String(form.companyName || '').trim() ||
      !legalForms.includes(form.legalForm)
    ) {
      setError('Le nom de l’entreprise et sa forme juridique sont obligatoires.')
      setActiveTab('general')
      return
    }

    const vatRate = Number(form.defaultVatRate)
    const quoteValidity = Number(form.defaultQuoteValidityMonths)
    const email = String(form.email || '').trim()
    const website = String(form.website || '').trim()
    const rib = String(form.rib || '').replace(/\s/g, '')
    const currency = String(form.defaultCurrency || '')
    const validWebsite = (value) => {
      if (!value) return true
      try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:'
      } catch {
        return false
      }
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Saisissez une adresse e-mail de contact valide.')
      setActiveTab('general')
      return
    }
    if (!validWebsite(website)) {
      setError('Le site web doit être une adresse HTTP ou HTTPS valide.')
      setActiveTab('general')
      return
    }
    if (form.defaultVatRate === '' || !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
      setError('Le taux de TVA doit être compris entre 0 et 100 %.')
      setActiveTab('preferences')
      return
    }
    if (!Number.isSafeInteger(quoteValidity) || quoteValidity < 1 || quoteValidity > 36) {
      setError('La validité des devis doit être comprise entre 1 et 36 mois.')
      setActiveTab('preferences')
      return
    }
    if (rib && !/^\d{24}$/.test(rib)) {
      setError('Le RIB doit contenir exactement 24 chiffres.')
      setActiveTab('legal')
      return
    }
    if (!supportedCurrencies.includes(currency)) {
      setError('Sélectionnez une monnaie prise en charge.')
      setActiveTab('preferences')
      return
    }
    const swiftBic = String(form.swiftBic || '').trim()
    if (swiftBic && !/^[A-Za-z0-9]{8}(?:[A-Za-z0-9]{3})?$/.test(swiftBic)) {
      setError('Le code SWIFT/BIC doit contenir 8 ou 11 caractères alphanumériques.')
      setActiveTab('legal')
      return
    }
    const prefixFields = ['invoicePrefix', 'quotePrefix', 'deliveryNotePrefix', 'purchaseOrderPrefix']
    if (prefixFields.some((field) => !/^[A-Za-z0-9-]{1,12}$/.test(String(form[field]).trim()))) {
      setError('Chaque préfixe doit contenir de 1 à 12 lettres, chiffres ou tirets.')
      setActiveTab('preferences')
      return
    }
    if (form.autoStampEnabled && !form.stampBase64) {
      setError('Importez un cachet ou une signature avant d’activer l’ajout automatique aux PDF.')
      setActiveTab('documents')
      return
    }

    setSaving(true)
    try {
      const settings = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [
          key,
          typeof value === 'string' ? value.trim() : value,
        ]),
      )
      settings.rib = rib
      settings.swiftBic = swiftBic
      settings.email = email
      settings.website = website
      await setDoc(
        doc(db, 'settings', 'company'),
        {
          ...settings,
          phone1: settings.phone,
          phone2: settings.mobileEmergency,
          telephoneFixed: settings.phone,
          emergencyMobile: settings.mobileEmergency,
          whatsappPro: settings.whatsapp,
          defaultVatRate: vatRate,
          defaultQuoteValidityMonths: quoteValidity,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      hasLocalChanges.current = false
      setForm(getSettingsForm(settings))
      setLogoPreview(settings.logoBase64 || settings.logoUrl)
      setStampPreview(settings.stampBase64)
      setNotice('Les paramètres de la société ont été enregistrés.')
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Impossible d’enregistrer les paramètres de la société.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-full bg-slate-50 px-4 py-10 sm:px-8">
        <div className="mx-auto max-w-6xl animate-pulse rounded-2xl bg-white p-8 shadow-sm">
          <div className="h-5 w-40 rounded bg-slate-200" />
          <div className="mt-4 h-9 w-72 rounded bg-slate-200" />
          <div className="mt-8 h-64 rounded-xl bg-slate-100" />
        </div>
      </main>
    )
  }

  const activeTabConfig = tabs.find((tab) => tab.id === activeTab) || tabs[0]

  return (
    <main className="min-h-full bg-slate-50 px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-steel-700">Administration · Configuration</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Paramètres de la société</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Gérez les coordonnées, les documents et les règles métier utilisés par TGI Manager Pro.
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm sm:flex">
            <ShieldCheck className="text-emerald-600" size={16} />
            Accès SuperAdmin
          </div>
        </header>

        <form onSubmit={saveSettings}>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/80 p-2 sm:p-3">
              <div aria-label="Sections des paramètres" className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4" role="tablist">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    aria-controls={`settings-panel-${id}`}
                    aria-selected={activeTab === id}
                    className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition duration-200 sm:text-sm ${
                      activeTab === id
                        ? 'bg-white text-steel-800 shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'
                    }`}
                    id={`settings-tab-${id}`}
                    key={id}
                    onClick={() => setActiveTab(id)}
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
              aria-labelledby={`settings-tab-${activeTab}`}
              className="min-h-[460px] p-5 transition-opacity duration-200 sm:p-8"
              id={`settings-panel-${activeTab}`}
              key={activeTab}
              role="tabpanel"
              tabIndex={0}
            >
              <div className="mb-6 flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-steel-50 text-steel-700">
                  <activeTabConfig.icon aria-hidden="true" size={19} />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{activeTabConfig.label}</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Les valeurs sauvegardées sont utilisées par les documents et exports de l’application.
                  </p>
                </div>
              </div>

              {activeTab === 'general' && (
                <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  <TextField form={form} label="Nom de l’entreprise *" name="companyName" onChange={updateField} placeholder="TGI Ascenseurs" required />
                  <TextField form={form} label="Raison sociale" name="legalName" onChange={updateField} placeholder="Raison sociale enregistrée" />
                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">Forme juridique *</span>
                    <select className={inputClass} name="legalForm" onChange={updateField} required value={form.legalForm}>
                      {legalForms.map((legalForm) => <option key={legalForm} value={legalForm}>{legalForm}</option>)}
                    </select>
                  </label>
                  <TextField form={form} label="Capital social" name="capital" onChange={updateField} placeholder="Ex. 1 000 000 MAD" />
                  <TextField className="sm:col-span-2" form={form} label="Adresse du siège social" name="address" onChange={updateField} placeholder="N°, rue, quartier" />
                  <TextField form={form} label="Ville" name="city" onChange={updateField} />
                  <TextField form={form} label="Code postal" name="postalCode" onChange={updateField} inputMode="numeric" />
                  <TextField form={form} label="Téléphone fixe" name="phone" onChange={updateField} placeholder="+212 5 00 00 00 00" type="tel" />
                  <TextField form={form} label="Mobile d’urgence · dépannage" name="mobileEmergency" onChange={updateField} placeholder="+212 6 00 00 00 00" type="tel" />
                  <TextField form={form} label="WhatsApp professionnel" name="whatsapp" onChange={updateField} placeholder="+212 6 00 00 00 00" type="tel" />
                  <TextField form={form} label="E-mail de contact" name="email" onChange={updateField} placeholder="contact@entreprise.ma" type="email" />
                  <TextField form={form} label="Site web" name="website" onChange={updateField} placeholder="https://www.entreprise.ma" type="url" />
                </div>
              )}

              {activeTab === 'legal' && (
                <div className="space-y-8">
                  <div>
                    <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">Identifiants légaux et fiscaux</h3>
                    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                      <TextField form={form} label="ICE" name="ice" onChange={updateField} placeholder="Identifiant commun de l’entreprise" />
                      <TextField form={form} label="Registre de commerce · RC" name="rc" onChange={updateField} placeholder="Numéro RC" />
                      <TextField form={form} label="Identifiant fiscal · IF" name="if" onChange={updateField} placeholder="Numéro IF" />
                      <TextField form={form} label="Taxe professionnelle · Patente" name="patente" onChange={updateField} placeholder="Numéro de patente" />
                      <TextField form={form} label="CNSS" name="cnss" onChange={updateField} placeholder="Numéro CNSS" />
                    </div>
                  </div>
                  <div className="border-t border-slate-100 pt-6">
                    <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">Coordonnées bancaires</h3>
                    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                      <TextField form={form} label="Nom de la banque" name="bankName" onChange={updateField} placeholder="Banque" />
                      <TextField form={form} label="RIB · 24 chiffres" name="rib" onChange={updateField} placeholder="000000000000000000000000" inputMode="numeric" maxLength={24} />
                      <TextField form={form} label="SWIFT / BIC" name="swiftBic" onChange={updateField} placeholder="8 ou 11 caractères" maxLength={11} />
                    </div>
                    <p className="mt-3 text-xs text-slate-500">Les coordonnées bancaires sont ajoutées au bas des factures PDF lorsqu’elles sont renseignées.</p>
                  </div>
                </div>
              )}

              {activeTab === 'documents' && (
                <div className="space-y-7">
                  <div className="grid gap-5 lg:grid-cols-2">
                    {[
                      { field: 'logoBase64', title: 'Logo de l’entreprise', preview: logoPreview, hint: 'Logo affiché dans les en-têtes PDF.' },
                      { field: 'stampBase64', title: 'Cachet / signature', preview: stampPreview, hint: 'Cachet apposé aux factures, bons de livraison et reçus.' },
                    ].map(({ field, title, preview, hint }) => (
                      <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4" key={field}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>
                          </div>
                          {preview && (
                            <button
                              aria-label={`Supprimer ${title.toLowerCase()}`}
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-700"
                              onClick={() => clearImage(field)}
                              type="button"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                        <div className="mt-4 flex min-h-28 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white p-3">
                          {preview
                            ? <img alt={`Aperçu : ${title}`} className="max-h-24 max-w-full object-contain" src={preview} />
                            : <span className="text-xs text-slate-400">Aucune image sélectionnée</span>}
                        </div>
                        <label className="mt-4 block">
                          <span className="mb-1.5 block text-xs font-medium text-slate-700">Importer une image · 700 Ko maximum</span>
                          <input
                            accept="image/png,image/jpeg,image/webp"
                            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-semibold file:text-blue-800 hover:file:bg-blue-100"
                            disabled={Boolean(readingMedia)}
                            onChange={(event) => selectImage(field, event)}
                            type="file"
                          />
                        </label>
                        {readingMedia === field && <p className="mt-2 text-xs text-blue-700">Conversion en base64…</p>}
                      </section>
                    ))}
                  </div>

                  <label className={`flex items-start gap-3 rounded-xl border p-4 transition ${form.stampBase64 ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-slate-50'}`}>
                    <input
                      checked={form.autoStampEnabled}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      disabled={!form.stampBase64}
                      name="autoStampEnabled"
                      onChange={updateField}
                      type="checkbox"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">Apposer automatiquement sur les PDF</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">Factures, bons de livraison et reçus. Le cachet reste désactivé tant que cette option n’est pas cochée.</span>
                    </span>
                  </label>

                </div>
              )}

              {activeTab === 'preferences' && (
                <div className="space-y-7">
                  <div>
                    <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">Paramètres de calcul</h3>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      <TextField form={form} label="Taux de TVA par défaut (%)" max="100" min="0" name="defaultVatRate" onChange={updateField} required step="0.01" type="number" />
                      <label>
                        <span className="mb-1.5 block text-xs font-semibold text-slate-700">Monnaie par défaut</span>
                        <select className={inputClass} name="defaultCurrency" onChange={updateField} value={form.defaultCurrency}>
                          <option value="MAD">MAD · Dirham marocain</option>
                          <option value="EUR">EUR · Euro</option>
                          <option value="USD">USD · Dollar américain</option>
                        </select>
                      </label>
                      <TextField form={form} label="Validité des devis par défaut (mois)" max="36" min="1" name="defaultQuoteValidityMonths" onChange={updateField} required step="1" type="number" />
                    </div>
                  </div>
                  <div className="border-t border-slate-100 pt-6">
                    <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Numérotation des documents</h3>
                    <p className="mb-4 text-xs text-slate-500">Le numéro généré prend la forme PRÉFIXE-ANNÉE-SÉQUENCE (ex. FAC-2026-0001).</p>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <TextField form={form} label="Préfixe des factures" maxLength={12} name="invoicePrefix" onChange={updateField} required placeholder="FAC-" />
                      <TextField form={form} label="Préfixe des devis" maxLength={12} name="quotePrefix" onChange={updateField} required placeholder="DEV-" />
                      <TextField form={form} label="Préfixe des bons de livraison" maxLength={12} name="deliveryNotePrefix" onChange={updateField} required placeholder="BL-" />
                      <TextField form={form} label="Préfixe des bons de commande" maxLength={12} name="purchaseOrderPrefix" onChange={updateField} required placeholder="BC-" />
                    </div>
                  </div>
                  <div className="grid gap-5 border-t border-slate-100 pt-6 lg:grid-cols-2">
                    <div>
                      <TextAreaField
                        className="block"
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
                        className="block"
                        form={form}
                        label="Conditions générales de vente par défaut"
                        maxLength={10000}
                        name="defaultTermsAndConditions"
                        onChange={updateField}
                        placeholder="Conditions proposées par défaut dans les devis et contrats…"
                        rows={5}
                      />
                      <p className="mt-1 text-xs leading-5 text-slate-500">Modèle éditable à adapter et faire valider avant utilisation contractuelle.</p>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <footer className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <ShieldCheck aria-hidden="true" className="text-emerald-600" size={16} />
                Configuration réservée au SuperAdmin
              </p>
              <div className="flex items-center justify-end gap-3">
                {error && <p className="mr-auto max-w-md text-xs text-red-700" role="alert">{error}</p>}
                <button
                  className="inline-flex min-w-48 items-center justify-center gap-2 rounded-xl bg-steel-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-steel-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving || Boolean(readingMedia)}
                  type="submit"
                >
                  {saving
                    ? <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
                    : <Save aria-hidden="true" size={17} />}
                  {saving ? 'Sauvegarde…' : 'Sauvegarder les modifications'}
                </button>
              </div>
            </footer>
          </div>
        </form>

        {notice && (
          <div className="fixed right-4 top-4 z-[70] flex max-w-sm items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg transition duration-200 sm:right-8 sm:top-8" role="status">
            <Check aria-hidden="true" className="shrink-0 text-emerald-600" size={17} />
            {notice}
          </div>
        )}
      </div>
    </main>
  )
}
