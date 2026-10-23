import type { RoadmapItem, RoadmapStatus } from '../types'

/** An item number as roadmaps write them: `S.5`, `T.2`, `D.3`, `S.9b`. */
const ID = /^([A-Z]{1,3}\.\d+[a-z]?)$/
const TITLE_ID = /^\s*\[?([A-Z]{1,3}\.\d+[a-z]?)\]?(?=[\s:–—-]|$)/

/** The item number a session title starts with: `T.2: Altsystem-Zuordnung` → `T.2`. */
export const idFromTitle = (title: string | null | undefined): string | undefined =>
  title ? TITLE_ID.exec(title)?.[1] : undefined

export const isId = (text: string): boolean => ID.test(text)

/** Markdown down to plain text: links, bold, code, strike-through. */
const plain = (text: string): string =>
  text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const statusOf = (text: string): RoadmapStatus => {
  if (/✅|\[x\]/i.test(text)) return 'done'
  if (/⏸|zurückgestellt|abgelöst|verworfen/i.test(text)) return 'paused'
  if (/🔵|in arbeit|in umsetzung/i.test(text)) return 'active'
  if (/⏳|❓/.test(text)) return 'open'
  if (/\b(gemergt|erledigt|abgeschlossen|done)\b/i.test(text)) return 'done'
  return 'open'
}

const cells = (line: string): string[] => {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map(cell => cell.trim())
}

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line)
const isSeparator = (line: string) => /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(line)

/**
 * The numbered items of a roadmap in file order: table rows whose first cell
 * is a number, headings that start with one, and checklist lines that do.
 * The first mention of a number wins.
 */
export const parseRoadmap = (markdown: string): { title?: string; items: RoadmapItem[] } => {
  const lines = markdown.split(/\r?\n/)
  const items: RoadmapItem[] = []
  const seen = new Set<string>()
  let title: string | undefined
  let header: string[] = []

  const add = (item: RoadmapItem) => {
    if (seen.has(item.id)) return
    seen.add(item.id)
    items.push(item)
  }

  lines.forEach((line, i) => {
    if (title === undefined && /^#\s+/.test(line)) title = plain(line.replace(/^#\s+/, ''))

    if (isTableRow(line)) {
      if (isSeparator(line)) return
      if (isSeparator(lines[i + 1] ?? '')) {
        header = cells(line).map(cell => plain(cell).toLowerCase())
        return
      }

      const row = cells(line)
      const id = plain(row[0] ?? '')
      if (!isId(id)) return

      const column = (pattern: RegExp) => {
        const at = header.findIndex(name => pattern.test(name))
        const cell = at > 0 ? plain(row[at] ?? '') : ''
        return cell === '' || cell === '—' ? undefined : cell
      }

      add({
        id,
        title: plain(row[1] ?? ''),
        status: statusOf(line),
        stand: column(/^(stand|status)$/),
        next: column(/nächster schritt|next/),
      })
      return
    }

    header = []

    const heading = /^#{2,6}\s+(.*)$/.exec(line)
    const check = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line)
    const text = heading?.[1] ?? check?.[2]
    if (text === undefined) return

    const clean = plain(text)
    const id = /^([A-Z]{1,3}\.\d+[a-z]?)(?![\w.])/.exec(clean)?.[1]
    if (id === undefined) return

    add({
      id,
      title: clean.slice(id.length).replace(/^\s*[:–—-]\s*/, ''),
      status: check?.[1]?.toLowerCase() === 'x' ? 'done' : statusOf(text),
    })
  })

  return { title, items }
}

/** How many words of the session title the item's row shares: picks between files. */
export const overlap = (sessionTitle: string, item: RoadmapItem): number => {
  const words = (text: string) =>
    new Set(text.toLowerCase().split(/[^a-zäöüß0-9]+/).filter(word => word.length > 3))
  const theirs = words(`${item.title} ${item.stand ?? ''} ${item.next ?? ''}`)
  return [...words(sessionTitle)].filter(word => theirs.has(word)).length
}

const GLYPH: Record<RoadmapStatus, string> = { done: '█', active: '▒', open: '░', paused: '·' }

/**
 * The bar in file order, one segment per item: filled for done, shaded for
 * in work elsewhere, light for open, dotted for set aside; the session's own
 * item is a run of its own, so it can take its own color.
 */
export const bar = (
  items: readonly RoadmapItem[],
  currentId: string,
  width: number,
): { kind: RoadmapStatus | 'current'; text: string }[] => {
  const per = Math.max(1, Math.floor(width / Math.max(1, items.length)))
  const runs: { kind: RoadmapStatus | 'current'; text: string }[] = []

  for (const item of items) {
    const kind = item.id === currentId ? 'current' : item.status
    const segment = (kind === 'current' ? '▓' : GLYPH[item.status]).repeat(per)
    const last = runs[runs.length - 1]
    if (last?.kind === kind && kind !== 'current') last.text += segment
    else runs.push({ kind, text: segment })
  }

  return runs
}

export const short = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`
