export type RoadmapStatus = 'pending' | 'in_progress' | 'completed'

export type RoadmapItem = {
  title: string
  status: RoadmapStatus
  /** TaskCreate/TaskUpdate: the task's id. */
  id?: string
  /** TodoWrite/TaskUpdate: what is being done right now. */
  activeForm?: string
}

/** Where the current item stands: since when it runs, how many tool calls it took. */
export type RoadmapStep = { title: string; startedAt: number; tools: number }

declare module 'claude-code' {
  interface PluginState {
    roadmap: {
      items: RoadmapItem[]
      step: RoadmapStep | null
      isShown: boolean
    }
  }
}
