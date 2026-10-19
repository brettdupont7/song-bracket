// Reads a playlist pasted or uploaded as an Exportify CSV or as plain "Artist - Title" lines.

import type { Song } from './engine'

export interface ParsedPlaylist {
  songs: Song[]
  duplicates: number
  source: 'csv' | 'text'
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = false
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

export function spotifyTrackId(value: string | undefined): string | undefined {
  if (!value) return undefined
  const v = value.trim()
  const m = v.match(/(?:spotify:track:|open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/)([A-Za-z0-9]{22})/)
  if (m) return m[1]
  return /^[A-Za-z0-9]{22}$/.test(v) ? v : undefined
}

type RawSong = Omit<Song, 'id'>

function fromCsv(text: string): RawSong[] {
  const [header = [], ...rows] = parseCsv(text)
  const h = header.map((x) => x.trim().toLowerCase())
  const col = (...names: string[]) => h.findIndex((x) => names.includes(x))
  const title = col('track name', 'name', 'title')
  const artist = col('artist name(s)', 'artist names', 'artist name', 'artist', 'artists')
  const album = col('album name', 'album')
  const uri = col('track uri', 'spotify id', 'track id', 'uri')
  return rows
    .map((r) => ({
      title: r[title]?.trim() ?? '',
      // Exportify joins several artists with bare commas.
      artist: artist >= 0 ? (r[artist] ?? '').trim().replace(/,(?=\S)/g, ', ') : '',
      album: album >= 0 ? r[album]?.trim() || undefined : undefined,
      spotifyId: uri >= 0 ? spotifyTrackId(r[uri]) : undefined,
    }))
    .filter((s) => s.title)
}

function fromText(text: string): RawSong[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\d+[.)]\s+/, ''))
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const m = line.match(/^(.+?)\s+[-–—]\s+(.+)$/)
      return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: line }
    })
}

export function parsePlaylist(input: string): ParsedPlaylist {
  const text = input.replace(/^﻿/, '')
  const firstLine = text.split(/\r?\n/, 1)[0].toLowerCase()
  const source = /(^|,)"?(track name|track uri)"?(,|$)/.test(firstLine) ? 'csv' : 'text'
  const raw = source === 'csv' ? fromCsv(text) : fromText(text)
  const seen = new Set<string>()
  const songs: Song[] = []
  for (const s of raw) {
    const key = s.spotifyId ?? `${s.artist}|${s.title}`.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)
    songs.push({ id: `s${songs.length + 1}`, ...s })
  }
  return { songs, duplicates: raw.length - songs.length, source }
}
