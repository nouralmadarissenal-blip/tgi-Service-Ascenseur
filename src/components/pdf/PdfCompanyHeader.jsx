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

const PdfCompanyHeader = forwardRef(function PdfCompanyHeader({ company = {} }, ref) {
  const details = COMPANY_FIELDS.filter(([, field]) => company[field])
  const logo = company.logoBase64 || company.logoUrl

  return (
    <header
      data-pdf-company-header="true"
      ref={ref}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '8mm',
        paddingBottom: '6mm',
        borderBottom: '2px solid #1e3a8a',
      }}
    >
      <div style={{ width: '55mm', minHeight: '22mm', display: 'flex', alignItems: 'center' }}>
        {logo ? (
          <img
            alt={`Logo ${company.companyName || 'TGI Ascenseurs'}`}
            crossOrigin="anonymous"
            src={logo}
            style={{ maxWidth: '52mm', maxHeight: '22mm', objectFit: 'contain' }}
          />
        ) : (
          <strong style={{ color: '#1e3a8a', fontSize: '16pt' }}>
            {company.companyName || 'TGI Ascenseurs'}
          </strong>
        )}
      </div>
      <div style={{ maxWidth: '100mm', textAlign: 'right', color: '#475569', fontSize: '7.5pt', lineHeight: 1.4 }}>
        <strong style={{ display: 'block', marginBottom: '1mm', color: '#0f172a', fontSize: '10pt' }}>
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
