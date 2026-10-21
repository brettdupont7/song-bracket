import { describe, expect, it } from 'vitest'
import {
  type Song,
  type Tournament,
  canRedraw,
  canReseed,
  canUndo,
  currentRound,
  deal,
  dealGroups,
  decide,
  eliminations,
  isPlayIn,
  pickPlace,
  redraw,
  placeCandidates,
  picksLeft,
  picksMade,
  plan,
  ratings,
  roundName,
  seedNumbers,
  seedOrder,
  setSeeding,
  startTournament,
  undo,
  wildcardLimit,
} from './engine'

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

const songs = (n: number): Song[] =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, title: `Song ${i}`, artist: 'A' }))

/** Plays to the end, always picking the lowest-numbered song (so s0 is the true favourite). */
function playOut(t: Tournament, rng: () => number, wildcard = false): Tournament {
  const rank = (id: string) => Number(id.slice(1))
  while (!t.places.length) {
    const round = currentRound(t)
    const gi = round.groups.findIndex((g) => !g.winner)
    const g = round.groups[gi]
    const sorted = g.songs.slice().sort((a, b) => rank(a) - rank(b))
    const wild = wildcard && wildcardLimit(round, g) > 0 && rank(sorted[1]) < 40 ? [sorted[1]] : []
    t = decide(t, gi, sorted[0], wild, rng)
  }
  return t
}

describe('plan', () => {
  it('takes 1,387 songs through groups of 4, then 64 groups, then the bracket', () => {
    expect(plan(1387)).toEqual([
      { kind: 'groups', songs: 1387, groups: 347, picks: 347 },
      { kind: 'groups', songs: 347, groups: 64, picks: 64 },
      { kind: 'bracket', songs: 64, groups: 32, picks: 63 },
    ])
  })

  it('uses a play-in when just over 64 songs remain', () => {
    expect(plan(70)[0]).toEqual({ kind: 'groups', songs: 70, groups: 64, picks: 6 })
  })

  it('goes straight to a bracket for small playlists', () => {
    expect(plan(20)).toEqual([{ kind: 'bracket', songs: 20, groups: 16, picks: 19 }])
  })
})

describe('deal', () => {
  it('balances groups and splits songs that advanced together', () => {
    const clusters = Array.from({ length: 40 }, (_, i) => (i < 10 ? [`w${i}`, `x${i}`] : [`w${i}`]))
    const groups = deal(clusters, 12, seeded(3))
    const sizes = groups.map((g) => g.length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    for (let i = 0; i < 10; i++) expect(groups.some((g) => g.includes(`w${i}`) && g.includes(`x${i}`))).toBe(false)
  })
})

describe('dealGroups', () => {
  // 347 winners, 120 of them with a wildcard (6 with two), like a real round 1.
  const clusters = Array.from({ length: 347 }, (_, i) =>
    i < 114 ? [`w${i}`, `c${i}`, ...(i < 6 ? [`d${i}`] : [])] : [`w${i}`],
  )

  it('spreads wildcards and group sizes evenly', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const groups = dealGroups(clusters, 64, seeded(seed))
      const sizes = groups.map((g) => g.length)
      const wild = groups.map((g) => g.filter((id) => !id.startsWith('w')).length)
      expect(sizes.reduce((a, b) => a + b)).toBe(467)
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
      expect(Math.max(...wild) - Math.min(...wild)).toBeLessThanOrEqual(1)
    }
  })

  it('never puts a wildcard with the song it advanced with', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const groups = dealGroups(clusters, 64, seeded(seed))
      for (const g of groups) {
        const ids = g.map((id) => id.slice(1))
        expect(new Set(ids).size).toBe(ids.length)
      }
    }
  })
})

