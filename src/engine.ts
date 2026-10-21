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
  /** For a seeded bracket: its songs from seed 1 down. */
  seeds?: string[]
  /** For a seeded bracket or play-in: each song's rating when the round was drawn. */
  ratings?: Record<string, number>
}

/** How the play-in and bracket are drawn: by ratings from your picks (the default), or at random. */
export type Seeding = 'rated' | 'random'

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
  seeding?: Seeding
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

/**
 * Rates every song from all picks so far with a Bradley–Terry model: in each decided
 * group the winner beat everyone else, and wildcards beat the songs that went out.
 * Each song also gets one win and one loss against a 1500-rated anchor, which keeps
 * unbeaten and winless songs finite. Ratings are on an Elo-like scale around 1500.
 */
export function ratings(t: Tournament): Map<string, number> {
  const ids = Object.keys(t.songs)
  const index = new Map(ids.map((id, i) => [id, i]))
  const winner: number[] = []
  const loser: number[] = []
  for (const round of t.rounds)
    for (const g of round.groups) {
      if (!g.winner || g.songs.length < 2) continue
      const tier = (s: string) => (s === g.winner ? 0 : g.wildcards.includes(s) ? 1 : 2)
      for (const x of g.songs)
        for (const y of g.songs)
          if (tier(x) < tier(y)) {
            winner.push(index.get(x)!)
            loser.push(index.get(y)!)
          }
    }
  const n = ids.length
  const wins = new Float64Array(n).fill(1)
  for (const i of winner) wins[i]++
  let p = new Float64Array(n).fill(1)
  // Minorization–maximization (Hunter, 2004): converges to the maximum-likelihood strengths.
  for (let iter = 0; iter < 500; iter++) {
    const denom = new Float64Array(n)
    for (let i = 0; i < n; i++) denom[i] = 2 / (p[i] + 1)
    for (let k = 0; k < winner.length; k++) {
      const s = 1 / (p[winner[k]] + p[loser[k]])
      denom[winner[k]] += s
      denom[loser[k]] += s
    }
    const next = new Float64Array(n)
    let change = 0
    for (let i = 0; i < n; i++) {
      next[i] = wins[i] / denom[i]
      change = Math.max(change, Math.abs(Math.log(next[i] / p[i])))
    }
    p = next
    if (change < 1e-7) break
  }
  return new Map(ids.map((id, i) => [id, 1500 + 400 * Math.log10(p[i])]))
}

/** Bracket positions for seeds 1..size, so that seed 1 meets seed `size` and the top two meet last. */
export function seedOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const sum = order.length * 2 + 1
    order = order.flatMap((s) => [s, sum - s])
  }
  return order
}

const byRating = (rating: Map<string, number>) => (x: string, y: string) =>
  rating.get(y)! - rating.get(x)! || x.localeCompare(y, undefined, { numeric: true })

const ratingsOf = (ids: string[], rating: Map<string, number>) =>
  Object.fromEntries(ids.map((id) => [id, Math.round(rating.get(id)!)]))

function seededBracket(ids: string[], rating: Map<string, number>): Round {
  const seeds = ids.slice().sort(byRating(rating))
  const order = seedOrder(nextPow2(seeds.length))
  const lists = Array.from({ length: order.length / 2 }, (_, m) =>
    [order[2 * m], order[2 * m + 1]].filter((s) => s <= seeds.length).map((s) => seeds[s - 1]),
  )
  return { kind: 'bracket', groups: makeGroups(lists), seeds, ratings: ratingsOf(seeds, rating) }
}

/**
 * A seeded play-in: the highest-rated group winners get byes, and wildcards play the
 * lowest-rated winners, best wildcard against worst winner. A wildcard never plays
 * the song it advanced with.
 */
function seededPlayIn(clusters: string[][], rating: Map<string, number>): Round {
  const leads = clusters.map((c) => c[0]).sort(byRating(rating))
  const extras = clusters.flatMap((c) => c.slice(1)).sort(byRating(rating))
  const clusterOf = new Map(clusters.flatMap((c, i) => c.map((id) => [id, i] as const)))
  const slots = leads.map((id) => [id])
  // Best wildcard → last slot, next → second-to-last, and so on.
  const target = extras.map((_, k) => slots.length - 1 - k)
  const clash = (k: number) => clusterOf.get(slots[target[k]][0]) === clusterOf.get(extras[k])
  for (let k = 0; k < extras.length; k++)
    if (clash(k)) {
      const j = k + 1 < extras.length ? k + 1 : k - 1
      if (j >= 0) [target[k], target[j]] = [target[j], target[k]]
    }
  extras.forEach((id, k) => slots[target[k]].push(id))
  return { kind: 'groups', groups: makeGroups(slots), ratings: ratingsOf(clusters.flat(), rating) }
}

/**
 * Draws the next round from the songs that advanced, or returns the champion if one
 * song is left. With `rate`, the play-in and bracket are seeded by rating.
 */
function drawRound(clusters: string[][], rng: Rng, rate?: () => Map<string, number>): Round | string {
  const n = clusters.reduce((sum, c) => sum + c.length, 0)
  if (n === 1) return clusters.flat()[0]
  const count = groupCountFor(n)
  if (count !== null) {
    const isPlayIn = count === BRACKET_SIZE && n <= 2 * BRACKET_SIZE && clusters.length === count
    if (rate && isPlayIn) return seededPlayIn(clusters, rate())
    return { kind: 'groups', groups: makeGroups(dealGroups(clusters, count, rng)) }
  }
  if (rate) return seededBracket(clusters.flat(), rate())
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

const rater = (t: Tournament) => (t.seeding === 'random' ? undefined : () => ratings(t))

/** True for a round of 1-on-1s and byes that trims the field to the bracket. */
export function isPlayIn(round: Round): boolean {
  return round.kind === 'groups' && round.groups.every((g) => g.songs.length <= 2)
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
    next = drawRound(last.groups.map(advancers), rng, rater(t))
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
  const next = drawRound(t.rounds[t.rounds.length - 2].groups.map(advancers), rng, rater(t)) as Round
  return { ...t, rounds: [...t.rounds.slice(0, -1), next] }
}

/** Seed numbers from a seeded bracket, if there is one. */
export function seedNumbers(t: Tournament): Map<string, number> {
  const seeds = t.rounds.find((r) => r.kind === 'bracket')?.seeds ?? []
  return new Map(seeds.map((id, i) => [id, i + 1]))
}

/** Whether the current round is a play-in or bracket that hasn't started, so its seeding can still change. */
export function canReseed(t: Tournament): boolean {
  const round = currentRound(t)
  return canRedraw(t) && (round.kind === 'bracket' || isPlayIn(round))
}

/** Chooses seeded or random draws for the play-in and bracket, redrawing the current one if it hasn't started. */
export function setSeeding(t: Tournament, seeding: Seeding, rng: Rng): Tournament {
  const next = { ...t, seeding }
  return canReseed(next) ? redraw(next, rng) : next
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
  if (isPlayIn(round)) return 'Play-in'
  return `Round ${t.rounds.slice(0, r + 1).filter((x) => x.kind === 'groups' && !isPlayIn(x)).length}`
}
