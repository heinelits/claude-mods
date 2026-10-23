/**
 * done: a check mark, [x] or a done word · active: a blue dot or "in Arbeit"
 * (any session) · paused: a pause mark, zurückgestellt, abgelöst · open: the rest.
 */
export type RoadmapStatus = 'done' | 'active' | 'open' | 'paused'

export type RoadmapItem = {
  /** The item's number in the roadmap, `T.2`. */
  id: string
  title: string
  status: RoadmapStatus
  /** The row's "Stand"/"Status" cell, when its table has one. */
  stand?: string
  /** The row's "Nächster Schritt" cell, when its table has one. */
  next?: string
}

export type RoadmapView = {
  /** The roadmap's own `# ` heading, else its file name. */
  title: string
  /** Path relative to the repository root. */
  file: string
  /** Where it was read: the working copy, or a branch and commit. */
  source: string
  items: RoadmapItem[]
  /** The item this session works on; absent in an overview of the whole roadmap. */
  currentId?: string
}

/**
 * What `/roadmap` fixed for this session, over what the title says; kept in
 * the store under the session's id, so a resumed session keeps it.
 */
export type RoadmapPin = { id?: string; file?: string; isHidden?: boolean }

declare module 'claude-code' {
  interface PluginState {
    roadmap: {
      view: RoadmapView | null
      /** Why there is no view, in words for the band. */
      problem: string | null
      sessionTitle: string | null
      pin: RoadmapPin
      isShown: boolean
    }
  }
}
