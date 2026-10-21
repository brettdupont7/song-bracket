import { useEffect, useState } from 'react'
import {
  type Group,
  type Round,
  type Tournament,
  canRedraw,
  canUndo,
  currentRound,
  picksLeft,
  picksMade,
  roundName,
  wildcardLimit,
} from '../engine'
import { useStore, useTournament } from '../store'
import { Player, SongLabel } from './SongCard'

export function Pick() {
  const t = useTournament()
  const decide = useStore((s) => s.decide)
  const undo = useStore((s) => s.undo)
  const redraw = useStore((s) => s.redraw)
  const [playing, setPlaying] = useState<string | null>(null)

  const r = t.rounds.length - 1
  const round = currentRound(t)
  const gi = round.groups.findIndex((g) => !g.winner)
  const contested = round.groups.filter((g) => g.songs.length > 1)
  const decided = contested.filter((g) => g.winner).length
  const wildcards = round.groups.reduce((sum, g) => sum + g.wildcards.length, 0)
  const done = picksMade(t)
  const left = picksLeft(t)

  return (
    <section className="pick">
      <div className="progress">
        <div className="progress-text">
          <strong>{roundName(t, r)}</strong>
          <span>
            {round.kind === 'bracket' ? 'Match' : 'Group'} {decided + 1} of {contested.length}
          </span>
          {round.kind === 'groups' && wildcards > 0 && (
            <span className="wild-count">
              ★ {wildcards} wildcard{wildcards === 1 ? '' : 's'} this round
            </span>
          )}
          <span className="muted">
            {done.toLocaleString()} picks made · about {left.toLocaleString()} to go
          </span>
          {canRedraw(t) && (
            <button
              className="redraw"
              title="Shuffle this round's groups again. Only possible before your first pick in the round."
              onClick={() => confirm(`Redraw the groups for ${roundName(t, r)}?`) && redraw()}
            >
              Redraw groups
            </button>
          )}
        </div>
        <div className="bar">
          <div style={{ width: `${(100 * done) / (done + left)}%` }} />
        </div>
      </div>

      {playing && t.songs[playing] && <Player song={t.songs[playing]} />}

      {gi >= 0 && (
        <GroupPicker
          key={`${r}-${gi}`}
          t={t}
          round={round}
          group={round.groups[gi]}
          playing={playing}
          onPlay={setPlaying}
          onConfirm={(winner, wild) => decide(gi, winner, wild)}
          onUndo={canUndo(t) ? undo : undefined}
        />
      )}
    </section>
  )
}

function GroupPicker({
  t,
  round,
  group,
  playing,
  onPlay,
  onConfirm,
  onUndo,
}: {
  t: Tournament
  round: Round
  group: Group
  playing: string | null
  onPlay: (id: string) => void
  onConfirm: (winner: string, wildcards: string[]) => void
  onUndo?: () => void
}) {
  const [winner, setWinner] = useState<string | null>(null)
  const [wild, setWild] = useState<string[]>([])
  const limit = wildcardLimit(round, group)

  const choose = (id: string) => {
    setWinner(id)
    setWild((w) => w.filter((x) => x !== id))
  }
  const toggleWild = (id: string) => {
    if (limit === 0 || id === winner) return
    setWild((w) => (w.includes(id) ? w.filter((x) => x !== id) : w.length < limit ? [...w, id] : w))
  }
  const confirm = () => winner && onConfirm(winner, wild)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const digit = e.code.match(/^(?:Digit|Numpad)([1-9])$/)
      if (digit) {
        const id = group.songs[Number(digit[1]) - 1]
        if (!id) return
        e.preventDefault()
        if (e.shiftKey) toggleWild(id)
        else choose(id)
      } else if (e.key === 'Enter' && winner) {
        e.preventDefault()
        confirm()
      } else if ((e.key === 'z' && (e.metaKey || e.ctrlKey)) || e.key === 'Backspace') {
        if (onUndo) {
          e.preventDefault()
          onUndo()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const isMatch = group.songs.length === 2

  return (
    <div className="picker">
      <p className="prompt">
        {isMatch ? 'Which do you like more?' : 'Pick your favourite.'}
        {limit > 0 && (
          <span className="muted">
            {' '}
            Too good to lose another? Mark up to {limit} as a wildcard and {limit === 1 ? 'it advances' : 'they advance'}{' '}
            too.
          </span>
        )}
      </p>

      <div className={`cards ${isMatch ? 'is-match' : ''}`}>
        {group.songs.map((id, i) => {
          const song = t.songs[id]
          const isWinner = winner === id
          const isWild = wild.includes(id)
          return (
            <div
              key={id}
              className={`song-card ${isWinner ? 'is-winner' : ''} ${isWild ? 'is-wild' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => choose(id)}
            >
              <div className="card-top">
                <span className="key">{i + 1}</span>
                {isWinner && <span className="badge win">Winner</span>}
                {isWild && <span className="badge wild">★ Wildcard</span>}
              </div>
              <SongLabel song={song} />
              {song.album && <span className="album">{song.album}</span>}
              <div className="card-actions">
                {song.spotifyId && (
                  <button
                    className={playing === id ? 'is-on' : ''}
                    onClick={(e) => {
                      e.stopPropagation()
                      onPlay(id)
                    }}
                  >
                    ▶ Play
                  </button>
                )}
                {limit > 0 && !isWinner && (
                  <button
                    className={isWild ? 'is-on wild' : ''}
                    disabled={!isWild && wild.length >= limit}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleWild(id)
                    }}
                  >
                    ★ Wildcard
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="picker-footer">
        {onUndo && <button onClick={onUndo}>↶ Undo last pick</button>}
        <span className="muted hint">
          Keys: 1–{group.songs.length} pick{limit > 0 ? ', Shift+number wildcard' : ''}, Enter confirm, Backspace undo
        </span>
        <button className="primary" disabled={!winner} onClick={confirm}>
          {wild.length ? `Advance ${wild.length + 1} songs` : 'Advance'} ⏎
        </button>
      </div>
    </div>
  )
}
