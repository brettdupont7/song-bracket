# Song Bracket

Put every song in a playlist into a tournament to find your favourite song right now.

## How it works

1. **Import a playlist.** Export a Spotify playlist as CSV with [Exportify](https://github.com/watsonbox/exportify) and upload or paste it. Plain text works too, one `Artist - Title` per line. Duplicates are skipped.
2. **Group rounds.** You see a few songs at a time and pick your favourite. If another song in the group is too good to lose, mark it as a **wildcard** and it advances too (up to all but one song in the group). Wildcards' groups are spread out next round, so a song never meets the song it advanced with straight away.
   - Groups of 4 until 512 or fewer songs remain, then one round of 64 groups (5–8 songs each) to land on 64.
   - If wildcards leave more than 64, a short **play-in** of 1-on-1s trims the field to exactly 64.
3. **Bracket.** The last 64 play 1-on-1, single elimination. Songs that advanced together start in opposite halves.
4. **Runner-up playoff.** After the final, **Find your 2nd favourite** lists every song that only lost to the champion; your #2 has to be one of them, so one pick settles it. Repeat for #3, #4 and so on.

A 1,387-song playlist takes 347 + 64 + 63 = **474 picks** before wildcards, plus one per extra place.

**Keys:** `1`–`9` pick the winner, `Shift`+number toggles a wildcard, `Enter` confirms, `Backspace` (or ⌘Z) undoes the last pick. Songs with a Spotify link have a **Play** button that loads Spotify's embedded player: full tracks if you're logged in to Spotify in the browser, previews otherwise.

**Tabs:** **Pick** (or **Results** once there's a champion), **Bracket** for the last 64, and **Rounds** for each round's picks, wildcards and the rounds still to come.

Progress is saved in the browser as you go. **Save backup** downloads it as JSON and **Restore backup** loads one, which is worth doing before clearing site data or switching browsers.

## Development

```sh
npm install
npm run dev    # http://localhost:5173
npm test
npm run build
```

```
src/
  engine.ts     The tournament: drawing rounds, picks, wildcards, undo, the runner-up playoff, plans and progress
  playlist.ts   Reads Exportify CSVs and plain-text lists
  store.ts      Zustand store, saved to localStorage
  components/   Setup, picking, results, bracket and rounds views
```
