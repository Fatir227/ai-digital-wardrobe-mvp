export type Category = 'Tops' | 'Bottoms' | 'Dresses' | 'Outerwear' | 'Shoes' | 'Bags' | 'Accessories'

export type WardrobeItem = {
  id: string
  user_id: string
  name: string
  category: Category
  subcategory: string | null
  primary_color: string | null
  secondary_color: string | null
  pattern: string | null
  style: string[]
  seasons: string[]
  occasions: string[]
  brand: string | null
  notes: string | null
  image_path: string
  image_url: string
  is_favorite: boolean
  created_at: string
}

export type SavedOutfit = {
  id: string
  user_id: string
  title: string
  notes: string | null
  occasion: string | null
  is_favorite: boolean
  created_at: string
  item_ids: string[]
}

export type GeneratedLook = {
  title: string
  note: string
  itemIds: string[]
  occasion: string
  savedOutfitId?: string
  is_favorite?: boolean
}

export type OutfitPlan = {
  id: string
  user_id: string
  planned_for: string
  outfit_id: string | null
  notes: string | null
  created_at: string
}

export type AtelierData = {
  items: WardrobeItem[]
  outfits: SavedOutfit[]
  plans: OutfitPlan[]
}

export type AtelierUser = {
  id: string
  email: string
  name: string
  styleProfile?: string
  palette?: string
}

export const categories: Category[] = ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 'Bags', 'Accessories']
