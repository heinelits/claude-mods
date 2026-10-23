import type { RoadmapStatus, RoadmapView } from '../types'
import { short, summarize } from './plan'

const escape = (text: string): string =>
  text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`)

const LABEL: Record<RoadmapStatus, string> = {
  done: 'erledigt',
  active: 'in Arbeit',
  open: 'offen',
  paused: 'zurückgestellt',
}

/** The page's name: the roadmap's own heading without "Roadmap" and its trailing subtitle. */
export const pageTitle = (view: RoadmapView): string => {
  const core = view.title.replace(/^roadmap\s*[:–—-]?\s*/i, '').split(/\s+[—–]\s+/)[0] ?? ''
  return `Roadmap ${short(core.trim() || view.file.split('/').pop() || 'Projekt', 50)}`
}

/**
 * The roadmap as a page for the side panel, where no band is drawn: the
 * count and bar first, then the session's own item, then every item in
 * file order. Self-contained; colors follow the viewer's theme.
 */
export const asHtml = (view: RoadmapView, updated: string): string => {
  const s = summarize(view, 0)
  const segments = view.items
    .map(item => {
      const kind = item.id === view.currentId ? `${item.status} current` : item.status
      return `<span class="seg ${kind}" title="${escape(`${item.id} ${item.title} · ${LABEL[item.status]}`)}"></span>`
    })
    .join('')

  const rows = view.items
    .map(item => {
      const isCurrent = item.id === view.currentId
      return `<li class="row ${item.status}${isCurrent ? ' current' : ''}">
  <span class="id">${escape(item.id)}</span>
  <span class="what">${escape(item.title || '—')}${item.stand ? `<small>${escape(item.stand)}</small>` : ''}</span>
  <span class="chip ${item.status}">${isCurrent ? 'diese Session' : LABEL[item.status]}</span>
</li>`
    })
    .join('\n')

  const current = s.current
    ? `<section class="mine" aria-label="Diese Session">
  <p class="eyebrow">Diese Session</p>
  <h2><span class="id">${escape(s.current.id)}</span> ${escape(s.current.title)}</h2>
  <dl>
    ${s.current.stand ? `<div><dt>Stand</dt><dd>${escape(s.current.stand)}</dd></div>` : ''}
    ${s.current.next ? `<div><dt>Nächster Schritt</dt><dd>${escape(s.current.next)}</dd></div>` : ''}
  </dl>
</section>`
    : ''

  return `<title>${escape(pageTitle(view))}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
/* One column: count and bar, the session's item, then every item in file order. */
:root {
  --bg: #f6f7f9; --panel: #ffffff; --fg: #1d2330; --muted: #5c6475; --line: #dde1e8;
  --done: #2f8a57; --active: #2f6fd1; --open: #c9ced8; --paused: #e6e8ed; --mine: #b8571c;
  --font: "Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #13161c; --panel: #1b1f27; --fg: #e6e9ef; --muted: #9aa2b2; --line: #2c323d;
  --done: #4fb47c; --active: #6a9ef0; --open: #3a414d; --paused: #262b34; --mine: #e5864a; color-scheme: dark;
} }
:root[data-theme="dark"] {
  --bg: #13161c; --panel: #1b1f27; --fg: #e6e9ef; --muted: #9aa2b2; --line: #2c323d;
  --done: #4fb47c; --active: #6a9ef0; --open: #3a414d; --paused: #262b34; --mine: #e5864a; color-scheme: dark;
}
body { background: var(--bg); color: var(--fg); font: 15px/1.5 var(--font); }
main { max-width: 760px; margin: 0 auto; display: grid; gap: 20px;
  padding-block: 20px 32px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
h1 { font-size: 1.35rem; line-height: 1.25; margin: 0; text-wrap: balance; }
.source { margin: 4px 0 0; color: var(--muted); font: 12px/1.4 var(--mono); overflow-wrap: anywhere; }
.count { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.count strong { font-size: 2rem; font-variant-numeric: tabular-nums; }
.count span { color: var(--muted); font-variant-numeric: tabular-nums; }
.bar { display: flex; gap: 2px; height: 14px; }
.seg { flex: 1; min-width: 3px; border-radius: 2px; background: var(--open); }
.seg.done { background: var(--done); } .seg.active { background: var(--active); } .seg.paused { background: var(--paused); }
.seg.current { background: var(--mine); outline: 2px solid var(--mine); outline-offset: 1px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 8px 0 0; padding: 0; list-style: none; color: var(--muted); font-size: 12px; }
.legend li::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; background: var(--c); }
.mine { background: var(--panel); border: 1px solid var(--mine); border-radius: 6px; padding: 14px 16px; min-width: 0; }
.eyebrow { margin: 0 0 4px; color: var(--mine); font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.mine h2 { margin: 0; font-size: 1.1rem; text-wrap: balance; }
dl { margin: 10px 0 0; display: grid; gap: 8px; }
dt { color: var(--muted); font-size: 12px; } dd { margin: 0; overflow-wrap: anywhere; }
h3 { margin: 0 0 8px; font-size: .8rem; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
ol { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.row { display: grid; grid-template-columns: 4.2em minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 8px 0; border-bottom: 1px solid var(--line); }
.row.paused { color: var(--muted); }
.row.current { background: color-mix(in srgb, var(--mine) 10%, transparent); }
.id { font: 500 13px/1.6 var(--mono); }
.what { min-width: 0; overflow-wrap: anywhere; }
.what small { display: block; color: var(--muted); font-size: 12px; }
.chip { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; white-space: nowrap; border: 1px solid var(--line); color: var(--muted); }
.chip.done { color: var(--done); border-color: var(--done); } .chip.active { color: var(--active); border-color: var(--active); }
.row.current .chip { color: var(--mine); border-color: var(--mine); }
footer { color: var(--muted); font-size: 12px; }
@media (max-width: 420px) { .row { grid-template-columns: 3.6em minmax(0, 1fr); } .chip { grid-column: 2; justify-self: start; } }
</style>
<main>
  <header>
    <h1>${escape(view.title)}</h1>
    <p class="source">${escape(view.file)} · ${escape(view.source)}</p>
  </header>
  <section aria-label="Fortschritt">
    <div class="count"><strong>${s.done} / ${s.counted}</strong><span>erledigt · ${s.percent} %</span></div>
    <div class="bar" role="img" aria-label="${s.done} von ${s.counted} Punkten erledigt">${segments}</div>
    <ul class="legend">
      <li style="--c: var(--done)">erledigt</li>
      ${view.currentId ? '<li style="--c: var(--mine)">diese Session</li>' : ''}
      <li style="--c: var(--active)">in Arbeit</li>
      <li style="--c: var(--open)">offen</li>
      <li style="--c: var(--paused)">zurückgestellt</li>
    </ul>
  </section>
  ${current}
  <section aria-label="Alle Punkte">
    <h3>Alle Punkte in der Reihenfolge der Roadmap</h3>
    <ol>
${rows}
    </ol>
  </section>
  <footer>Stand ${escape(updated)} · /roadmap aktualisiert diese Seite.</footer>
</main>
`
}
