import { useState } from 'react'
import { advancers, canUndo, eliminations, placeCandidates, roundName } from '../engine'
import { useStore, useTournament } from '../store'
import { Player, SongLabel, spotifyUrl } from './SongCard'

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function Results() {
  const t = useTournament()
  const pickPlace = useStore((s) => s.pickPlace)
  const undo = useStore((s) => s.undo)
  const [playing, setPlaying] = useState<string | null>(null)

  const champion = t.songs[t.places[0].song]
  const candidates = placeCandidates(t)
  const elim = eliminations(t)
  const next = t.places.length + 1
  const path = t.rounds
    .map((round, r) => ({ r, group: round.groups.find((g) => g.songs.includes(champion.id))! }))
    .filter(({ group }) => group.songs.length > 1)

  return (
    <section className="results">
      <div className="champion">
        <span className="muted">Your favourite song right now</span>
        <SongLabel song={champion} />
        {spotifyUrl(champion) && (
          <a href={spotifyUrl(champion)} target="_blank" rel="noreferrer">
            Open in Spotify
          </a>
        )}
      </div>

      {t.places.length > 1 && (
        <ol className="places">
          {t.places.map((p, i) => (
            <li key={p.song}>
              <span className="place">{ordinal(i + 1)}</span>
              <SongLabel song={t.songs[p.song]} compact />
            </li>
          ))}
        </ol>
      )}

      {candidates.length > 0 && (
        <div className="next-place">
          <h3>Find your {ordinal(next)} favourite</h3>
          <p className="muted">
            Every song here only lost to songs you've already placed, so your {ordinal(next)} favourite is one of them.
          </p>
          {playing && <Player song={t.songs[playing]} />}
          <ul className="candidates">
            {candidates.map((id) => {
              const e = elim.get(id)!
              return (
                <li key={id}>
                  <button className="candidate" onClick={() => pickPlace(id)}>
                    <SongLabel song={t.songs[id]} compact />
                    <span className="muted">
                      lost to {e.by.map((s) => t.songs[s].title).join(' & ')} in {roundName(t, e.round)}
                    </span>
                  </button>
                  {t.songs[id].spotifyId && (
                    <button className={playing === id ? 'is-on' : ''} onClick={() => setPlaying(id)}>
                      ▶
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="path">
        <h3>How {champion.title} got here</h3>
        <ul>
          {path.map(({ r, group }) => {
            const others = group.songs.filter((s) => s !== champion.id)
            const wild = advancers(group).filter((s) => s !== champion.id)
            return (
              <li key={r}>
                <strong>{roundName(t, r)}:</strong> beat{' '}
                {others.map((s, i) => (
                  <span key={s}>
                    {i > 0 && (i === others.length - 1 ? ' and ' : ', ')}
                    {t.songs[s].title}
                    {wild.includes(s) && ' (wildcard)'}
                  </span>
                ))}
              </li>
            )
          })}
        </ul>
      </div>

      {canUndo(t) && <button onClick={undo}>↶ Undo last pick</button>}
    </section>
  )
}
