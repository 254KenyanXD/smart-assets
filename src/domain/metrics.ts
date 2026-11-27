export const assetCategories = [
  "Laptop",
  "Projector",
  "Calculator",
  "Camera",
  "Kit",
  "Accessory",
  "Furniture",
  "Uncategorised",
] as const;

export type AssetCategory = (typeof assetCategories)[number];

const categoryNames: Record<AssetCategory, string> = {
  Laptop: "Laptops",
  Projector: "Projectors",
  Calculator: "Calculators",
  Camera: "Cameras and mics",
  Kit: "Kits and accessories",
  Accessory: "Accessories",
  Furniture: "Furniture",
  Uncategorised: "Uncategorised",
};

export function parseCategory(value: string): AssetCategory | null {
  const match = assetCategories.find((category) => category === value);
  return match ?? null;
}

export function categoryFromInput(value: string): AssetCategory {
  return parseCategory(value) ?? "Uncategorised";
}

export function categoryName(category: AssetCategory): string {
  return categoryNames[category];
}

export const periodKeys = ["term"] as const;

export type PeriodKey = (typeof periodKeys)[number];

export const periodLabels: Record<PeriodKey, string> = {
  term: "This term",
};

export function currentPeriod(now: Date): { readonly key: PeriodKey; readonly label: string; readonly from: Date; readonly to: Date } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return { key: "term", label: periodLabels.term, from, to: now };
}

export function periodRangeLabel(from: Date, to: Date): string {
  return `${dayMonth(from)} - ${dayMonth(to)}`;
}

export function dayMonth(value: Date): string {
  const day = value.getUTCDate();
  const month = value.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${day} ${month}`;
}

export function longDate(value: Date): string {
  const weekday = value.toLocaleString("en-GB", { weekday: "long", timeZone: "UTC" });
  const month = value.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  return `${weekday} ${value.getUTCDate()} ${month} ${value.getUTCFullYear()}`;
}
