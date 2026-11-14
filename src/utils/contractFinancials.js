import { calculateLineAmounts } from './money'

const EMPTY_AMOUNTS = {
  unitPrice: 0,
  totalHT: 0,
  taxAmount: 0,
  totalTTC: 0,
}

export function calculateContractAmounts(priceHT, taxRate) {
  if (priceHT === '' || priceHT === null || priceHT === undefined) {
    return { ...EMPTY_AMOUNTS, valid: false, error: '' }
  }

  try {
    return {
      ...calculateLineAmounts(priceHT, 1, taxRate),
      valid: true,
      error: '',
    }
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return { ...EMPTY_AMOUNTS, valid: false, error: error.message }
    }
    throw error
  }
}
