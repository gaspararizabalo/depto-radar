import type { TargetRef } from './types.js'
import type { GameView } from './view.js'

/**
 * Protocolo WebSocket compartido entre cliente y servidor.
 * Vive en el engine para que las dos puntas compilen contra los mismos tipos:
 * si cambio un mensaje y me olvido de la otra punta, no compila.
 */

export const PROTOCOL_VERSION = 1

/** Estado de reloj de turno que el servidor emite junto con la vista. */
export interface ClockState {
  /** Milisegundos que le quedan al jugador de turno. */
  msLeft: number
  turnMs: number
}

/**
 * Estado de la serie (al mejor de 3).
 *
 * POR QUE SERIE Y NO PARTIDA UNICA: simulando 4000 partidas, el jugador que
 * abre gana el 57.1%. Para una ladder eso es inaceptable — el resultado lo
 * decide el sorteo inicial. Al mejor de 3 con primer jugador alternado (y
 * sorteo fresco en el desempate) la ventaja se diluye casi por completo.
 */
export interface SeriesState {
  round: number
  /** Rondas ganadas, con el mismo orden de indices que `view.players`. */
  scores: [number, number]
  /** Rondas necesarias para llevarse la serie. */
  target: number
  over: boolean
  winnerId: string | null
}

export type ClientMessage =
  /** Primer mensaje. `playerId` viene de localStorage y permite reconectar. */
  | { t: 'hello'; playerId: string; nickname: string; version: number }
  | { t: 'queue' }
  | { t: 'cancelQueue' }
  | { t: 'createRoom' }
  | { t: 'joinRoom'; code: string }
  | { t: 'leaveRoom' }
  | { t: 'play'; cardId: string; target?: TargetRef }
  | { t: 'discard'; cardId: string }
  | { t: 'forfeit' }
  | { t: 'rematch' }
  | { t: 'ping' }

export type ServerMessage =
  | { t: 'welcome'; playerId: string; nickname: string; online: number }
  | { t: 'queued'; position: number }
  | { t: 'queueCancelled' }
  | { t: 'roomCreated'; code: string }
  | { t: 'roomJoined'; code: string; opponentNickname: string | null }
  | { t: 'matchFound'; gameId: string; opponentNickname: string; ranked: boolean }
  /** La verdad del juego. Siempre filtrada por `viewFor`. */
  | { t: 'state'; view: GameView; clock: ClockState; series: SeriesState }
  /** Ronda terminada; en unos segundos arranca la siguiente. */
  | { t: 'roundOver'; series: SeriesState; roundWinnerId: string | null; nextInMs: number }
  | { t: 'opponentDisconnected'; msUntilForfeit: number }
  | { t: 'opponentReconnected' }
  | { t: 'opponentLeft' }
  | { t: 'rematchOffered'; byYou: boolean }
  | { t: 'error'; message: string; fatal?: boolean }
  | { t: 'pong' }
