import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RoadmapPin, RoadmapStatus } from '../types'
import { asText, bar, idFromTitle, parseArgs, short, summarize } from './plan'
import { findRoadmap } from './source'

const view = atom({ plugin: 'roadmap', key: 'view' } as const, null)
const problem = atom({ plugin: 'roadmap', key: 'problem' } as const, null)
const sessionTitle = atom({ plugin: 'roadmap', key: 'sessionTitle' } as const, null)
const pin = atom({ plugin: 'roadmap', key: 'pin' } as const, {})
const isShown = atom({ plugin: 'roadmap', key: 'isShown' } as const, false)

/** Read again at most this often; a new title or /roadmap reads at once. */
const REFRESH_MS = 2 * 60_000
const TICK_MS = 10_000

/** Pins are kept per session id in the store; the oldest go past this many. */
const PIN_PREFIX = 'pin:'
const MAX_PINS = 200

const COLOR: Record<RoadmapStatus | 'current', string> = {
  done: 'success',
  active: 'suggestion',
  open: 'inactive',
  paused: 'subtle',
  current: 'claude',
}

const USAGE = '/roadmap [an|aus] [T.2] [pfad/zur/roadmap.md] oder /roadmap auto'

let lastLoad = 0
let isStale = true
let sessionId: string | undefined

async function savePin($: EngineInterface, next: RoadmapPin) {
  await update($, pin, () => next)
  if (sessionId === undefined) return

  await $.store.set(`${PIN_PREFIX}${sessionId}`, next)
  const pins = (await $.store.keys()).filter(key => key.startsWith(PIN_PREFIX))
  for (const key of pins.slice(0, Math.max(0, pins.length - MAX_PINS))) await $.store.delete(key)
}

/**
 * Finds the roadmap again and decides whether the band shows: hidden when the
 * person hid it, shown when they asked for it, else shown where a roadmap holds
 * the session title's item.
 */
async function reload($: EngineInterface) {
  lastLoad = await $.clock.now()
  isStale = false

  const title = await read($, sessionTitle)
  const pinned = await read($, pin)
  const id = pinned.id ?? idFromTitle(title)

  const found =
    id === undefined && pinned.file === undefined
      ? undefined
      : await findRoadmap($, { id, sessionTitle: title ?? '', file: pinned.file })

  await update($, view, () => found ?? null)
  await update($, isShown, () => (pinned.isHidden === undefined ? found !== undefined : !pinned.isHidden))
  await update($, problem, () => {
    if (found) return null
    if (pinned.file) return `${pinned.file} gibt es weder in der Arbeitskopie noch auf einem Branch.`
    if (id) return `Punkt ${id} steht in keiner Roadmap unter docs/roadmap, auf keinem Branch.`
    return `${title ? `der Session-Titel „${short(title, 40)}“ nennt keine Punkt-Nummer` : 'kein Session-Titel bekannt'}. ${USAGE} legt fest, was gezeigt wird.`
  })
}

async function noteTitle($: EngineInterface, title: string | undefined) {
  if (title === undefined || title === '') return
  if ((await read($, sessionTitle)) === title) return
  await update($, sessionTitle, () => title)
  isStale = true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'roadmap',
      description: 'Fortschritt der Projekt-Roadmap, aus der diese Session einen Punkt abarbeitet',
      argumentHint: '[an|aus] [T.2] [pfad.md] | auto',
    })

    sessionId = await $.session.id()
    const stored = await $.store.get(`${PIN_PREFIX}${sessionId}`)
    if (typeof stored === 'object' && stored !== null) await update($, pin, () => stored as RoadmapPin)
    isStale = true

    $.clock.every(TICK_MS, () => {
      void (async () => {
        if (isStale || (await $.clock.now()) - lastLoad > REFRESH_MS) await reload($)
      })()
    })

    return next(e)
  })

  // Only reads the title: a failure here must never hold up the session or a prompt.
  on('classic.SessionStart', async ($, e, next) => {
    await noteTitle($, e.session_title)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.UserPromptSubmit', async ($, e, next) => {
    await noteTitle($, e.session_title)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Where a surface draws the band (a local session), the band is the answer;
  // where none does (a cloud session), the roadmap comes back as text.
  on('command.run', { command: 'roadmap' }, async ($, e) => {
    const args = parseArgs(e.args ?? '')
    if ('error' in args) return { text: `Roadmap: ${args.error}. ${USAGE}` }

    const pinned = args.isReset ? {} : await read($, pin)
    const isBare = args.show === undefined && args.id === undefined && args.file === undefined && !args.isReset
    const isDrawn = (await $.session.surfaces()).length > 0

    // A bare /roadmap hides a band that shows; with no band to hide, it only reports.
    const isHidden =
      args.show !== undefined ? !args.show
      : isBare && isDrawn && (await read($, isShown)) ? true
      : args.isReset && !args.id && !args.file ? undefined
      : false

    await savePin($, {
      ...pinned,
      ...(args.id !== undefined && { id: args.id }),
      ...(args.file !== undefined && { file: args.file }),
      ...(isHidden !== undefined && { isHidden }),
    })

    if (isHidden === true) {
      await update($, isShown, () => false)
      return { text: 'Roadmap-Leiste ausgeblendet. /roadmap blendet sie wieder ein.' }
    }

    await reload($)

    const shown = await read($, view)
    if (shown === null) return { text: `Roadmap: ${(await read($, problem)) ?? 'keine Roadmap gefunden.'}` }
    if (!isDrawn) return { text: asText(shown) }

    // The band shows it all; the answer only says what it shows.
    return {
      text: shown.currentId
        ? `Roadmap-Leiste: ${shown.currentId} in ${shown.file} (${shown.source}).`
        : `Roadmap-Leiste: Übersicht von ${shown.file} (${shown.source}).`,
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isShown))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const roadmap = await read($, view)

    if (roadmap === null) {
      const why = await read($, problem)
      return (
        <Box>
          <Text dimColor>Roadmap: {why ?? 'wird gelesen …'}</Text>
        </Box>
      )
    }

    const cols = e.props.bodyColumns
    const width = Math.max(roadmap.items.length, Math.min(60, cols - 24))
    // Two rows of open items at most; a long roadmap ends in a count.
    const { counted, done, percent, current, detail, named, more } = summarize(roadmap, cols * 2 - 20)

    return (
      <Box flexDirection="column">
        <Text bold wrap="truncate-end">
          {roadmap.title}
        </Text>
        <Box flexDirection="row">
          {bar(roadmap.items, roadmap.currentId, width).map(run => (
            <Text mono color={COLOR[run.kind]}>{run.text}</Text>
          ))}
          <Text>
            {' '}
            {done}/{counted} erledigt · {percent} %
          </Text>
        </Box>
        {current !== undefined && (
          <Text wrap="truncate-end">
            <Text color="claude" bold>
              ▶ Diese Session: {current.id}{' '}
            </Text>
            {current.title}
          </Text>
        )}
        {detail !== '' && (
          <Text dimColor wrap="truncate-end">
            {'  '}
            {detail}
          </Text>
        )}
        {named.length > 0 && (
          <Text wrap="wrap">
            <Text dimColor>Offen: </Text>
            {named.join('  ›  ')}
            {more > 0 && <Text dimColor>{`  + ${more} weitere`}</Text>}
          </Text>
        )}
        <Text dimColor wrap="truncate-start">
          {roadmap.file} · {roadmap.source}
        </Text>
      </Box>
    )
  })
}
