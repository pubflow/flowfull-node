/**
 * Intelligent Pricing Calculator
 * 
 * Supports flexible pricing input where users can send:
 * - Only subtotal_cents (treated as total_cents)
 * - Only total_cents (treated as subtotal_cents without discounts)
 * - Partial combinations (auto-calculates missing fields)
 * - Complete breakdown (validates consistency)
 */

export interface PricingInput {
  subtotal_cents?: number;
  tax_cents?: number;
  discount_cents?: number;
  total_cents?: number;
}

export interface PricingOutput {
  subtotal_cents: number;
  tax_cents: number;
  discount_cents: number;
  total_cents: number;
}

export interface PricingCalculationResult {
  pricing: PricingOutput;
  scenario: string;
  calculated_fields: string[];
}

/**
 * Intelligent pricing calculation that handles various input scenarios
 */
export function calculateIntelligentPricing(input: PricingInput): PricingCalculationResult {
  const { subtotal_cents, tax_cents, discount_cents, total_cents } = input;
  
  // Normalize undefined to null for easier checking
  const s = subtotal_cents ?? null;
  const t = tax_cents ?? null;
  const d = discount_cents ?? null;
  const total = total_cents ?? null;
  
  // Count how many fields are provided
  const providedFields = [s, t, d, total].filter(field => field !== null).length;
  
  // SCENARIO 1: Only subtotal_cents provided
  // subtotal_cents → treat as total_cents (most common case)
  if (s !== null && t === null && d === null && total === null) {
    return {
      pricing: {
        subtotal_cents: s,
        tax_cents: 0,
        discount_cents: 0,
        total_cents: s
      },
      scenario: 'subtotal_only',
      calculated_fields: ['tax_cents', 'discount_cents', 'total_cents']
    };
  }
  
  // SCENARIO 2: Only total_cents provided
  // total_cents → treat as subtotal_cents (no tax/discount)
  if (s === null && t === null && d === null && total !== null) {
    return {
      pricing: {
        subtotal_cents: total,
        tax_cents: 0,
        discount_cents: 0,
        total_cents: total
      },
      scenario: 'total_only',
      calculated_fields: ['subtotal_cents', 'tax_cents', 'discount_cents']
    };
  }
  
  // SCENARIO 3: Subtotal + Tax (calculate total)
  if (s !== null && t !== null && d === null && total === null) {
    const calculated_total = s + t;
    return {
      pricing: {
        subtotal_cents: s,
        tax_cents: t,
        discount_cents: 0,
        total_cents: calculated_total
      },
      scenario: 'subtotal_tax',
      calculated_fields: ['discount_cents', 'total_cents']
    };
  }
  
  // SCENARIO 4: Subtotal + Discount (calculate total)
  if (s !== null && t === null && d !== null && total === null) {
    const calculated_total = s - d;
    if (calculated_total < 0) {
      throw new Error(`Invalid pricing: discount (${d}) cannot be greater than subtotal (${s})`);
    }
    return {
      pricing: {
        subtotal_cents: s,
        tax_cents: 0,
        discount_cents: d,
        total_cents: calculated_total
      },
      scenario: 'subtotal_discount',
      calculated_fields: ['tax_cents', 'total_cents']
    };
  }
  
  // SCENARIO 5: Total + Tax (calculate subtotal)
  if (s === null && t !== null && d === null && total !== null) {
    const calculated_subtotal = total - t;
    if (calculated_subtotal < 0) {
      throw new Error(`Invalid pricing: tax (${t}) cannot be greater than total (${total})`);
    }
    return {
      pricing: {
        subtotal_cents: calculated_subtotal,
        tax_cents: t,
        discount_cents: 0,
        total_cents: total
      },
      scenario: 'total_tax',
      calculated_fields: ['subtotal_cents', 'discount_cents']
    };
  }
  
  // SCENARIO 6: Total + Discount (calculate subtotal)
  if (s === null && t === null && d !== null && total !== null) {
    const calculated_subtotal = total + d;
    return {
      pricing: {
        subtotal_cents: calculated_subtotal,
        tax_cents: 0,
        discount_cents: d,
        total_cents: total
      },
      scenario: 'total_discount',
      calculated_fields: ['subtotal_cents', 'tax_cents']
    };
  }
  
  // SCENARIO 7: Subtotal + Tax + Discount (calculate total)
  if (s !== null && t !== null && d !== null && total === null) {
    const calculated_total = s + t - d;
    if (calculated_total < 0) {
      throw new Error(`Invalid pricing: subtotal (${s}) + tax (${t}) - discount (${d}) results in negative total`);
    }
    return {
      pricing: {
        subtotal_cents: s,
        tax_cents: t,
        discount_cents: d,
        total_cents: calculated_total
      },
      scenario: 'subtotal_tax_discount',
      calculated_fields: ['total_cents']
    };
  }
  
  // SCENARIO 8: Complete breakdown provided (validate consistency)
  if (s !== null && total !== null) {
    const tax_value = t ?? 0;
    const discount_value = d ?? 0;
    const calculated_total = s + tax_value - discount_value;
    
    if (calculated_total !== total) {
      throw new Error(
        `Pricing validation failed: subtotal (${s}) + tax (${tax_value}) - discount (${discount_value}) = ${calculated_total}, but total_cents provided is ${total}`
      );
    }
    
    return {
      pricing: {
        subtotal_cents: s,
        tax_cents: tax_value,
        discount_cents: discount_value,
        total_cents: total
      },
      scenario: 'complete_validation',
      calculated_fields: []
    };
  }
  
  // SCENARIO 9: Missing subtotal, calculate from total - tax + discount
  if (s === null && t !== null && d !== null && total !== null) {
    const calculated_subtotal = total - t + d;
    if (calculated_subtotal < 0) {
      throw new Error(`Invalid pricing: cannot calculate valid subtotal from total (${total}), tax (${t}), discount (${d})`);
    }
    return {
      pricing: {
        subtotal_cents: calculated_subtotal,
        tax_cents: t,
        discount_cents: d,
        total_cents: total
      },
      scenario: 'calculate_subtotal',
      calculated_fields: ['subtotal_cents']
    };
  }
  
  // SCENARIO 10: Invalid or insufficient data
  if (providedFields === 0) {
    throw new Error('At least one pricing field (subtotal_cents, tax_cents, discount_cents, or total_cents) must be provided');
  }
  
  // If we reach here, it's an unsupported combination
  throw new Error(
    `Unsupported pricing combination. Provided: ${Object.entries(input)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')}`
  );
}

