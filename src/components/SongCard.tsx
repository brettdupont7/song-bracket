import type { Song } from '../engine'

export function spotifyUrl(song: Song): string | undefined {
  return song.spotifyId ? `https://open.spotify.com/track/${song.spotifyId}` : undefined
}

export function SongLabel({ song, compact }: { song: Song; compact?: boolean }) {
  return (
    <span className={`song-label ${compact ? 'is-compact' : ''}`}>
      <span className="title">{song.title}</span>
      {song.artist && <span className="artist">{song.artist}</span>}
    </span>
  )
}

/** A small embedded Spotify player. Full tracks when logged in to Spotify in this browser, previews otherwise. */
export function Player({ song }: { song: Song }) {
  if (!song.spotifyId) return null
  return (
    <iframe
      className="player"
      title={`Play ${song.title}`}
      src={`https://open.spotify.com/embed/track/${song.spotifyId}?utm_source=generator`}
      height={80}
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
    />
  )
}
