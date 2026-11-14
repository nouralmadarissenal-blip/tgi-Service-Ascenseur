import html2pdf from 'html2pdf.js'

const pdfOptions = {
  margin: [10, 10, 19, 10],
  image: { type: 'jpeg', quality: 1 },
  html2canvas: {
    scale: 3,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  pagebreak: {
    mode: ['css', 'legacy'],
    before: '#page-break',
    avoid: ['tr', '.avoid-page-break', '[data-pdf-keep-together]'],
  },
}

function createCompanyHeader(company = {}) {
  const header = document.createElement('header')
  header.dataset.pdfCompanyHeader = 'true'
  header.style.cssText =
    'box-sizing:border-box;width:190mm;display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;padding:0 0 6mm;border-bottom:2px solid #1e3a8a;font:8pt Arial,sans-serif;color:#475569;'

  const logoBox = document.createElement('div')
  logoBox.style.cssText = 'width:55mm;min-height:22mm;display:flex;align-items:center;'
  const companyLogo = company.logoBase64 || company.logoUrl
  if (companyLogo) {
    const logo = document.createElement('img')
    logo.alt = `Logo ${company.companyName || 'TGI Ascenseurs'}`
    logo.crossOrigin = 'anonymous'
    logo.style.cssText = 'max-width:52mm;max-height:22mm;object-fit:contain;'
    logo.src = companyLogo
    logoBox.appendChild(logo)
  } else {
    const brand = document.createElement('strong')
    brand.textContent = company.companyName || 'TGI Ascenseurs'
    brand.style.cssText = 'font-size:16pt;color:#1e3a8a;'
    logoBox.appendChild(brand)
  }
  header.appendChild(logoBox)

  const details = document.createElement('div')
  details.style.cssText = 'max-width:100mm;text-align:right;font-size:7.5pt;line-height:1.4;'
  const companyName = document.createElement('strong')
  companyName.textContent = company.companyName || 'TGI Ascenseurs'
  companyName.style.cssText = 'display:block;margin-bottom:1mm;font-size:10pt;color:#0f172a;'
  details.appendChild(companyName)
  ;[
    ['Raison sociale', company.legalName],
    ['Forme juridique', company.legalForm],
    ['Adresse', company.address],
    ['Ville', company.city],
    ['Code postal', company.postalCode],
    ['Téléphone fixe', company.phone || company.phone1],
    ['Mobile dépannage', company.mobileEmergency || company.phone2],
    ['WhatsApp', company.whatsapp || company.whatsappPro],
    ['E-mail', company.email],
    ['Site web', company.website],
    ['ICE', company.ice],
    ['RC', company.rc],
    ['IF', company.if],
    ['Patente', company.patente],
    ['CNSS', company.cnss],
    ['Capital', company.capital],
  ]
    .filter(([, value]) => value)
    .forEach(([label, value]) => {
      const line = document.createElement('div')
      line.textContent = `${label} : ${value}`
      details.appendChild(line)
    })
  header.appendChild(details)
  return header
}

async function waitForImages(root) {
  const images = [...root.querySelectorAll('img')]
  await Promise.all(
    images.map(async (image) => {
      if (!image.complete) {
        await new Promise((resolve, reject) => {
          image.addEventListener('load', resolve, { once: true })
          image.addEventListener(
            'error',
            () => reject(new Error(`Impossible de charger l’image ${image.alt || ''}.`)),
            { once: true },
          )
        })
      }
      if (!image.naturalWidth) {
        throw new Error(`L’image ${image.alt || ''} est vide ou inaccessible.`)
      }
    }),
  )
}

export default async function generatePdf(element, filename = 'document.pdf', company = {}) {
  if (!(element instanceof HTMLElement)) {
    throw new TypeError('Un élément HTML est requis pour générer le PDF.')
  }
  if (typeof filename !== 'string' || !filename.trim()) {
    throw new TypeError('Le nom du fichier PDF ne peut pas être vide.')
  }

  const wrapper = document.createElement('div')
  wrapper.style.cssText =
    'position:fixed;top:0;left:-10000px;z-index:-1;width:190mm;background:#fff;'
  const printable = element.cloneNode(true)
  if (!printable.querySelector('[data-pdf-company-header]')) {
    printable.prepend(createCompanyHeader(company))
  }
  const stampSlot = printable.querySelector('[data-pdf-stamp-slot="true"]')
  if (company.autoStampEnabled === true && company.stampBase64 && stampSlot) {
    const stamp = document.createElement('img')
    stamp.alt = 'Cachet et signature de la société'
    stamp.crossOrigin = 'anonymous'
    stamp.src = company.stampBase64
    stamp.style.cssText =
      'position:absolute;right:3mm;bottom:2mm;max-width:34mm;max-height:22mm;object-fit:contain;opacity:.92;pointer-events:none;'
    stampSlot.appendChild(stamp)
  }
  wrapper.appendChild(printable)
  document.body.appendChild(wrapper)

  try {
    await waitForImages(printable)
    const footerText = String(company.documentFooter || '').trim()
    const footerLineEstimate = Math.max(
      1,
      Math.ceil(footerText.length / 140),
      footerText.split(/\r?\n/).length,
    )
    if (footerLineEstimate > 10) {
      throw new Error('Le pied de page est trop long pour tenir dans la zone réservée du PDF.')
    }
    const footerMargin = footerText ? Math.max(19, 12 + footerLineEstimate * 3) : 19
    const worker = html2pdf()
      .set({
        ...pdfOptions,
        filename,
        margin: [10, 10, footerMargin, 10],
      })
      .from(printable)
      .toPdf()
    const pdf = await worker.get('pdf').thenExternal((generatedPdf) => generatedPdf)
    const pageCount = pdf.internal.getNumberOfPages()
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const footerLines = footerText
      ? pdf.splitTextToSize(footerText, pageWidth - 28)
      : []

    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page)
      pdf.setDrawColor(226, 232, 240)
      pdf.setLineWidth(0.25)
      pdf.line(10, pageHeight - footerMargin + 2, pageWidth - 10, pageHeight - footerMargin + 2)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.setTextColor(100, 116, 139)
      if (footerLines.length) {
        pdf.text(footerLines, pageWidth / 2, pageHeight - footerMargin + 6, {
          align: 'center',
          maxWidth: pageWidth - 28,
        })
      } else {
        pdf.text(company.companyName || 'TGI Ascenseurs', 10, pageHeight - 10)
      }
      pdf.text(`${page} / ${pageCount}`, pageWidth - 10, pageHeight - 5, {
        align: 'right',
      })
    }

    await worker.save().thenExternal(() => undefined)
  } finally {
    wrapper.remove()
  }
}
