import { forwardRef } from 'react'
import PdfCompanyHeader from './PdfCompanyHeader'

function formatCurrency(value, currency = 'MAD') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: ['MAD', 'EUR', 'USD'].includes(currency) ? currency : 'MAD',
    maximumFractionDigits: 2,
  }).format(amount)
}

const InventoryPdf = forwardRef(function InventoryPdf({ company, items }, ref) {
  const totalPurchaseValue = items.reduce(
    (total, item) => total + Number(item.quantity || 0) * Number(item.purchasePrice ?? item.unitPrice ?? 0),
    0,
  )

  return (
    <article
      ref={ref}
      style={{
        boxSizing: 'border-box',
        width: '190mm',
        padding: '10mm',
        background: '#fff',
        color: '#172033',
        font: '8pt/1.4 Arial, sans-serif',
      }}
    >
      <PdfCompanyHeader company={company} />
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', padding: '8mm 0 5mm' }}>
        <div>
          <p style={{ margin: '0 0 1mm', color: '#2563eb', fontSize: '7.5pt', fontWeight: 700, letterSpacing: '1.5px' }}>LOGISTIQUE</p>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: '18pt' }}>ÉTAT DE L’INVENTAIRE</h1>
        </div>
        <span style={{ color: '#64748b' }}>{new Date().toLocaleDateString('fr-FR')}</span>
      </section>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '7.5pt' }}>
        <thead style={{ display: 'table-header-group' }}>
          <tr style={{ background: '#1e3a8a', color: '#fff' }}>
            {[
              ['Référence', '14%'],
              ['Désignation', '19%'],
              ['Catégorie', '12%'],
              ['Emplacement', '12%'],
              ['Qté', '6%'],
              ['Seuil', '6%'],
              ['TVA', '6%'],
              ['Achat HT', '12%'],
              ['Vente HT', '13%'],
            ].map(([label, width]) => (
              <th key={label} style={{ width, padding: '2.5mm 1.5mm', textAlign: label === 'Désignation' ? 'left' : 'right' }}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const low = Number(item.quantity) <= Number(item.alertThreshold)
            return (
              <tr key={item.id || `${item.reference}-${index}`} style={{ background: index % 2 ? '#f8fafc' : '#fff', borderBottom: '1px solid #e2e8f0', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <td style={{ padding: '2.5mm 1.5mm', overflowWrap: 'anywhere' }}>{item.reference || item.tgiReference || '—'}</td>
                <td style={{ padding: '2.5mm 1.5mm', overflowWrap: 'anywhere' }}>{item.name || item.designation || '—'}</td>
                <td style={{ padding: '2.5mm 1.5mm', overflowWrap: 'anywhere' }}>{item.category || '—'}</td>
                <td style={{ padding: '2.5mm 1.5mm', overflowWrap: 'anywhere' }}>{item.location || '—'}</td>
                <td style={{ padding: '2.5mm 1.5mm', color: low ? '#b91c1c' : '#172033', fontWeight: 700, textAlign: 'right' }}>{item.quantity}</td>
                <td style={{ padding: '2.5mm 1.5mm', textAlign: 'right' }}>{item.alertThreshold}</td>
                <td style={{ padding: '2.5mm 1.5mm', textAlign: 'right' }}>{Number(item.vatRate ?? 20)}%</td>
                <td style={{ padding: '2.5mm 1.5mm', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(item.purchasePrice ?? item.unitPrice, company.defaultCurrency)}</td>
                <td style={{ padding: '2.5mm 1.5mm', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(item.salePrice ?? item.unitPrice, company.defaultCurrency)}</td>
              </tr>
            )
          })}
          {items.length === 0 && (
            <tr><td colSpan="9" style={{ padding: '8mm', color: '#64748b', textAlign: 'center' }}>Aucun article en stock</td></tr>
          )}
        </tbody>
      </table>
      <section style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '5mm' }}>
        <div style={{ width: '80mm', padding: '3mm', background: '#eff6ff', color: '#1e3a8a', textAlign: 'right', fontWeight: 700 }}>
          Valeur d’achat estimée : {formatCurrency(totalPurchaseValue, company.defaultCurrency)}
        </div>
      </section>
    </article>
  )
})

export default InventoryPdf
