import { forwardRef } from 'react'
import PdfCompanyHeader from './PdfCompanyHeader'

function formatCurrency(value, currency = 'MAD') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('fr-FR')
}

const ReceiptPdf = forwardRef(function ReceiptPdf(
  { client, company, invoice, payment, previousPayments = [] },
  ref,
) {
  const invoiceNumber = invoice.number || payment.invoiceNumber || '—'
  const settled = Number(payment.remainingAfter) <= 0

  return (
    <article
      ref={ref}
      style={{
        boxSizing: 'border-box',
        width: '190mm',
        minHeight: '140mm',
        padding: '8mm',
        backgroundColor: '#ffffff',
        color: '#172033',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '10pt',
        lineHeight: 1.55,
      }}
    >
      <PdfCompanyHeader company={company} />

      <section style={{ padding: '5mm 0 4mm', textAlign: 'center' }}>
        <p style={{ margin: '0 0 2mm', color: '#15803d', fontSize: '8pt', fontWeight: 700, letterSpacing: '2px' }}>
          REÇU DE PAIEMENT N° {payment.reference || '—'}
        </p>
        <h1 style={{ margin: 0, color: '#0f172a', fontSize: '19pt' }}>Reçu de règlement</h1>
      </section>

      <section style={{ padding: '4mm', border: '1px solid #dbe3ef', borderRadius: '3mm' }}>
        <p style={{ margin: '0 0 3mm', color: '#334155' }}>
          Nous reconnaissons avoir reçu de{' '}
          <strong>{client.name || client.companyName || payment.clientName || 'notre client'}</strong>{' '}
          la somme de <strong>{formatCurrency(payment.amount, company.defaultCurrency)}</strong> par{' '}
          <strong>{payment.method || '—'}</strong> pour le règlement {settled ? 'total' : 'partiel'} de la facture N°{' '}
          <strong>{invoiceNumber}</strong>.
        </p>
        <p style={{ margin: '0 0 3mm', color: '#15803d', fontSize: '17pt', fontWeight: 700, textAlign: 'center' }}>
          {formatCurrency(payment.amount, company.defaultCurrency)}
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <tbody>
            {[
              ['Date du règlement', formatDate(payment.paymentDate)],
              ['Mode de paiement', payment.method],
              ['Référence de transaction', payment.transactionReference],
              ['Facture concernée', invoiceNumber],
              ['Reste à payer après règlement', formatCurrency(payment.remainingAfter, company.defaultCurrency)],
            ].map(([label, value]) => (
              <tr key={label} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ width: '55%', padding: '2mm 3mm', background: '#f8fafc', color: '#475569', textAlign: 'left' }}>
                  {label}
                </th>
                <td style={{ padding: '2mm 3mm', color: '#172033' }}>{value || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: '3mm' }}>
          <strong style={{ color: '#334155', fontSize: '8pt' }}>Règlements antérieurs sur cette facture</strong>
          {previousPayments.length > 0 ? (
            <table style={{ width: '100%', marginTop: '1mm', borderCollapse: 'collapse', fontSize: '7.5pt' }}>
              <thead>
                <tr>
                  {['Date', 'Mode', 'Référence', 'Montant'].map((label) => (
                    <th key={label} style={{ padding: '1.2mm 2mm', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', textAlign: 'left' }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previousPayments.map((previousPayment) => (
                  <tr key={previousPayment.id || previousPayment.reference}>
                    <td style={{ padding: '1.2mm 2mm', border: '1px solid #e2e8f0' }}>{formatDate(previousPayment.paymentDate)}</td>
                    <td style={{ padding: '1.2mm 2mm', border: '1px solid #e2e8f0' }}>{previousPayment.method || '—'}</td>
                    <td style={{ padding: '1.2mm 2mm', border: '1px solid #e2e8f0' }}>{previousPayment.reference || '—'}</td>
                    <td style={{ padding: '1.2mm 2mm', border: '1px solid #e2e8f0', textAlign: 'right' }}>{formatCurrency(previousPayment.amount, company.defaultCurrency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ margin: '1mm 0 0', color: '#64748b', fontSize: '7.5pt' }}>Aucun règlement antérieur enregistré.</p>
          )}
        </div>
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '5mm' }}>
        <div data-pdf-stamp-slot="true" style={{ position: 'relative', width: '70mm', minHeight: '20mm', padding: '3mm', border: '1px solid #cbd5e1', borderRadius: '2mm' }}>
          <strong style={{ color: '#1e3a8a' }}>La Direction</strong>
          <p style={{ margin: '2mm 0 0', color: '#64748b', fontSize: '8pt' }}>
            Signature et cachet
          </p>
        </div>
      </div>
      <footer style={{ marginTop: '4mm', paddingTop: '2mm', borderTop: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '7pt' }}>
        Reçu établi pour le règlement de la facture {invoiceNumber}.
      </footer>
    </article>
  )
})

export default ReceiptPdf
