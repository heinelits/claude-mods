import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RoadmapStatus } from '../types'
import { bar, idFromTitle, isId, short } from './plan'
import { findRoadmap } from './source'

const view = atom({ plugin: 'roadmap', key: 'view' } as const, null)
const problem = atom({ plugin: 'roadmap', key: 'problem' } as const, null)
const sessionTitle = atom({ plugin: 'roadmap', key: 'sessionTitle' } as const, null)
const pin = atom({ plugin: 'roadmap', key: 'pin' } as const, {})
const isShown = atom({ plugin: 'roadmap', key: 'isShown' } as const, false)

/** Read again at most this often while shown; a new title or /roadmap reads at once. */
const REFRESH_MS = 2 * 60_000

const COLOR: Record<RoadmapStatus | 'current', string> = {
  done: 'success',
  active: 'suggestion',
  open: 'inactive',
  paused: 'subtle',
  current: 'claude',
}

const ON = ['an', 'on', 'ein', 'show']
const OFF = ['aus', 'off', 'hide']

let lastLoad = 0
let isStale = true

async function reload($: EngineInterface) {
  lastLoad = await $.clock.now()
  isStale = false

  const title = await read($, sessionTitle)
  const pinned = await read($, pin)
  const id = pinned.id ?? idFromTitle(title)

  if (id === undefined) {
    await update($, view, () => null)
    await update($, problem, () =>
      title
        ? `der Session-Titel „${short(title, 40)}“ beginnt mit keiner Punkt-Nummer. /roadmap T.2 legt sie fest.`
        : 'kein Session-Titel bekannt. /roadmap T.2 legt die Punkt-Nummer fest.',
    )
    return
  }

  const found = await findRoadmap($, { id, sessionTitle: title ?? '', file: pinned.file })
  await update($, view, () => found ?? null)
  await update($, problem, () =>
    found
      ? null
      : `Punkt ${id} steht in keiner Roadmap${pinned.file ? ` (${pinned.file})` : ' unter docs/roadmap'}, auf keinem Branch.`,
  )
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
      description: 'Fortschritt der übergreifenden Roadmap, aus der diese Session einen Punkt abarbeitet',
      argumentHint: '[an|aus|T.2|pfad.md|auto]',
    })
    $.clock.every(30_000, () => {
      void (async () => {
        if (!(await read($, isShown))) return
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

  on('command.run', { command: 'roadmap' }, async ($, e) => {
    const arg = (e.args ?? '').trim()
    const word = arg.toLowerCase()

    if (OFF.includes(word) || (word === '' && (await read($, isShown)))) {
      await update($, isShown, () => false)
      return { text: 'Roadmap-Leiste ausgeblendet.' }
    }

    if (isId(arg)) await update($, pin, current => ({ ...current, id: arg }))
    else if (arg.endsWith('.md')) await update($, pin, current => ({ ...current, file: arg.replace(/\\/g, '/') }))
    else if (word === 'auto') await update($, pin, () => ({}))
    else if (word !== '' && !ON.includes(word)) {
      return { text: 'Unbekannt. /roadmap [an|aus|T.2|pfad/zur/roadmap.md|auto]' }
    }

    await update($, isShown, () => true)
    await reload($)

    const shown = await read($, view)
    return {
      text: shown
        ? `Roadmap-Leiste: ${shown.currentId} in ${shown.file} (${shown.source}).`
        : `Roadmap-Leiste eingeblendet, aber ${(await read($, problem)) ?? 'keine Roadmap gefunden.'}`,
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
    const counted = roadmap.items.filter(item => item.status !== 'paused')
    const done = counted.filter(item => item.status === 'done').length
    const percent = counted.length === 0 ? 0 : Math.round((done / counted.length) * 100)
    const current = roadmap.items.find(item => item.id === roadmap.currentId)
    const open = roadmap.items.filter(
      item => item.id !== roadmap.currentId && (item.status === 'open' || item.status === 'active'),
    )
    const width = Math.max(roadmap.items.length, Math.min(60, cols - 24))
    const detail = [current?.stand && `Stand: ${current.stand}`, current?.next && `Nächster Schritt: ${current.next}`]
      .filter(Boolean)
      .join(' · ')

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
            {done}/{counted.length} erledigt · {percent} %
          </Text>
        </Box>
        <Text wrap="truncate-end">
          <Text color="claude" bold>
            ▶ Diese Session: {roadmap.currentId}{' '}
          </Text>
          {current?.title ?? '(nicht in der Roadmap)'}
        </Text>
        {detail !== '' && (
          <Text dimColor wrap="truncate-end">
            {'  '}
            {detail}
          </Text>
        )}
        {open.length > 0 && (
          <Text wrap="wrap">
            <Text dimColor>Offen: </Text>
            {open.map(item => `${item.status === 'active' ? '🔵 ' : ''}${item.id} ${short(item.title, 28)}`).join('  ›  ')}
          </Text>
        )}
        <Text dimColor wrap="truncate-start">
          {roadmap.file} · {roadmap.source}
        </Text>
      </Box>
    )
  })
}
