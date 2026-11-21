import { createElement, useMemo } from 'react'
import type { ReactNode } from 'react'

// Remote HTML is data, never markup injected into the privileged app webview.
const allowed = new Set(['p', 'pre', 'code', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'br', 'sup', 'sub', 'h2', 'h3', 'table', 'tbody', 'tr', 'td', 'th', 'blockquote'])
const ignored = new Set(['script', 'style', 'iframe', 'object', 'svg', 'form', 'input', 'button'])
const emptyImages: Record<string, string> = Object.freeze({})
export function statementText(html: string) {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  body.querySelectorAll('script,style,iframe,object').forEach(node => node.remove())
  body.querySelectorAll('br,p,pre,div,li').forEach(node => node.append('\n'))
  return body.textContent ?? ''
}
function renderNode(node: Node, key: number, images: Record<string, string>, depth = 0): ReactNode {
  if (depth > 50) return null
  if (node.nodeType === Node.TEXT_NODE) return node.textContent
  if (!(node instanceof Element)) return null
  const tag = node.tagName.toLowerCase()
  if (ignored.has(tag)) return null
  if (tag === 'img') {
    const source = images[node.getAttribute('src') ?? '']
    return source && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(source)
      ? <img key={key} src={source} alt={node.getAttribute('alt') || 'Problem diagram'} loading="lazy" />
      : <span className="offline-image-note" key={key}>[Diagram unavailable offline — refresh this saved problem while connected]</span>
  }
  const children = Array.from(node.childNodes).map((child, i) => renderNode(child, i, images, depth + 1))
  return createElement(allowed.has(tag) ? tag : 'span', { key }, tag === 'br' ? undefined : children)
}
export function Statement({ html, images = emptyImages }: { html: string; images?: Record<string, string> }) {
  const content = useMemo(() => Array.from(new DOMParser().parseFromString(html, 'text/html').body.childNodes).map((node, i) => renderNode(node, i, images)), [html, images])
  return <div className="offline-statement-content">{content}</div>
}
