import type { RoadmapItem, RoadmapStatus, RoadmapView } from '../types'

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
  if (/🔵|🔄|in arbeit|in umsetzung/i.test(text)) return 'active'
  if (/⏳|❓|❌/.test(text)) return 'open'
  if (/\b(gemergt|erledigt|abgeschlossen|done)\b/i.test(text)) return 'done'
  return 'open'
}

const cells = (line: string): string[] => {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map(cell => cell.trim())
}

/**
 * The items a first cell names: `T.2`, `R.1 Rundgang`, or several with their
 * own titles (`D.11 Status · D.13 Kunde`, `D.3 / D.9`). A range (`R.2–R.4`)
 * names none, as its members are not spelled out.
 */
const named = (cell: string): { id: string; title: string }[] =>
  plain(cell)
    .split(/\s+[·/]\s+/)
    .map(part => /^([A-Z]{1,3}\.\d+[a-z]?)(?![\w.])\s*(.*)$/.exec(part))
    .filter((match): match is RegExpExecArray => match !== null && !/^[–-]/.test(match[2] ?? ''))
    .map(match => ({ id: match[1] ?? '', title: (match[2] ?? '').replace(/^[:–—-]\s*/, '') }))

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line)
const isSeparator = (line: string) => /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(line)

/**
 * The numbered items of a roadmap in file order: table rows whose first cell
 * starts with a number, headings that start with one, and checklist lines
 * that do. The first mention of a number sets its status; a later one only
 * fills in a title or a column the first lacked.
 */
export const parseRoadmap = (markdown: string): { title?: string; items: RoadmapItem[] } => {
  const lines = markdown.split(/\r?\n/)
  const items: RoadmapItem[] = []
  let title: string | undefined
  let header: string[] = []

  const add = (item: RoadmapItem) => {
    const known = items.find(one => one.id === item.id)
    if (known === undefined) {
      items.push(item)
      return
    }
    if (known.title === '') known.title = item.title
    known.stand ??= item.stand
    known.next ??= item.next
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
      const column = (pattern: RegExp) => {
        const at = header.findIndex(name => pattern.test(name))
        const cell = at > 0 ? plain(row[at] ?? '') : ''
        return cell === '' || cell === '—' ? undefined : cell
      }

      for (const { id, title: own } of named(row[0] ?? '')) {
        add({
          id,
          // A bare number takes the next cell as its title; `R.1 Rundgang` brings its own.
          title: own !== '' ? own : isId(plain(row[0] ?? '')) ? plain(row[1] ?? '') : '',
          status: statusOf(line),
          stand: column(/^(stand|status)$/),
          next: column(/nächster schritt|next/),
        })
      }
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
  currentId: string | undefined,
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

export type Summary = {
  counted: number
  done: number
  percent: number
  current?: RoadmapItem
  /** The session's item: its Stand and Nächster Schritt, joined. */
  detail: string
  /** Open items as labels, as many as fit in `room` characters. */
  named: string[]
  /** Open items past `room`. */
  more: number
}

/** What the band and the command's text both show, with `room` characters for the open items. */
export const summarize = (view: RoadmapView, room: number): Summary => {
  const counted = view.items.filter(item => item.status !== 'paused')
  const done = counted.filter(item => item.status === 'done').length
  const current = view.items.find(item => item.id === view.currentId)
  const open = view.items.filter(
    item => item.id !== view.currentId && (item.status === 'open' || item.status === 'active'),
  )

  const named: string[] = []
  for (const item of open) {
    const label = `${item.status === 'active' ? '🔵 ' : ''}${item.id} ${short(item.title, 28)}`.trim()
    if ([...named, label].join('  ›  ').length > room && named.length > 0) break
    named.push(label)
  }

  return {
    counted: counted.length,
    done,
    percent: counted.length === 0 ? 0 : Math.round((done / counted.length) * 100),
    current,
    detail: [current?.stand && `Stand: ${current.stand}`, current?.next && `Nächster Schritt: ${current.next}`]
      .filter(Boolean)
      .join(' · '),
    named,
    more: open.length - named.length,
  }
}

/**
 * The roadmap as plain lines, for the command's own answer: where no surface
 * draws the band (a cloud session), this is all the person sees.
 */
export const asText = (view: RoadmapView): string => {
  const s = summarize(view, 400)
  const glyphs = bar(view.items, view.currentId, Math.min(40, Math.max(view.items.length, 20)))
    .map(run => run.text)
    .join('')

  return [
    view.title,
    `${glyphs}  ${s.done}/${s.counted} erledigt · ${s.percent} %`,
    `█ erledigt  ${view.currentId ? '▓ diese Session  ' : ''}▒ in Arbeit  ░ offen  · zurückgestellt`,
    s.current && `▶ Diese Session: ${s.current.id} ${s.current.title}`,
    s.detail && `  ${s.detail}`,
    s.named.length > 0 && `Offen: ${s.named.join('  ›  ')}${s.more > 0 ? `  + ${s.more} weitere` : ''}`,
    `${view.file} · ${view.source}`,
  ]
    .filter((line): line is string => typeof line === 'string' && line !== '')
    .join('\n')
}

export type RoadmapArgs =
  | { show?: boolean; id?: string; file?: string; isReset?: boolean }
  | { error: string }

const ON = ['an', 'on', 'ein', 'show']
const OFF = ['aus', 'off', 'hide']

/**
 * `/roadmap`'s arguments one by one, in any order: an/aus, one item number,
 * one `.md` path (without spaces), auto. Anything else is an error, and
 * nothing is kept from a line with one.
 */
export const parseArgs = (args: string): RoadmapArgs => {
  const parsed: { show?: boolean; id?: string; file?: string; isReset?: boolean } = {}

  for (const token of args.trim().split(/\s+/).filter(Boolean)) {
    const word = token.toLowerCase()
    if (ON.includes(word) || OFF.includes(word)) {
      if (parsed.show !== undefined) return { error: 'an oder aus nur einmal' }
      parsed.show = ON.includes(word)
    } else if (isId(token)) {
      if (parsed.id !== undefined) return { error: `nur eine Punkt-Nummer, nicht ${parsed.id} und ${token}` }
      parsed.id = token
    } else if (word.endsWith('.md')) {
      if (parsed.file !== undefined) return { error: 'nur eine Roadmap-Datei' }
      parsed.file = token.replace(/\\/g, '/').replace(/^\.\//, '')
    } else if (word === 'auto') {
      parsed.isReset = true
    } else {
      return { error: `unbekannt: „${short(token, 40)}“` }
    }
  }

  return parsed
}
