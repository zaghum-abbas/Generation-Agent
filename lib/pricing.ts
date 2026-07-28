
export type PricingItem = {
  sku: string;
  description: string;
  unit: string;
  unit_price: number;
};

export const PRICING_TABLE: PricingItem[] = [
  {
    sku: "DEMO-CONCRETE",
    description: "Demo & haul existing concrete patio",
    unit: "sqft",
    unit_price: 8.5,
  },
  {
    sku: "PAVER-INSTALL",
    description: "Patio paver installation (Belgard-grade)",
    unit: "sqft",
    unit_price: 22,
  },
  {
    sku: "PERGOLA-CEDAR",
    description: "Cedar pergola structure",
    unit: "each",
    unit_price: 4800,
  },
  {
    sku: "FIREPIT-GAS",
    description: "Gas fire pit (round, sitting height)",
    unit: "each",
    unit_price: 3200,
  },
  {
    sku: "TURF-ARTIFICIAL",
    description: "Artificial turf install",
    unit: "sqft",
    unit_price: 12,
  },
  {
    sku: "IRRIGATION-ZONE",
    description: "Irrigation zone (extend existing system)",
    unit: "zone",
    unit_price: 950,
  },
  {
    sku: "RETAIN-WALL",
    description: "Retaining wall (natural stone look)",
    unit: "linear_ft",
    unit_price: 185,
  },
  {
    sku: "PLANT-MAPLE",
    description: "Japanese maple (installed)",
    unit: "each",
    unit_price: 425,
  },
  {
    sku: "PLANT-SHRUB",
    description: "Evergreen shrub (installed)",
    unit: "each",
    unit_price: 95,
  },
  {
    sku: "MULCH-BED",
    description: "Mulched planting bed prep & mulch",
    unit: "sqft",
    unit_price: 4.5,
  },
  {
    sku: "LIGHTING-STRING",
    description: "Pergola string lighting package",
    unit: "each",
    unit_price: 650,
  },
  {
    sku: "SOIL-GRADING",
    description: "Fine grading & soil prep",
    unit: "sqft",
    unit_price: 3.25,
  },
  {
    sku: "DRAINAGE-FRENCH",
    description: "French drain",
    unit: "linear_ft",
    unit_price: 55,
  },
  {
    sku: "EDGING-STEEL",
    description: "Steel landscape edging",
    unit: "linear_ft",
    unit_price: 18,
  },
  {
    sku: "MOBILIZATION",
    description: "Mobilization / site protection",
    unit: "each",
    unit_price: 750,
  },
];

export function formatPricingCatalog(): string {
  return PRICING_TABLE.map(
    (item) =>
      `- ${item.sku}: ${item.description} — $${item.unit_price}/${item.unit}`,
  ).join("\n");
}
