import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyAction,
  autoAction,
  createGame,
  nextFirstPlayer,
  SERIES,
  viewFor,
  type Action,
  type GameState,
  type TargetRef,
} from '@drecksau/engine'
import type { AppState, GameActions } from '../net.js'
import { chooseAction, type Difficulty } from '@drecksau/engine'
import { thinkingDelay } from './thinking.js'

/**
 * Modo contra la máquina: la partida entera corre en el navegador, sin servidor.
 *
 * Devuelve exactamente la misma forma de `AppState` y `GameActions` que el modo
 * online, así que la pantalla de juego (`screens/Game.tsx`) se reusa sin tocar
 * una línea. Todo lo que cambia es de dónde sale el estado.
 *
 * Acá no hay problema de confianza: el rival es local, no hay nada que ocultar
 * a nadie. Igual pasamos por `viewFor`, porque es lo que espera la UI y porque
 * así el modo solo no puede mostrar accidentalmente algo que el online oculta.
 */

export const HUMAN_ID = 'vos'
export const BOT_ID = 'maquina'
const BOT_NAME = 'La máquina'

interface SoloState {
  phase: 'home' | 'playing'
  game: GameState | null
  scores: [number, number]
  round: number
  firstOfRound: 0 | 1
  seriesOver: boolean
  seriesWinnerId: string | null
  roundBreak: { roundWinnerId: string | null; until: number } | null
  clockDeadline: number
  toast: string | null
}

const FRESH: SoloState = {
  phase: 'home',
  game: null,
  scores: [0, 0],
  round: 1,
  firstOfRound: 0,
  seriesOver: false,
  seriesWinnerId: null,
  roundBreak: null,
  clockDeadline: 0,
  toast: null,
}

function newRound(nickname: string, first: 0 | 1, round: number): GameState {
  return createGame({
    id: `solo-r${round}-${Date.now()}`,
    seed: (Math.random() * 2 ** 31) | 0,
    players: [
      { id: HUMAN_ID, nickname },
      { id: BOT_ID, nickname: BOT_NAME },
    ],
    firstPlayerIndex: first,
  })
}