/**
 * Validates that all pricing values are non-negative integers
 */
export function validatePricingValues(pricing: PricingOutput): void {
  const { subtotal_cents, tax_cents, discount_cents, total_cents } = pricing;
  
  if (!Number.isInteger(subtotal_cents) || subtotal_cents < 0) {
    throw new Error(`subtotal_cents must be a non-negative integer, got: ${subtotal_cents}`);
  }
  
  if (!Number.isInteger(tax_cents) || tax_cents < 0) {
    throw new Error(`tax_cents must be a non-negative integer, got: ${tax_cents}`);
  }
  
  if (!Number.isInteger(discount_cents) || discount_cents < 0) {
    throw new Error(`discount_cents must be a non-negative integer, got: ${discount_cents}`);
  }
  
  if (!Number.isInteger(total_cents) || total_cents < 0) {
    throw new Error(`total_cents must be a non-negative integer, got: ${total_cents}`);
  }
  
  // Final validation: ensure math is correct
  const calculated_total = subtotal_cents + tax_cents - discount_cents;
  if (calculated_total !== total_cents) {
    throw new Error(
      `Final validation failed: ${subtotal_cents} + ${tax_cents} - ${discount_cents} = ${calculated_total}, but total_cents is ${total_cents}`
    );
  }
}

/**
 * Main function that combines intelligent calculation and validation
 */
export function processIntelligentPricing(input: PricingInput): PricingCalculationResult {
  const result = calculateIntelligentPricing(input);
  validatePricingValues(result.pricing);
  return result;
}
