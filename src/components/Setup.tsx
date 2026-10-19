import { useMemo, useState } from 'react'
import { plan, bracketRoundName } from '../engine'
import { parsePlaylist } from '../playlist'
import { useStore } from '../store'

export function Setup() {
  const start = useStore((s) => s.start)
  const [text, setText] = useState('')
  const parsed = useMemo(() => (text.trim() ? parsePlaylist(text) : null), [text])
  const steps = parsed ? plan(parsed.songs.length) : []
  const total = steps.reduce((sum, s) => sum + s.picks, 0)

  return (
    <section className="setup">
      <h2>Find your favourite song right now</h2>
      <p className="muted">
        Every song in a playlist goes into a tournament. Early rounds show you a few songs at a time: pick your
        favourite, and mark a <strong>wildcard</strong> when another song is too good to lose. Once 64 songs are left
        it's a 1-on-1 bracket.
      </p>

      <ol className="steps">
        <li>
          Export your Spotify playlist as a CSV with{' '}
          <a href="https://github.com/watsonbox/exportify" target="_blank" rel="noreferrer">
            Exportify
          </a>
          , or write one song per line as <code>Artist - Title</code>.
        </li>
        <li>Upload the file or paste it below.</li>
      </ol>

      <div className="setup-input">
        <label className="file-button">
          Upload CSV or text
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) setText(await file.text())
              e.target.value = ''
            }}
          />
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Daft Punk - One More Time\nKendrick Lamar - HUMBLE.\n…'}
          rows={8}
          spellCheck={false}
        />
      </div>

      {parsed && (
        <div className="setup-preview">
          <p>
            <strong>{parsed.songs.length.toLocaleString()} songs</strong>
            {parsed.source === 'csv' ? ' from the CSV' : ''}
            {parsed.duplicates > 0 && ` (${parsed.duplicates} duplicates skipped)`}
            {parsed.songs.length > 0 && !parsed.songs.some((s) => s.spotifyId) && (
              <span className="muted"> · no Spotify links, so songs can't be played here</span>
            )}
          </p>
          {steps.length > 0 && (
            <table className="plan">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Songs</th>
                  <th>Format</th>
                  <th>Picks</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s, i) => (
                  <tr key={i}>
                    <td>{s.kind === 'bracket' ? 'Bracket' : `Round ${i + 1}`}</td>
                    <td>{s.songs.toLocaleString()}</td>
                    <td>
                      {s.kind === 'bracket'
                        ? `1-on-1 from the ${bracketRoundName(s.groups)}`
                        : `${s.groups} groups of ${groupSizes(s.songs, s.groups)}, 1 advances`}
                    </td>
                    <td>{s.picks.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total, before wildcards and the runner-up playoff</td>
                  <td>{total.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          )}
          <button className="primary" disabled={parsed.songs.length < 2} onClick={() => start(parsed.songs)}>
            Start
          </button>
        </div>
      )}
    </section>
  )
}

function groupSizes(songs: number, groups: number): string {
  const lo = Math.floor(songs / groups)
  const hi = Math.ceil(songs / groups)
  return lo === hi ? `${lo}` : `${lo}–${hi}`
}
