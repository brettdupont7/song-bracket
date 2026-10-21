// The tournament: group rounds (pick 1 of ~4, plus optional wildcards) until 64
// songs remain, then a 1-on-1 bracket, then a runner-up playoff for further places.

export interface Song {
  id: string
  title: string
  artist: string
  album?: string
  /** Spotify track ID, for playing the song and linking to it. */
  spotifyId?: string
}

export interface Group {
  songs: string[]
  winner?: string
  /** Songs picked to advance alongside the winner. */
  wildcards: string[]
  /** When the group was decided (higher is later). Absent for a lone song, which advances on its own. */
  seq?: number
}

export interface Round {
  kind: 'groups' | 'bracket'
  groups: Group[]
}

export interface Place {
  song: string
  seq: number
}

export interface Tournament {
  version: 1
  songs: Record<string, Song>
  rounds: Round[]
  /** Champion first, then any places found with the runner-up playoff. */
  places: Place[]
  seq: number
  createdAt: string
}

export type Rng = () => number

export const BRACKET_SIZE = 64
export const GROUP_SIZE = 4
/** The largest groups the round that lands on the bracket may use. */
export const MAX_LANDING_GROUP = 8

/** How many groups a round of `n` songs uses, or null when it's time for the bracket. */
export function groupCountFor(n: number): number | null {
  if (n <= BRACKET_SIZE) return null
  if (n <= BRACKET_SIZE * MAX_LANDING_GROUP) return BRACKET_SIZE
  return Math.ceil(n / GROUP_SIZE)
}

export function nextPow2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Deals songs into `count` groups as evenly as possible. Songs in the same cluster
 * (a group's winner and its wildcards) are dealt next to each other, so they land
 * in different groups.
 */
export function deal(clusters: string[][], count: number, rng: Rng): string[][] {
  const order = shuffle(clusters, rng).flatMap((c) => shuffle(c, rng))
  const groups: string[][] = Array.from({ length: count }, () => [])
  order.forEach((id, i) => groups[i % count].push(id))
  return groups
}

/**
 * Deals a group round: each cluster's first song (the group winner) is dealt first,
 * then the wildcards, so every group gets about the same number of each. A wildcard
 * never shares a group with the song it advanced with.
 */
export function dealGroups(clusters: string[][], count: number, rng: Rng): string[][] {
  const order = shuffle(clusters, rng)
  const clusterOf = new Map<string, number>()
  order.forEach((c, i) => c.forEach((id) => clusterOf.set(id, i)))
  const groups: string[][] = Array.from({ length: count }, () => [])
  const leads = order.map((c) => c[0])
  leads.forEach((id, i) => groups[i % count].push(id))
  const extras = shuffle(
    order.flatMap((c) => c.slice(1)),
    rng,
  )
  extras.forEach((id, k) => groups[(leads.length + k) % count].push(id))

  // Swap any wildcard that landed with a song from its own cluster for one elsewhere.
  const clash = (g: string[], id: string) => g.some((x) => x !== id && clusterOf.get(x) === clusterOf.get(id))
  const isExtra = new Set(extras)
  for (let g = 0; g < count; g++) {
    for (const id of groups[g].filter((x) => isExtra.has(x) && clash(groups[g], x))) {
      for (let h = 0; h < count; h++) {
        if (h === g) continue
        const other = groups[h].find(
          (y) =>
            isExtra.has(y) &&
            !groups[g].some((x) => x !== id && clusterOf.get(x) === clusterOf.get(y)) &&
            !groups[h].some((x) => x !== y && clusterOf.get(x) === clusterOf.get(id)),
        )
        if (other) {
          groups[g][groups[g].indexOf(id)] = other
          groups[h][groups[h].indexOf(other)] = id
          break
        }
      }
    }
  }
  return groups
}

function bitReverse(i: number, bits: number): number {
  let r = 0
  for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1)
  return r
}

function makeGroups(lists: string[][]): Group[] {
  return lists.map((songs) =>
    songs.length === 1 ? { songs, winner: songs[0], wildcards: [] } : { songs, wildcards: [] },
  )
}

