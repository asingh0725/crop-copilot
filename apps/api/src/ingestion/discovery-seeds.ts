/**
 * Seed data for the crop × region discovery queue.
 *
 * The DiscoverSourcesWorker inserts these combinations into CropRegionDiscovery
 * on its first run using INSERT ... ON CONFLICT DO NOTHING, so this list can
 * be expanded over time without re-seeding.
 *
 * 30 crops × 17 regions = 510 combinations (North America only).
 * At the default batch of 10 per run (48 runs/day at 30-min intervals) the
 * full matrix is covered in ~2 days, then each combination refreshes every 90 days.
 */

export const CROPS: string[] = [
  // Row crops
  'corn',
  'soybeans',
  'wheat',
  'cotton',
  'rice',
  'sorghum',
  'barley',
  'oats',
  'rye',
  'millet',
  'sunflower',
  'canola',
  'alfalfa',
  'sugarcane',
  'tobacco',
  'peanuts',
  // Vegetables
  'tomatoes',
  'potatoes',
  'peppers',
  'cucumbers',
  'onions',
  'carrots',
  'lettuce',
  'broccoli',
  // Fruits & nuts
  'apples',
  'grapes',
  'strawberries',
  'peaches',
  'almonds',
  'blueberries',
];

export const REGIONS: string[] = [
  // US Midwest (primary crop belt)
  'Iowa',
  'Illinois',
  'Indiana',
  'Ohio',
  'Nebraska',
  'Kansas',
  'Minnesota',
  'Wisconsin',
  'Missouri',
  // US South & West
  'Texas',
  'California',
  'Georgia',
  'North Carolina',
  'Florida',
  'Washington',
  // Canada
  'Ontario',
  'Alberta',
];
