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

function formatDate(value) {
  if (!value) return '—'
  const dateValue = typeof value?.toDate === 'function' ? value.toDate() : value
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue))
    ? new Date(`${dateValue}T00:00:00`)
    : new Date(dateValue)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('fr-FR')
}

function getClientName(client) {
  return client.name || client.companyName || client.clientName || 'Client'
}

function getLegacyElevatorCount(client) {
  if (
    client.undetailedElevatorCount != null &&
    Number.isFinite(Number(client.undetailedElevatorCount))
  ) {
    return Math.max(0, Number(client.undetailedElevatorCount))
  }
  const totalCount = Math.max(0, Number(client.elevatorCount) || 0)
  const detailedCount = Array.isArray(client.elevators) ? client.elevators.length : 0
  return Math.max(0, totalCount - detailedCount)
}

function getRemainingAmount(invoice) {
  if (invoice.remainingAmount != null) return Math.max(0, Number(invoice.remainingAmount) || 0)
  return Math.max(
    0,
    Number(invoice.totalTTC || 0) - Number(invoice.paidAmount || 0),
  )
}

function DetailTable({ rows }) {
  const visibleRows = rows.filter(([, value]) => value !== '' && value != null)
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
      <tbody>
        {visibleRows.map(([label, value]) => (
          <tr
            data-pdf-keep-together="true"
            key={label}
            style={{ borderBottom: '1px solid #e2e8f0', pageBreakInside: 'avoid', breakInside: 'avoid' }}
          >
            <th style={{ width: '33%', padding: '2.7mm 3mm', background: '#f8fafc', color: '#475569', textAlign: 'left', verticalAlign: 'top' }}>
              {label}
            </th>
            <td style={{ padding: '2.7mm 3mm', color: '#172033', verticalAlign: 'top', overflowWrap: 'anywhere' }}>
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const sectionTitleStyle = {
  margin: '0 0 3mm',
  color: '#0f172a',
  fontSize: '11pt',
  fontWeight: 700,
}

const ClientPdf = forwardRef(function ClientPdf(
  { client = {}, company = {}, invoices = [] },
  ref,
) {
  const elevators = Array.isArray(client.elevators) ? client.elevators : []
  const legacyElevatorCount = getLegacyElevatorCount(client)
  const elevatorCount = elevators.length + legacyElevatorCount
  const currency = company.defaultCurrency || 'MAD'
  const invoiceHistory = invoices.filter((invoice) => invoice.clientId === client.id)
  const invoiceBalance = invoiceHistory.reduce(
    (total, invoice) => total + getRemainingAmount(invoice),
    0,
  )
  const currentBalance = invoiceHistory.length
    ? invoiceBalance
    : Number(client.currentBalance || 0)
  const clientAddress = [client.address, client.city, client.postalCode]
    .filter(Boolean)
    .join(', ')

  return (
    <article
      ref={ref}
      style={{
        boxSizing: 'border-box',
        width: '190mm',
        padding: '10mm',
        background: '#ffffff',
        color: '#172033',
        font: '8.5pt/1.45 Arial, Helvetica, sans-serif',
      }}
    >
      <PdfCompanyHeader company={company} />

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8mm', padding: '7mm 0 5mm', borderBottom: '1px solid #cbd5e1' }}>
        <div>
          <p style={{ margin: '0 0 1mm', color: '#1d4ed8', fontSize: '7.5pt', fontWeight: 700, letterSpacing: '1.3px' }}>
            DOSSIER CLIENT
          </p>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: '19pt', lineHeight: 1.2 }}>
            FICHE CLIENT TECHNIQUE
          </h1>
        </div>
        <p style={{ margin: 0, color: '#64748b', fontSize: '8pt', textAlign: 'right' }}>
          Éditée le {new Date().toLocaleDateString('fr-FR')}
        </p>
      </header>

      <section style={{ marginTop: '6mm' }}>
        <h2 style={sectionTitleStyle}>Identité & contact</h2>
        <DetailTable
          rows={[
            ['Client / résidence', getClientName(client)],
            ['Type de client', client.clientType || 'Entreprise'],
            ['Responsable', client.contactName],
            ['Téléphone 1', client.phone || client.phone1],
            ['Téléphone 2', client.phone2],
            ['E-mail', client.email],
            ['Adresse du site', clientAddress || 'Non renseignée'],
            ['ICE', client.ice],
            ['Registre de commerce (RC)', client.rc],
            ['Identifiant fiscal (IF)', client.if],
            ['Patente', client.patente],
          ]}
        />
      </section>

      <section style={{ marginTop: '7mm' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '5mm', marginBottom: '3mm' }}>
          <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Parc d’ascenseurs</h2>
          <span style={{ color: '#1e3a8a', fontSize: '8pt', fontWeight: 700 }}>
            {elevatorCount} équipement{elevatorCount === 1 ? '' : 's'}
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '8pt' }}>
          <thead style={{ display: 'table-header-group' }}>
            <tr style={{ background: '#1e3a8a', color: '#ffffff' }}>
              <th style={{ width: '25%', padding: '2.7mm 2mm', textAlign: 'left' }}>Repère / numéro</th>
              <th style={{ width: '20%', padding: '2.7mm 2mm', textAlign: 'left' }}>Marque</th>
              <th style={{ width: '18%', padding: '2.7mm 2mm', textAlign: 'left' }}>Type</th>
              <th style={{ width: '14%', padding: '2.7mm 2mm', textAlign: 'right' }}>Niveaux</th>
              <th style={{ width: '23%', padding: '2.7mm 2mm', textAlign: 'left' }}>État actuel</th>
            </tr>
          </thead>
          <tbody>
            {elevators.map((elevator, index) => (
              <tr
                data-pdf-keep-together="true"
                key={elevator.id || `${elevator.reference || 'ascenseur'}-${index}`}
                style={{
                  background: index % 2 ? '#f8fafc' : '#ffffff',
                  borderBottom: '1px solid #e2e8f0',
                  pageBreakInside: 'avoid',
                  breakInside: 'avoid',
                }}
              >
                <td style={{ padding: '2.7mm 2mm', overflowWrap: 'anywhere' }}>{elevator.reference || '—'}</td>
                <td style={{ padding: '2.7mm 2mm', overflowWrap: 'anywhere' }}>{elevator.brand || '—'}</td>
                <td style={{ padding: '2.7mm 2mm' }}>{elevator.type || '—'}</td>
                <td style={{ padding: '2.7mm 2mm', textAlign: 'right' }}>{elevator.floors ?? '—'}</td>
                <td style={{ padding: '2.7mm 2mm' }}>{elevator.status || '—'}</td>
              </tr>
            ))}
            {legacyElevatorCount > 0 && (
              <tr style={{ background: '#fffbeb', borderBottom: '1px solid #e2e8f0' }}>
                <td colSpan={5} style={{ padding: '3mm', color: '#92400e' }}>
                  {legacyElevatorCount} équipement(s) historique(s) recensé(s), dont les détails techniques restent à compléter.
                  {client.elevatorBrands ? ` Marques historiques : ${client.elevatorBrands}.` : ''}
                </td>
              </tr>
            )}
            {elevatorCount === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '5mm', color: '#64748b', textAlign: 'center' }}>
                  Aucun ascenseur n’est actuellement enregistré pour ce site.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: '7mm' }}>
        <h2 style={sectionTitleStyle}>Contrat & situation financière</h2>
        <DetailTable
          rows={[
            ['Type de contrat', client.contractType || 'Aucun'],
            ['Statut du contrat', client.contractStatus || 'Aucun'],
            ['Échéance du contrat', formatDate(client.contractEndDate)],
            ['Solde actuel / impayés', formatCurrency(currentBalance, currency)],
          ]}
        />
      </section>

      <section style={{ marginTop: '7mm' }}>
        <h2 style={sectionTitleStyle}>Historique des factures</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '7.8pt' }}>
          <thead style={{ display: 'table-header-group' }}>
            <tr style={{ background: '#f1f5f9', color: '#334155' }}>
              <th style={{ width: '25%', padding: '2.5mm 2mm', border: '1px solid #cbd5e1', textAlign: 'left' }}>N° facture</th>
              <th style={{ width: '20%', padding: '2.5mm 2mm', border: '1px solid #cbd5e1', textAlign: 'left' }}>Date</th>
              <th style={{ width: '18%', padding: '2.5mm 2mm', border: '1px solid #cbd5e1', textAlign: 'right' }}>Total TTC</th>
              <th style={{ width: '18%', padding: '2.5mm 2mm', border: '1px solid #cbd5e1', textAlign: 'right' }}>Payé</th>
              <th style={{ width: '19%', padding: '2.5mm 2mm', border: '1px solid #cbd5e1', textAlign: 'right' }}>Reste</th>
            </tr>
          </thead>
          <tbody>
            {invoiceHistory.length ? invoiceHistory.map((invoice, index) => (
              <tr
                data-pdf-keep-together="true"
                key={invoice.id || invoice.number || index}
                style={{ background: index % 2 ? '#f8fafc' : '#ffffff', pageBreakInside: 'avoid', breakInside: 'avoid' }}
              >
                <td style={{ padding: '2.5mm 2mm', border: '1px solid #e2e8f0', overflowWrap: 'anywhere' }}>{invoice.number || '—'}</td>
                <td style={{ padding: '2.5mm 2mm', border: '1px solid #e2e8f0' }}>{formatDate(invoice.issueDate)}</td>
                <td style={{ padding: '2.5mm 2mm', border: '1px solid #e2e8f0', textAlign: 'right' }}>{formatCurrency(invoice.totalTTC, currency)}</td>
                <td style={{ padding: '2.5mm 2mm', border: '1px solid #e2e8f0', textAlign: 'right' }}>{formatCurrency(invoice.paidAmount || 0, currency)}</td>
                <td style={{ padding: '2.5mm 2mm', border: '1px solid #e2e8f0', textAlign: 'right' }}>{formatCurrency(getRemainingAmount(invoice), currency)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} style={{ padding: '4mm', border: '1px solid #e2e8f0', color: '#64748b', textAlign: 'center' }}>
                  Aucune facture enregistrée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p style={{ margin: '3mm 0 0', color: '#1e3a8a', fontSize: '9pt', fontWeight: 700, textAlign: 'right' }}>
          Solde restant : {formatCurrency(currentBalance, currency)}
        </p>
      </section>

      {client.notes && (
        <section style={{ marginTop: '7mm', padding: '4mm', border: '1px solid #e2e8f0', borderRadius: '2mm', background: '#f8fafc' }}>
          <h2 style={{ ...sectionTitleStyle, fontSize: '9pt' }}>Notes</h2>
          <p style={{ margin: 0, color: '#475569', whiteSpace: 'pre-wrap' }}>{client.notes}</p>
        </section>
      )}

      {company.autoStampEnabled === true && company.stampBase64 && (
        <div
          data-pdf-stamp-slot="true"
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            minHeight: '23mm',
            marginTop: '6mm',
            color: '#64748b',
            fontSize: '7.5pt',
          }}
        >
          Cachet et signature de la société
        </div>
      )}
    </article>
  )
})

export default ClientPdf
