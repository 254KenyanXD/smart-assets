/** Why a straight-line figure was not computed. */
export type DepreciationRefusal = "cost" | "salvage" | "life" | "age";

/** Annual charge and book value, both in the same integer units as the cost. */
export interface StraightLineValue {
  /** `(cost - salvage) / useful life`, truncated toward zero. */
  readonly annualCharge: number;
  /** Cost minus annual charge times the age in years. */
  readonly bookValue: number;
}

/**
 * Straight-line depreciation from the written formula.
 * Money stays in integer units. A life that does not divide the depreciable amount
 * drops the remainder. The formula does not stop the book value at salvage.
 *
 * @param input - Cost, salvage, useful life, and age. All four are whole numbers.
 * @returns The two figures, or why the inputs cannot be used.
 */
export function straightLine(input: {
  readonly cost: number;
  readonly salvage: number;
  readonly usefulLifeYears: number;
  readonly ageYears: number;
}): { readonly _tag: "ok"; readonly value: StraightLineValue } | { readonly _tag: "invalid"; readonly reason: DepreciationRefusal } {
  if (!Number.isInteger(input.cost) || input.cost < 0) {
    return { _tag: "invalid", reason: "cost" };
  }
  if (!Number.isInteger(input.salvage) || input.salvage < 0 || input.salvage > input.cost) {
    return { _tag: "invalid", reason: "salvage" };
  }
  if (!Number.isInteger(input.usefulLifeYears) || input.usefulLifeYears < 1) {
    return { _tag: "invalid", reason: "life" };
  }
  if (!Number.isInteger(input.ageYears) || input.ageYears < 0) {
    return { _tag: "invalid", reason: "age" };
  }
  const annualCharge = Math.trunc((input.cost - input.salvage) / input.usefulLifeYears);
  return {
    _tag: "ok",
    value: {
      annualCharge,
      bookValue: input.cost - annualCharge * input.ageYears,
    },
  };
}

/**
 * Completed years from a purchase date to a clock reading, in UTC.
 *
 * @param purchasedOn - The day the asset was bought.
 * @param now - The clock reading.
 * @returns Zero when the purchase is still in the future. Otherwise the completed years.
 */
export function completedYears(purchasedOn: Date, now: Date): number {
  let years = now.getUTCFullYear() - purchasedOn.getUTCFullYear();
  const month = now.getUTCMonth() - purchasedOn.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < purchasedOn.getUTCDate())) {
    years -= 1;
  }
  return years < 0 ? 0 : years;
}
