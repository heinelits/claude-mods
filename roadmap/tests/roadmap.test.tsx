import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'roadmap',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

test('the band shows done, current and open items, on every surface', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  on('command.register', () => ({ value: { command: 'roadmap' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({
    command: 'roadmap',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })
  await $.tool.call({
    tool: 'mcp__ccd_turn__update_plan',
    items: [
      { content: 'API lesen', status: 'in_progress' },
      { content: 'Mod schreiben', status: 'pending' },
      { content: 'Testen', status: 'pending' },
    ],
  })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', advance: true })
  await clock.advance(5 * 60_000)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /1\/3 erledigt · 33 %/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /Mod schreiben.*seit 5 min · 2 Aktionen/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /3\. Testen/ }))).toBeDefined()
    await ui.unmount()
  }
})

test('the band stays away until /roadmap', async ($, on) => {
  on('command.register', () => ({ value: { command: 'roadmap' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
