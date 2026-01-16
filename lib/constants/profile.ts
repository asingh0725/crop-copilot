export interface LocationOption {
  value: string
  label: string
  country: 'US' | 'CA'
}

export interface LabeledOption {
  value: string
  label: string
}

export interface CropOption extends LabeledOption {
  category: string
}

export const US_STATES: readonly string[] = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming'
]

export const CA_PROVINCES: readonly string[] = [
  'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador',
  'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island',
  'Quebec', 'Saskatchewan', 'Yukon'
]

export const LOCATIONS: readonly LocationOption[] = [
  ...US_STATES.map((state: string): LocationOption => ({
    value: state,
    label: state,
    country: 'US',
  })),
  ...CA_PROVINCES.map((province: string): LocationOption => ({
    value: province,
    label: province,
    country: 'CA',
  }))
]

export const FARM_SIZES: readonly LabeledOption[] = [
  { value: 'hobby', label: 'Hobby (< 1 acre)' },
  { value: 'small', label: 'Small (1-10 acres)' },
  { value: 'medium', label: 'Medium (10-100 acres)' },
  { value: 'large', label: 'Large (100-1000 acres)' },
  { value: 'commercial', label: 'Commercial (> 1000 acres)' }
]

export const EXPERIENCE_LEVELS: readonly LabeledOption[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'professional', label: 'Professional' }
]

export const CROP_OPTIONS: readonly CropOption[] = [
  // Grains
  { value: 'wheat', label: 'Wheat', category: 'Grains' },
  { value: 'corn', label: 'Corn', category: 'Grains' },
  { value: 'rice', label: 'Rice', category: 'Grains' },
  { value: 'barley', label: 'Barley', category: 'Grains' },
  { value: 'oats', label: 'Oats', category: 'Grains' },
  { value: 'sorghum', label: 'Sorghum', category: 'Grains' },

  // Vegetables
  { value: 'tomatoes', label: 'Tomatoes', category: 'Vegetables' },
  { value: 'potatoes', label: 'Potatoes', category: 'Vegetables' },
  { value: 'onions', label: 'Onions', category: 'Vegetables' },
  { value: 'carrots', label: 'Carrots', category: 'Vegetables' },
  { value: 'lettuce', label: 'Lettuce', category: 'Vegetables' },
  { value: 'peppers', label: 'Peppers', category: 'Vegetables' },
  { value: 'cucumbers', label: 'Cucumbers', category: 'Vegetables' },
  { value: 'cabbage', label: 'Cabbage', category: 'Vegetables' },
  { value: 'broccoli', label: 'Broccoli', category: 'Vegetables' },
  { value: 'cauliflower', label: 'Cauliflower', category: 'Vegetables' },
  { value: 'spinach', label: 'Spinach', category: 'Vegetables' },
  { value: 'kale', label: 'Kale', category: 'Vegetables' },

  // Fruits
  { value: 'apples', label: 'Apples', category: 'Fruits' },
  { value: 'oranges', label: 'Oranges', category: 'Fruits' },
  { value: 'grapes', label: 'Grapes', category: 'Fruits' },
  { value: 'strawberries', label: 'Strawberries', category: 'Fruits' },
  { value: 'blueberries', label: 'Blueberries', category: 'Fruits' },
  { value: 'peaches', label: 'Peaches', category: 'Fruits' },
  { value: 'cherries', label: 'Cherries', category: 'Fruits' },
  { value: 'watermelon', label: 'Watermelon', category: 'Fruits' },

  // Legumes
  { value: 'soybeans', label: 'Soybeans', category: 'Legumes' },
  { value: 'peas', label: 'Peas', category: 'Legumes' },
  { value: 'beans', label: 'Beans', category: 'Legumes' },
  { value: 'lentils', label: 'Lentils', category: 'Legumes' },
  { value: 'peanuts', label: 'Peanuts', category: 'Legumes' },

  // Other
  { value: 'cotton', label: 'Cotton', category: 'Other' },
  { value: 'sugarcane', label: 'Sugarcane', category: 'Other' },
  { value: 'sunflower', label: 'Sunflower', category: 'Other' },
  { value: 'canola', label: 'Canola', category: 'Other' },
  { value: 'alfalfa', label: 'Alfalfa', category: 'Other' }
]
