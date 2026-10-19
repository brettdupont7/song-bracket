import { advancers, currentRound, plan, roundName } from '../engine'
import { useTournament } from '../store'

export function Rounds() {
  const t = useTournament()
  const round = currentRound(t)
  const advancing =
    round.kind === 'groups' && !t.places.length
      ? round.groups.reduce((sum, g) => sum + (g.winner ? advancers(g).length : 1), 0)
      : 0
  const ahead = advancing ? plan(advancing) : []

  return (
    <section className="rounds">
      <table className="plan">
        <thead>
          <tr>
            <th>Round</th>
            <th>Songs</th>
            <th>Picks</th>
            <th>Wildcards</th>
            <th>Advanced</th>
          </tr>
        </thead>
        <tbody>
          {t.rounds.map((round, r) => {
            const contested = round.groups.filter((g) => g.songs.length > 1)
            const decided = contested.filter((g) => g.winner).length
            const complete = round.groups.every((g) => g.winner)
            return (
              <tr key={r}>
                <td>{roundName(t, r)}</td>
                <td>{round.groups.reduce((sum, g) => sum + g.songs.length, 0).toLocaleString()}</td>
                <td>
                  {decided} / {contested.length}
                </td>
                <td>{round.kind === 'groups' ? round.groups.reduce((sum, g) => sum + g.wildcards.length, 0) : '—'}</td>
                <td>
                  {complete ? round.groups.reduce((sum, g) => sum + advancers(g).length, 0).toLocaleString() : '…'}
                </td>
              </tr>
            )
          })}
          {ahead.map((s, i) => (
            <tr key={`ahead-${i}`} className="muted">
              <td>{s.kind === 'bracket' ? 'Bracket' : i === 0 ? 'Next round' : 'Then'}</td>
              <td>{s.songs.toLocaleString()}</td>
              <td>0 / {s.picks}</td>
              <td>{s.kind === 'groups' ? '—' : ''}</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      {ahead.length > 0 && (
        <p className="muted">Rounds still to come assume no more wildcards; their sizes adjust as you go.</p>
      )}
    </section>
  )
}
