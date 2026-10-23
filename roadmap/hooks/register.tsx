import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RoadmapItem, RoadmapStatus } from '../types'
import { addTask, applyPlan, bar, finishRunning, fromTodos, since, updateTask } from './plan'

const items = atom({ plugin: 'roadmap', key: 'items' } as const, [])
const step = atom({ plugin: 'roadmap', key: 'step' } as const, null)
const isShown = atom({ plugin: 'roadmap', key: 'isShown' } as const, false)

const PLAN_TOOL = 'mcp__ccd_turn__update_plan'
const WRAP_UP_TOOL = 'mcp__ccd_turn__wrap_up'
const LIST_TOOLS = ['TodoWrite', 'TaskCreate', 'TaskUpdate', PLAN_TOOL, WRAP_UP_TOOL]

const COLOR: Record<RoadmapStatus, string> = {
  completed: 'success',
  in_progress: 'claude',
  pending: 'inactive',
}

const ON = ['an', 'on', 'ein', 'show']
const OFF = ['aus', 'off', 'hide']

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'roadmap',
      description: 'Fortschrittsleiste der aktuellen Aufgabenliste ein- oder ausblenden',
      argumentHint: '[an|aus]',
    })

    return next(e)
  })

  on('command.run', { command: 'roadmap' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    const wasShown = await read($, isShown)
    const shown = ON.includes(arg) ? true : OFF.includes(arg) ? false : !wasShown
    await update($, isShown, () => shown)

    return { text: shown ? 'Roadmap-Leiste eingeblendet.' : 'Roadmap-Leiste ausgeblendet.' }
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)

    // Subagents keep lists of their own; the roadmap follows the main session.
    if (e.agentId !== undefined) return next(e)

    if (!LIST_TOOLS.includes(tool)) {
      await update($, step, current => (current === null ? null : { ...current, tools: current.tools + 1 }))

      return next(e)
    }

    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran

    const args = e as unknown as Record<string, unknown>
    await update($, items, list => {
      switch (tool) {
        case 'TodoWrite':
          return Array.isArray(args.todos) ? fromTodos(args.todos) : list
        case 'TaskCreate': {
          const created = (ran.result as { task?: { id?: unknown } } | undefined)?.task
          return typeof created?.id === 'string' && typeof args.subject === 'string'
            ? addTask(list, created.id, args.subject, args.activeForm as string | undefined)
            : list
        }
        case 'TaskUpdate':
          return typeof args.taskId === 'string'
            ? updateTask(list, args as { taskId: string })
            : list
        case PLAN_TOOL:
          return applyPlan(list, args)
        default:
          return finishRunning(list)
      }
    })
    await followCurrent($)

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isShown))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, items)

    if (list.length === 0) {
      return (
        <Box>
          <Text dimColor>Roadmap: noch keine Aufgabenliste in dieser Session.</Text>
        </Box>
      )
    }

    const done = list.filter(item => item.status === 'completed').length
    const percent = Math.round((done / list.length) * 100)
    const width = Math.max(list.length, Math.min(48, e.props.bodyColumns - 32))
    const position = list.findIndex(item => item.status === 'in_progress')
    const current = position >= 0 ? list[position] : undefined
    const open = list
      .map((item, i) => ({ item, n: i + 1 }))
      .filter(({ item }) => item.status === 'pending')
    const running = await read($, step)
    const now = await $.clock.now()

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text bold>Roadmap </Text>
          {bar(list, width).map(run => (
            <Text mono color={COLOR[run.status]}>{run.text}</Text>
          ))}
          <Text>
            {' '}
            {done}/{list.length} erledigt · {percent} %
          </Text>
        </Box>
        {current !== undefined ? (
          <Text wrap="truncate-end">
            <Text color="claude" bold>
              ▶ Jetzt ({position + 1}/{list.length}):{' '}
            </Text>
            {current.title}
            <Text dimColor>{currentDetail(current, running, now)}</Text>
          </Text>
        ) : (
          <Text dimColor={done < list.length} color={done === list.length ? 'success' : undefined}>
            {done === list.length ? '✓ Alle Punkte erledigt' : 'Gerade ist kein Punkt in Arbeit.'}
          </Text>
        )}
        {open.length > 0 && (
          <Text wrap="wrap">
            <Text dimColor>Offen: </Text>
            {open.map(({ item, n }) => `${n}. ${item.title}`).join('  ›  ')}
          </Text>
        )}
      </Box>
    )
  })
}

const currentDetail = (
  current: RoadmapItem,
  running: { title: string; startedAt: number; tools: number } | null,
  now: number,
): string => {
  const parts: string[] = []
  if (current.activeForm && current.activeForm !== current.title) parts.push(current.activeForm)
  if (running !== null && running.title === current.title) {
    parts.push(since(now - running.startedAt))
    parts.push(running.tools === 1 ? '1 Aktion' : `${running.tools} Aktionen`)
  }

  return parts.length > 0 ? `  · ${parts.join(' · ')}` : ''
}

/** A new current item starts its own count; none running clears it. */
const followCurrent = async ($: EngineInterface) => {
  const list = await read($, items)
  const current = list.find(item => item.status === 'in_progress')
  const startedAt = await $.clock.now()
  await update($, step, running =>
    current === undefined
      ? null
      : running !== null && running.title === current.title
        ? running
        : { title: current.title, startedAt, tools: 0 },
  )
}
