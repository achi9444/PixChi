export const PUBLIC_PRICING_PRESET = {
  unitCost: 0.08,
  lossRate: 5,
  labor: 80,
  fixedCost: 20,
  margin: 20,
  complexityPerBead: 0.12
};

export const COMPLEXITY_CAP_TIERS: Array<{ maxBeads: number; cap: number }> = [
  { maxBeads: 500, cap: 30 },
  { maxBeads: 1200, cap: 80 },
  { maxBeads: 2500, cap: 180 },
  { maxBeads: Number.POSITIVE_INFINITY, cap: 300 }
];

