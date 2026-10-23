import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { idFromTitle, parseRoadmap } from '../hooks/plan'

const ROADMAP = `# Roadmap Example Project

Legend: ✅ done · 🔵 in Arbeit · ⏳ waiting

| # | Strang | Issue / PR | Stand | Nächster Schritt |
|---|---|---|---|---|
| A.1 | Access and export | — | ✅ 22.10. | — |
| **B.1** | **Switches** for test mode | #10 / PR #11 | 🔵 PR offen | CI grün → Review |
| B.2 | Mapping old → new | #12 | 🔵 Session-Karte bereit | Schritt 1 → Bau → PR |
| B.3 | Initial import | #13 | ⏳ wartet auf B.1 und B.2 | nach B.2 |
| B.4 | Nightly comparison | #14 | ⏳ wartet auf B.3 | — |
| C.1 | Old idea | — | ⏸️ zurückgestellt | — |

### D.1 — Rollout

## Overview

| Item | Stand |
|---|---|
| **E.1 Rollout** | ✅ live |
| E.2 Push · E.3 Notices | ❌ offen |
| E.4–E.6 Later | ❌ offen |
| A.1 Again | ❌ offen |
`

const BAND = {
  plugin: 'roadmap',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 11 },
    view: {},
  },
} as const

test('the parser reads table rows and headings with their status', async () => {
  const { title, items } = parseRoadmap(ROADMAP)

  expect(title).toBe('Roadmap Example Project')
  expect(items.map(item => `${item.id}:${item.status}`)).toEqual([
    'A.1:done',
    'B.1:active',
    'B.2:active',
    'B.3:open',
    'B.4:open',
    'C.1:paused',
    'D.1:open',
    'E.1:done',
    'E.2:open',
    'E.3:open',
  ])
  expect(items.find(item => item.id === 'E.3')?.title).toBe('Notices')
  expect(items[2]?.title).toBe('Mapping old → new')
  expect(items[2]?.next).toBe('Schritt 1 → Bau → PR')
  expect(idFromTitle('B.2: Mapping des Altsystems')).toBe('B.2')
  expect(idFromTitle('Planung: Cutover')).toBeUndefined()
})


const ok = (stdout: string) => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

/** A repository whose one roadmap is committed on another branch. */
const world = (on: On, store: Record<string, unknown> = {}) => {
  const clock = mock.clock(on, { now: 1761200000000 })
  mock.store(on, store)
  on('command.register', () => ({ value: { command: 'roadmap' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.id', () => ({ value: 's1' }))
  on('classic.UserPromptSubmit', () => ({}))
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')
    if (argv.includes('rev-parse')) return ok('/repo\n')
    if (argv.includes('log --all')) return ok('@abc1234def 1761140000\n\ndocs/roadmap/example.md\n')
    if (argv.includes('status')) return ok('')
    if (argv.includes('show')) return ok(ROADMAP)
    if (argv.includes('name-rev')) return ok('remotes/origin/planning\n')
    return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return clock
}

const roadmap = (args: string) => ({
  command: 'roadmap',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 120 },
})

test('a session title with an item number shows the band by itself', async ($, on) => {
  const clock = world(on)

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.classic.UserPromptSubmit({ prompt: 'los', session_title: 'B.2: Mapping des Altsystems' })
  await clock.advance(10_000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect(await ui.find({ type: 'Text', text: /Roadmap Example Project/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2\/9 erledigt · 22 %/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Diese Session: B\.2/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Nächster Schritt: Schritt 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /🔵 B\.1 Switches/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /origin\/planning @ abc1234/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a file named once shows an overview, and the session keeps it', async ($, on) => {
  world(on)

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.classic.UserPromptSubmit({ prompt: 'los', session_title: 'Planung der Module' })
  const ran = await $.command.run(roadmap('docs/roadmap/example.md'))

  expect(ran.text).toContain('Übersicht von docs/roadmap/example.md')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /2\/9 erledigt/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Diese Session/ })).toBeUndefined()
  await ui.unmount()
})

test('a resumed session shows what it was given before', async ($, on) => {
  const clock = world(on, { 'pin:s1': { file: 'docs/roadmap/example.md', isHidden: false } })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await clock.advance(10_000)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Roadmap Example Project/ })).toBeDefined()
  await ui.unmount()
})

test('without a number or a file the band stays away', async ($, on) => {
  const clock = world(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.classic.UserPromptSubmit({ prompt: 'los', session_title: 'Planung der Module' })
  await clock.advance(10_000)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
