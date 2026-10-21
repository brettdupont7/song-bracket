import { BRACKET_SIZE, bracketRoundName, seedNumbers } from '../engine'
import { useTournament } from '../store'

export function BracketView() {
  const t = useTournament()
  const start = t.rounds.findIndex((r) => r.kind === 'bracket')
  if (start < 0)
    return <p className="muted empty">The bracket starts once {BRACKET_SIZE} songs are left.</p>

  const first = t.rounds[start].groups.length
  const seeds = seedNumbers(t)
  const ratings = t.rounds[start].ratings
  const columns: number[] = []
  for (let m = first; m >= 1; m /= 2) columns.push(m)

  return (
    <section className="bracket">
      {columns.map((matches, c) => {
        const round = t.rounds[start + c]
        return (
          <div className="bracket-col" key={c}>
            <h4>{bracketRoundName(matches)}</h4>
            <div className="bracket-matches">
              {Array.from({ length: matches }, (_, i) => {
                const g = round?.groups[i]
                const slots = g ? (g.songs.length === 1 ? [g.songs[0], null] : g.songs) : [undefined, undefined]
                return (
                  <div className="bracket-match" key={i}>
                    {slots.map((id, k) => (
                      <div
                        key={k}
                        className={`slot ${id && g?.winner === id && g.songs.length > 1 ? 'is-winner' : ''} ${id && g?.winner && g.winner !== id ? 'is-loser' : ''}`}
                        title={
                          id
                            ? `${t.songs[id].title} — ${t.songs[id].artist}${ratings?.[id] ? ` (rating ${ratings[id]})` : ''}`
                            : undefined
                        }
                      >
                        {id && seeds.has(id) && <span className="seed-num">{seeds.get(id)}</span>}
                        {id ? t.songs[id].title : id === null ? <span className="muted">bye</span> : ' '}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </section>
  )
}
