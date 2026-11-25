import { generateText, Output } from 'ai'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const model = 'google/gemini-4-neon-fast'
const categories = ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 'Bags', 'Accessories'] as const
const actionSchema = z.object({ action: z.enum(['analyze', 'chat', 'outfit']) })
const itemSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(categories),
  subcategory: z.string().max(80),
  primary_color: z.string().max(50),
  secondary_color: z.string().max(50),
  pattern: z.string().max(80),
  style: z.array(z.string().max(40)).max(8),
  seasons: z.array(z.string().max(30)).max(6),
  occasions: z.array(z.string().max(40)).max(8),
  brand: z.string().max(80),
  notes: z.string().max(240),
})

const itemSummary = (item: { id: string; name: string; category: string; primary_color: string | null; brand: string | null; seasons: string[]; style: string[] }) => ({
  id: item.id,
  name: item.name,
  category: item.category,
  colour: item.primary_color || 'not specified',
  brand: item.brand || 'unbranded',
  seasons: item.seasons || [],
  style: item.style || [],
})

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'This request could not be verified.' }, { status: 403 })
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Sign in to use your personal stylist.' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Please send a valid request.' }, { status: 400 }) }
  const actionResult = actionSchema.safeParse(body)
  if (!actionResult.success) return NextResponse.json({ error: 'Choose a valid stylist action.' }, { status: 400 })

  try {
    if (actionResult.data.action === 'analyze') {
      const input = z.object({ image: z.string().min(1).max(11_200_000) }).safeParse(body)
      if (!input.success) return NextResponse.json({ error: 'Choose an image smaller than 8 MB.' }, { status: 400 })
      const match = input.data.image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/)
      if (!match) return NextResponse.json({ error: 'Choose a JPG, PNG, or WebP photograph.' }, { status: 400 })
      const mediaType = match[1] === 'jpeg' ? 'image/jpeg' : `image/${match[1]}`
      const image = Buffer.from(match[2], 'base64')
      if (image.byteLength > 8 * 1024 * 1024) return NextResponse.json({ error: 'Choose an image smaller than 8 MB.' }, { status: 400 })
      const { output } = await generateText({
        model,
        system: 'You are an expert wardrobe cataloguer. Describe only visible clothing and accessories. Do not guess a brand or make claims that cannot be seen. Keep the name and notes concise, and use the allowed category that best fits.',
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'Identify the single main clothing or accessory item in this image. Suggest a useful wardrobe name, category, silhouette, dominant colour, optional secondary colour or pattern, descriptive style tags, seasons, occasions, and short practical notes. If a detail is uncertain, leave its string blank or its array empty.' },
          { type: 'image', image, mediaType },
        ] }],
        output: Output.object({ schema: itemSchema }),
      })
      return NextResponse.json({ item: output })
    }

    if (actionResult.data.action === 'chat') {
      const input = z.object({ question: z.string().trim().min(2).max(1200) }).safeParse(body)
      if (!input.success) return NextResponse.json({ error: 'Write a short styling question to get started.' }, { status: 400 })
      const historyInput = z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1200) })).max(20).safeParse((body as { messages?: unknown }).messages ?? [])
      if (!historyInput.success) return NextResponse.json({ error: 'Please shorten that conversation and try again.' }, { status: 400 })
      const [itemsResult, outfitsResult] = await Promise.all([
        supabase.from('wardrobe_items').select('id,name,category,primary_color,brand,seasons,style').eq('user_id', user.id).order('created_at', { ascending: false }).limit(60),
        supabase.from('outfits').select('id,title,occasion').eq('user_id', user.id).order('created_at', { ascending: false }).limit(12),
      ])
      if (itemsResult.error) throw itemsResult.error
      if (outfitsResult.error) throw outfitsResult.error
      const pieces = (itemsResult.data || []).map(itemSummary)
      const savedOutfits = outfitsResult.data || []
      const savedOutfitIds = savedOutfits.map((outfit) => outfit.id)
      const savedOutfitItems = savedOutfitIds.length ? await supabase.from('outfit_items').select('outfit_id,wardrobe_item_id,category_slot').eq('user_id', user.id).in('outfit_id', savedOutfitIds) : { data: [], error: null }
      if (savedOutfitItems.error) throw savedOutfitItems.error
      const savedLookSummaries = savedOutfits.map((outfit) => ({ ...outfit, pieces: (savedOutfitItems.data || []).filter((entry) => entry.outfit_id === outfit.id).map((entry) => ({ id: entry.wardrobe_item_id, slot: entry.category_slot })) }))
      const styleOptions = ['Classic', 'Minimalist', 'Casual', 'Streetwear', 'Formal', 'Vintage', 'Sporty', 'Smart Casual', 'Ethnic', 'Trendy']
      const paletteOptions = ['Warm neutrals', 'Cool neutrals', 'Earth tones', 'Monochrome', 'Jewel tones', 'Soft pastels', 'Bright accents', 'No preference']
      const styleProfile = styleOptions.includes(String(user.user_metadata?.style_profile)) ? String(user.user_metadata.style_profile) : 'Classic'
      const palette = paletteOptions.includes(String(user.user_metadata?.palette)) ? String(user.user_metadata.palette) : 'Warm neutrals'
      const history = historyInput.data.map((message) => `${message.role === 'user' ? 'User' : 'Stylist'}: ${message.content}`).join('\n')
      const { text } = await generateText({
        model,
        maxOutputTokens: 400,
        system: `You are Elena, a thoughtful, modern personal wardrobe stylist. Give concise, warm and practical advice using only this user's actual wardrobe. Never claim they own a piece not listed. If the collection is empty, invite them to add a few pieces. Consider season, context, and accessibility of the outfit; avoid body judgement or assumptions about gender. User style preferences: ${styleProfile}; ${palette}. Their saved looks: ${JSON.stringify(savedLookSummaries)}. The current wardrobe is JSON: ${JSON.stringify(pieces)}`,
        prompt: history || input.data.question,
      })
      return NextResponse.json({ text })
    }

    const input = z.object({
      occasion: z.string().trim().min(1).max(60),
      weather: z.string().trim().min(1).max(40),
      style: z.string().trim().min(1).max(60),
      preferredColors: z.string().trim().max(120).default(''),
      instructions: z.string().trim().max(360).default(''),
    }).safeParse(body)
    if (!input.success) return NextResponse.json({ error: 'Choose an occasion, weather, and style.' }, { status: 400 })
    const [itemsResult, outfitsResult] = await Promise.all([
      supabase.from('wardrobe_items').select('id,name,category,primary_color,brand,seasons,style').eq('user_id', user.id).order('created_at', { ascending: false }).limit(60),
      supabase.from('outfits').select('id,title,occasion').eq('user_id', user.id).order('created_at', { ascending: false }).limit(12),
    ])
    if (itemsResult.error) throw itemsResult.error
    if (outfitsResult.error) throw outfitsResult.error
    const pieces = (itemsResult.data || []).map(itemSummary)
    if (pieces.length < 2) return NextResponse.json({ error: 'Add at least two pieces before generating a full look.' }, { status: 400 })
    const recentOutfits = outfitsResult.data || []
    const recentOutfitIds = recentOutfits.map((outfit) => outfit.id)
    const outfitItemsResult = recentOutfitIds.length ? await supabase.from('outfit_items').select('outfit_id,wardrobe_item_id').eq('user_id', user.id).in('outfit_id', recentOutfitIds) : { data: [], error: null }
    if (outfitItemsResult.error) throw outfitItemsResult.error
    const recentCombinations = recentOutfits.map((outfit) => ({
      title: outfit.title,
      occasion: outfit.occasion,
      itemIds: (outfitItemsResult.data || []).filter((entry) => entry.outfit_id === outfit.id).map((entry) => entry.wardrobe_item_id),
    }))
    const styleOptions = ['Classic', 'Minimalist', 'Casual', 'Streetwear', 'Formal', 'Vintage', 'Sporty', 'Smart Casual', 'Ethnic', 'Trendy']
    const paletteOptions = ['Warm neutrals', 'Cool neutrals', 'Earth tones', 'Monochrome', 'Jewel tones', 'Soft pastels', 'Bright accents', 'No preference']
    const styleProfile = styleOptions.includes(String(user.user_metadata?.style_profile)) ? String(user.user_metadata.style_profile) : 'Classic'
    const palette = paletteOptions.includes(String(user.user_metadata?.palette)) ? String(user.user_metadata.palette) : 'Warm neutrals'
    const { output } = await generateText({
      model,
      maxOutputTokens: 500,
      system: `You are a personal stylist. Create one wearable, cohesive outfit using only the exact wardrobe item IDs provided. Select two to five pieces from useful categories when possible. Never create, rename, or return an ID that is not in the supplied wardrobe. Consider the user's style preference (${styleProfile}), palette (${palette}), preferred colours (${input.data.preferredColors || 'no additional preference'}), weather (${input.data.weather}), and occasion (${input.data.occasion}). Avoid repeating recent saved combinations when there are suitable alternatives. Explain why the items work together and add practical styling details. Keep the title short.`,
      prompt: `Make one ${input.data.style} outfit for ${input.data.occasion} in ${input.data.weather} weather. ${input.data.preferredColors ? `Prefer these colours: ${input.data.preferredColors}.` : ''} ${input.data.instructions ? `Additional context: ${input.data.instructions}.` : ''} Use only items from this wardrobe: ${JSON.stringify(pieces)}. Avoid these recent saved combinations if possible: ${JSON.stringify(recentCombinations)}`,
      output: Output.object({ schema: z.object({ title: z.string().min(2).max(80), note: z.string().min(4).max(260), itemIds: z.array(z.string().uuid()).min(2).max(5) }) }),
    })
    const validIds = new Set(pieces.map((item) => item.id))
    const itemIds = [...new Set(output.itemIds.filter((id) => validIds.has(id)))].slice(0, 5)
    if (itemIds.length < 2) return NextResponse.json({ error: 'Your stylist could not make a complete look from those pieces. Try again.' }, { status: 422 })
    return NextResponse.json({ outfit: { ...output, itemIds, occasion: input.data.occasion } })
  } catch {
    return NextResponse.json({ error: 'Your stylist is taking a moment. Please try again.' }, { status: 503 })
  }
}