describe('seeding', () => {
  /** Plays until the bracket is drawn, picking the lowest-numbered song and wildcarding strong runners-up. */
  function toBracket(seeding?: 'rated' | 'random', seed = 31) {
    const rng = seeded(seed)
    const rank = (id: string) => Number(id.slice(1))
    let t: Tournament = { ...startTournament(songs(1387), rng), seeding }
    let playIn: Tournament | null = null
    while (currentRound(t).kind !== 'bracket') {
      const round = currentRound(t)
      if (isPlayIn(round) && !playIn) playIn = t
      const gi = round.groups.findIndex((g) => !g.winner)
      const g = round.groups[gi]
      const sorted = g.songs.slice().sort((a, b) => rank(a) - rank(b))
      const wild = wildcardLimit(round, g) > 0 && rank(sorted[1]) < 60 ? [sorted[1]] : []
      t = decide(t, gi, sorted[0], wild, rng)
    }
    return { t, playIn: playIn! }
  }

  it('orders seeds so the top two meet last', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
    expect(seedOrder(64).slice(0, 4)).toEqual([1, 64, 32, 33])
  })

  it('rates songs by who they beat', () => {
    const { t } = toBracket()
    const r = ratings(t)
    const order = [...r.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
    // Unbeaten songs are told apart only by who they beat, so the true #1 lands near, not at, the top.
    expect(order.indexOf('s0')).toBeLessThan(64)
    const avg = (from: number) => Array.from({ length: 10 }, (_, i) => r.get(`s${from + i}`)!).reduce((a, b) => a + b) / 10
    expect(avg(0)).toBeGreaterThan(avg(50))
    expect(avg(50)).toBeGreaterThan(avg(500))
    expect(r.get('s0')!).toBeGreaterThan(r.get('s500')!)
    expect(r.get('s100')!).toBeGreaterThan(r.get('s1300')!)
  })

  it('seeds the bracket 1 v 64 with ratings attached', () => {
    const { t } = toBracket()
    const bracket = currentRound(t)
    expect(bracket.seeds).toHaveLength(64)
    const trueRank = (ids: string[]) => ids.reduce((sum, id) => sum + Number(id.slice(1)), 0) / ids.length
    expect(trueRank(bracket.seeds!.slice(0, 16))).toBeLessThan(trueRank(bracket.seeds!.slice(48)))
    const seeds = seedNumbers(t)
    for (const g of bracket.groups) expect(seeds.get(g.songs[0])! + seeds.get(g.songs[1])!).toBe(65)
    const top = bracket.groups.findIndex((g) => g.songs.includes(bracket.seeds![0]))
    const second = bracket.groups.findIndex((g) => g.songs.includes(bracket.seeds![1]))
    expect(top < 16).not.toBe(second < 16)
    expect(Object.keys(bracket.ratings!)).toHaveLength(64)
  })

  it('gives the play-in byes to the best winners and pits wildcards against the weakest', () => {
    const { playIn } = toBracket()
    const round = currentRound(playIn)
    const prev = playIn.rounds[playIn.rounds.length - 2]
    const winners = new Set(prev.groups.map((g) => g.winner))
    const matches = round.groups.filter((g) => g.songs.length === 2)
    expect(matches.length).toBeGreaterThan(0)
    for (const m of matches) {
      expect(m.songs.filter((s) => winners.has(s))).toHaveLength(1)
      const from = (s: string) => prev.groups.findIndex((g) => g.songs.includes(s))
      expect(from(m.songs[0])).not.toBe(from(m.songs[1]))
    }
    const rating = round.ratings!
    const byes = round.groups.filter((g) => g.songs.length === 1).map((g) => rating[g.songs[0]])
    const defenders = matches.map((m) => rating[m.songs.find((s) => winners.has(s))!])
    expect(Math.min(...byes)).toBeGreaterThanOrEqual(Math.max(...defenders))
  })

  it('can switch to a random draw before the round starts', () => {
    const { t } = toBracket()
    expect(canReseed(t)).toBe(true)
    const random = setSeeding(t, 'random', seeded(5))
    expect(currentRound(random).seeds).toBeUndefined()
    expect(currentRound(random).groups.flatMap((g) => g.songs).sort()).toEqual(
      currentRound(t).groups.flatMap((g) => g.songs).sort(),
    )
    const back = setSeeding(random, 'rated', seeded(6))
    expect(currentRound(back).seeds).toEqual(currentRound(t).seeds)
  })

  it('keeps old random behaviour when seeding is off', () => {
    const { t } = toBracket('random')
    expect(currentRound(t).seeds).toBeUndefined()
    expect(currentRound(t).groups).toHaveLength(32)
  })
})

describe('redraw', () => {
  it('redraws a round with no picks from the previous round', () => {
    const rng = seeded(21)
    let t: Tournament = { ...startTournament(songs(300), rng), seeding: 'random' }
    expect(canRedraw(t)).toBe(false)
    currentRound(t).groups.forEach((g, i) => {
      t = decide(t, i, g.songs[0], g.songs.length > 3 && i % 3 === 0 ? [g.songs[1]] : [], rng)
    })
    const before = currentRound(t)
    expect(canRedraw(t)).toBe(true)
    const after = currentRound(redraw(t, rng))
    expect(after.groups.flatMap((g) => g.songs).sort()).toEqual(before.groups.flatMap((g) => g.songs).sort())
    expect(after.groups.map((g) => g.songs)).not.toEqual(before.groups.map((g) => g.songs))
    t = decide(t, 0, currentRound(t).groups[0].songs[0], [], rng)
    expect(canRedraw(t)).toBe(false)
    expect(() => redraw(t, rng)).toThrow()
  })
})

