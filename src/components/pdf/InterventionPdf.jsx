import { forwardRef } from 'react'
import PdfCompanyHeader from './PdfCompanyHeader'

function formatDate(value) {
  if (!value) return '—'
  const dateValue = typeof value?.toDate === 'function' ? value.toDate() : value
  const text = String(dateValue)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00`)
    : new Date(dateValue)
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString('fr-FR')
}

function getClientName(client, intervention) {
  return client.name || client.companyName || client.clientName || intervention.clientName || 'Client'
}

function getTechnicianName(technician, intervention) {
  return technician.name ||
    `${technician.firstName || ''} ${technician.lastName || ''}`.trim() ||
    intervention.technicianName ||
    'Technicien'
}

function InfoRows({ rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr
            data-pdf-keep-together="true"
            key={label}
            style={{ borderBottom: '1px solid #e2e8f0', pageBreakInside: 'avoid', breakInside: 'avoid' }}
          >
            <th style={{ width: '34%', padding: '2.8mm 3.5mm', background: '#f8fafc', color: '#475569', textAlign: 'left', verticalAlign: 'top' }}>
              {label}
            </th>
            <td style={{ padding: '2.8mm 3.5mm', color: '#172033', verticalAlign: 'top', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
              {value || '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function BorderedPanel({ title, children, style = {} }) {
  return (
    <section
      className="avoid-page-break"
      data-pdf-keep-together="true"
      style={{
        marginTop: '4mm',
        overflow: 'hidden',
        border: '1px solid #cbd5e1',
        borderRadius: '2mm',
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
        ...style,
      }}
    >
      <h2 style={{ margin: 0, padding: '2.5mm 3.5mm', background: '#1e3a8a', color: '#fff', fontSize: '8.5pt', letterSpacing: '0.4px' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

const InterventionPdf = forwardRef(function InterventionPdf(
  { client = {}, company = {}, intervention = {}, technician = {}, technicians = [] },
  ref,
) {
  const date = formatDate(
    intervention.scheduledDate || intervention.scheduledAt || intervention.date,
  )
  const scheduledAt = String(intervention.scheduledAt || '')
  const scheduledTime =
    intervention.scheduledTime ||
    (scheduledAt.includes('T') ? scheduledAt.slice(11, 16) : '') ||
    intervention.arrivalTime ||
    ''
  const actualStartTime =
    intervention.actualStartTime ||
    (intervention.scheduledTime ? intervention.arrivalTime : '') ||
    ''
  const actualEndTime =
    intervention.actualEndTime ||
    intervention.departureTime ||
    ''
  const parts = Array.isArray(intervention.replacedParts)
    ? intervention.replacedParts
    : Array.isArray(intervention.parts)
      ? intervention.parts
      : []
  const legacyPartsText =
    typeof intervention.replacedParts === 'string'
      ? intervention.replacedParts
      : intervention.replacedPartsText || ''
  const clientName = getClientName(client, intervention)
  const assignedTechnicianNames = Array.isArray(intervention.technicianNames) &&
      intervention.technicianNames.length
    ? intervention.technicianNames
    : technicians.map((assignedTechnician) => getTechnicianName(assignedTechnician, {}))
  const technicianName = assignedTechnicianNames.length
    ? assignedTechnicianNames.join(', ')
    : getTechnicianName(technician, intervention)
  const clientAddress = [
    client.address || intervention.clientAddress,
    client.city,
    client.postalCode,
  ].filter(Boolean).join(', ')
  const elevatorReference =
    intervention.elevatorReference ||
    intervention.elevatorIdentifier ||
    intervention.elevatorId

  return (
    <article
      ref={ref}
      style={{
        boxSizing: 'border-box',
        width: '190mm',
        padding: '10mm',
        background: '#fff',
        color: '#172033',
        font: '8.5pt/1.45 Arial, Helvetica, sans-serif',
      }}
    >
      <PdfCompanyHeader company={company} />

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '6mm', padding: '7mm 0 5mm', borderBottom: '1px solid #cbd5e1' }}>
        <div>
          <p style={{ margin: '0 0 1mm', color: '#1e3a8a', fontSize: '7.5pt', fontWeight: 700, letterSpacing: '1.2px' }}>
            RAPPORT D’INTERVENTION
          </p>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: '17pt', lineHeight: 1.2 }}>
            BON D’INTERVENTION N° {intervention.reference || '—'}
          </h1>
          <p style={{ margin: '1mm 0 0', color: '#64748b', fontSize: '8pt' }}>
            Fiche d’intervention · {intervention.status || 'Planifiée'}
          </p>
        </div>
        <span style={{ border: '1px solid #bfdbfe', borderRadius: '20px', padding: '2mm 3.5mm', background: '#eff6ff', color: '#1e3a8a', fontSize: '8pt', fontWeight: 700, whiteSpace: 'nowrap' }}>
          {intervention.type || 'Mission terrain'}
        </span>
      </header>

      <BorderedPanel title="1 · LIEU D’INTERVENTION">
        <InfoRows rows={[
          ['Client / résidence', clientName],
          ['Adresse du site', clientAddress],
          ['Contact', client.contactName || client.contactPerson || intervention.clientContact],
          ['Téléphone', client.phone || client.phone1 || intervention.clientPhone],
          ['Ascenseur concerné', elevatorReference],
          ['Marque / type', [intervention.elevatorBrand, intervention.elevatorType].filter(Boolean).join(' · ')],
        ]} />
      </BorderedPanel>

      <BorderedPanel title="2 · INTERVENANT & PLANIFICATION">
        <InfoRows rows={[
          ['Technicien(s) affecté(s)', technicianName],
          ['Spécialité', technician.specialty],
          ['CIN', technician.cin],
          ['Date prévue', date],
          ['Heure prévue', scheduledTime],
          ['Début réel', actualStartTime],
          ['Fin réelle', actualEndTime],
        ]} />
      </BorderedPanel>

      <BorderedPanel title="3 · DIAGNOSTIC & TRAVAUX">
        <InfoRows rows={[
          ['Nature de la mission', intervention.type || intervention.title],
          ['Niveau d’urgence', intervention.priority || intervention.urgency],
          ['Panne / symptômes', intervention.description || intervention.notes],
          ['Travaux réalisés / résolution', intervention.actionsPerformed || intervention.workPerformed],
          ['Statut de clôture', intervention.status],
        ]} />
      </BorderedPanel>

      <BorderedPanel title="4 · PIÈCES DE RECHANGE DÉCLARÉES" style={{ marginTop: '5mm' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '8pt' }}>
          <thead style={{ display: 'table-header-group' }}>
            <tr style={{ background: '#f1f5f9', color: '#334155' }}>
              <th style={{ width: '25%', padding: '2.7mm 3mm', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>Référence</th>
              <th style={{ width: '55%', padding: '2.7mm 3mm', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>Désignation</th>
              <th style={{ width: '20%', padding: '2.7mm 3mm', borderBottom: '1px solid #cbd5e1', textAlign: 'right' }}>Quantité</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((part, index) => (
              <tr
                data-pdf-keep-together="true"
                key={part.id || part.stockId || `${part.reference || part.name}-${index}`}
                style={{ background: index % 2 ? '#f8fafc' : '#fff', borderBottom: '1px solid #e2e8f0', pageBreakInside: 'avoid', breakInside: 'avoid' }}
              >
                <td style={{ padding: '2.7mm 3mm', overflowWrap: 'anywhere' }}>{part.reference || '—'}</td>
                <td style={{ padding: '2.7mm 3mm', overflowWrap: 'anywhere' }}>{part.name || part.designation || 'Pièce'}</td>
                <td style={{ padding: '2.7mm 3mm', textAlign: 'right' }}>{part.quantity ?? '—'}</td>
              </tr>
            ))}
            {legacyPartsText && (
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td colSpan={3} style={{ padding: '3mm', whiteSpace: 'pre-wrap', color: '#475569' }}>
                  Déclaration historique : {legacyPartsText}
                </td>
              </tr>
            )}
            {!parts.length && !legacyPartsText && (
              <tr>
                <td colSpan={3} style={{ padding: '4mm', color: '#64748b', textAlign: 'center' }}>
                  Aucune pièce déclarée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p style={{ margin: 0, padding: '2mm 3mm', color: '#64748b', fontSize: '7pt' }}>
          Déclaration pour le bon de travail uniquement ; aucun mouvement de stock n’est effectué depuis cette fiche.
        </p>
      </BorderedPanel>

      <section
        className="avoid-page-break"
        data-pdf-keep-together="true"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.15fr',
          gap: '6mm',
          marginTop: '8mm',
          pageBreakInside: 'avoid',
          breakInside: 'avoid',
        }}
      >
        <div style={{ minHeight: '47mm', padding: '4mm', border: '1px solid #94a3b8', borderRadius: '2mm', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <strong style={{ color: '#1e3a8a', fontSize: '9pt' }}>Signature du Technicien</strong>
          <p style={{ margin: '3mm 0 0', color: '#475569', fontSize: '8pt' }}>{technicianName}</p>
          <p style={{ margin: '1mm 0 0', color: '#64748b', fontSize: '7.5pt' }}>
            Date : {date} · Début : {actualStartTime || '—'} · Fin : {actualEndTime || '—'}
          </p>
          <div style={{ marginTop: '18mm', borderTop: '1px solid #cbd5e1' }} />
        </div>
        <div style={{ minHeight: '47mm', padding: '4mm', border: '1px solid #94a3b8', borderRadius: '2mm', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <p style={{ margin: 0, color: '#334155', fontSize: '8pt', fontWeight: 600, lineHeight: 1.4 }}>
            Bon pour accord, travaux exécutés de manière satisfaisante
          </p>
          <div
            data-pdf-stamp-slot="true"
            style={{
              position: 'relative',
              minHeight: '35mm',
              marginTop: '2mm',
              paddingTop: '3mm',
              color: '#1e3a8a',
              fontSize: '8.5pt',
              fontWeight: 700,
            }}
          >
            Signature du Client
            <p style={{ margin: '2mm 0 0', color: '#64748b', fontSize: '7.5pt', fontWeight: 400 }}>
              Nom : {clientName}
            </p>
          </div>
        </div>
      </section>
    </article>
  )
})

export default InterventionPdf
