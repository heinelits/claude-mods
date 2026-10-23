import type { EngineInterface } from 'claude-code'

import type { RoadmapView } from '../types'
import { asHtml, pageTitle } from './page'
import { short } from './plan'
import { git, when } from './source'

/** Artifact links are kept per session id in the store; the oldest go past this many. */
const URL_PREFIX = 'artifact:'
const MAX_URLS = 200

/**
 * Writes the roadmap page and publishes it with the Artifact tool, where no
 * band is drawn. The page lives in the repository's git folder, so it never
 * shows as a change in the working copy; one file per session, so each
 * `/roadmap` updates the same artifact.
 */
export async function publishPage(
  $: EngineInterface,
  view: RoadmapView,
  sessionId: string | undefined,
): Promise<{ url?: string; error?: string }> {
  const cwd = await $.session.cwd()
  const gitDir = (await git($, cwd, ['rev-parse', '--absolute-git-dir']))?.trim()
  if (!gitDir) return { error: 'kein Git-Ordner, in dem die Seite liegen kann' }

  const id = (sessionId ?? 'session').replace(/[^\w-]/g, '')
  const file = `${gitDir}/claude-roadmap/roadmap-${id}.html`
  await $.fs.write(file, asHtml(view, when(await $.clock.now())))

  const key = `${URL_PREFIX}${id}`
  const known = await $.store.get(key)
  const ran = await $.tool
    .call({
      tool: 'Artifact',
      action: 'publish',
      file_path: file,
      description: view.currentId
        ? `Fortschritt von ${pageTitle(view)}, aus der diese Session ${view.currentId} abarbeitet.`
        : `Fortschritt von ${pageTitle(view)}.`,
      // The icon goes with the first publish only; a redeploy keeps it.
      ...(typeof known === 'string' ? {} : { icon: 'chart' }),
    })
    .catch((error: unknown) => ({ deny: error instanceof Error ? error.message : String(error) }))

  if (ran.deny !== undefined) return { error: short(ran.deny, 200) }
  if (ran.isError === true) return { error: short(ran.text ?? 'das Artifact-Tool meldete einen Fehler', 200) }

  const url = /https:\/\/claude\.ai\/[^\s)\]"'<>]+/.exec(ran.text ?? '')?.[0] ?? (typeof known === 'string' ? known : undefined)
  if (url !== undefined && url !== known) {
    await $.store.set(key, url)
    const urls = (await $.store.keys()).filter(one => one.startsWith(URL_PREFIX))
    for (const old of urls.slice(0, Math.max(0, urls.length - MAX_URLS))) await $.store.delete(old)
  }

  return { url }
}