describe('tournament', () => {
  it('starts 1,387 songs in 346 groups of 4 and one of 3', () => {
    const t = startTournament(songs(1387), seeded())
    const sizes = currentRound(t).groups.map((g) => g.songs.length)
    expect(sizes.filter((s) => s === 4)).toHaveLength(346)
    expect(sizes.filter((s) => s === 3)).toHaveLength(1)
    expect(picksLeft(t)).toBe(474)
  })

  it('finds the favourite and lands on a 64-song bracket', () => {
    const rng = seeded(7)
    const t = playOut(startTournament(songs(1387), rng), rng)
    expect(t.places[0].song).toBe('s0')
    expect(picksMade(t)).toBe(474)
    const firstBracket = t.rounds.find((r) => r.kind === 'bracket')!
    expect(firstBracket.groups).toHaveLength(32)
    expect(t.rounds.map((_, r) => roundName(t, r))).toEqual([
      'Round 1',
      'Round 2',
      'Round of 64',
      'Round of 32',
      'Round of 16',
      'Quarterfinals',
      'Semifinals',
      'Final',
    ])
  })

  it('absorbs wildcards with a play-in before the bracket', () => {
    const rng = seeded(11)
    const t = playOut(startTournament(songs(1387), rng), rng, true)
    expect(t.places[0].song).toBe('s0')
    const names = t.rounds.map((_, r) => roundName(t, r))
    expect(names).toContain('Play-in')
    expect(t.rounds.find((r) => r.kind === 'bracket')!.groups).toHaveLength(32)
  })

  it('lets the top songs survive a group of death with a wildcard', () => {
    const rng = seeded(5)
    const t = playOut(startTournament(songs(1387), rng), rng, true)
    // s1 is only ever beaten by s0, so with wildcards it reaches the bracket.
    const bracketStart = t.rounds.findIndex((r) => r.kind === 'bracket')
    expect(t.rounds[bracketStart].groups.some((g) => g.songs.includes('s1'))).toBe(true)
  })

  it('handles small playlists with byes', () => {
    const rng = seeded(2)
    let t = startTournament(songs(5), rng)
    expect(currentRound(t).groups.filter((g) => g.songs.length === 1)).toHaveLength(3)
    t = playOut(t, rng)
    expect(t.places[0].song).toBe('s0')
    expect(picksMade(t)).toBe(4)
  })

  it('rejects bad picks', () => {
    const t = startTournament(songs(1387), seeded())
    const g = currentRound(t).groups[0]
    expect(() => decide(t, 0, 'nope', [], seeded())).toThrow()
    expect(() => decide(t, 0, g.songs[0], [g.songs[0]], seeded())).toThrow()
    expect(() => decide(t, 0, g.songs[0], g.songs.slice(1), seeded())).toThrow()
  })
})

describe('undo', () => {
  it('reverts the latest pick, including the round it completed', () => {
    const rng = seeded(4)
    let t = startTournament(songs(10), rng)
    expect(canUndo(t)).toBe(false)
    const firstRound = currentRound(t)
    firstRound.groups.forEach((g, i) => {
      if (!g.winner) t = decide(t, i, g.songs[0], [], rng)
    })
    expect(t.rounds).toHaveLength(2)
    t = undo(t)
    expect(t.rounds).toHaveLength(1)
    expect(currentRound(t).groups.filter((g) => !g.winner)).toHaveLength(1)
  })

  it('reverts places and then the final', () => {
    const rng = seeded(9)
    let t = playOut(startTournament(songs(8), rng), rng)
    t = pickPlace(t, placeCandidates(t)[0])
    expect(t.places).toHaveLength(2)
    t = undo(t)
    expect(t.places).toHaveLength(1)
    t = undo(t)
    expect(t.places).toHaveLength(0)
    expect(currentRound(t).groups).toHaveLength(1)
  })
})

describe('runner-up playoff', () => {
  it('offers only songs knocked out by placed songs, and finds the true order', () => {
    const rng = seeded(13)
    let t = playOut(startTournament(songs(1387), rng), rng, true)
    const elim = eliminations(t)
    for (const c of placeCandidates(t)) expect(elim.get(c)!.by).toEqual(['s0'])
    for (let place = 1; place < 5; place++) {
      const candidates = placeCandidates(t)
      expect(candidates).toContain(`s${place}`)
      t = pickPlace(t, `s${place}`)
    }
    expect(t.places.map((p) => p.song)).toEqual(['s0', 's1', 's2', 's3', 's4'])
    expect(() => pickPlace(t, 's1000')).toThrow()
  })
})
