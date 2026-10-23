import type { RoadmapItem, RoadmapStatus } from '../types'

const STATUSES: readonly string[] = ['pending', 'in_progress', 'completed']

const asStatus = (value: unknown): RoadmapStatus =>
  typeof value === 'string' && STATUSES.includes(value)
    ? (value as RoadmapStatus)
    : 'pending'

/** TodoWrite: the whole list, every call. */
export const fromTodos = (todos: readonly { content: string; status: string; activeForm?: string }[]): RoadmapItem[] =>
  todos.map(todo => ({
    title: todo.content,
    status: asStatus(todo.status),
    activeForm: todo.activeForm,
  }))

export type PlanUpdate = {
  items?: unknown
  advance?: unknown
  done?: unknown
  start?: unknown
}

/**
 * The desktop app's task list (update_plan): a whole list, or `advance`
 * (finish the running step, start the next open one), or `done`/`start`
 * by 1-based position.
 */
export const applyPlan = (list: readonly RoadmapItem[], update: PlanUpdate): RoadmapItem[] => {
  if (Array.isArray(update.items)) {
    return update.items
      .filter((item): item is { content: string; status?: unknown } =>
        typeof item === 'object' && item !== null && typeof (item as { content?: unknown }).content === 'string')
      .map(item => ({ title: item.content, status: asStatus(item.status) }))
  }

  let next = list.map(item => ({ ...item }))
  const set = (index: number, status: RoadmapStatus) => {
    const item = next[index]
    if (item !== undefined) item.status = status
  }

  if (update.advance === true) {
    const running = next.findIndex(item => item.status === 'in_progress')
    set(running, 'completed')
    set(next.findIndex((item, i) => i > running && item.status === 'pending'), 'in_progress')
  }

  if (Array.isArray(update.done)) {
    for (const n of update.done) {
      if (typeof n === 'number') set(n - 1, 'completed')
    }
  }

  if (typeof update.start === 'number' && next[update.start - 1] !== undefined) {
    next = next.map(item => (item.status === 'in_progress' ? { ...item, status: 'pending' } : item))
    set(update.start - 1, 'in_progress')
  }

  return next
}

/** wrap_up checks off what still runs. */
export const finishRunning = (list: readonly RoadmapItem[]): RoadmapItem[] =>
  list.map(item => (item.status === 'in_progress' ? { ...item, status: 'completed' } : item))

/** TaskCreate: one task appended, by the id the tool answered. */
export const addTask = (list: readonly RoadmapItem[], id: string, title: string, activeForm?: string): RoadmapItem[] => [
  ...list,
  { id, title, status: 'pending', activeForm },
]

/** TaskUpdate: one task changed, or removed on `deleted`. */
export const updateTask = (
  list: readonly RoadmapItem[],
  change: { taskId: string; status?: string; subject?: string; activeForm?: string },
): RoadmapItem[] =>
  change.status === 'deleted'
    ? list.filter(item => item.id !== change.taskId)
    : list.map(item =>
        item.id === change.taskId
          ? {
              ...item,
              title: change.subject ?? item.title,
              status: change.status === undefined ? item.status : asStatus(change.status),
              activeForm: change.activeForm ?? item.activeForm,
            }
          : item,
      )

const GLYPH: Record<RoadmapStatus, string> = { completed: '█', in_progress: '▓', pending: '░' }

/**
 * The bar in list order: one segment per item, filled for done, shaded for
 * the current one, light for open; neighbours of one status share a run.
 */
export const bar = (items: readonly RoadmapItem[], width: number): { status: RoadmapStatus; text: string }[] => {
  const per = Math.max(1, Math.floor(width / Math.max(1, items.length)))
  const runs: { status: RoadmapStatus; text: string }[] = []

  for (const item of items) {
    const last = runs[runs.length - 1]
    const segment = GLYPH[item.status].repeat(per)
    if (last?.status === item.status) last.text += segment
    else runs.push({ status: item.status, text: segment })
  }

  return runs
}

export const since = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'gerade gestartet'
  if (minutes < 60) return `seit ${minutes} min`
  return `seit ${Math.floor(minutes / 60)} h ${minutes % 60} min`
}
