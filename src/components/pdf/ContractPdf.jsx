import { forwardRef } from 'react'
import PdfCompanyHeader from './PdfCompanyHeader'
import { calculateContractAmounts } from '../../utils/contractFinancials'

function formatCurrency(value, currency = 'MAD') {
  if (value === null || value === undefined || value === '') return 'À définir'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'À définir'
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

const ContractPdf = forwardRef(function ContractPdf({ client, company, contract }, ref) {
  const contractType = contract.type === 'installation'
    ? 'CONTRAT D’INSTALLATION'
    : ['modernisation', 'modernization'].includes(contract.type)
      ? 'CONTRAT DE MODERNISATION'
      : 'CONTRAT DE MAINTENANCE'
  const version = contract.version === 'complete' ? 'VERSION COMPLÈTE' : 'VERSION SIMPLE'
  const rawTaxRate = Number(contract.taxRate)
  const taxRate = Number.isFinite(rawTaxRate) && rawTaxRate >= 0 && rawTaxRate <= 100
    ? rawTaxRate
    : 0
  const amounts = calculateContractAmounts(contract.priceHT, taxRate)
  const priceHT = amounts.valid ? amounts.totalHT : null
  const taxAmount = amounts.valid ? amounts.taxAmount : null
  const priceTTC = amounts.valid ? amounts.totalTTC : null
  const clauses = String(contract.clauses || '')
    .split(/\n\s*\n|(?=^ARTICLE\s+\d+\s*[—-])/gim)
    .map((clause) => clause.trim())
    .filter(Boolean)

  return (
    <article
      className="contract-pdf"
      ref={ref}
      style={{
        boxSizing: 'border-box',
        width: '190mm',
        padding: '12mm',
        backgroundColor: '#ffffff',
        color: '#172033',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '9.5pt',
        lineHeight: 1.55,
      }}
    >
      <PdfCompanyHeader company={company} />

      <section style={{ padding: '10mm 0 7mm', textAlign: 'center' }}>
        <p style={{ margin: '0 0 2mm', color: '#1d4ed8', fontSize: '8pt', fontWeight: 700, letterSpacing: '2px' }}>
          {contract.reference}
        </p>
        <h1 style={{ margin: '0', color: '#0f172a', fontSize: '19pt', lineHeight: 1.3 }}>
          {contractType}
        </h1>
        <p style={{ margin: '2mm 0 0', color: '#64748b', fontSize: '9pt', fontWeight: 600 }}>
          {version}
        </p>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '5mm',
          marginBottom: '7mm',
        }}
      >
        <p style={{ gridColumn: '1 / -1', margin: 0, color: '#334155', textAlign: 'justify' }}>
          Entre les soussignés, <strong>{company.companyName || 'TGI Ascenseurs'}</strong>,
          représentée par sa direction, ci-après « le Prestataire », et le Client
          désigné ci-dessous, ci-après « le Client », il a été convenu ce qui suit.
        </p>
        <div style={{ padding: '5mm', border: '1px solid #dbe3ef', borderRadius: '3mm' }}>
          <p style={{ margin: '0 0 2mm', color: '#1e3a8a', fontSize: '8pt', fontWeight: 700, letterSpacing: '1px' }}>
            LE PRESTATAIRE
          </p>
          <strong>{company.companyName || 'TGI Ascenseurs'}</strong>
          {company.legalName && <div>{company.legalName}</div>}
          {company.legalForm && <div>{company.legalForm}</div>}
          {company.address && <div>{company.address}</div>}
          {(company.phone || company.phone1) && <div>Tél. : {company.phone || company.phone1}</div>}
          {company.email && <div>{company.email}</div>}
          {company.ice && <div>ICE : {company.ice}</div>}
          {company.rc && <div>RC : {company.rc}</div>}
          {company.if && <div>IF : {company.if}</div>}
        </div>
        <div style={{ padding: '5mm', border: '1px solid #dbe3ef', borderRadius: '3mm' }}>
          <p style={{ margin: '0 0 2mm', color: '#1e3a8a', fontSize: '8pt', fontWeight: 700, letterSpacing: '1px' }}>
            LE CLIENT
          </p>
          <strong>{client.name || client.companyName || contract.clientName || 'Client'}</strong>
          {(client.address || contract.clientAddress) && (
            <div>{client.address || contract.clientAddress}{client.city ? `, ${client.city}` : ''}</div>
          )}
          {(client.ice || contract.clientIce) && <div>ICE : {client.ice || contract.clientIce}</div>}
          {client.phone && <div>Tél. : {client.phone}</div>}
          {client.email && <div>{client.email}</div>}
        </div>
      </section>

      <section style={{ marginBottom: '7mm', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <h2 style={{ margin: '0 0 3mm', color: '#0f172a', fontSize: '11pt' }}>
          Conditions particulières
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <tbody>
            {[
              ['Objet / équipement', contract.subject],
              ['Ascenseur concerné', contract.elevatorReference || '—'],
              ['Marque / type', [contract.elevatorBrand, contract.elevatorType].filter(Boolean).join(' · ') || '—'],
              ['Site d’exécution', contract.siteAddress || client.address || '—'],
              ['Date de début', formatDate(contract.startDate)],
              ['Date de fin', formatDate(contract.endDate)],
              ['Périmètre', contract.scope],
              ['Durée de garantie', contract.warranty || '—'],
              ['Délai de prise en charge', contract.responseTime || '—'],
              ['SLA garanti', contract.slaResponseTime || contract.responseTime || '—'],
              ['Échéancier de facturation', contract.billingFrequency || '—'],
              ['Reconduction tacite', contract.autoRenewal ? 'Oui' : 'Non'],
              ...(contract.autoRenewal
                ? [['Préavis de renouvellement', `${Number(contract.noticeMonths) || 0} mois avant échéance`]]
                : []),
              ['Règlement', contract.paymentTerms || 'Selon facture'],
            ].map(([label, value]) => (
              <tr key={label} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ width: '37%', padding: '2.5mm 3mm', background: '#f8fafc', color: '#475569', textAlign: 'left', verticalAlign: 'top' }}>
                  {label}
                </th>
                <td style={{ padding: '2.5mm 3mm', whiteSpace: 'pre-wrap', verticalAlign: 'top' }}>
                  {value || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: '7mm', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <h2 style={{ margin: '0 0 3mm', color: '#0f172a', fontSize: '11pt' }}>
          Conditions financières
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '2.5mm 3mm', background: '#f8fafc', color: '#475569', textAlign: 'left' }}>Montant HT</th>
              <td style={{ padding: '2.5mm 3mm', textAlign: 'right' }}>{formatCurrency(priceHT, company.defaultCurrency)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '2.5mm 3mm', background: '#f8fafc', color: '#475569', textAlign: 'left' }}>TVA ({taxRate} %)</th>
              <td style={{ padding: '2.5mm 3mm', textAlign: 'right' }}>
                {taxAmount === null ? 'À définir' : formatCurrency(taxAmount, company.defaultCurrency)}
              </td>
            </tr>
            <tr>
              <th style={{ padding: '2.5mm 3mm', background: '#eff6ff', color: '#1e3a8a', textAlign: 'left' }}>Total TTC</th>
              <td style={{ padding: '2.5mm 3mm', background: '#eff6ff', color: '#1e3a8a', fontWeight: 700, textAlign: 'right' }}>
                {formatCurrency(priceTTC, company.defaultCurrency)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 style={{ margin: '0 0 4mm', color: '#0f172a', fontSize: '11pt' }}>
          Clauses contractuelles
        </h2>
        {clauses.map((clause, index) => (
          <p
            className="contract-clause"
            data-pdf-keep-together="true"
            key={`${index}-${clause.slice(0, 20)}`}
            style={{
              margin: '0 0 4mm',
              textAlign: 'justify',
              whiteSpace: 'pre-wrap',
              widows: 3,
              orphans: 3,
              pageBreakInside: 'avoid',
              breakInside: 'avoid',
            }}
          >
            {clause}
          </p>
        ))}
      </section>

      {contract.generalConditions && (
        <section style={{ marginTop: '7mm' }}>
          <h2 style={{ margin: '0 0 4mm', color: '#0f172a', fontSize: '11pt' }}>
            Conditions générales de vente
          </h2>
          {String(contract.generalConditions).split(/\n\s*\n/).map((paragraph, index) => (
            <p
              data-pdf-keep-together="true"
              key={`cgv-${index}-${paragraph.slice(0, 20)}`}
              style={{
                margin: '0 0 3mm',
                color: '#334155',
                fontSize: '8.5pt',
                textAlign: 'justify',
                whiteSpace: 'pre-wrap',
                pageBreakInside: 'avoid',
                breakInside: 'avoid',
                widows: 3,
                orphans: 3,
              }}
            >
              {paragraph}
            </p>
          ))}
        </section>
      )}

      {Array.isArray(contract.amendments) && contract.amendments.length > 0 && (
        <section style={{ marginTop: '7mm' }}>
          <h2 style={{ margin: '0 0 4mm', color: '#0f172a', fontSize: '11pt' }}>
            Historique des avenants
          </h2>
          {contract.amendments.map((amendment, index) => {
            const text = typeof amendment === 'string'
              ? amendment
              : amendment.text || amendment.note || ''
            const date = typeof amendment === 'string' ? '' : amendment.date || ''
            return (
              <p
                className="contract-clause"
                data-pdf-keep-together="true"
                key={`amendment-${index}`}
                style={{
                  margin: '0 0 4mm',
                  padding: '3mm',
                  borderLeft: '2px solid #3b82f6',
                  background: '#f8fafc',
                  whiteSpace: 'pre-wrap',
                  pageBreakInside: 'avoid',
                  breakInside: 'avoid',
                }}
              >
                <strong>{date ? `${formatDate(date)} — ` : `Avenant ${index + 1} — `}</strong>
                {text}
              </p>
            )
          })}
        </section>
      )}

      <section
        id="page-break"
        style={{
          breakBefore: 'page',
          pageBreakBefore: 'always',
          paddingTop: '16mm',
          minHeight: '245mm',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h2 style={{ margin: '0 0 3mm', color: '#0f172a', fontSize: '12pt' }}>
          Signatures
        </h2>
        <p style={{ margin: '0 0 12mm', color: '#475569', fontSize: '9pt' }}>
          Fait en deux exemplaires. Les parties reconnaissent avoir pris connaissance des conditions particulières et des clauses ci-dessus, sous réserve des vérifications et validations requises avant signature.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12mm', marginTop: 'auto' }}>
          {['Pour TGI Ascenseurs', 'Pour le Client'].map((signatory) => (
            <div
              key={signatory}
              data-pdf-stamp-slot={signatory === 'Pour TGI Ascenseurs' ? 'true' : undefined}
              style={{
                boxSizing: 'border-box',
                minHeight: '53mm',
                padding: '5mm',
                border: '1px solid #cbd5e1',
                borderRadius: '3mm',
                position: 'relative',
                pageBreakInside: 'avoid',
                breakInside: 'avoid',
              }}
            >
              <strong style={{ color: '#1e3a8a' }}>{signatory}</strong>
              <p style={{ margin: '7mm 0 0', color: '#334155', fontSize: '8.5pt', fontWeight: 600 }}>
                Lu et approuvé, bon pour accord
              </p>
              <p style={{ margin: '2mm 0 0', color: '#64748b', fontSize: '8pt' }}>
                Nom, qualité, date, signature et cachet
              </p>
            </div>
          ))}
        </div>
      </section>
    </article>
  )
})

export default ContractPdf
