import { PrismaClient, ProductType } from "@prisma/client";

const prisma = new PrismaClient();

interface ProductSeed {
  name: string;
  brand: string;
  type: ProductType;
  analysis: Record<string, number | string>;
  applicationRate: string;
  crops: string[];
  description: string;
}

const products: ProductSeed[] = [
  // ============ NITROGEN FERTILIZERS ============
  {
    name: "UAN 32-0-0",
    brand: "Nutrien",
    type: "FERTILIZER",
    analysis: { N: 32, P: 0, K: 0 },
    applicationRate: "10-20 gal/acre",
    crops: ["Corn", "Wheat", "Cotton", "Sorghum"],
    description:
      "Urea-ammonium nitrate solution containing 32% nitrogen. Ideal for foliar and soil applications. Provides both quick-release and slow-release nitrogen forms.",
  },
  {
    name: "Urea 46-0-0",
    brand: "Koch Fertilizer",
    type: "FERTILIZER",
    analysis: { N: 46, P: 0, K: 0 },
    applicationRate: "87-175 lbs/acre",
    crops: ["Corn", "Wheat", "Rice", "Cotton", "Soybeans"],
    description:
      "High-nitrogen granular fertilizer. Most concentrated solid nitrogen source available. Best applied before rain or irrigation to minimize volatilization losses.",
  },
  {
    name: "Anhydrous Ammonia 82-0-0",
    brand: "CF Industries",
    type: "FERTILIZER",
    analysis: { N: 82, P: 0, K: 0 },
    applicationRate: "100-180 lbs/acre",
    crops: ["Corn", "Wheat", "Cotton", "Sorghum"],
    description:
      "Most concentrated and economical nitrogen source. Requires specialized application equipment. Best applied in fall or spring before planting.",
  },
  {
    name: "Ammonium Sulfate 21-0-0-24S",
    brand: "AdvanSix",
    type: "FERTILIZER",
    analysis: { N: 21, P: 0, K: 0, S: 24 },
    applicationRate: "100-200 lbs/acre",
    crops: ["Corn", "Wheat", "Canola", "Alfalfa", "Soybeans"],
    description:
      "Provides both nitrogen and sulfur in plant-available forms. Excellent for sulfur-deficient soils. Lower volatilization risk than urea.",
  },

  // ============ PHOSPHORUS FERTILIZERS ============
  {
    name: "MAP 11-52-0",
    brand: "Mosaic",
    type: "FERTILIZER",
    analysis: { N: 11, P: 52, K: 0 },
    applicationRate: "100-200 lbs/acre",
    crops: ["Corn", "Soybeans", "Wheat", "Cotton", "Vegetables"],
    description:
      "Monoammonium phosphate - excellent starter fertilizer. High phosphorus content ideal for root development. Slightly acidifying effect benefits high-pH soils.",
  },
  {
    name: "DAP 18-46-0",
    brand: "Mosaic",
    type: "FERTILIZER",
    analysis: { N: 18, P: 46, K: 0 },
    applicationRate: "100-200 lbs/acre",
    crops: ["Corn", "Soybeans", "Wheat", "Cotton", "Alfalfa"],
    description:
      "Diammonium phosphate - most widely used phosphorus fertilizer. Good balance of nitrogen and phosphorus. Avoid direct seed contact due to ammonia release.",
  },
  {
    name: "Triple Superphosphate 0-46-0",
    brand: "Mosaic",
    type: "FERTILIZER",
    analysis: { N: 0, P: 46, K: 0 },
    applicationRate: "50-150 lbs/acre",
    crops: ["Corn", "Soybeans", "Vegetables", "Fruit Trees", "Alfalfa"],
    description:
      "Concentrated phosphorus source without nitrogen. Ideal when only phosphorus is needed. Water-soluble and immediately plant-available.",
  },

  // ============ POTASSIUM FERTILIZERS ============
  {
    name: "Muriate of Potash 0-0-60",
    brand: "Nutrien",
    type: "FERTILIZER",
    analysis: { N: 0, P: 0, K: 60 },
    applicationRate: "100-300 lbs/acre",
    crops: ["Corn", "Soybeans", "Cotton", "Wheat", "Alfalfa"],
    description:
      "Most common and economical potassium source. Contains chloride - avoid on chloride-sensitive crops. Essential for stalk strength and disease resistance.",
  },
  {
    name: "Sulfate of Potash 0-0-50-18S",
    brand: "Compass Minerals",
    type: "FERTILIZER",
    analysis: { N: 0, P: 0, K: 50, S: 18 },
    applicationRate: "100-250 lbs/acre",
    crops: ["Potatoes", "Tobacco", "Vegetables", "Fruit Trees", "Grapes"],
    description:
      "Chloride-free potassium source with sulfur. Premium fertilizer for chloride-sensitive crops. Improves fruit quality and storage life.",
  },

  // ============ SOIL AMENDMENTS ============
  {
    name: "Agricultural Lime (Hi-Cal)",
    brand: "Graymont",
    type: "AMENDMENT",
    analysis: {ite: 90, calcium: 36 },
    applicationRate: "1-4 tons/acre",
    crops: ["All Crops"],
    description:
      "High-calcium limestone for soil pH correction. Raises soil pH and provides calcium. Apply based on soil buffer pH for proper rate.",
  },
  {
    name: "Dolomitic Lime",
    brand: "Graymont",
    type: "AMENDMENT",
    analysis: { ite: 85, calcium: 22, magnesium: 12 },
    applicationRate: "1-4 tons/acre",
    crops: ["All Crops"],
    description:
      "Limestone containing both calcium and magnesium. Use when soil is deficient in both calcium and magnesium. Slower-acting than calcitic lime.",
  },
  {
    name: "Pelletized Gypsum",
    brand: "USA Gypsum",
    type: "AMENDMENT",
    analysis: { calcium: 23, sulfur: 18 },
    applicationRate: "500-2000 lbs/acre",
    crops: ["Corn", "Soybeans", "Peanuts", "Cotton", "Vegetables"],
    description:
      "Calcium sulfate for calcium and sulfur without affecting pH. Improves soil structure in high-sodium soils. Alleviates aluminum toxicity.",
  },
  {
    name: "Elemental Sulfur",
    brand: "Tiger-Sul",
    type: "AMENDMENT",
    analysis: { sulfur: 90 },
    applicationRate: "10-50 lbs/acre",
    crops: ["Corn", "Soybeans", "Canola", "Alfalfa", "Wheat"],
    description:
      "Concentrated sulfur source that also lowers soil pH. Must be oxidized by soil bacteria before plant uptake. Apply in fall for spring availability.",
  },

  // ============ MICRONUTRIENTS ============
  {
    name: "Zinc Sulfate 35%",
    brand: "Chem One",
    type: "FERTILIZER",
    analysis: { zinc: 35, sulfur: 17 },
    applicationRate: "5-20 lbs/acre",
    crops: ["Corn", "Soybeans", "Rice", "Wheat", "Vegetables"],
    description:
      "Most common zinc source for soil application. Essential for corn and rice production. Apply when soil test Zn is below 1 ppm.",
  },
  {
    name: "Manganese Sulfate 32%",
    brand: "Prince Agri Products",
    type: "FERTILIZER",
    analysis: { manganese: 32, sulfur: 19 },
    applicationRate: "5-15 lbs/acre",
    crops: ["Soybeans", "Wheat", "Oats", "Sugar Beets", "Vegetables"],
    description:
      "Corrects manganese deficiency common in high-pH soils. Soybeans especially sensitive to Mn deficiency. Foliar application often more effective.",
  },
  {
    name: "Boron 15%",
    brand: "U.S. Borax",
    type: "FERTILIZER",
    analysis: { boron: 15 },
    applicationRate: "0.5-2 lbs B/acre",
    crops: ["Alfalfa", "Corn", "Soybeans", "Sunflowers", "Vegetables"],
    description:
      "Essential micronutrient for reproductive development. Narrow range between deficiency and toxicity. Alfalfa has high boron requirement.",
  },

  // ============ FUNGICIDES ============
  {
    name: "Headline AMP",
    brand: "BASF",
    type: "FUNGICIDE",
    analysis: { activeIngredient: "Pyraclostrobin + Metconazole" },
    applicationRate: "10-14 fl oz/acre",
    crops: ["Corn", "Soybeans", "Wheat", "Peanuts", "Sorghum"],
    description:
      "Broad-spectrum strobilurin + triazole fungicide. Controls gray leaf spot, northern corn leaf blight, and many soybean diseases. Plant health benefits.",
  },
  {
    name: "Priaxor",
    brand: "BASF",
    type: "FUNGICIDE",
    analysis: { activeIngredient: "Fluxapyroxad + Pyraclostrobin" },
    applicationRate: "4-8 fl oz/acre",
    crops: ["Corn", "Soybeans", "Wheat", "Peanuts"],
    description:
      "SDHI + strobilurin combination for premium disease control. Excellent activity on white mold in soybeans. Long-lasting residual activity.",
  },
  {
    name: "Delaro 325 SC",
    brand: "Bayer",
    type: "FUNGICIDE",
    analysis: { activeIngredient: "Prothioconazole + Trifloxystrobin" },
    applicationRate: "8-11.4 fl oz/acre",
    crops: ["Wheat", "Barley", "Corn", "Soybeans"],
    description:
      "Dual-action fungicide for cereals and row crops. Excellent control of Fusarium head blight in wheat. Reduces DON mycotoxin levels.",
  },

  // ============ INSECTICIDES ============
  {
    name: "Warrior II with Zeon",
    brand: "Syngenta",
    type: "INSECTICIDE",
    analysis: { activeIngredient: "Lambda-cyhalothrin" },
    applicationRate: "1.28-1.92 fl oz/acre",
    crops: ["Corn", "Soybeans", "Cotton", "Wheat", "Vegetables"],
    description:
      "Broad-spectrum pyrethroid insecticide. Controls corn rootworm adults, aphids, and many other pests. Zeon technology provides extended residual.",
  },
  {
    name: "Prevathon",
    brand: "FMC",
    type: "INSECTICIDE",
    analysis: { activeIngredient: "Chlorantraniliprole" },
    applicationRate: "14-20 fl oz/acre",
    crops: ["Corn", "Soybeans", "Cotton", "Vegetables", "Fruit"],
    description:
      "Diamide insecticide for caterpillar and beetle control. Excellent safety to beneficial insects. Long residual activity.",
  },
  {
    name: "Sivanto Prime",
    brand: "Bayer",
    type: "INSECTICIDE",
    analysis: { activeIngredient: "Flupyradifurone" },
    applicationRate: "7-14 fl oz/acre",
    crops: ["Soybeans", "Cotton", "Vegetables", "Citrus", "Grapes"],
    description:
      "Systemic insecticide safe for pollinators when applied correctly. Controls aphids, whiteflies, and other sucking pests. Flexible application timing.",
  },

  // ============ HERBICIDES ============
  {
    name: "Roundup PowerMax 3",
    brand: "Bayer",
    type: "HERBICIDE",
    analysis: { activeIngredient: "Glyphosate 5.5 lb ae/gal" },
    applicationRate: "22-44 fl oz/acre",
    crops: ["Corn (RR)", "Soybeans (RR)", "Cotton (RR)", "Burndown"],
    description:
      "Industry-standard glyphosate formulation. Non-selective herbicide for burndown and in-crop use on tolerant varieties. Enhanced surfactant system.",
  },
  {
    name: "Engenia",
    brand: "BASF",
    type: "HERBICIDE",
    analysis: { activeIngredient: "Dicamba 5 lb ae/gal" },
    applicationRate: "12.8 fl oz/acre",
    crops: ["Soybeans (Xtend)", "Cotton (Xtend)"],
    description:
      "Low-volatility dicamba formulation for Xtend crops. Controls glyphosate-resistant weeds. Requires VaporGrip technology for reduced drift.",
  },
  {
    name: "Acuron",
    brand: "Syngenta",
    type: "HERBICIDE",
    analysis: { activeIngredient: "Bicyclopyrone + Mesotrione + S-metolachlor + Atrazine" },
    applicationRate: "2.5-3 qt/acre",
    crops: ["Corn"],
    description:
      "Complete one-pass corn herbicide with four modes of action. Controls over 70 broadleaf and grass weeds. Residual control through the season.",
  },

  // ============ BIOLOGICALS ============
  {
    name: "Vault HP Plus",
    brand: "BASF",
    type: "BIOLOGICAL",
    analysis: { activeIngredient: "Bradyrhizobium japonicum" },
    applicationRate: "3.2 fl oz/100 lb seed",
    crops: ["Soybeans"],
    description:
      "Premium soybean inoculant with high rhizobia concentration. Ensures nitrogen fixation in fields without recent soybean history. LCO technology enhances nodulation.",
  },
  {
    name: "Pivot Bio PROVEN 40",
    brand: "Pivot Bio",
    type: "BIOLOGICAL",
    analysis: { activeIngredient: "Klebsiella variicola" },
    applicationRate: "3 fl oz/acre in-furrow",
    crops: ["Corn"],
    description:
      "Nitrogen-producing microbial for corn. Colonizes roots and fixes atmospheric nitrogen. Can replace 25-40 lbs N/acre of synthetic fertilizer.",
  },

  // ============ SEED TREATMENTS ============
  {
    name: "Cruiser Maxx",
    brand: "Syngenta",
    type: "SEED_TREATMENT",
    analysis: { activeIngredient: "Thiamethoxam + Fludioxonil + Mefenoxam" },
    applicationRate: "5 fl oz/100 lb seed",
    crops: ["Corn", "Soybeans", "Cotton", "Cereals"],
    description:
      "Comprehensive seed treatment with insecticide and fungicides. Protects against early-season insects and seedling diseases. Enhances stand establishment.",
  },
  {
    name: "Poncho Votivo 2.0",
    brand: "BASF",
    type: "SEED_TREATMENT",
    analysis: { activeIngredient: "Clothianidin + Bacillus firmus" },
    applicationRate: "0.5 mg ai/seed",
    crops: ["Corn", "Soybeans"],
    description:
      "Neonicotinoid insecticide plus biological nematicide. Protects roots from insects and nematodes. Bacillus firmus colonizes root zone for extended protection.",
  },
];

async function seedProducts() {
  console.log("Starting product seed...");

  for (const product of products) {
    try {
      // Check if product already exists
      const existing = await prisma.product.findFirst({
        where: {
          name: product.name,
          brand: product.brand,
        },
      });

      if (existing) {
        console.log(`Skipping existing product: ${product.name}`);
        continue;
      }

      // Create product (no prices - pricing is now fetched via LLM web search)
      const created = await prisma.product.create({
        data: product,
      });

      console.log(`Created: ${created.name}`);
    } catch (error) {
      console.error(`Error creating ${product.name}:`, error);
    }
  }

  console.log("Product seed completed!");
}

seedProducts()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
