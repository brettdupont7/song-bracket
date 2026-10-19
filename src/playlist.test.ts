import { describe, expect, it } from 'vitest'
import { parseCsv, parsePlaylist, spotifyTrackId } from './playlist'

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ])
  })
})

describe('parsePlaylist', () => {
  it('reads an Exportify CSV', () => {
    const csv = [
      '﻿"Track URI","Track Name","Album Name","Artist Name(s)","Release Date"',
      '"spotify:track:4uLU6hMCjMI75M1A2tKUQC","Never Gonna Give You Up","Whenever You Need Somebody","Rick Astley","1987"',
      '"spotify:track:0VjIjW4GlUZAMYd2vXMi3b","Blinding Lights","After Hours","The Weeknd","2020"',
      '"spotify:track:1xznGGDReH1oQq0xzbwXa3","One Dance","Views","Drake,Wizkid,Kyla","2016"',
      '"spotify:track:0VjIjW4GlUZAMYd2vXMi3b","Blinding Lights","After Hours","The Weeknd","2020"',
    ].join('\n')
    const p = parsePlaylist(csv)
    expect(p.source).toBe('csv')
    expect(p.duplicates).toBe(1)
    expect(p.songs).toHaveLength(3)
    expect(p.songs[2]).toEqual({
      id: 's3',
      title: 'One Dance',
      artist: 'Drake, Wizkid, Kyla',
      album: 'Views',
      spotifyId: '1xznGGDReH1oQq0xzbwXa3',
    })
  })

  it('reads plain "Artist - Title" lines', () => {
    const p = parsePlaylist('1. Daft Punk - One More Time\nKendrick Lamar – HUMBLE.\n\nJust A Title\n')
    expect(p.source).toBe('text')
    expect(p.songs.map((s) => [s.artist, s.title])).toEqual([
      ['Daft Punk', 'One More Time'],
      ['Kendrick Lamar', 'HUMBLE.'],
      ['', 'Just A Title'],
    ])
  })
})

describe('spotifyTrackId', () => {
  it('accepts URIs, links and bare IDs', () => {
    expect(spotifyTrackId('spotify:track:4uLU6hMCjMI75M1A2tKUQC')).toBe('4uLU6hMCjMI75M1A2tKUQC')
    expect(spotifyTrackId('https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC?si=x')).toBe(
      '4uLU6hMCjMI75M1A2tKUQC',
    )
    expect(spotifyTrackId('nope')).toBeUndefined()
  })
})
