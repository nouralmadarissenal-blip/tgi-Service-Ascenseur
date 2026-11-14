import { forwardRef } from 'react'
import PdfCompanyHeader from './PdfCompanyHeader'

const TechnicianPdf = forwardRef(function TechnicianPdf({ technician, company }, ref) {
  const fields = [
    ['Nom complet', technician.name || `${technician.firstName || ''} ${technician.lastName || ''}`.trim() || '—'],
    ['CIN', technician.cin || '—'],
    ['N° CNSS', technician.cnss || '—'],
    ['Téléphone', technician.phone || '—'],
    ['E-mail', technician.email || '—'],
    ['Spécialité', technician.specialty || '—'],
    ['Taux horaire', technician.hourlyRate ? `${technician.hourlyRate} MAD / heure` : '—'],
    ['Date d’embauche', technician.hireDate || '—'],
    ['Statut', technician.status || technician.availability || 'Disponible'],
  ]

  return (
    <article
      ref={ref}
      style={{
        boxSizing: 'border-box',
        width: '190mm',
        minHeight: '250mm',
        padding: '12mm',
        background: '#fff',
        color: '#172033',
        font: '10pt/1.5 Arial, sans-serif',
      }}
    >
      <PdfCompanyHeader company={company} />
      <section style={{ padding: '12mm 0 8mm' }}>
        <p style={{ margin: '0 0 2mm', color: '#2563eb', fontSize: '8pt', fontWeight: 700, letterSpacing: '2px' }}>
          RESSOURCES HUMAINES
        </p>
        <h1 style={{ margin: 0, color: '#0f172a', fontSize: '22pt' }}>FICHE TECHNICIEN</h1>
      </section>
      <section style={{ marginTop: '3mm', overflow: 'hidden', border: '1px solid #dbe3ef', borderRadius: '3mm' }}>
        {fields.map(([label, value], index) => (
          <div
            key={label}
            style={{
              display: 'flex',
              gap: '8mm',
              padding: '4mm 5mm',
              background: index % 2 ? '#f8fafc' : '#fff',
              borderBottom: index === fields.length - 1 ? '0' : '1px solid #e2e8f0',
            }}
          >
            <strong style={{ width: '55mm', color: '#64748b', fontSize: '8.5pt' }}>{label}</strong>
            <span style={{ color: '#172033', fontWeight: 600 }}>{value}</span>
          </div>
        ))}
      </section>
      <section style={{ marginTop: '20mm', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12mm' }}>
        {['Le technicien', 'La Direction'].map((label) => (
          <div key={label} style={{ minHeight: '42mm', padding: '5mm', border: '1px solid #cbd5e1', borderRadius: '3mm' }}>
            <strong style={{ color: '#1e3a8a' }}>{label}</strong>
            <p style={{ marginTop: '3mm', color: '#64748b', fontSize: '8pt' }}>Date et signature</p>
          </div>
        ))}
      </section>
    </article>
  )
})

export default TechnicianPdf
