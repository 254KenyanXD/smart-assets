
export type DepreciationRefusal = "cost" | "salvage" | "life" | "age";

export interface StraightLineValue {
  readonly annualCharge: number;

  readonly bookValue: number;
}

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

export function completedYears(purchasedOn: Date, now: Date): number {
  let years = now.getUTCFullYear() - purchasedOn.getUTCFullYear();
  const month = now.getUTCMonth() - purchasedOn.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < purchasedOn.getUTCDate())) {
    years -= 1;
  }
  return years < 0 ? 0 : years;
}