/** Draws the next round from the songs that advanced, or returns the champion if one song is left. */
function drawRound(clusters: string[][], rng: Rng): Round | string {
  const n = clusters.reduce((sum, c) => sum + c.length, 0)
  if (n === 1) return clusters.flat()[0]
  const count = groupCountFor(n)
  if (count !== null) return { kind: 'groups', groups: makeGroups(dealGroups(clusters, count, rng)) }
  // Bit-reversing the dealt order puts neighbours (a winner and its wildcard) in
  // opposite halves of the bracket and spreads any byes evenly.
  const matches = nextPow2(n) / 2
  const bits = Math.log2(matches)
  const slots: string[][] = new Array(matches)
  deal(clusters, matches, rng).forEach((songs, i) => {
    slots[bitReverse(i, bits)] = songs
  })
  return { kind: 'bracket', groups: makeGroups(slots) }
}

export function advancers(g: Group): string[] {
  return g.winner ? [g.winner, ...g.wildcards] : []
}

export function startTournament(songs: Song[], rng: Rng): Tournament {
  if (songs.length < 2) throw new Error('Add at least two songs.')
  const first = drawRound(
    songs.map((s) => [s.id]),
    rng,
  ) as Round
  return {
    version: 1,
    songs: Object.fromEntries(songs.map((s) => [s.id, s])),
    rounds: [first],
    places: [],
    seq: 0,
    createdAt: new Date().toISOString(),
  }
}

export function currentRound(t: Tournament): Round {
  return t.rounds[t.rounds.length - 1]
}

export function wildcardLimit(round: Round, group: Group): number {
  return round.kind === 'groups' && group.songs.length >= 3 ? group.songs.length - 2 : 0
}

function completeRound(t: Tournament, rng: Rng): Tournament {
  const last = currentRound(t)
  if (!last.groups.every((g) => g.winner)) return t
  let next: Round | string
  if (last.kind === 'bracket') {
    const winners = last.groups.map((g) => g.winner!)
    next =
      winners.length === 1
        ? winners[0]
        : {
            kind: 'bracket',
            groups: makeGroups(
              Array.from({ length: winners.length / 2 }, (_, i) => [winners[2 * i], winners[2 * i + 1]]),
            ),
          }
  } else {
    next = drawRound(last.groups.map(advancers), rng)
  }
  if (typeof next === 'string') return { ...t, places: [{ song: next, seq: t.seq }] }
  return { ...t, rounds: [...t.rounds, next] }
}

/** Decides a group in the current round. Deciding the round's last group draws the next round. */
export function decide(
  t: Tournament,
  groupIndex: number,
  winner: string,
  wildcards: string[],
  rng: Rng,
): Tournament {
  if (t.places.length) throw new Error('The tournament is over.')
  const r = t.rounds.length - 1
  const round = t.rounds[r]
  const group = round.groups[groupIndex]
  if (!group || group.songs.length < 2) throw new Error('No such group.')
  if (!group.songs.includes(winner)) throw new Error('The winner must be in the group.')
  const wild = [...new Set(wildcards)]
  if (wild.length > wildcardLimit(round, group) || wild.some((w) => w === winner || !group.songs.includes(w)))
    throw new Error('Invalid wildcards.')
  const seq = t.seq + 1
  const groups = round.groups.slice()
  groups[groupIndex] = { ...group, winner, wildcards: wild, seq }
  const rounds = t.rounds.slice()
  rounds[r] = { ...round, groups }
  return completeRound({ ...t, rounds, seq }, rng)
}

/** A round can be redrawn while none of its groups has been picked and it was drawn from a group round. */
export function canRedraw(t: Tournament): boolean {
  if (t.places.length || t.rounds.length < 2) return false
  const prev = t.rounds[t.rounds.length - 2]
  return prev.kind === 'groups' && currentRound(t).groups.every((g) => g.seq === undefined)
}

/** Draws the current round again from the songs that advanced from the previous one. */
export function redraw(t: Tournament, rng: Rng): Tournament {
  if (!canRedraw(t)) throw new Error('This round already has picks.')
  const next = drawRound(t.rounds[t.rounds.length - 2].groups.map(advancers), rng) as Round
  return { ...t, rounds: [...t.rounds.slice(0, -1), next] }
}

