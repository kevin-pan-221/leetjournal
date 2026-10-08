import { invoke } from '@tauri-apps/api/core'

export interface ConnectionStatus { enabled: boolean; supported: boolean }
export interface Playback {
  running: boolean
  is_playing: boolean
  progress_ms: number
  volume_percent: number
  item: null | {
    name: string; artist: string; duration_ms: number; artwork_url: string; url: string
  }
}
export type PlayerAction = { type: 'play' | 'pause' | 'next' | 'previous' | 'open' }
  | { type: 'seek'; position: number } | { type: 'volume'; percent: number }

export const spotifyApi = {
  status: () => invoke<ConnectionStatus>('spotify_status'),
  connect: () => invoke<ConnectionStatus>('spotify_connect'),
  disconnect: () => invoke<void>('spotify_disconnect'),
  playback: () => invoke<Playback | null>('spotify_playback'),
  control: (action: PlayerAction) => invoke<void>('spotify_control', { action }),
}

export function spotifyLink(value?: string): string {
  const uri = /^spotify:(track|episode):([a-zA-Z0-9]+)$/.exec(value ?? '')
  if (uri) return `https://open.spotify.com/${uri[1]}/${uri[2]}`
  try {
    const url = new URL(value ?? '')
    if (url.protocol === 'https:' && url.hostname === 'open.spotify.com') return url.href
  } catch { /* Missing or unsupported content. */ }
  return 'https://open.spotify.com/'
}

export function playbackPosition(playback: Playback | null, receivedAt: number, now: number): number {
  if (!playback?.item) return 0
  // Smooth the display between native reads, but don't invent minutes of
  // playback if Spotify stops responding or the app was asleep.
  const elapsed = playback.is_playing ? Math.min(5_000, Math.max(0, now - receivedAt)) : 0
  return Math.min(playback.item.duration_ms, Math.max(0, (playback.progress_ms ?? 0) + elapsed))
}
