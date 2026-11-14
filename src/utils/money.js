function toCents(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) {
    throw new TypeError('Un montant numérique valide est requis.')
  }
  const cents = Math.round((amount + Number.EPSILON) * 100)
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('Le montant dépasse la précision prise en charge.')
  }
  return cents
}

function fromCents(value) {
  return value / 100
}

export function calculateLineAmounts(unitPrice, quantity, taxRate) {
  const priceCents = toCents(unitPrice)
  const quantityValue = Number(quantity)
  const rate = Number(taxRate)
  if (priceCents < 0 || !Number.isSafeInteger(quantityValue) || quantityValue <= 0) {
    throw new RangeError('Le prix et la quantité de la ligne doivent être positifs.')
  }
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new RangeError('Le taux de TVA doit être compris entre 0 et 100 %.')
  }

  const totalHTCents = priceCents * quantityValue
  const rateBasisPoints = Math.round((rate + Number.EPSILON) * 100)
  if (!Number.isSafeInteger(totalHTCents) || !Number.isSafeInteger(rateBasisPoints)) {
    throw new RangeError('Les valeurs de la ligne dépassent la précision prise en charge.')
  }
  const taxNumerator = totalHTCents * rateBasisPoints
  if (!Number.isSafeInteger(taxNumerator)) {
    throw new RangeError('Le calcul de TVA dépasse la précision prise en charge.')
  }
  const taxCents = Math.round(taxNumerator / 10000)
  if (!Number.isSafeInteger(taxCents)) {
    throw new RangeError('Le montant de TVA dépasse la précision prise en charge.')
  }
  if (!Number.isSafeInteger(totalHTCents + taxCents)) {
    throw new RangeError('Le total TTC dépasse la précision prise en charge.')
  }

  return {
    unitPrice: fromCents(priceCents),
    totalHT: fromCents(totalHTCents),
    taxAmount: fromCents(taxCents),
    totalTTC: fromCents(totalHTCents + taxCents),
  }
}

export function sumLineAmounts(lines) {
  const totalsCents = lines.reduce(
    (totals, line) => {
      totals.totalHT += toCents(line.totalHT)
      totals.totalTax += toCents(line.taxAmount ?? line.totalTax ?? 0)
      if (!Number.isSafeInteger(totals.totalHT) || !Number.isSafeInteger(totals.totalTax)) {
        throw new RangeError('Le total du document dépasse la précision prise en charge.')
      }
      if (!Number.isSafeInteger(totals.totalHT + totals.totalTax)) {
        throw new RangeError('Le total TTC dépasse la précision prise en charge.')
      }
      return totals
    },
    { totalHT: 0, totalTax: 0 },
  )

  return {
    totalHT: fromCents(totalsCents.totalHT),
    totalTax: fromCents(totalsCents.totalTax),
    totalTTC: fromCents(totalsCents.totalHT + totalsCents.totalTax),
  }
}
