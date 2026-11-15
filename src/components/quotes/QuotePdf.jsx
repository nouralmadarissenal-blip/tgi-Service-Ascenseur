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

const QuotePdf = forwardRef(function QuotePdf(
  { client, company, quote },
  ref,
) {
  const items = Array.isArray(quote.items) ? quote.items : []
  const currency = company.defaultCurrency || 'MAD'
  const companyName = company.companyName || 'TGI Ascenseurs'
  const location = [client.address || quote.clientAddress, client.city || quote.clientCity]
    .filter(Boolean)
    .join(', ')

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
            PROPOSITION COMMERCIALE
          </p>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: '22pt', lineHeight: 1.2 }}>DEVIS</h1>
          <p style={{ margin: '2mm 0 0', color: '#1d4ed8', fontSize: '11pt', fontWeight: 700 }}>
            N° {quote.number || '—'}
          </p>
        </div>
        <div style={{ textAlign: 'right', color: '#475569', fontSize: '8.5pt' }}>
          <div>Date du devis : {formatDate(quote.issueDate)}</div>
          <div style={{ marginTop: '1mm' }}>Valable jusqu’au : {formatDate(quote.validUntil || quote.dueDate)}</div>
          {quote.validityDays > 0 && (
            <div style={{ marginTop: '1mm' }}>Durée de validité : {quote.validityDays} jours</div>
          )}
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5mm', marginBottom: '6mm' }}>
        <div style={{ padding: '4mm 5mm', border: '1px solid #dbe3ef', borderRadius: '2mm', minHeight: '31mm' }}>
          <p style={{ margin: '0 0 1.5mm', color: '#1e3a8a', fontSize: '7pt', fontWeight: 700, letterSpacing: '1px' }}>
            CLIENT
          </p>
          <strong style={{ fontSize: '10pt' }}>
            {client.name || client.companyName || client.clientName || quote.clientName || 'Client'}
          </strong>
          {location && <div style={{ marginTop: '1mm' }}>{location}</div>}
          {(client.phone || quote.clientPhone) && <div>Tél. : {client.phone || quote.clientPhone}</div>}
          {(client.email || quote.clientEmail) && <div>{client.email || quote.clientEmail}</div>}
          {(client.ice || quote.clientIce) && <div>ICE : {client.ice || quote.clientIce}</div>}
        </div>
        <div style={{ padding: '4mm 5mm', border: '1px solid #dbe3ef', borderRadius: '2mm', minHeight: '31mm' }}>
          <p style={{ margin: '0 0 1.5mm', color: '#1e3a8a', fontSize: '7pt', fontWeight: 700, letterSpacing: '1px' }}>
            ÉQUIPEMENT CONCERNÉ
          </p>
          <strong style={{ fontSize: '10pt' }}>{quote.elevatorReference || 'Ascenseur'}</strong>
          {quote.elevatorBrand && <div>Marque : {quote.elevatorBrand}</div>}
          {quote.elevatorType && <div>Type : {quote.elevatorType}</div>}
        </div>
      </section>

      {quote.notes && (
        <section style={{ marginBottom: '5mm', padding: '3mm 4mm', borderLeft: '2px solid #1d4ed8', backgroundColor: '#f8fafc', color: '#475569', whiteSpace: 'pre-wrap' }}>
          {quote.notes}
        </section>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '8pt' }}>
        <thead style={{ display: 'table-header-group' }}>
          <tr style={{ backgroundColor: '#1e3a8a', color: '#ffffff' }}>
            <th style={{ width: '10%', padding: '3mm 2mm', textAlign: 'left' }}>Type</th>
            <th style={{ width: '31%', padding: '3mm 2mm', textAlign: 'left' }}>Désignation</th>
            <th style={{ width: '14%', padding: '3mm 1mm', textAlign: 'left' }}>Référence</th>
            <th style={{ width: '7%', padding: '3mm 1mm', textAlign: 'right' }}>Qté</th>
            <th style={{ width: '13%', padding: '3mm 1mm', textAlign: 'right' }}>PU HT</th>
            <th style={{ width: '8%', padding: '3mm 1mm', textAlign: 'right' }}>TVA</th>
            <th style={{ width: '17%', padding: '3mm 2mm', textAlign: 'right' }}>Total TTC</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              key={`${item.stockId || item.reference || item.name}-${index}`}
              style={{ borderBottom: '1px solid #cbd5e1', pageBreakInside: 'avoid', breakInside: 'avoid' }}
            >
              <td style={{ padding: '3mm 2mm', color: '#475569', verticalAlign: 'top' }}>
                {item.lineType === 'labor' ? 'Main-d’œuvre' : item.lineType === 'travel' ? 'Déplacement' : 'Pièce'}
              </td>
              <td style={{ padding: '3mm 2mm', color: '#172033', verticalAlign: 'top', overflowWrap: 'anywhere' }}>
                {item.name || item.designation || 'Article'}
              </td>
              <td style={{ padding: '3mm 1mm', color: '#475569', verticalAlign: 'top', overflowWrap: 'anywhere' }}>
                {item.reference || '—'}
              </td>
              <td style={{ padding: '3mm 1mm', textAlign: 'right', verticalAlign: 'top' }}>{item.quantity}</td>
              <td style={{ padding: '3mm 1mm', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                {formatCurrency(item.unitPrice, currency)}
              </td>
              <td style={{ padding: '3mm 1mm', textAlign: 'right', verticalAlign: 'top' }}>
                {Number(item.taxRate) || 0} %
              </td>
              <td style={{ padding: '3mm 2mm', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                {formatCurrency(item.totalTTC, currency)}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan="7" style={{ padding: '8mm', textAlign: 'center', color: '#64748b' }}>Aucune ligne.</td>
            </tr>
          )}
        </tbody>
      </table>

      <section style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6mm' }}>
        <table style={{ width: '76mm', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '2.5mm 3mm', color: '#475569', textAlign: 'left' }}>Total HT</th>
              <td style={{ padding: '2.5mm 3mm', textAlign: 'right' }}>{formatCurrency(quote.totalHT, currency)}</td>
            </tr>
            {(quote.taxBreakdown || []).map((row) => (
              <tr key={row.taxRate} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '2.5mm 3mm', color: '#475569', textAlign: 'left' }}>TVA {row.taxRate} %</th>
                <td style={{ padding: '2.5mm 3mm', textAlign: 'right' }}>{formatCurrency(row.totalTax, currency)}</td>
              </tr>
            ))}
            <tr style={{ backgroundColor: '#eff6ff' }}>
              <th style={{ padding: '3mm', color: '#1e3a8a', fontSize: '10pt', textAlign: 'left' }}>Total TTC</th>
              <td style={{ padding: '3mm', color: '#1e3a8a', fontSize: '10pt', fontWeight: 700, textAlign: 'right' }}>
                {formatCurrency(quote.totalTTC, currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {(quote.deliveryDelay || quote.paymentTerms || quote.generalConditions) && (
        <section style={{ marginTop: '6mm', padding: '4mm 5mm', border: '1px solid #dbe3ef', borderRadius: '2mm', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <p style={{ margin: '0 0 2mm', color: '#1e3a8a', fontSize: '7pt', fontWeight: 700, letterSpacing: '1px' }}>CONDITIONS</p>
          {quote.deliveryDelay && <p style={{ margin: '0 0 1mm' }}><strong>Délai :</strong> {quote.deliveryDelay}</p>}
          {quote.paymentTerms && <p style={{ margin: '0 0 1mm' }}><strong>Paiement :</strong> {quote.paymentTerms}</p>}
          {quote.generalConditions && <p style={{ margin: '2mm 0 0', color: '#475569', whiteSpace: 'pre-wrap' }}>{quote.generalConditions}</p>}
        </section>
      )}

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8mm', marginTop: '9mm', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <div style={{ minHeight: '35mm', padding: '4mm', border: '1px solid #cbd5e1', borderRadius: '2mm' }}>
          <strong style={{ color: '#1e3a8a', fontSize: '8pt' }}>BON POUR ACCORD</strong>
          <p style={{ margin: '2mm 0', color: '#475569', fontSize: '7.5pt' }}>Date : ______________________________</p>
          <p style={{ margin: '2mm 0', color: '#475569', fontSize: '7.5pt' }}>Nom et signature du client :</p>
        </div>
        <div data-pdf-stamp-slot="true" style={{ position: 'relative', minHeight: '35mm', padding: '4mm', border: '1px solid #cbd5e1', borderRadius: '2mm', textAlign: 'center' }}>
          <strong style={{ color: '#1e3a8a', fontSize: '8pt' }}>POUR {companyName.toLocaleUpperCase('fr')}</strong>
          <p style={{ margin: '2mm 0', color: '#64748b', fontSize: '7.5pt' }}>Cachet et signature</p>
          {company.stampBase64 && company.autoStampEnabled !== true && (
            <img
              alt="Cachet de l’entreprise"
              src={company.stampBase64}
              style={{ display: 'block', maxWidth: '42mm', maxHeight: '22mm', objectFit: 'contain', margin: '2mm auto 0' }}
            />
          )}
        </div>
      </section>

      <footer style={{ marginTop: '8mm', paddingTop: '3mm', borderTop: '1px solid #e2e8f0', color: '#64748b', fontSize: '7pt' }}>
        {company.documentFooter || `Document généré par ${companyName}`}
      </footer>
    </article>
  )
})

export default QuotePdf
