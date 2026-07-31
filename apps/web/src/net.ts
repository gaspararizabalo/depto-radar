import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type GameView,
  type SeriesState,
  type ServerMessage,
  type TargetRef,
} from '@drecksau/engine'

const PLAYER_ID_KEY = 'drecksau.playerId'
const NICK_KEY = 'drecksau.nickname'

/**
 * Identidad sin cuenta: un id random en localStorage. Alcanza para reconectar
 * si se corta la red y para que el servidor sepa quien sos entre partidas.
 * Cuando agreguemos cuentas de verdad, este id se migra al usuario nuevo.
 */
function loadPlayerId(): string {
  try {
    const saved = localStorage.getItem(PLAYER_ID_KEY)
    if (saved && /^[a-zA-Z0-9_-]{8,64}$/.test(saved)) return saved
  } catch {
    /* modo incognito con storage bloqueado */
  }
  const fresh = `p_${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`
  try {
    localStorage.setItem(PLAYER_ID_KEY, fresh)
  } catch {
    /* ignoramos: la sesion simplemente no sobrevive al refresh */
  }
  return fresh
}

export function loadNickname(): string {
  try {
    return localStorage.getItem(NICK_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveNickname(nick: string): void {
  try {
    localStorage.setItem(NICK_KEY, nick)
  } catch {
    /* ignoramos */
  }
}

export type Phase = 'connecting' | 'home' | 'queued' | 'waitingRoom' | 'playing'

export interface Clock {
  /** Timestamp local en el que se vence el turno. */
  deadline: number
  turnMs: number
}

export interface AppState {
  connected: boolean
  phase: Phase
  playerId: string
  nickname: string
  online: number
  roomCode: string | null
  view: GameView | null
  series: SeriesState | null
  clock: Clock | null
  opponentNickname: string | null
  ranked: boolean
  toast: string | null
  opponentAway: number | null
  roundBreak: { roundWinnerId: string | null; until: number } | null
  rematch: { you: boolean; them: boolean }
}

const INITIAL: AppState = {
  connected: false,
  phase: 'connecting',
  playerId: '',
  nickname: '',
  online: 0,
  roomCode: null,
  view: null,
  series: null,
  clock: null,
  opponentNickname: null,
  ranked: false,
  toast: null,
  opponentAway: null,
  roundBreak: null,
  rematch: { you: false, them: false },
}

function socketUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws`
}

export function useGame() {
  const [state, setState] = useState<AppState>(INITIAL)
  const wsRef = useRef<WebSocket | null>(null)
  const nickRef = useRef<string>(loadNickname())
  const idRef = useRef<string>('')
  const retryRef = useRef(0)
  const disposedRef = useRef(false)
  const toastTimer = useRef<number | null>(null)

  const patch = useCallback((p: Partial<AppState>) => {
    setState((s) => ({ ...s, ...p }))
  }, [])

  const toast = useCallback(
    (message: string) => {
      patch({ toast: message })
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => patch({ toast: null }), 3200)
    },
    [patch],
  )

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }, [])

  const handle = useCallback(
    (msg: ServerMessage) => {
      switch (msg.t) {
        case 'welcome':
          idRef.current = msg.playerId
          setState((s) => ({
            ...s,
            connected: true,
            playerId: msg.playerId,
            nickname: msg.nickname,
            online: msg.online,
            // Si volvemos de una caida en medio de una partida, el servidor
            // manda el estado enseguida y `phase` se corrige sola.
            phase: s.phase === 'connecting' ? 'home' : s.phase,
          }))
          break

        case 'queued':
          patch({ phase: 'queued', roomCode: null })
          break

        case 'queueCancelled':
          patch({ phase: 'home' })
          break

        case 'roomCreated':
          patch({ phase: 'waitingRoom', roomCode: msg.code })
          break

        case 'roomJoined':
          patch({ roomCode: msg.code, opponentNickname: msg.opponentNickname })
          break

        case 'matchFound':
          patch({
            phase: 'playing',
            opponentNickname: msg.opponentNickname,
            ranked: msg.ranked,
            roundBreak: null,
            rematch: { you: false, them: false },
            opponentAway: null,
          })
          break

        case 'state':
          setState((s) => ({
            ...s,
            phase: 'playing',
            view: msg.view,
            series: msg.series,
            clock: { deadline: Date.now() + msg.clock.msLeft, turnMs: msg.clock.turnMs },
            roundBreak: msg.view.status === 'playing' ? null : s.roundBreak,
          }))
          break

        case 'roundOver':
          patch({
            series: msg.series,
            roundBreak: { roundWinnerId: msg.roundWinnerId, until: Date.now() + msg.nextInMs },
          })
          break

        case 'opponentDisconnected':
          patch({ opponentAway: Date.now() + msg.msUntilForfeit })
          break

        case 'opponentReconnected':
          patch({ opponentAway: null })
          toast('Tu rival volvió.')
          break

        case 'opponentLeft':
          patch({ opponentAway: null })
          toast('Tu rival abandonó la partida.')
          break

        case 'rematchOffered':
          setState((s) => ({
            ...s,
            rematch: msg.byYou ? { ...s.rematch, you: true } : { ...s.rematch, them: true },
          }))
          break

        case 'error':
          toast(msg.message)
          if (msg.fatal) {
            disposedRef.current = true
            patch({ connected: false })
          }
          break

        case 'pong':
          break
      }
    },
    [patch, toast],
  )

  // Conexion + reconexion con backoff.
  useEffect(() => {
    disposedRef.current = false
    idRef.current = loadPlayerId()
    let heartbeat: number | null = null
    let retryTimer: number | null = null

    const connect = () => {
      if (disposedRef.current) return
      const ws = new WebSocket(socketUrl())
      wsRef.current = ws

      ws.onopen = () => {
        retryRef.current = 0
        ws.send(
          JSON.stringify({
            t: 'hello',
            playerId: idRef.current,
            nickname: nickRef.current || 'Invitado',
            version: PROTOCOL_VERSION,
          } satisfies ClientMessage),
        )
        heartbeat = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'ping' }))
        }, 25_000)
      }

      ws.onmessage = (ev) => {
        try {
          handle(JSON.parse(String(ev.data)) as ServerMessage)
        } catch {
          /* mensaje corrupto: lo ignoramos antes que romper la UI */
        }
      }

      ws.onclose = () => {
        if (heartbeat) window.clearInterval(heartbeat)
        heartbeat = null
        patch({ connected: false })
        if (disposedRef.current) return
        // Backoff hasta 8s. El servidor guarda la partida 45s, asi que hay
        // tiempo de sobra para volver a entrar donde estabamos.
        retryRef.current = Math.min(retryRef.current + 1, 6)
        const delay = Math.min(500 * 2 ** (retryRef.current - 1), 8000)
        retryTimer = window.setTimeout(connect, delay)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      disposedRef.current = true
      if (heartbeat) window.clearInterval(heartbeat)
      if (retryTimer) window.clearTimeout(retryTimer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [handle, patch])

  const actions = {
    setNickname: useCallback(
      (nick: string) => {
        nickRef.current = nick
        saveNickname(nick)
        patch({ nickname: nick })
        // Re-anunciarse actualiza el nombre en el servidor sin reconectar.
        send({ t: 'hello', playerId: idRef.current, nickname: nick, version: PROTOCOL_VERSION })
      },
      [patch, send],
    ),
    queue: useCallback(() => send({ t: 'queue' }), [send]),
    cancelQueue: useCallback(() => send({ t: 'cancelQueue' }), [send]),
    createRoom: useCallback(() => send({ t: 'createRoom' }), [send]),
    joinRoom: useCallback((code: string) => send({ t: 'joinRoom', code }), [send]),
    play: useCallback(
      (cardId: string, target?: TargetRef) => send({ t: 'play', cardId, ...(target ? { target } : {}) }),
      [send],
    ),
    discard: useCallback((cardId: string) => send({ t: 'discard', cardId }), [send]),
    forfeit: useCallback(() => send({ t: 'forfeit' }), [send]),
    rematch: useCallback(() => send({ t: 'rematch' }), [send]),
    goHome: useCallback(() => {
      send({ t: 'leaveRoom' })
      setState((s) => ({
        ...s,
        phase: 'home',
        view: null,
        series: null,
        roomCode: null,
        roundBreak: null,
        opponentAway: null,
        rematch: { you: false, them: false },
      }))
    }, [send]),
    toast,
  }

  return [state, actions] as const
}

export type GameActions = ReturnType<typeof useGame>[1]
export type { GameView, SeriesState }
