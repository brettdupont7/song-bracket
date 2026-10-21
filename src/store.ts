import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as engine from './engine'
import type { Song, Tournament } from './engine'

interface State {
  tournament: Tournament | null
  start: (songs: Song[]) => void
  decide: (group: number, winner: string, wildcards: string[]) => void
  pickPlace: (song: string) => void
  undo: () => void
  redraw: () => void
  setSeeding: (seeding: engine.Seeding) => void
  load: (t: Tournament) => void
  reset: () => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const update = (fn: (t: Tournament) => Tournament) => {
        const t = get().tournament
        if (t) set({ tournament: fn(t) })
      }
      return {
        tournament: null,
        start: (songs) => set({ tournament: engine.startTournament(songs, Math.random) }),
        decide: (group, winner, wildcards) =>
          update((t) => engine.decide(t, group, winner, wildcards, Math.random)),
        pickPlace: (song) => update((t) => engine.pickPlace(t, song)),
        undo: () => update(engine.undo),
        redraw: () => update((t) => engine.redraw(t, Math.random)),
        setSeeding: (seeding) => update((t) => engine.setSeeding(t, seeding, Math.random)),
        load: (tournament) => set({ tournament }),
        reset: () => set({ tournament: null }),
      }
    },
    { name: 'song-bracket', version: 1 },
  ),
)

export function useTournament(): Tournament {
  return useStore((s) => s.tournament)!
}

export function isTournament(value: unknown): value is Tournament {
  const t = value as Tournament
  return (
    !!t &&
    t.version === 1 &&
    typeof t.songs === 'object' &&
    Array.isArray(t.rounds) &&
    t.rounds.length > 0 &&
    Array.isArray(t.places)
  )
}
