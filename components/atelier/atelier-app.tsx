'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  ArrowRight, Bell, CalendarDays, Check, ChevronDown, Heart, Home, LogIn,
  Menu, Plus, Search, Settings2, Shirt, Sparkles, UserRound, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AtelierData, AtelierUser, GeneratedLook, OutfitPlan, SavedOutfit, WardrobeItem } from './types'
import { ItemDialog, type ItemInput } from './item-dialog'
import { DashboardView, GeneratorView, PlannerView, ProfileView, type ChatMessage, StylistView, StudioView, WardrobeView } from './views'

type PageKey = 'home' | 'wardrobe' | 'studio' | 'generator' | 'stylist' | 'planner' | 'profile'
type AuthMode = 'signin' | 'signup'
type AIResponse = { text?: string; item?: Partial<ItemInput>; outfit?: { title: string; note: string; itemIds: string[] } }
const emptyData: AtelierData = { items: [], outfits: [], plans: [] }

async function optimizeImage(file: File) {
  if (file.size <= 1.5 * 1024 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) { bitmap.close(); return file }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], `${file.name.replace(/\\.[^.]+$/, '')}.webp`, { type: 'image/webp', lastModified: Date.now() })
  } catch {
    return file
  }
}

async function loadAtelierData(userId: string): Promise<AtelierData> {
  const supabase = createClient()
  const [itemsResult, outfitsResult, plansResult] = await Promise.all([
    supabase.from('wardrobe_items').select('id,user_id,name,category,subcategory,primary_color,secondary_color,pattern,style,seasons,occasions,brand,notes,image_path,is_favorite,created_at').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('outfits').select('id,user_id,title,notes,occasion,is_favorite,created_at').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('outfit_plans').select('id,user_id,planned_for,outfit_id,notes,created_at').eq('user_id', userId).order('planned_for', { ascending: true }),
  ])
  if (itemsResult.error) throw itemsResult.error
  if (outfitsResult.error) throw outfitsResult.error
  if (plansResult.error) throw plansResult.error
  const items = await Promise.all((itemsResult.data || []).map(async (item) => {
    const { data } = await supabase.storage.from('wardrobe-images').createSignedUrl(item.image_path, 60 * 60)
    return { ...item, image_url: data?.signedUrl || '' } as WardrobeItem
  }))
  const outfitIds = (outfitsResult.data || []).map((outfit) => outfit.id)
  const outfitItems = outfitIds.length ? await supabase.from('outfit_items').select('outfit_id,wardrobe_item_id').eq('user_id', userId).in('outfit_id', outfitIds) : { data: [], error: null }
  if (outfitItems.error) throw outfitItems.error
  const itemMap = new Map<string, string[]>()
  for (const entry of outfitItems.data || []) itemMap.set(entry.outfit_id, [...(itemMap.get(entry.outfit_id) || []), entry.wardrobe_item_id])
  const outfits = (outfitsResult.data || []).map((outfit) => ({ ...outfit, item_ids: itemMap.get(outfit.id) || [] })) as SavedOutfit[]
  return { items, outfits, plans: (plansResult.data || []) as OutfitPlan[] }
}

const navGroups = [
  { label: 'OVERVIEW', items: [{ key: 'home', label: 'Dashboard', icon: Home }] },
  { label: 'YOUR WARDROBE', items: [{ key: 'wardrobe', label: 'The Wardrobe', icon: Shirt }, { key: 'studio', label: 'Outfit Canvas', icon: Sparkles }, { key: 'generator', label: 'AI Outfit Generator', icon: Sparkles }, { key: 'stylist', label: 'Elena’s Atelier AI', icon: Sparkles }, { key: 'planner', label: 'Outfit Planner', icon: CalendarDays }] },
] as const

