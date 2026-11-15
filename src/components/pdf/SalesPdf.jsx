import { forwardRef } from 'react'
import PdfCompanyHeader from './PdfCompanyHeader'

const DOCUMENT_TITLES = {
  quote: 'DEVIS',
  purchaseOrder: 'BON DE COMMANDE',
  deliveryNote: 'BON DE LIVRAISON',
  invoice: 'FACTURE',
}

function formatCurrency(value, currency = 'MAD') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(value) {
  if (!value) return '—'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('fr-FR')
}

const SalesPdf = forwardRef(function SalesPdf({ client = {}, company = {}, documentData = {} }, ref) {
  const items = Array.isArray(documentData.items) ? documentData.items : []
  const taxBreakdown = Array.isArray(documentData.taxBreakdown)
    ? documentData.taxBreakdown.filter((row) =>
        Number.isFinite(Number(row.taxRate)) &&
        Number.isFinite(Number(row.totalTax)) &&
        Number.isFinite(Number(row.totalHT)),
      )
    : []
  const summaryNeedsNewPage = items.length > 10
  const title = DOCUMENT_TITLES[documentData.type] || 'DOCUMENT COMMERCIAL'
  const companyDetails = [
    ['ICE', company.ice],
    ['RC', company.rc],
    ['Patente', company.patente],
    ['CNSS', company.cnss],
  ].filter(([, value]) => value)
  const bankDetails = [
    ['Banque', company.bankName],
    ['RIB', company.rib],
    ['SWIFT/BIC', company.swiftBic],
  ].filter(([, value]) => value)

  return (
    <article
      ref={ref}
      style={{
        boxSizing: 'border-box',
        width: '190mm',
        padding: '10mm',
        background: '#fff',
        color: '#172033',
        font: '9pt/1.45 Arial, Helvetica, sans-serif',
      }}
    >
      <PdfCompanyHeader company={company} />

      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', gap: '8mm', padding: '7mm 0 6mm' }}>
        <div style={{ flex: '1 1 50%', alignSelf: 'center' }}>
          <p style={{ margin: '0 0 1.5mm', color: '#64748b', fontSize: '7.5pt', fontWeight: 700, letterSpacing: '1.2px' }}>
            DOCUMENT COMMERCIAL
          </p>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: '20pt', lineHeight: 1.2 }}>{title}</h1>
          <p style={{ margin: '2mm 0 0', color: '#1e3a8a', fontSize: '12pt', fontWeight: 700 }}>
            N° {documentData.number || '—'}
          </p>
          <p style={{ margin: '1mm 0 0', color: '#64748b', fontSize: '8.5pt' }}>
            Date d’émission : {formatDate(documentData.issueDate)}
          </p>
          {documentData.dueDate && (
            <p style={{ margin: '1mm 0 0', color: '#64748b', fontSize: '8.5pt' }}>
              {documentData.type === 'quote' ? 'Devis valable jusqu’au' : 'Date d’échéance'} : {formatDate(documentData.dueDate)}
            </p>
          )}
          {documentData.type === 'invoice' && documentData.linkedDocumentNumber && (
            <p style={{ margin: '1mm 0 0', color: '#64748b', fontSize: '8.5pt' }}>
              Référence : {documentData.linkedDocumentType || 'Document lié'} · {documentData.linkedDocumentNumber}
            </p>
          )}
        </div>
        <section style={{ boxSizing: 'border-box', flex: '0 1 78mm', padding: '4mm 4.5mm', border: '1px solid #cbd5e1', borderRadius: '2mm', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <p style={{ margin: '0 0 2mm', color: '#1e3a8a', fontSize: '7.5pt', fontWeight: 700, letterSpacing: '1px' }}>
            CLIENT
          </p>
          <strong style={{ display: 'block', marginBottom: '1mm', color: '#0f172a', fontSize: '10pt' }}>
            {client.name || client.companyName || documentData.clientName || 'Client'}
          </strong>
          <div style={{ color: '#475569', overflowWrap: 'anywhere' }}>
            {[client.address || documentData.clientAddress, client.city, client.postalCode].filter(Boolean).join(', ') || 'Adresse non renseignée'}
          </div>
          {(client.contactName || client.contactPerson) && (
            <div style={{ marginTop: '1mm', color: '#475569' }}>Contact : {client.contactName || client.contactPerson}</div>
          )}
          {(client.phone || client.phone1) && (
            <div style={{ marginTop: '1mm', color: '#475569' }}>Tél. : {client.phone || client.phone1}</div>
          )}
          {client.email && <div style={{ marginTop: '1mm', color: '#475569', overflowWrap: 'anywhere' }}>{client.email}</div>}
          {(client.ice || documentData.clientIce) && (
            <div style={{ marginTop: '1mm', color: '#475569' }}>ICE : {client.ice || documentData.clientIce}</div>
          )}
        </section>
      </section>

      {documentData.notes && (
        <section style={{ marginBottom: '5mm', padding: '3mm 4mm', borderLeft: '2px solid #1e3a8a', background: '#f8fafc', color: '#475569', whiteSpace: 'pre-wrap' }}>
          {documentData.notes}
        </section>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '8.5pt' }}>
        <thead style={{ display: 'table-header-group' }}>
          <tr style={{ background: '#f1f5f9', color: '#1e293b' }}>
            <th style={{ width: '13%', padding: '3mm 2mm', border: '1px solid #cbd5e1', textAlign: 'left' }}>Réf.</th>
            <th style={{ width: '32%', padding: '3mm 2mm', border: '1px solid #cbd5e1', textAlign: 'left' }}>Désignation</th>
            <th style={{ width: '8%', padding: '3mm 1mm', border: '1px solid #cbd5e1', textAlign: 'right' }}>Qté</th>
            <th style={{ width: '18%', padding: '3mm 2mm', border: '1px solid #cbd5e1', textAlign: 'right' }}>PU HT</th>
            <th style={{ width: '9%', padding: '3mm 1mm', border: '1px solid #cbd5e1', textAlign: 'right' }}>TVA</th>
            <th style={{ width: '20%', padding: '3mm 2mm', border: '1px solid #cbd5e1', textAlign: 'right' }}>Total HT</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              key={`${item.stockId || item.reference || item.name}-${index}`}
              style={{ borderBottom: '1px solid #cbd5e1', pageBreakInside: 'avoid', breakInside: 'avoid' }}
            >
              <td style={{ padding: '3mm 2mm', border: '1px solid #e2e8f0', color: '#475569', verticalAlign: 'top', overflowWrap: 'anywhere' }}>
                {item.reference || item.tgiReference || '—'}
              </td>
              <td style={{ padding: '3mm 2mm', border: '1px solid #e2e8f0', color: '#172033', verticalAlign: 'top', overflowWrap: 'anywhere' }}>
                {item.name || item.designation || 'Article'}
              </td>
              <td style={{ padding: '3mm 1mm', border: '1px solid #e2e8f0', textAlign: 'right', verticalAlign: 'top' }}>{item.quantity}</td>
              <td style={{ padding: '3mm 2mm', border: '1px solid #e2e8f0', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                {formatCurrency(item.unitPrice, company.defaultCurrency)}
              </td>
              <td style={{ padding: '3mm 1mm', border: '1px solid #e2e8f0', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                {Number(item.taxRate ?? item.vatRate ?? 0)}%
              </td>
              <td style={{ padding: '3mm 2mm', border: '1px solid #e2e8f0', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                {formatCurrency(item.totalHT, company.defaultCurrency)}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan="6" style={{ padding: '8mm', border: '1px solid #e2e8f0', color: '#64748b', textAlign: 'center' }}>Aucune ligne de document.</td>
            </tr>
          )}
        </tbody>
      </table>

      <section
        id={summaryNeedsNewPage ? 'page-break' : undefined}
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: '6mm',
          breakBefore: summaryNeedsNewPage ? 'page' : 'auto',
          pageBreakBefore: summaryNeedsNewPage ? 'always' : 'auto',
        }}
      >
        <table style={{ width: '78mm', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
              <th style={{ padding: '2.5mm 3mm', color: '#475569', textAlign: 'left' }}>Total HT</th>
              <td style={{ padding: '2.5mm 3mm', textAlign: 'right' }}>{formatCurrency(documentData.totalHT, company.defaultCurrency)}</td>
            </tr>
            {taxBreakdown.map((row) => (
              <tr key={`vat-${row.taxRate}`} style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '8pt' }}>
                <th style={{ padding: '2mm 3mm', textAlign: 'left' }}>
                  TVA {Number(row.taxRate)} % · base {formatCurrency(row.totalHT, company.defaultCurrency)}
                </th>
                <td style={{ padding: '2mm 3mm', textAlign: 'right' }}>
                  {formatCurrency(row.totalTax, company.defaultCurrency)}
                </td>
              </tr>
            ))}
            <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
              <th style={{ padding: '2.5mm 3mm', color: '#475569', textAlign: 'left' }}>Total TVA</th>
              <td style={{ padding: '2.5mm 3mm', textAlign: 'right' }}>{formatCurrency(documentData.totalTax, company.defaultCurrency)}</td>
            </tr>
            <tr style={{ background: '#eff6ff' }}>
              <th style={{ padding: '3mm', color: '#1e3a8a', fontSize: '10pt', textAlign: 'left' }}>Total TTC</th>
              <td style={{ padding: '3mm', color: '#1e3a8a', fontSize: '10pt', fontWeight: 700, textAlign: 'right' }}>{formatCurrency(documentData.totalTTC, company.defaultCurrency)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {documentData.type === 'quote' && documentData.generalConditions && (
        <section style={{ marginTop: '8mm', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <h2 style={{ margin: '0 0 3mm', color: '#1e3a8a', fontSize: '9pt' }}>Conditions générales de vente</h2>
          {String(documentData.generalConditions).split(/\n\s*\n/).map((paragraph, index) => (
            <p
              data-pdf-keep-together="true"
              key={`${index}-${paragraph.slice(0, 20)}`}
              style={{ margin: '0 0 2.5mm', color: '#475569', fontSize: '7.5pt', lineHeight: 1.4, whiteSpace: 'pre-wrap', textAlign: 'justify', pageBreakInside: 'avoid', breakInside: 'avoid' }}
            >
              {paragraph}
            </p>
          ))}
        </section>
      )}

      {documentData.type === 'invoice' && (
        <section style={{ marginTop: '7mm', paddingTop: '3mm', borderTop: '1px solid #e2e8f0', color: '#475569', fontSize: '8pt' }}>
          <p style={{ margin: '0 0 2mm' }}>
            Arrêtée la présente facture à la somme de : <strong>{formatCurrency(documentData.totalTTC, company.defaultCurrency)}</strong> TTC.
          </p>
          {documentData.paymentTerms && (
            <p style={{ margin: 0 }}>Conditions de règlement : <strong>{documentData.paymentTerms}</strong></p>
          )}
        </section>
      )}

      {(companyDetails.length > 0 || bankDetails.length > 0) && (
        <section style={{ display: 'flex', justifyContent: 'space-between', gap: '5mm', marginTop: '8mm', padding: '4mm', border: '1px solid #cbd5e1', borderRadius: '2mm', color: '#475569', fontSize: '7.5pt', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          {companyDetails.length > 0 && (
            <div style={{ flex: '1 1 50%' }}>
              <strong style={{ display: 'block', marginBottom: '2mm', color: '#1e3a8a' }}>Identifiants légaux</strong>
              {companyDetails.map(([label, value]) => <div key={label}>{label} : {value}</div>)}
            </div>
          )}
          {bankDetails.length > 0 && (
            <div style={{ flex: '1 1 50%' }}>
              <strong style={{ display: 'block', marginBottom: '2mm', color: '#1e3a8a' }}>Coordonnées bancaires</strong>
              {bankDetails.map(([label, value]) => <div key={label}>{label} : {value}</div>)}
            </div>
          )}
        </section>
      )}

      <section style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8mm', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <div
          data-pdf-stamp-slot={['invoice', 'deliveryNote'].includes(documentData.type) ? 'true' : undefined}
          style={{ boxSizing: 'border-box', position: 'relative', width: '70mm', minHeight: '30mm', padding: '4mm', border: '1px solid #94a3b8', borderRadius: '2mm', textAlign: 'center', pageBreakInside: 'avoid', breakInside: 'avoid' }}
        >
          <strong style={{ color: '#1e3a8a', fontSize: '9pt' }}>TGI ASCENSEURS</strong>
          <p style={{ margin: '2mm 0 0', color: '#64748b', fontSize: '8pt' }}>Signature et cachet</p>
          {documentData.type === 'invoice' && company.stampBase64 && company.autoStampEnabled !== true && (
            <img
              alt="Cachet et signature de l’entreprise"
              src={company.stampBase64}
              style={{ display: 'block', maxWidth: '40mm', maxHeight: '20mm', objectFit: 'contain', margin: '2mm auto 0' }}
            />
          )}
        </div>
      </section>
    </article>
  )
})

export default SalesPdf
