import { useRef, useState } from 'react'
import { isTournament, useStore } from '../store'
import { Setup } from './Setup'
import { Pick } from './Pick'
import { Results } from './Results'
import { BracketView } from './BracketView'
import { Rounds } from './Rounds'

type View = 'play' | 'bracket' | 'rounds'

export function App() {
  const t = useStore((s) => s.tournament)
  const [view, setView] = useState<View>('play')

  return (
    <div className="app">
      <header className="topbar">
        <h1>Song Bracket</h1>
        {t && (
          <nav className="tabs">
            <Tab view="play" current={view} onSelect={setView}>
              {t.places.length ? 'Results' : 'Pick'}
            </Tab>
            <Tab view="bracket" current={view} onSelect={setView}>
              Bracket
            </Tab>
            <Tab view="rounds" current={view} onSelect={setView}>
              Rounds
            </Tab>
          </nav>
        )}
        <Menu />
      </header>
      <main>
        {!t ? (
          <Setup />
        ) : view === 'bracket' ? (
          <BracketView />
        ) : view === 'rounds' ? (
          <Rounds />
        ) : t.places.length ? (
          <Results />
        ) : (
          <Pick />
        )}
      </main>
    </div>
  )
}

function Tab({
  view,
  current,
  onSelect,
  children,
}: {
  view: View
  current: View
  onSelect: (v: View) => void
  children: React.ReactNode
}) {
  return (
    <button className={`tab ${view === current ? 'is-active' : ''}`} onClick={() => onSelect(view)}>
      {children}
    </button>
  )
}

function Menu() {
  const t = useStore((s) => s.tournament)
  const load = useStore((s) => s.load)
  const reset = useStore((s) => s.reset)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(t)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `song-bracket-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      if (!isTournament(data)) throw new Error()
      if (!t || confirm('Replace the current tournament with this backup?')) load(data)
    } catch {
      alert("That file isn't a Song Bracket backup.")
    }
  }

  return (
    <div className="menu">
      {t && <button onClick={exportBackup}>Save backup</button>}
      <button onClick={() => fileRef.current?.click()}>Restore backup</button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) restore(file)
          e.target.value = ''
        }}
      />
      {t && (
        <button
          className="danger"
          onClick={() => confirm('Start over? Your picks will be lost unless you saved a backup.') && reset()}
        >
          Start over
        </button>
      )}
    </div>
  )
}
