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
  ])
  expect(items[2]?.title).toBe('Mapping old → new')
  expect(items[2]?.next).toBe('Schritt 1 → Bau → PR')
  expect(idFromTitle('B.2: Mapping des Altsystems')).toBe('B.2')
  expect(idFromTitle('Planung: Cutover')).toBeUndefined()
})

test('the band shows the roadmap the session title points into', async ($, on) => {
  mock.clock(on, { now: 1761200000000 })
  on('command.register', () => ({ value: { command: 'roadmap' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')
    const out = (stdout: string) => ({
      value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    })
    if (argv.includes('rev-parse')) return out('/repo\n')
    if (argv.includes('log --all')) return out('@abc1234def 1761140000\n\ndocs/roadmap/example.md\n')
    if (argv.includes('status')) return out('')
    if (argv.includes('show')) return out(ROADMAP)
    if (argv.includes('name-rev')) return out('remotes/origin/planning\n')
    return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.command.run({
    command: 'roadmap',
    args: 'B.2',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect(await ui.find({ type: 'Text', text: /Roadmap Example Project/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1\/6 erledigt · 17 %/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Diese Session: B\.2/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Nächster Schritt: Schritt 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /🔵 B\.1 Switches/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /origin\/planning @ abc1234/ })).toBeDefined()
    await ui.unmount()
  }
})
