import { forwardRef } from 'react'
import PdfCompanyHeader from '../pdf/PdfCompanyHeader'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('fr-FR')
}

const DeliveryNotePdf = forwardRef(function DeliveryNotePdf(
  { client = {}, company = {}, note = {} },
  ref,
) {
  const items = Array.isArray(note.items) ? note.items : []
  const clientName = client.name || client.companyName || client.clientName || note.clientName || 'Client'
  const address = note.deliveryAddress ||
    [client.address || note.clientAddress, client.city || note.clientCity, client.postalCode || note.clientPostalCode]
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
            DOCUMENT LOGISTIQUE
          </p>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: '20pt', lineHeight: 1.2 }}>BON DE LIVRAISON</h1>
          <p style={{ margin: '2mm 0 0', color: '#1d4ed8', fontSize: '11pt', fontWeight: 700 }}>
            N° {note.number || '—'}
          </p>
        </div>
        <div style={{ textAlign: 'right', color: '#475569', fontSize: '8.5pt' }}>
          <div>Date de livraison : {formatDate(note.deliveryDate)}</div>
          {note.linkedDocumentReference && (
            <div style={{ marginTop: '1mm' }}>Document lié : {note.linkedDocumentReference}</div>
          )}
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5mm', marginBottom: '7mm' }}>
        <div style={{ padding: '5mm 6mm', border: '1px solid #dbe3ef', borderRadius: '2mm', minHeight: '32mm' }}>
          <p style={{ margin: '0 0 1.5mm', color: '#1e3a8a', fontSize: '7.5pt', fontWeight: 700, letterSpacing: '1px' }}>CLIENT</p>
          <strong style={{ fontSize: '10pt' }}>{clientName}</strong>
          {(client.ice || note.clientIce) && <div>ICE : {client.ice || note.clientIce}</div>}
          {(client.phone || note.clientPhone) && <div>Tél. : {client.phone || note.clientPhone}</div>}
          {(client.email || note.clientEmail) && <div>{client.email || note.clientEmail}</div>}
        </div>
        <div style={{ padding: '5mm 6mm', border: '1px solid #dbe3ef', borderRadius: '2mm', minHeight: '32mm' }}>
          <p style={{ margin: '0 0 1.5mm', color: '#1e3a8a', fontSize: '7.5pt', fontWeight: 700, letterSpacing: '1px' }}>LIVRAISON</p>
          <strong>{address || 'Adresse non renseignée'}</strong>
          {note.carrierName && <div style={{ marginTop: '1.5mm' }}>Transporteur : {note.carrierName}</div>}
          {note.status && <div style={{ marginTop: '1.5mm' }}>Statut : {note.status}</div>}
        </div>
      </section>

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '8.5pt' }}>
        <thead style={{ display: 'table-header-group' }}>
          <tr style={{ backgroundColor: '#1e3a8a', color: '#ffffff' }}>
            <th style={{ width: '20%', padding: '3.5mm 3mm', textAlign: 'left' }}>Référence</th>
            <th style={{ width: '48%', padding: '3.5mm 3mm', textAlign: 'left' }}>Désignation</th>
            <th style={{ width: '16%', padding: '3.5mm 2mm', textAlign: 'right' }}>Quantité</th>
            <th style={{ width: '16%', padding: '3.5mm 3mm', textAlign: 'right' }}>Unité</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              key={`${item.stockId || item.reference}-${index}`}
              style={{ borderBottom: '1px solid #cbd5e1', pageBreakInside: 'avoid', breakInside: 'avoid' }}
            >
              <td style={{ padding: '4mm 3mm', color: '#475569', verticalAlign: 'top', overflowWrap: 'anywhere' }}>
                {item.reference || '—'}
              </td>
              <td style={{ padding: '4mm 3mm', color: '#172033', verticalAlign: 'top', overflowWrap: 'anywhere' }}>
                {item.name || item.designation || 'Article'}
              </td>
              <td style={{ padding: '4mm 2mm', textAlign: 'right', verticalAlign: 'top', fontWeight: 700 }}>
                {item.quantity}
              </td>
              <td style={{ padding: '4mm 3mm', textAlign: 'right', verticalAlign: 'top' }}>
                {item.unit || 'Pièce'}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan="4" style={{ padding: '8mm', textAlign: 'center', color: '#64748b' }}>Aucun article.</td>
            </tr>
          )}
        </tbody>
      </table>

      {note.notes && (
        <section style={{ marginTop: '7mm', padding: '4mm 5mm', borderLeft: '2px solid #1d4ed8', backgroundColor: '#f8fafc', color: '#475569', whiteSpace: 'pre-wrap' }}>
          <strong style={{ display: 'block', marginBottom: '1.5mm', color: '#1e3a8a', fontSize: '7.5pt' }}>NOTES DE LIVRAISON</strong>
          {note.notes}
        </section>
      )}

      <section style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18mm', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <div style={{ width: '84mm', minHeight: '42mm', padding: '5mm', border: '1px solid #cbd5e1', borderRadius: '2mm' }}>
          <strong style={{ color: '#1e3a8a', fontSize: '8pt' }}>RÉCEPTIONNAIRE (CLIENT)</strong>
          <p style={{ margin: '3mm 0', color: '#475569', fontSize: '8pt' }}>Date : ______________________________</p>
          <p style={{ margin: '3mm 0', color: '#475569', fontSize: '8pt' }}>Nom et signature : ___________________</p>
        </div>
      </section>

      <footer style={{ marginTop: '9mm', paddingTop: '3mm', borderTop: '1px solid #e2e8f0', color: '#64748b', fontSize: '7pt' }}>
        {company.documentFooter || `Document généré par ${company.companyName || 'TGI Ascenseurs'}`}
      </footer>
    </article>
  )
})

export default DeliveryNotePdf