export function useSoloGame(nickname: string, difficulty: Difficulty) {
  const [s, setS] = useState<SoloState>(FRESH)
  const timers = useRef<number[]>([])
  const toastTimer = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms)
    timers.current.push(id)
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const toast = useCallback((message: string) => {
    setS((p) => ({ ...p, toast: message }))
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setS((p) => ({ ...p, toast: null })), 3000)
  }, [])

  const startSeries = useCallback(() => {
    clearTimers()
    const first: 0 | 1 = Math.random() < 0.5 ? 0 : 1
    setS({
      ...FRESH,
      phase: 'playing',
      game: newRound(nickname, first, 1),
      firstOfRound: first,
      clockDeadline: Date.now() + SERIES.turnMs,
    })
  }, [clearTimers, nickname])

  /**
   * Aplica una acción del jugador y nada más. El cierre de ronda lo resuelve
   * SIEMPRE el efecto de abajo, sin importar quién la haya cerrado. Tenerlo en
   * dos lugares hacía que el marcador sumara dos veces cuando ganábamos nosotros.
   */
  const commit = useCallback((action: Action) => {
    setS((prev) => {
      if (!prev.game || prev.game.status !== 'playing') return prev
      const r = applyAction(prev.game, action)
      if (!r.ok) return prev
      return { ...prev, game: r.state, clockDeadline: Date.now() + SERIES.turnMs }
    })
  }, [])

  /** Rendirse en solo termina la SERIE, no solo la ronda. */
  const surrender = useCallback(() => {
    clearTimers()
    setS((prev) => {
      if (!prev.game || prev.seriesOver) return prev
      const r = applyAction(prev.game, { type: 'FORFEIT', playerId: HUMAN_ID })
      return {
        ...prev,
        game: r.ok ? r.state : prev.game,
        scores: [prev.scores[0], SERIES.target],
        seriesOver: true,
        seriesWinnerId: BOT_ID,
        roundBreak: null,
      }
    })
  }, [clearTimers])

  // Arranque de la ronda siguiente tras la pausa.
  useEffect(() => {
    if (!s.roundBreak || s.seriesOver) return
    const wait = Math.max(0, s.roundBreak.until - Date.now())
    later(() => {
      setS((prev) => {
        if (!prev.roundBreak || prev.seriesOver) return prev
        const first = nextFirstPlayer(prev.firstOfRound, prev.scores, SERIES.target)
        const round = prev.round + 1
        return {
          ...prev,
          round,
          firstOfRound: first,
          game: newRound(nickname, first, round),
          roundBreak: null,
          clockDeadline: Date.now() + SERIES.turnMs,
        }
      })
    }, wait)
  }, [s.roundBreak, s.seriesOver, later, nickname])

  // Turno de la máquina.
  useEffect(() => {
    const game = s.game
    if (!game || game.status !== 'playing' || s.roundBreak) return
    if (game.players[game.turnIndex].id !== BOT_ID) return

    later(() => {
      setS((prev) => {
        const g = prev.game
        if (!g || g.status !== 'playing') return prev
        if (g.players[g.turnIndex].id !== BOT_ID) return prev
        const action = chooseAction(g, difficulty)
        if (!action) return prev
        const r = applyAction(g, action)
        if (!r.ok) return prev
        return { ...prev, game: r.state, clockDeadline: Date.now() + SERIES.turnMs }
      })
    }, thinkingDelay(difficulty))
  }, [s.game, s.roundBreak, difficulty, later])

  // Al terminar la ronda por jugada de la máquina hay que cerrar la serie igual
  // que si la hubiéramos cerrado nosotros. Este efecto la resuelve.
  useEffect(() => {
    const game = s.game
    if (!game || game.status !== 'finished' || s.roundBreak || s.seriesOver) return

    setS((prev) => {
      if (!prev.game || prev.game.status !== 'finished' || prev.roundBreak || prev.seriesOver) return prev
      const scores: [number, number] = [prev.scores[0], prev.scores[1]]
      if (prev.game.winnerId === HUMAN_ID) scores[0] += 1
      else if (prev.game.winnerId === BOT_ID) scores[1] += 1

      const over = scores[0] >= SERIES.target || scores[1] >= SERIES.target
      if (over) {
        return {
          ...prev,
          scores,
          seriesOver: true,
          seriesWinnerId: scores[0] >= SERIES.target ? HUMAN_ID : BOT_ID,
        }
      }
      return {
        ...prev,
        scores,
        roundBreak: { roundWinnerId: prev.game.winnerId, until: Date.now() + SERIES.roundBreakMs },
      }
    })
  }, [s.game, s.roundBreak, s.seriesOver])

  // Reloj de turno. A diferencia del online, acá agotarlo NUNCA hace perder:
  // estás jugando solo y lo más probable es que te hayan interrumpido.
  useEffect(() => {
    const game = s.game
    if (!game || game.status !== 'playing' || s.roundBreak) return
    if (game.players[game.turnIndex].id !== HUMAN_ID) return

    const wait = Math.max(0, s.clockDeadline - Date.now())
    later(() => {
      setS((prev) => {
        const g = prev.game
        if (!g || g.status !== 'playing') return prev
        if (g.players[g.turnIndex].id !== HUMAN_ID) return prev
        if (Date.now() < prev.clockDeadline) return prev
        const action = autoAction(g)
        if (!action) return prev
        const r = applyAction(g, action)
        if (!r.ok) return prev
        return { ...prev, game: r.state, clockDeadline: Date.now() + SERIES.turnMs }
      })
      toast('Se te acabó el tiempo, jugué por vos.')
    }, wait)
  }, [s.game, s.clockDeadline, s.roundBreak, later, toast])

  const state: AppState = {
    connected: true,
    phase: s.phase === 'playing' ? 'playing' : 'home',
    playerId: HUMAN_ID,
    nickname,
    online: 1,
    roomCode: null,
    view: s.game ? viewFor(s.game, HUMAN_ID) : null,
    series: {
      round: s.round,
      scores: s.scores,
      target: SERIES.target,
      over: s.seriesOver,
      winnerId: s.seriesWinnerId,
    },
    clock: { deadline: s.clockDeadline, turnMs: SERIES.turnMs },
    opponentNickname: BOT_NAME,
    ranked: false,
    toast: s.toast,
    opponentAway: null,
    roundBreak: s.roundBreak,
    rematch: { you: false, them: false },
  }

  const actions: GameActions = {
    setNickname: () => {},
    queue: () => {},
    cancelQueue: () => {},
    createRoom: () => {},
    joinRoom: () => {},
    play: (cardId: string, target?: TargetRef) =>
      commit({ type: 'PLAY', playerId: HUMAN_ID, cardId, ...(target ? { target } : {}) }),
    discard: (cardId: string) => commit({ type: 'DISCARD', playerId: HUMAN_ID, cardId }),
    forfeit: surrender,
    rematch: startSeries,
    goHome: () => {
      clearTimers()
      setS(FRESH)
    },
    toast,
  }

  return { state, actions, startSeries }
}
