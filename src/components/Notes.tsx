import { useEffect, useState } from 'react'
import { loadEntries, saveEntry, useAutosave } from '../lib/entries.ts'
import styles from './Notes.module.css'

/** A side panel for your own notes on a module; saved per login, a moment after you stop typing. */
export default function Notes({ slug, title, open, onClose }: { slug: string; title: string; open: boolean; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false)
  const [text, setText, status, reset] = useAutosave('', (v) => saveEntry(slug, { kind: 'note', text: v }))
  useEffect(() => {
    const effect = { cancelled: false }
    loadEntries(slug).then((e) => {
      if (effect.cancelled) return
      reset(e.note)
      setLoaded(true)
    })
    return () => {
      effect.cancelled = true
    }
  }, [slug, reset])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <aside className={styles.drawer} aria-label={`Your notes on ${title}`}>
      <div className={styles.head}>
        <strong>Your notes</strong>
        <small className={styles.status}>{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved: retry by typing' : ''}</small>
        <button type="button" onClick={onClose} aria-label="Close notes">
          ✕
        </button>
      </div>
      <p className={styles.hint}>In your own words: what clicked, what surprised you, what to revisit. Notes appear on the cheat sheet. Markdown is fine.</p>
      <textarea
        className={styles.text}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!loaded}
        placeholder={loaded ? 'Start typing…' : 'Loading…'}
      />
    </aside>
  )
}
