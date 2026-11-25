'use client'

import { useEffect, useState } from 'react'
import { Camera, Check, LoaderCircle, Sparkles, Upload, X } from 'lucide-react'
import type { Category, WardrobeItem } from './types'
import { categories } from './types'

export type ItemInput = {
  name: string; category: Category; subcategory: string; primary_color: string; secondary_color: string; pattern: string
  style: string[]; seasons: string[]; occasions: string[]; brand: string; notes: string
}

const blankItem: ItemInput = { name: '', category: 'Tops', subcategory: '', primary_color: '', secondary_color: '', pattern: '', style: [], seasons: [], occasions: [], brand: '', notes: '' }
const tags = (value: string) => value.split(',').map((tag) => tag.trim()).filter(Boolean)

export function ItemDialog({ item, onClose, onSave, onAnalyze, busy, onMessage }: {
  item: WardrobeItem | null; onClose: () => void; onSave: (values: ItemInput, file: File | null) => void
  onAnalyze: (file: File) => Promise<Partial<ItemInput>>; busy: boolean; onMessage: (message: string) => void
}) {
  const [values, setValues] = useState<ItemInput>(() => item ? {
    name: item.name, category: item.category, subcategory: item.subcategory || '', primary_color: item.primary_color || '',
    secondary_color: item.secondary_color || '', pattern: item.pattern || '', style: item.style || [], seasons: item.seasons || [],
    occasions: item.occasions || [], brand: item.brand || '', notes: item.notes || '',
  } : blankItem)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState(item?.image_url || '')
  const [analyzing, setAnalyzing] = useState(false)
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const update = (key: keyof ItemInput, value: string | Category) => setValues((current) => ({ ...current, [key]: value }))
  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0]
    if (!nextFile) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(nextFile.type)) { onMessage('Choose a JPG, PNG, or WebP image.'); return }
    if (nextFile.size > 8 * 1024 * 1024) { onMessage('Images need to be smaller than 8 MB.'); return }
    setFile(nextFile)
  }
  const analyze = async () => {
    if (!file) return
    setAnalyzing(true)
    try {
      const detected = await onAnalyze(file)
      setValues((current) => ({ ...detected, ...Object.fromEntries(Object.entries(current).filter(([key, value]) => key === 'category' ? value !== 'Tops' : value !== '' && (!Array.isArray(value) || value.length))) } as ItemInput))
      onMessage('We found a few details. Take a moment to review them.')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'The image could not be analysed. Try again.')
    } finally { setAnalyzing(false) }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="item-modal" role="dialog" aria-modal="true" aria-labelledby="item-dialog-title">
      <header className="modal-header"><div><p className="eyebrow">YOUR PERSONAL ARCHIVE</p><h2 id="item-dialog-title">{item ? 'Edit a piece' : 'Add a piece'}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></header>
      <form onSubmit={(event) => { event.preventDefault(); onSave(values, file) }} onKeyDown={(event) => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault() }}>
        <div className="item-form-layout"><div className="upload-column"><label className="image-drop" htmlFor="item-image">{preview ? <img src={preview} alt="Selected clothing item preview" /> : <span className="upload-placeholder"><Camera size={25} /><strong>Add a photograph</strong><small>JPG, PNG, WebP · up to 8 MB</small></span>}<span className="upload-edit"><Upload size={14} /> {preview ? 'Change photo' : 'Upload image'}</span></label><input className="visually-hidden" id="item-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} />{file && <><button type="button" className="ai-analyze-button" onClick={analyze} disabled={analyzing}><Sparkles size={15} />{analyzing ? 'Reading details…' : 'Analyse with AI'}</button><button type="button" className="remove-image-button" onClick={() => { setFile(null); setPreview(item?.image_url || '') }}>Remove selected photo</button></>}{item && !file && <p className="upload-hint">Keep the existing photo, or upload a new one.</p>}</div>
          <div className="item-fields"><label className="field-label" htmlFor="item-name">PIECE NAME *</label><input id="item-name" required maxLength={100} value={values.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. The everyday trench" /><div className="form-two-col"><div><label className="field-label" htmlFor="item-category">CATEGORY *</label><select id="item-category" value={values.category} onChange={(event) => update('category', event.target.value as Category)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></div><div><label className="field-label" htmlFor="item-subcategory">SILHOUETTE</label><input id="item-subcategory" value={values.subcategory} onChange={(event) => update('subcategory', event.target.value)} placeholder="Relaxed, tailored…" /></div></div><div className="form-two-col"><div><label className="field-label" htmlFor="item-color">PRIMARY COLOUR</label><input id="item-color" value={values.primary_color} onChange={(event) => update('primary_color', event.target.value)} placeholder="Camel" /></div><div><label className="field-label" htmlFor="item-secondary-color">SECONDARY COLOUR</label><input id="item-secondary-color" value={values.secondary_color} onChange={(event) => update('secondary_color', event.target.value)} placeholder="Optional" /></div></div><label className="field-label" htmlFor="item-brand">BRAND</label><input id="item-brand" value={values.brand} onChange={(event) => update('brand', event.target.value)} placeholder="Optional" /><label className="field-label" htmlFor="item-secondary">PATTERN &amp; DETAILS</label><input id="item-secondary" value={values.pattern} onChange={(event) => update('pattern', event.target.value)} placeholder="Solid, pinstripe, floral…" /><label className="field-label" htmlFor="item-style">STYLE TAGS <span>(comma separated)</span></label><input id="item-style" value={values.style.join(', ')} onChange={(event) => setValues((current) => ({ ...current, style: tags(event.target.value) }))} placeholder="Minimalist, timeless" /><div className="form-two-col"><div><label className="field-label" htmlFor="item-season">SEASONS <span>(comma separated)</span></label><input id="item-season" value={values.seasons.join(', ')} onChange={(event) => setValues((current) => ({ ...current, seasons: tags(event.target.value) }))} placeholder="Autumn, winter" /></div><div><label className="field-label" htmlFor="item-occasion">OCCASIONS <span>(comma separated)</span></label><input id="item-occasion" value={values.occasions.join(', ')} onChange={(event) => setValues((current) => ({ ...current, occasions: tags(event.target.value) }))} placeholder="Office, weekend" /></div></div><label className="field-label" htmlFor="item-notes">PERSONAL NOTES</label><textarea id="item-notes" value={values.notes} onChange={(event) => update('notes', event.target.value)} rows={2} placeholder="How does this piece make you feel?" /></div></div>
        <footer className="modal-footer"><span className="private-note"><span className="online-dot" /> Only visible to you</span><div><button type="button" className="button button-light" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="button button-dark" disabled={busy || analyzing || (!file && !item)}>{busy ? <><LoaderCircle className="spin-icon" size={15} /> Saving…</> : <><Check size={15} /> {item ? 'Save changes' : 'Add to wardrobe'}</>}</button></div></footer>
      </form>
    </section>
  </div>
}
