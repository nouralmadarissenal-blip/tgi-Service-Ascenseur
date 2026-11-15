import { forwardRef } from 'react'

const COMPANY_FIELDS = [
  ['Raison sociale', 'legalName'],
  ['Forme juridique', 'legalForm'],
  ['Adresse', 'address'],
  ['Ville', 'city'],
  ['Code postal', 'postalCode'],
  ['Téléphone fixe', 'phone'],
  ['Mobile dépannage', 'mobileEmergency'],
  ['WhatsApp', 'whatsapp'],
  ['E-mail', 'email'],
  ['Site web', 'website'],
  ['ICE', 'ice'],
  ['RC', 'rc'],
  ['IF', 'if'],
  ['Patente', 'patente'],
  ['CNSS', 'cnss'],
  ['Capital', 'capital'],
]

function validColor(value, fallback) {
  return /^#[0-9A-Fa-f]{6}$/.test(value || '') ? value : fallback
}

function getFontFamily(font) {
  if (font === 'Times New Roman') return '"Times New Roman", Times, serif'
  if (font === 'Arial') return 'Arial, Helvetica, sans-serif'
  if (font === 'Roboto') return 'Roboto, Arial, sans-serif'
  return 'Helvetica, Arial, sans-serif'
}

const PdfCompanyHeader = forwardRef(function PdfCompanyHeader({ company = {} }, ref) {
  const details = COMPANY_FIELDS.filter(([, field]) => company[field])
  const logo = company.logoBase64 || company.logoUrl
  const primaryColor = validColor(company.pdfPrimaryColor, '#4682B4')
  const secondaryColor = validColor(company.pdfSecondaryColor, '#1e3a8a')
  const layout = ['classic', 'modern', 'minimal'].includes(company.pdfLayout)
    ? company.pdfLayout
    : 'classic'
  const modern = layout === 'modern'
  const minimal = layout === 'minimal'
  const fontFamily = getFontFamily(company.pdfFont)

  return (
    <header
      data-pdf-company-header="true"
      ref={ref}
      style={{
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: modern ? 'column' : 'row',
        justifyContent: modern || minimal ? 'center' : 'space-between',
        alignItems: modern || minimal ? 'center' : 'flex-start',
        gap: '8mm',
        padding: modern ? '6mm 5mm' : minimal ? '0 0 3mm' : '0 0 6mm',
        borderBottom: `${minimal ? '1px' : '2px'} solid ${secondaryColor}`,
        backgroundColor: modern ? primaryColor : 'transparent',
        color: modern ? '#ffffff' : '#475569',
        fontFamily,
      }}
    >
      <div
        style={{
          width: modern ? '100%' : minimal ? '40mm' : '55mm',
          minHeight: modern ? '17mm' : '22mm',
          display: 'flex',
          alignItems: 'center',
          justifyContent: modern || minimal ? 'center' : 'flex-start',
        }}
      >
        {logo ? (
          <img
            alt={`Logo ${company.companyName || 'TGI Ascenseurs'}`}
            crossOrigin="anonymous"
            src={logo}
            style={{
              maxWidth: modern ? '54mm' : minimal ? '38mm' : '52mm',
              maxHeight: modern ? '18mm' : minimal ? '15mm' : '22mm',
              objectFit: 'contain',
            }}
          />
        ) : (
          <strong style={{ color: modern ? '#ffffff' : primaryColor, fontSize: minimal ? '12pt' : '16pt' }}>
            {company.companyName || 'TGI Ascenseurs'}
          </strong>
        )}
      </div>
      <div
        style={{
          maxWidth: modern ? '160mm' : '100mm',
          textAlign: modern || minimal ? 'center' : 'right',
          color: modern ? '#ffffff' : '#475569',
          fontSize: minimal ? '7pt' : '7.5pt',
          lineHeight: 1.4,
          fontFamily,
        }}
      >
        <strong style={{
          display: 'block',
          marginBottom: '1mm',
          color: modern ? '#ffffff' : primaryColor,
          fontSize: '10pt',
        }}>
          {company.companyName || 'TGI Ascenseurs'}
        </strong>
        {details.map(([label, field]) => (
          <div key={field}>{label} : {company[field]}</div>
        ))}
      </div>
    </header>
  )
})

export default PdfCompanyHeader
