import type { EngineInterface } from 'claude-code'

import type { RoadmapView } from '../types'
import { overlap, parseRoadmap } from './plan'

/** Where roadmaps live in a repository. */
const ROADMAP_DIR = 'docs/roadmap'
const ROADMAP_FILES = ['ROADMAP.md', 'docs/ROADMAP.md']
const MAX_FILES = 40

type Candidate = { file: string; source: string; time: number; text: string }

async function git($: EngineInterface, root: string, args: string[]): Promise<string | undefined> {
  const ran = await $.process.run(['git', ...args], { cwd: root, timeoutMs: 15_000 }).catch(() => undefined)
  return ran?.exitCode === 0 ? ran.stdout : undefined
}

const isRoadmapPath = (path: string) =>
  path.endsWith('.md') && (path.startsWith(`${ROADMAP_DIR}/`) || ROADMAP_FILES.includes(path))

/** Markdown files under docs/roadmap (three levels) and the usual ROADMAP.md, for a folder without git. */
async function listFiles($: EngineInterface, root: string): Promise<string[]> {
  const found: string[] = []
  const walk = async (dir: string, depth: number) => {
    const entries = await $.fs.list(`${root}/${dir}`).catch(() => [])
    for (const entry of entries) {
      const path = `${dir}/${entry.name}`
      if (entry.kind === 'dir' && depth < 3) await walk(path, depth + 1)
      else if (entry.kind === 'file' && path.endsWith('.md')) found.push(path)
    }
  }
  await walk(ROADMAP_DIR, 1)
  for (const file of ROADMAP_FILES) {
    if (await $.fs.exists(`${root}/${file}`).catch(() => false)) found.push(file)
  }
  return found.slice(0, MAX_FILES)
}

async function readWorking($: EngineInterface, root: string, file: string): Promise<Candidate | undefined> {
  const text = await $.fs.read(`${root}/${file}`).catch(() => undefined)
  if (text === undefined) return undefined
  const stat = await $.fs.stat(`${root}/${file}`).catch(() => undefined)
  return { file, source: 'Arbeitskopie', time: stat?.mtimeMs ?? 0, text }
}

/**
 * Every roadmap file in its newest committed version across all branches
 * (another session may keep the roadmap on its own branch), and in the
 * working copy where it is changed or not committed at all.
 */
async function candidates($: EngineInterface, root: string, pinned?: string): Promise<Candidate[]> {
  const paths = pinned ? [pinned] : [ROADMAP_DIR, ...ROADMAP_FILES]
  const log = await git($, root, ['log', '--all', '-n', '400', '--format=@%H %ct', '--name-only', '--', ...paths])

  if (log === undefined) {
    const files = pinned ? [pinned] : await listFiles($, root)
    const read = await Promise.all(files.map(file => readWorking($, root, file)))
    return read.filter((one): one is Candidate => one !== undefined)
  }

  const newest = new Map<string, { hash: string; time: number }>()
  let commit = { hash: '', time: 0 }
  for (const line of log.split('\n')) {
    const head = /^@([0-9a-f]+) (\d+)$/.exec(line)
    if (head) commit = { hash: head[1] ?? '', time: Number(head[2]) * 1000 }
    else if (line !== '' && (pinned ? line === pinned : isRoadmapPath(line)) && !newest.has(line)) newest.set(line, commit)
  }

  const status = (await git($, root, ['status', '--porcelain', '--untracked-files=all', '--', ...paths])) ?? ''
  const changed = status
    .split('\n')
    .map(line => line.slice(3).trim())
    .filter(path => path !== '' && (pinned ? path === pinned : isRoadmapPath(path)))

  const fromGit = await Promise.all(
    [...newest]
      .filter(([file]) => !changed.includes(file))
      .slice(0, MAX_FILES)
      .map(async ([file, { hash, time }]) => {
        const text = await git($, root, ['show', `${hash}:${file}`])
        return text === undefined ? undefined : { file, source: hash, time, text }
      }),
  )
  const fromWorking = await Promise.all(changed.map(file => readWorking($, root, file)))

  return [...fromGit, ...fromWorking].filter((one): one is Candidate => one !== undefined)
}

const when = (ms: number): string => {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}. ${two(d.getHours())}:${two(d.getMinutes())}`
}

/** A commit as a person reads it: the branch it is on and its short hash. */
async function label($: EngineInterface, root: string, candidate: Candidate): Promise<string> {
  if (candidate.source === 'Arbeitskopie') return `Arbeitskopie · ${when(candidate.time)}`
  const ref = (await git($, root, ['name-rev', '--name-only', '--exclude=refs/tags/*', candidate.source]))?.trim()
  const branch = ref?.replace(/^remotes\//, '').replace(/[~^]\d*$/, '')
  return `${branch && branch !== 'undefined' ? `${branch} @ ` : ''}${candidate.source.slice(0, 7)} · ${when(candidate.time)}`
}

/**
 * The roadmap that holds item `id`: of the files that hold it, the one whose
 * row and title share the most words with the session title, then the newest.
 * Without an id, the newest version of the one file asked for.
 */
export async function findRoadmap($: EngineInterface,
  wanted: { id?: string; sessionTitle: string; file?: string },
): Promise<RoadmapView | undefined> {
  if (wanted.id === undefined && wanted.file === undefined) return undefined

  const cwd = await $.session.cwd()
  const root = (await git($, cwd, ['rev-parse', '--show-toplevel']))?.trim() || cwd

  const scored = (await candidates($, root, wanted.file))
    .map(candidate => {
      const parsed = parseRoadmap(candidate.text)
      const title = parsed.title ?? candidate.file.split('/').pop() ?? candidate.file
      const item = wanted.id === undefined ? undefined : parsed.items.find(one => one.id === wanted.id)
      // A file asked for by name is shown even where it lacks the id: as an overview.
      const score =
        item !== undefined ? overlap(wanted.sessionTitle, { ...item, title: `${item.title} ${title}` })
        : wanted.file !== undefined ? 0
        : -1
      return { candidate, items: parsed.items, title, score, hasItem: item !== undefined }
    })
    .filter(one => one.score >= 0)
    .sort((a, b) => b.score - a.score || b.candidate.time - a.candidate.time)

  const best = scored[0]
  if (best === undefined) return undefined

  return {
    title: best.title,
    file: best.candidate.file,
    source: await label($, root, best.candidate),
    items: best.items,
    currentId: best.hasItem ? wanted.id : undefined,
  }
}