export function AtelierApp({ initialUser }: { initialUser: AtelierUser | null }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [user, setUser] = useState(initialUser)
  const [page, setPage] = useState<PageKey>('home')
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)
  const [itemEditor, setItemEditor] = useState<{ open: boolean; item: WardrobeItem | null }>({ open: false, item: null })
  const [busy, setBusy] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [toast, setToast] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [stylistLoading, setStylistLoading] = useState(false)
  const [outfitSelection, setOutfitSelection] = useState<string[]>([])
  const [outfitTitle, setOutfitTitle] = useState('')
  const [outfitNotes, setOutfitNotes] = useState('')
  const [outfitOccasion, setOutfitOccasion] = useState('Everyday')
  const [generatingLook, setGeneratingLook] = useState(false)
  const [generatedNote, setGeneratedNote] = useState('')
  const [generatedLook, setGeneratedLook] = useState<GeneratedLook | null>(null)
  const { data, error, mutate, isLoading } = useSWR(user ? ['atelier-data', user.id] : null, ([, userId]) => loadAtelierData(userId))
  const currentData = data || emptyData

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user
      if (nextUser) {
        setUser({ id: nextUser.id, email: nextUser.email || '', name: String(nextUser.user_metadata?.display_name || nextUser.email?.split('@')[0] || 'there'), styleProfile: String(nextUser.user_metadata?.style_profile || 'Classic'), palette: String(nextUser.user_metadata?.palette || 'Warm neutrals') })
        if (event === 'SIGNED_IN') router.refresh()
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setPage('home')
        setMessages([])
      }
    })
    return () => authListener.subscription.unsubscribe()
  }, [router, supabase])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const showAuth = () => setAuthMode('signin')
  const requireUser = () => { if (!user) { setAuthMode('signin'); setToast('Sign in to keep your wardrobe private and in sync.'); return false } return true }
  const openAddItem = () => { if (!requireUser()) return; setItemEditor({ open: true, item: null }) }
  const apiCall = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch('/api/atelier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.')
    return result as AIResponse
  }, [])

  const saveItem = async (values: ItemInput, image: File | null) => {
    if (!user || !requireUser()) return
    const existing = itemEditor.item
    if (!image && !existing) { setToast('Choose a photo to add your piece.'); return }
    setBusy(true)
    let imagePath = existing?.image_path || ''
    try {
      if (image) {
        const uploadFile = await optimizeImage(image)
        const extension = uploadFile.type === 'image/png' ? 'png' : uploadFile.type === 'image/webp' ? 'webp' : 'jpg'
        imagePath = `${user.id}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage.from('wardrobe-images').upload(imagePath, uploadFile, { contentType: uploadFile.type, upsert: false })
        if (uploadError) throw uploadError
      }
      const payload = { ...values, user_id: user.id, image_path: imagePath }
      const result = existing
        ? await supabase.from('wardrobe_items').update(payload).eq('id', existing.id).eq('user_id', user.id)
        : await supabase.from('wardrobe_items').insert(payload)
      if (result.error) {
        if (imagePath && image) await supabase.storage.from('wardrobe-images').remove([imagePath])
        throw result.error
      }
      if (image && existing?.image_path) await supabase.storage.from('wardrobe-images').remove([existing.image_path])
      await mutate()
      setItemEditor({ open: false, item: null })
      setToast(existing ? 'Your piece has been updated.' : 'A new piece, thoughtfully added.')
    } catch (saveError) {
      setToast(saveError instanceof Error ? saveError.message : 'We could not save that piece. Please try again.')
    } finally { setBusy(false) }
  }

  const analyzeImage = async (image: File): Promise<Partial<ItemInput>> => {
    if (!requireUser()) throw new Error('Sign in to use the AI stylist.')
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the image.'))
      reader.onerror = () => reject(new Error('Could not read the image.'))
      reader.readAsDataURL(image)
    })
    const response = await apiCall({ action: 'analyze', image: dataUrl })
    if (!response.item) throw new Error('We could not read the details from this photo.')
    return response.item
  }

  const removeItem = async (item: WardrobeItem) => {
    if (!user || !requireUser()) return
    if (!window.confirm(`Remove “${item.name}” from your wardrobe?`)) return
    const { error: removeError } = await supabase.from('wardrobe_items').delete().eq('id', item.id).eq('user_id', user.id)
    if (removeError) { setToast(removeError.message); return }
    await supabase.storage.from('wardrobe-images').remove([item.image_path])
    await mutate()
    setToast('Piece removed from your wardrobe.')
  }

  const toggleFavorite = async (item: WardrobeItem) => {
    if (!user || !requireUser()) return
    const { error: updateError } = await supabase.from('wardrobe_items').update({ is_favorite: !item.is_favorite }).eq('id', item.id).eq('user_id', user.id)
    if (updateError) setToast(updateError.message)
    else await mutate()
  }

  const saveOutfit = async () => {
    if (!user || !requireUser() || !outfitSelection.length) return
    setBusy(true)
    const title = outfitTitle.trim() || `Look ${new Date().toLocaleDateString('en', { month: 'short', day: 'numeric' })}`
    try {
      const { data: outfit, error: outfitError } = await supabase.from('outfits').insert({ user_id: user.id, title, notes: outfitNotes || null, occasion: outfitOccasion }).select('id').single()
      if (outfitError) throw outfitError
      const links = outfitSelection.map((wardrobeItemId, position) => ({ outfit_id: outfit.id, wardrobe_item_id: wardrobeItemId, user_id: user.id, category_slot: currentData.items.find((item) => item.id === wardrobeItemId)?.category || 'Tops', position }))
      const { error: linkError } = await supabase.from('outfit_items').insert(links)
      if (linkError) { await supabase.from('outfits').delete().eq('id', outfit.id).eq('user_id', user.id); throw linkError }
      await mutate()
      setOutfitTitle('')
      setOutfitNotes('')
      setGeneratedNote('This look is saved to your private lookbook.')
      setToast('Look saved to your personal lookbook.')
    } catch (saveError) { setToast(saveError instanceof Error ? saveError.message : 'We could not save this look.') }
    finally { setBusy(false) }
  }

  const generateLook = async (preferences: { occasion: string; weather: string; style: string; preferredColors: string; instructions: string }) => {
    if (!requireUser()) return
    if (currentData.items.length < 2) { setToast('Add at least two pieces to your wardrobe first.'); return }
    setGeneratingLook(true)
    try {
      const response = await apiCall({ action: 'outfit', ...preferences })
      if (!response.outfit) throw new Error('Your stylist could not find a look just now.')
      setGeneratedLook({ ...response.outfit, occasion: preferences.occasion })
      setToast('A new look is ready in your personal edit.')
    } catch (generationError) { setToast(generationError instanceof Error ? generationError.message : 'Your stylist is taking a moment. Try again.') }
    finally { setGeneratingLook(false) }
  }

  const saveGeneratedLook = async (favorite: boolean) => {
    if (!user || !requireUser() || !generatedLook) return
    if (generatedLook.savedOutfitId) {
      const { error: updateError } = await supabase.from('outfits').update({ is_favorite: favorite }).eq('id', generatedLook.savedOutfitId).eq('user_id', user.id)
      if (updateError) { setToast('Your look could not be updated just now.'); return }
      setGeneratedLook({ ...generatedLook, is_favorite: favorite })
      await mutate()
      setToast(favorite ? 'Added to your favorites.' : 'Removed from your favorites.')
      return
    }
    setBusy(true)
    const title = generatedLook.title.trim() || 'A considered look'
    try {
      const { data: outfit, error: outfitError } = await supabase.from('outfits').insert({ user_id: user.id, title, notes: generatedLook.note, occasion: generatedLook.occasion, is_favorite: favorite }).select('id').single()
      if (outfitError) throw outfitError
      const links = generatedLook.itemIds.map((wardrobeItemId, position) => ({ outfit_id: outfit.id, wardrobe_item_id: wardrobeItemId, user_id: user.id, category_slot: currentData.items.find((item) => item.id === wardrobeItemId)?.category || 'Tops', position }))
      const { error: linkError } = await supabase.from('outfit_items').insert(links)
      if (linkError) { await supabase.from('outfits').delete().eq('id', outfit.id).eq('user_id', user.id); throw linkError }
      setGeneratedLook({ ...generatedLook, savedOutfitId: outfit.id, is_favorite: favorite })
      await mutate()
      setToast(favorite ? 'Look saved to your favorites.' : 'Look saved to your personal lookbook.')
    } catch (saveError) { setToast(saveError instanceof Error ? saveError.message : 'We could not save this look.') }
    finally { setBusy(false) }
  }

  const toggleOutfitFavorite = async (outfit: SavedOutfit) => {
    if (!user || !requireUser()) return
    const { error: favoriteError } = await supabase.from('outfits').update({ is_favorite: !outfit.is_favorite }).eq('id', outfit.id).eq('user_id', user.id)
    if (favoriteError) setToast('That look could not be updated just now.')
    else await mutate()
  }

  const askStylist = async (question: string) => {
    if (!requireUser()) return
    if (!question.trim() || stylistLoading) return
    const nextMessages = [...messages, { role: 'user' as const, content: question }]
    setMessages(nextMessages)
    setStylistLoading(true)
    try {
      const response = await apiCall({ action: 'chat', question, messages: [...messages.slice(-10), { role: 'user', content: question }] })
      setMessages([...nextMessages, { role: 'assistant', content: response.text || 'Let me take another look at your wardrobe.' }])
    } catch (chatError) {
      setMessages([...nextMessages, { role: 'assistant', content: chatError instanceof Error ? chatError.message : 'I could not reach the stylist just now.' }])
    } finally { setStylistLoading(false) }
  }

  const createPlan = async (plannedFor: string, outfitId: string, notes: string) => {
    if (!user || !requireUser()) return
    const { error: planError } = await supabase.from('outfit_plans').insert({ user_id: user.id, planned_for: plannedFor, outfit_id: outfitId, notes: notes || null })
    if (planError) setToast(planError.message)
    else { await mutate(); setToast('Your look is on the calendar.') }
  }

  const saveProfile = async (name: string, styleProfile: string, palette: string) => {
    if (!user || !name.trim()) return
    setSavingProfile(true)
    const { data: updated, error: updateError } = await supabase.auth.updateUser({ data: { display_name: name.trim(), style_profile: styleProfile, palette } })
    if (updateError) setToast('Your profile could not be saved just now. Please try again.')
    else if (updated.user) {
      setUser({ id: updated.user.id, email: updated.user.email || '', name: name.trim(), styleProfile, palette })
      setToast('Your personal preferences are saved.')
    }
    setSavingProfile(false)
  }

  const signOut = async () => { await supabase.auth.signOut(); setToast('You have signed out.') }
  const navigate = (next: string) => { setPage(next as PageKey); setMobileNav(false); window.scrollTo(0, 0) }

  const renderPage = () => {
    switch (page) {
      case 'wardrobe': return <WardrobeView items={currentData.items} onAdd={openAddItem} onEdit={(item) => setItemEditor({ open: true, item })} onFavorite={toggleFavorite} onDelete={removeItem} />
      case 'studio': return <StudioView items={currentData.items} outfits={currentData.outfits} selection={outfitSelection} setSelection={setOutfitSelection} title={outfitTitle} setTitle={setOutfitTitle} notes={outfitNotes} setNotes={setOutfitNotes} occasion={outfitOccasion} setOccasion={setOutfitOccasion} onSave={saveOutfit} onNeedAuth={showAuth} onNavigate={navigate} />
      case 'generator': return <GeneratorView items={currentData.items} outfits={currentData.outfits} look={generatedLook} setLook={setGeneratedLook} onGenerate={generateLook} onSave={saveGeneratedLook} onNeedAuth={showAuth} generating={generatingLook} isSaving={busy} onNavigate={navigate} onToggleOutfitFavorite={toggleOutfitFavorite} />
      case 'stylist': return <StylistView messages={messages} onAsk={askStylist} loading={stylistLoading} onPrompt={askStylist} signedIn={!!user} onNavigate={navigate} />
      case 'planner': return <PlannerView plans={currentData.plans} outfits={currentData.outfits} onPlan={createPlan} onNeedAuth={() => user ? navigate('studio') : showAuth()} />
      case 'profile': return <ProfileView user={user} items={currentData.items} outfits={currentData.outfits} onSignOut={signOut} onSignIn={showAuth} onSaveProfile={saveProfile} savingProfile={savingProfile} />
      default: return <DashboardView user={user} items={currentData.items} outfits={currentData.outfits} plans={currentData.plans} onAdd={openAddItem} onNavigate={navigate} />
    }
  }

  const currentLabel = ({ home: 'Dashboard', wardrobe: 'The Wardrobe', studio: 'Outfit Canvas', generator: 'AI Outfit Generator', stylist: 'Elena’s Atelier AI', planner: 'Outfit Planner', profile: 'Curator Dossier' } as Record<PageKey, string>)[page]
  return <div className="atelier-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand-lockup"><span className="brand-symbol">A</span><span><strong>ATELIER</strong><small>THE WARDROBE EDIT</small></span><button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
      <button className="closet-switcher"><span className="closet-avatar">{user?.name.slice(0, 1).toUpperCase() || 'A'}</span><span><strong>{user?.name || 'Personal wardrobe'}</strong><small>{user ? 'Personal archive' : 'Preview · sign in to sync'}</small></span><ChevronDown size={15} /></button>
      <nav className="side-navigation" aria-label="Main navigation">{navGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-heading">{group.label}</span>{group.items.map(({ key, label, icon: Icon }) => <button key={key} className={`nav-link ${page === key ? 'active' : ''}`} onClick={() => navigate(key as PageKey)}><Icon size={17} strokeWidth={1.7} /><span>{label}</span>{key === 'wardrobe' && <small>{currentData.items.length}</small>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><button className={`nav-link ${page === 'profile' ? 'active' : ''}`} onClick={() => navigate('profile')}><UserRound size={17} strokeWidth={1.7} /><span>Curator Dossier</span></button><div className="sidebar-account"><span className="account-avatar">{user?.name.slice(0, 1).toUpperCase() || 'A'}</span><div><strong>{user?.name || 'Your Atelier'}</strong><span>{user?.email || 'Sign in to sync'}</span></div><button className="account-settings" onClick={() => navigate('profile')} aria-label="Open profile settings"><Settings2 size={17} /></button></div><span className="sidebar-version">MADE TO BE WORN, AGAIN &amp; AGAIN <span>v2.4.0</span></span></div>
    </aside>

    {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <main className="app-main"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button><span className="breadcrumb-muted">The Atelier</span><span className="breadcrumb-divider">/</span><span>{currentLabel}</span></div><div className="topbar-actions"><span className="today-label">YOUR SEASONAL EDIT</span><button className="topbar-icon" aria-label="Search your wardrobe" onClick={() => navigate('wardrobe')}><Search size={17} /></button><button className="topbar-icon notification-button" aria-label="Notifications"><Bell size={17} /><i /></button>{user ? <button className="topbar-profile" onClick={() => navigate('profile')} aria-label="Open profile"><span className="account-avatar">{user.name.slice(0, 1).toUpperCase()}</span><ChevronDown size={14} /></button> : <button className="topbar-signin" onClick={showAuth}><LogIn size={15} /> Sign in</button>}</div></header>
      <div className="page-content">{isLoading && user ? <div className="loading-bar" aria-label="Loading your wardrobe"><span /></div> : null}{error && <div className="inline-error" role="alert">We couldn&apos;t load your wardrobe. Please try again. <button className="text-button" onClick={() => mutate()}>Retry <ArrowRight size={14} /></button></div>}{renderPage()}<footer className="main-footer"><span>ATELIER · A MORE CONSIDERED CLOSET</span><span>MADE WITH INTENTION</span></footer></div>
      <nav className="mobile-tabbar" aria-label="Quick navigation">{([{ key: 'home', label: 'Home', icon: Home }, { key: 'wardrobe', label: 'Closet', icon: Shirt }, { key: 'studio', label: 'Create', icon: Plus }, { key: 'stylist', label: 'Stylist', icon: Sparkles }, { key: 'profile', label: 'Profile', icon: UserRound }] as const).map(({ key, label, icon: Icon }) => <button key={key} className={page === key || (key === 'studio' && page === 'generator') ? 'active' : ''} onClick={() => navigate(key)}><Icon size={19} strokeWidth={1.7} /><span>{label}</span></button>)}</nav>
    </main>

    {itemEditor.open && <ItemDialog item={itemEditor.item} onClose={() => setItemEditor({ open: false, item: null })} onSave={saveItem} onAnalyze={analyzeImage} busy={busy} onMessage={setToast} />}
    {authMode && <AuthDialog mode={authMode} onModeChange={setAuthMode} onClose={() => setAuthMode(null)} onMessage={setToast} />}
    {toast && <div className="toast-message" role="status"><span className="toast-dot"><Check size={13} /></span>{toast}<button aria-label="Dismiss message" onClick={() => setToast('')}><X size={14} /></button></div>}
  </div>
}

function AuthDialog({ mode, onModeChange, onClose, onMessage }: {
  mode: AuthMode; onModeChange: (mode: AuthMode) => void; onClose: () => void; onMessage: (message: string) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending) return
    setPending(true)
    try {
      if (mode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`, data: { display_name: name.trim() } } })
        if (authError) {
          if (/weak_password/i.test(authError.message)) throw new Error('Choose a stronger password (at least 8 characters).')
          if (/rate limit|over_email_send_rate_limit/i.test(authError.message)) throw new Error('Email sending is temporarily rate limited. Please try again later.')
          if (/invalid email|email_address_invalid/i.test(authError.message)) throw new Error('Enter a valid email address.')
          throw new Error('We couldn’t create your account just now. Please try again.')
        }
        if (data.session) { onMessage('Your private wardrobe is ready.'); onClose(); router.refresh() }
        else setNotice('Check your inbox to confirm your email. Your wardrobe is ready as soon as you verify your account.')
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
        if (authError) {
          if (/email not confirmed/i.test(authError.message)) throw new Error('Please confirm your email from your inbox before signing in.')
          if (/invalid login credentials/i.test(authError.message)) throw new Error('Invalid email or password.')
          if (/rate limit/i.test(authError.message)) throw new Error('Too many attempts. Please wait a moment and try again.')
          throw new Error('We couldn’t sign you in just now. Please try again.')
        }
        onMessage('Welcome back to your Atelier.'); onClose(); router.refresh()
      }
    } catch (authError) { setNotice(authError instanceof Error ? authError.message : 'Something went wrong. Please try again.') }
    finally { setPending(false) }
  }
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !pending) onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, pending])
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose() }}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="icon-button auth-close" aria-label="Close sign-in" onClick={onClose}><X size={18} /></button><div className="auth-brand"><span className="brand-symbol">A</span><span className="eyebrow">THE WARDROBE EDIT</span></div><p className="eyebrow">A MORE CONSIDERED CLOSET</p><h2 id="auth-title">{mode === 'signin' ? 'Welcome back.' : 'Make it yours.'}</h2><p className="auth-lede">{mode === 'signin' ? 'Sign in to find your pieces, just as you left them.' : 'Create your private archive and start your personal edit.'}</p>{notice && <p className="auth-notice" role="status">{notice}</p>}<form onSubmit={submit} onKeyDown={(event) => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault() }}>{mode === 'signup' && <><label className="field-label" htmlFor="auth-name">YOUR NAME</label><input id="auth-name" autoComplete="name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="The name you go by" /> </>}<label className="field-label" htmlFor="auth-email">EMAIL ADDRESS</label><input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><label className="field-label" htmlFor="auth-password">PASSWORD</label><input id="auth-password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'signin' ? 'Your password' : 'At least 8 characters'} /><button className="button button-green full-width auth-submit" disabled={pending}>{pending ? 'One moment…' : mode === 'signin' ? 'Sign in to your archive' : 'Create my archive'} <ArrowRight size={16} /></button></form><p className="auth-switch">{mode === 'signin' ? 'New to Atelier?' : 'Already have an archive?'} <button onClick={() => { onModeChange(mode === 'signin' ? 'signup' : 'signin'); setNotice('') }}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></p><p className="auth-privacy"><span className="online-dot" /> Your wardrobe and photos are private to your account.</p></section></div>
}
