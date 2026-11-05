import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useMemo, type MouseEvent } from 'react'
import { useNavigate } from 'react-router'
import styles from './Markdown.module.css'

marked.setOptions({ gfm: true, breaks: false })

/** Content from the API, rendered as Markdown. Internal links (/slug) navigate inside the app. */
export default function Markdown({ md, inline = false, className }: { md: string; inline?: boolean; className?: string }) {
  const navigate = useNavigate()
  const html = useMemo(() => {
    const raw = inline ? (marked.parseInline(md) as string) : (marked.parse(md) as string)
    return DOMPurify.sanitize(raw)
  }, [md, inline])
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    const href = a?.getAttribute('href')
    if (href && href.startsWith('/') && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      navigate(href)
    }
  }
  const Tag = inline ? 'span' : 'div'
  return <Tag className={`${styles.md} ${className ?? ''}`} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}
