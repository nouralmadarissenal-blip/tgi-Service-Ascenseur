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

function validColor(value, fallback) {
  return /^#[0-9A-Fa-f]{6}$/.test(value || '') ? value : fallback
}

function hexToRgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

function getFontFamily(font) {
  if (font === 'Times New Roman') return '"Times New Roman", Times, serif'
  if (font === 'Arial') return 'Arial, Helvetica, sans-serif'
  if (font === 'Roboto') return 'Roboto, Arial, sans-serif'
  return 'Helvetica, Arial, sans-serif'
}

function applyPdfAppearance(root, company) {
  const primaryColor = validColor(company.pdfPrimaryColor, '#4682B4')
  const secondaryColor = validColor(company.pdfSecondaryColor, '#1e3a8a')
  const fontFamily = getFontFamily(company.pdfFont)
  root.style.fontFamily = fontFamily

  root.querySelectorAll('*').forEach((element) => {
    element.style.fontFamily = fontFamily
    if (
      element.style.border ||
      element.style.borderTop ||
      element.style.borderRight ||
      element.style.borderBottom ||
      element.style.borderLeft
    ) {
      element.style.borderColor = secondaryColor
    }
  })

  root.querySelectorAll('h1, h2, h3, [data-pdf-primary]').forEach((element) => {
    element.style.color = primaryColor
  })
  root.querySelectorAll('table thead th').forEach((element) => {
    element.style.backgroundColor = primaryColor
    element.style.borderColor = secondaryColor
    element.style.color = '#ffffff'
  })
  root.querySelectorAll('table tbody th').forEach((element) => {
    element.style.borderColor = secondaryColor
    element.style.color = secondaryColor
  })
}

function createCompanyHeader(company = {}) {
  const primaryColor = validColor(company.pdfPrimaryColor, '#4682B4')
  const secondaryColor = validColor(company.pdfSecondaryColor, '#1e3a8a')
  const layout = ['classic', 'modern', 'minimal'].includes(company.pdfLayout)
    ? company.pdfLayout
    : 'classic'
  const modern = layout === 'modern'
  const minimal = layout === 'minimal'
  const fontFamily = getFontFamily(company.pdfFont)
  const header = document.createElement('header')
  header.dataset.pdfCompanyHeader = 'true'
  header.style.cssText = [
    'box-sizing:border-box',
    'width:190mm',
    'display:flex',
    `flex-direction:${modern ? 'column' : 'row'}`,
    `justify-content:${modern || minimal ? 'center' : 'space-between'}`,
    `align-items:${modern || minimal ? 'center' : 'flex-start'}`,
    'gap:8mm',
    `padding:${modern ? '6mm 5mm' : minimal ? '0 0 3mm' : '0 0 6mm'}`,
    `border-bottom:${minimal ? '1px' : '2px'} solid ${secondaryColor}`,
    `background:${modern ? primaryColor : 'transparent'}`,
    `font:8pt ${fontFamily}`,
    `color:${modern ? '#ffffff' : '#475569'}`,
  ].join(';')

  const logoBox = document.createElement('div')
  logoBox.style.cssText = [
    `width:${modern ? '100%' : minimal ? '40mm' : '55mm'}`,
    `min-height:${modern ? '17mm' : '22mm'}`,
    'display:flex',
    'align-items:center',
    `justify-content:${modern || minimal ? 'center' : 'flex-start'}`,
  ].join(';')
  const companyLogo = company.logoBase64 || company.logoUrl
  if (companyLogo) {
    const logo = document.createElement('img')
    logo.alt = `Logo ${company.companyName || 'TGI Ascenseurs'}`
    logo.crossOrigin = 'anonymous'
    logo.style.cssText = `max-width:${modern ? '54mm' : minimal ? '38mm' : '52mm'};max-height:${modern ? '18mm' : minimal ? '15mm' : '22mm'};object-fit:contain;`
    logo.src = companyLogo
    logoBox.appendChild(logo)
  } else {
    const brand = document.createElement('strong')
    brand.textContent = company.companyName || 'TGI Ascenseurs'
    brand.style.cssText = `font-size:${minimal ? '12pt' : '16pt'};color:${modern ? '#ffffff' : primaryColor};`
    logoBox.appendChild(brand)
  }
  header.appendChild(logoBox)

  const details = document.createElement('div')
  details.style.cssText = `max-width:${modern ? '160mm' : '100mm'};text-align:${modern || minimal ? 'center' : 'right'};font-size:${minimal ? '7pt' : '7.5pt'};line-height:1.4;`
  const companyName = document.createElement('strong')
  companyName.textContent = company.companyName || 'TGI Ascenseurs'
  companyName.style.cssText = `display:block;margin-bottom:1mm;font-size:10pt;color:${modern ? '#ffffff' : primaryColor};`
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
  applyPdfAppearance(printable, company)
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
    const watermark = String(company.pdfWatermark || '').trim().slice(0, 80)
    const secondaryRgb = hexToRgb(validColor(company.pdfSecondaryColor, '#1e3a8a'))
    const footerFont = company.pdfFont === 'Times New Roman' ? 'times' : 'helvetica'
    const footerLines = footerText
      ? pdf.splitTextToSize(footerText, pageWidth - 28)
      : []

    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page)
      if (watermark) {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(42)
        pdf.setTextColor(244, 246, 248)
        pdf.text(watermark, pageWidth / 2, pageHeight / 2, {
          align: 'center',
          angle: -32,
          maxWidth: pageWidth - 30,
        })
      }
      pdf.setDrawColor(...secondaryRgb)
      pdf.setLineWidth(0.25)
      pdf.line(10, pageHeight - footerMargin + 2, pageWidth - 10, pageHeight - footerMargin + 2)
      pdf.setFont(footerFont, 'normal')
      pdf.setFontSize(7)
      pdf.setTextColor(...secondaryRgb)
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
