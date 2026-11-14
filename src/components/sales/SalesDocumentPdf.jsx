import { forwardRef } from 'react'
import PdfCompanyHeader from '../pdf/PdfCompanyHeader'

const DOCUMENT_TITLES = {
  purchaseOrder: 'BON DE COMMANDE',
  deliveryNote: 'BON DE LIVRAISON',
  invoice: 'FACTURE',
}

function formatCurrency(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('fr-FR')
}

const SalesDocumentPdf = forwardRef(function SalesDocumentPdf(
  { client, company, documentData },
  ref,
) {
  const items = Array.isArray(documentData.items) ? documentData.items : []
  const showSummaryOnNewPage = items.length > 10

  return (
    <article
      ref={ref}
      style={{
        boxSizing: 'border-box',
        width: '190mm',
        padding: '11mm',
        backgroundColor: '#ffffff',
        color: '#172033',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '9pt',
        lineHeight: 1.45,
      }}
    >
      <PdfCompanyHeader company={company} />

      <section
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: '8mm',
          padding: '8mm 0 6mm',
        }}
      >
        <div>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: '20pt', lineHeight: 1.2 }}>
            {DOCUMENT_TITLES[documentData.type] || 'DOCUMENT COMMERCIAL'}
          </h1>
          <p style={{ margin: '2mm 0 0', color: '#1d4ed8', fontSize: '11pt', fontWeight: 700 }}>
            N° {documentData.number}
          </p>
        </div>
        <div style={{ textAlign: 'right', color: '#475569', fontSize: '8.5pt' }}>
          <div>Date : {formatDate(documentData.issueDate)}</div>
          {documentData.type === 'invoice' && (
            <div style={{ marginTop: '1mm' }}>Échéance : {formatDate(documentData.dueDate)}</div>
          )}
        </div>
      </section>

      <section
        style={{
          marginBottom: '7mm',
          padding: '5mm 6mm',
          border: '1px solid #dbe3ef',
          borderRadius: '2mm',
          pageBreakInside: 'avoid',
          breakInside: 'avoid',
        }}
      >
        <p style={{ margin: '0 0 1.5mm', color: '#1e3a8a', fontSize: '7.5pt', fontWeight: 700, letterSpacing: '1px' }}>
          CLIENT
        </p>
        <strong style={{ fontSize: '10pt' }}>
          {client.name || client.companyName || documentData.clientName || 'Client'}
        </strong>
        {(client.address || documentData.clientAddress) && (
          <div>{client.address || documentData.clientAddress}{client.city ? `, ${client.city}` : ''}</div>
        )}
        {client.phone && <div>Tél. : {client.phone}</div>}
        {client.email && <div>{client.email}</div>}
        {(client.ice || documentData.clientIce) && <div>ICE : {client.ice || documentData.clientIce}</div>}
      </section>

      {documentData.notes && (
        <p style={{ margin: '0 0 5mm', color: '#475569', whiteSpace: 'pre-wrap' }}>
          {documentData.notes}
        </p>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '8pt' }}>
        <thead style={{ display: 'table-header-group' }}>
          <tr style={{ backgroundColor: '#1e3a8a', color: '#ffffff' }}>
            <th style={{ width: '26%', padding: '3mm 2mm', textAlign: 'left' }}>Désignation</th>
            <th style={{ width: '13%', padding: '3mm 1mm', textAlign: 'left' }}>Référence</th>
            <th style={{ width: '7%', padding: '3mm 1mm', textAlign: 'right' }}>Qté</th>
            <th style={{ width: '13%', padding: '3mm 1mm', textAlign: 'right' }}>PU HT</th>
            <th style={{ width: '8%', padding: '3mm 1mm', textAlign: 'right' }}>TVA</th>
            <th style={{ width: '16%', padding: '3mm 2mm', textAlign: 'right' }}>Total HT</th>
            <th style={{ width: '17%', padding: '3mm 2mm', textAlign: 'right' }}>Total TTC</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              key={`${item.stockId || item.reference || item.name}-${index}`}
              style={{
                borderBottom: '1px solid #cbd5e1',
                pageBreakInside: 'avoid',
                breakInside: 'avoid',
              }}
            >
              <td style={{ padding: '3mm 2mm', color: '#172033', verticalAlign: 'top', overflowWrap: 'anywhere' }}>
                {item.name || 'Article'}
              </td>
              <td style={{ padding: '3mm 1mm', color: '#475569', verticalAlign: 'top', overflowWrap: 'anywhere' }}>
                {item.reference || '—'}
              </td>
              <td style={{ padding: '3mm 1mm', textAlign: 'right', verticalAlign: 'top' }}>{item.quantity}</td>
              <td style={{ padding: '3mm 1mm', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                {formatCurrency(item.unitPrice)}
              </td>
              <td style={{ padding: '3mm 1mm', textAlign: 'right', verticalAlign: 'top' }}>
                {Number(item.taxRate) || 0} %
              </td>
              <td style={{ padding: '3mm 2mm', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                {formatCurrency(item.totalHT)}
              </td>
              <td style={{ padding: '3mm 2mm', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                {formatCurrency(item.totalTTC)}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan="7" style={{ padding: '8mm', textAlign: 'center', color: '#64748b' }}>
                Aucun article.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <section
        id={showSummaryOnNewPage ? 'page-break' : undefined}
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: '7mm',
          breakBefore: showSummaryOnNewPage ? 'page' : 'auto',
          pageBreakBefore: showSummaryOnNewPage ? 'always' : 'auto',
        }}
      >
        <table style={{ width: '76mm', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '2.5mm 3mm', color: '#475569', textAlign: 'left' }}>Total HT</th>
              <td style={{ padding: '2.5mm 3mm', textAlign: 'right' }}>{formatCurrency(documentData.totalHT)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '2.5mm 3mm', color: '#475569', textAlign: 'left' }}>Total TVA</th>
              <td style={{ padding: '2.5mm 3mm', textAlign: 'right' }}>{formatCurrency(documentData.totalTax)}</td>
            </tr>
            <tr style={{ backgroundColor: '#eff6ff' }}>
              <th style={{ padding: '3mm', color: '#1e3a8a', fontSize: '10pt', textAlign: 'left' }}>Total TTC</th>
              <td style={{ padding: '3mm', color: '#1e3a8a', fontSize: '10pt', fontWeight: 700, textAlign: 'right' }}>
                {formatCurrency(documentData.totalTTC)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {documentData.type === 'invoice' && (
        <p style={{ margin: '9mm 0 0', paddingTop: '3mm', borderTop: '1px solid #e2e8f0', color: '#64748b', fontSize: '8pt' }}>
          Arrêtée la présente facture à la somme de {formatCurrency(documentData.totalTTC)} TTC.
        </p>
      )}
      <footer style={{ marginTop: '10mm', paddingTop: '3mm', borderTop: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '7pt' }}>
        Document généré par TGI Manager Pro · {company.companyName || 'TGI Ascenseurs'}
      </footer>
    </article>
  )
})

export default SalesDocumentPdf