export function canUndo(t: Tournament): boolean {
  return t.rounds.some((round) => round.groups.some((g) => g.seq !== undefined))
}

/** Undoes the latest pick: a place, or a group (dropping any round drawn after it). */
export function undo(t: Tournament): Tournament {
  if (t.places.length > 1) return { ...t, places: t.places.slice(0, -1) }
  let best = -1
  let at = null as [number, number] | null
  t.rounds.forEach((round, r) =>
    round.groups.forEach((g, i) => {
      if (g.seq !== undefined && g.seq > best) {
        best = g.seq
        at = [r, i]
      }
    }),
  )
  if (!at) return t
  const [r, i] = at
  const rounds = t.rounds.slice(0, r + 1)
  const groups = rounds[r].groups.slice()
  groups[i] = { songs: groups[i].songs, wildcards: [] }
  rounds[r] = { ...rounds[r], groups }
  return { ...t, rounds, places: [] }
}

export interface Elimination {
  round: number
  /** The songs that advanced from the group or match this song went out in. */
  by: string[]
}

export function eliminations(t: Tournament): Map<string, Elimination> {
  const out = new Map<string, Elimination>()
  t.rounds.forEach((round, r) =>
    round.groups.forEach((g) => {
      const by = advancers(g)
      if (!by.length) return
      for (const s of g.songs) if (!by.includes(s)) out.set(s, { round: r, by })
    }),
  )
  return out
}

/**
 * Songs that could be the next place: every song that knocked them out is already
 * placed. Whatever deserves the next place must be among these.
 */
export function placeCandidates(t: Tournament): string[] {
  if (!t.places.length) return []
  const placed = new Set(t.places.map((p) => p.song))
  const out: string[] = []
  for (const [song, e] of eliminations(t))
    if (!placed.has(song) && e.by.every((s) => placed.has(s))) out.push(song)
  return out
}

export function pickPlace(t: Tournament, song: string): Tournament {
  if (!placeCandidates(t).includes(song)) throw new Error('That song cannot take this place.')
  const seq = t.seq + 1
  return { ...t, seq, places: [...t.places, { song, seq }] }
}

export interface PlanStep {
  kind: 'groups' | 'bracket'
  songs: number
  groups: number
  picks: number
}

/** The rounds ahead for `n` songs entering a fresh round, assuming no wildcards. */
export function plan(n: number): PlanStep[] {
  const steps: PlanStep[] = []
  while (n > 1) {
    const count = groupCountFor(n)
    if (count === null) {
      steps.push({ kind: 'bracket', songs: n, groups: nextPow2(n) / 2, picks: n - 1 })
      break
    }
    const lone = Math.max(0, 2 * count - n)
    steps.push({ kind: 'groups', songs: n, groups: count, picks: count - lone })
    n = count
  }
  return steps
}

export function picksMade(t: Tournament): number {
  return t.rounds.reduce((sum, round) => sum + round.groups.filter((g) => g.seq !== undefined).length, 0)
}

/** Picks left until the champion is found, assuming no further wildcards. */
export function picksLeft(t: Tournament): number {
  if (t.places.length) return 0
  const round = currentRound(t)
  const pending = round.groups.filter((g) => !g.winner).length
  if (round.kind === 'bracket') return pending + round.groups.length - 1
  const n = round.groups.reduce((sum, g) => sum + (g.winner ? advancers(g).length : 1), 0)
  return pending + plan(n).reduce((sum, s) => sum + s.picks, 0)
}

export function bracketRoundName(matches: number): string {
  const size = matches * 2
  if (size === 2) return 'Final'
  if (size === 4) return 'Semifinals'
  if (size === 8) return 'Quarterfinals'
  return `Round of ${size}`
}

export function roundName(t: Tournament, r: number): string {
  const round = t.rounds[r]
  if (round.kind === 'bracket') return bracketRoundName(round.groups.length)
  const isPlayIn = (x: Round) => x.groups.every((g) => g.songs.length <= 2)
  if (isPlayIn(round)) return 'Play-in'
  return `Round ${t.rounds.slice(0, r + 1).filter((x) => x.kind === 'groups' && !isPlayIn(x)).length}`
}
