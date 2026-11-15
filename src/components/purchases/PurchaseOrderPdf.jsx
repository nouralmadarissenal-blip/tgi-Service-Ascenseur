import { forwardRef } from 'react'
import PdfCompanyHeader from '../pdf/PdfCompanyHeader'

function formatCurrency(value, currency = 'MAD') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: ['MAD', 'EUR', 'USD'].includes(currency) ? currency : 'MAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('fr-FR')
}

const PurchaseOrderPdf = forwardRef(function PurchaseOrderPdf(
  { company = {}, order = {} },
  ref,
) {
  const items = Array.isArray(order.items) ? order.items : []
  const currency = order.currency || company.defaultCurrency || 'MAD'

  return (
    <article
      ref={ref}
      style={{
        boxSizing: 'border-box',
        width: '190mm',
        minHeight: '265mm',
        padding: '11mm',
        backgroundColor: '#ffffff',
        color: '#172033',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '9pt',
        lineHeight: 1.45,
      }}
    >
      <PdfCompanyHeader company={company} />

      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8mm', padding: '8mm 0 6mm' }}>
        <div>
          <p style={{ margin: '0 0 1mm', color: '#64748b', fontSize: '7pt', fontWeight: 700, letterSpacing: '1.2px' }}>
            APPROVISIONNEMENT
          </p>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: '20pt', lineHeight: 1.2 }}>BON DE COMMANDE</h1>
          <p style={{ margin: '2mm 0 0', color: '#1d4ed8', fontSize: '11pt', fontWeight: 700 }}>
            N° {order.number || '—'}
          </p>
        </div>
        <div style={{ textAlign: 'right', color: '#475569', fontSize: '8.5pt' }}>
          <div>Date de commande : {formatDate(order.issueDate)}</div>
          <div style={{ marginTop: '1mm' }}>Livraison souhaitée : {formatDate(order.expectedDeliveryDate)}</div>
          <div style={{ marginTop: '1mm' }}>Statut : {order.status || 'Brouillon'}</div>
        </div>
      </section>

      <section style={{ marginBottom: '7mm', padding: '5mm 6mm', border: '1px solid #dbe3ef', borderRadius: '2mm', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <p style={{ margin: '0 0 1.5mm', color: '#1e3a8a', fontSize: '7.5pt', fontWeight: 700, letterSpacing: '1px' }}>
          FOURNISSEUR
        </p>
        <strong style={{ fontSize: '10pt' }}>{order.supplierName || 'Fournisseur'}</strong>
        {order.supplierAddress && <div>{order.supplierAddress}</div>}
        {order.supplierPhone && <div>Tél. : {order.supplierPhone}</div>}
        {order.supplierEmail && <div>{order.supplierEmail}</div>}
        {order.supplierIce && <div>ICE : {order.supplierIce}</div>}
      </section>

      {order.notes && (
        <section style={{ marginBottom: '5mm', padding: '3mm 4mm', borderLeft: '2px solid #1d4ed8', backgroundColor: '#f8fafc', color: '#475569', whiteSpace: 'pre-wrap' }}>
          {order.notes}
        </section>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '8pt' }}>
        <thead style={{ display: 'table-header-group' }}>
          <tr style={{ backgroundColor: '#1e3a8a', color: '#ffffff' }}>
            <th style={{ width: '16%', padding: '3mm 2mm', textAlign: 'left' }}>Référence</th>
            <th style={{ width: '32%', padding: '3mm 2mm', textAlign: 'left' }}>Désignation</th>
            <th style={{ width: '9%', padding: '3mm 1mm', textAlign: 'right' }}>Qté</th>
            <th style={{ width: '15%', padding: '3mm 1mm', textAlign: 'right' }}>PU HT</th>
            <th style={{ width: '9%', padding: '3mm 1mm', textAlign: 'right' }}>TVA</th>
            <th style={{ width: '19%', padding: '3mm 2mm', textAlign: 'right' }}>Total HT</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              key={`${item.stockId || item.reference}-${index}`}
              style={{ borderBottom: '1px solid #cbd5e1', pageBreakInside: 'avoid', breakInside: 'avoid' }}
            >
              <td style={{ padding: '3mm 2mm', color: '#475569', verticalAlign: 'top', overflowWrap: 'anywhere' }}>
                {item.reference || '—'}
              </td>
              <td style={{ padding: '3mm 2mm', color: '#172033', verticalAlign: 'top', overflowWrap: 'anywhere' }}>
                {item.name || item.designation || 'Article'}
              </td>
              <td style={{ padding: '3mm 1mm', textAlign: 'right', verticalAlign: 'top' }}>{item.quantity}</td>
              <td style={{ padding: '3mm 1mm', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                {formatCurrency(item.unitPrice, currency)}
              </td>
              <td style={{ padding: '3mm 1mm', textAlign: 'right', verticalAlign: 'top' }}>{Number(item.taxRate) || 0} %</td>
              <td style={{ padding: '3mm 2mm', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                {formatCurrency(item.totalHT, currency)}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan="6" style={{ padding: '8mm', textAlign: 'center', color: '#64748b' }}>Aucun article.</td>
            </tr>
          )}
        </tbody>
      </table>

      <section style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '7mm' }}>
        <table style={{ width: '76mm', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '2.5mm 3mm', color: '#475569', textAlign: 'left' }}>Total HT</th>
              <td style={{ padding: '2.5mm 3mm', textAlign: 'right' }}>{formatCurrency(order.totalHT, currency)}</td>
            </tr>
            {(order.taxBreakdown || []).map((row) => (
              <tr key={row.taxRate} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '2.5mm 3mm', color: '#475569', textAlign: 'left' }}>TVA {row.taxRate} %</th>
                <td style={{ padding: '2.5mm 3mm', textAlign: 'right' }}>{formatCurrency(row.totalTax, currency)}</td>
              </tr>
            ))}
            <tr style={{ backgroundColor: '#eff6ff' }}>
              <th style={{ padding: '3mm', color: '#1e3a8a', fontSize: '10pt', textAlign: 'left' }}>Total TTC</th>
              <td style={{ padding: '3mm', color: '#1e3a8a', fontSize: '10pt', fontWeight: 700, textAlign: 'right' }}>
                {formatCurrency(order.totalTTC, currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {(order.paymentTerms || order.deliveryMethod) && (
        <section style={{ marginTop: '6mm', padding: '4mm 5mm', border: '1px solid #dbe3ef', borderRadius: '2mm' }}>
          <p style={{ margin: '0 0 2mm', color: '#1e3a8a', fontSize: '7pt', fontWeight: 700, letterSpacing: '1px' }}>CONDITIONS</p>
          {order.paymentTerms && <p style={{ margin: '0 0 1mm' }}><strong>Paiement :</strong> {order.paymentTerms}</p>}
          {order.deliveryMethod && <p style={{ margin: 0 }}><strong>Livraison :</strong> {order.deliveryMethod}</p>}
        </section>
      )}

      <section style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12mm', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <div style={{ width: '75mm', minHeight: '38mm', padding: '4mm', border: '1px solid #cbd5e1', borderRadius: '2mm', textAlign: 'center' }}>
          <strong style={{ color: '#1e3a8a', fontSize: '8pt' }}>LA DIRECTION</strong>
          <p style={{ margin: '2mm 0', color: '#64748b', fontSize: '7.5pt' }}>Cachet et signature</p>
        </div>
      </section>

      <footer style={{ marginTop: '9mm', paddingTop: '3mm', borderTop: '1px solid #e2e8f0', color: '#64748b', fontSize: '7pt' }}>
        {company.documentFooter || `Document généré par ${company.companyName || 'TGI Ascenseurs'}`}
      </footer>
    </article>
  )
})

export default PurchaseOrderPdf
