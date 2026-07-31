import { legalMoves, mustDiscard } from './game.js'
import type { Card, GameConfig, GameState, LegalMove, LogEntry, Pig } from './types.js'

/**
 * Vista filtrada por jugador ("niebla de guerra").
 *
 * ESTO ES LA REGLA DE ORO ANTITRAMPA: el cliente jamas recibe el GameState
 * completo, porque contiene la mano del rival y el orden del mazo. El servidor
 * manda unicamente lo que ese jugador tiene derecho a ver. Si en algun momento
 * mandamos el estado crudo "porque es mas comodo", el ranked deja de valer nada:
 * cualquiera abre el DevTools y ve las cartas del otro.
 */

export interface PlayerView {
  id: string
  nickname: string
  /** Los cerdos y lo que tienen encima son informacion publica. */
  pigs: Pig[]
  /** Solo viene poblada para vos. Para el rival es null. */
  hand: Card[] | null
  handCount: number
}

export interface GameView {
  id: string
  /** Indice de QUIEN esta mirando esta vista. */
  youIndex: 0 | 1
  players: [PlayerView, PlayerView]
  turnIndex: 0 | 1
  turnNumber: number
  yourTurn: boolean
  deckCount: number
  discardCount: number
  /** Solo la de arriba: el resto del descarte no hace falta y es ruido. */
  discardTop: Card | null
  status: GameState['status']
  winnerId: string | null
  endReason: GameState['endReason']
  log: LogEntry[]
  config: GameConfig
  /** Precalculadas por el servidor. La UI no adivina que es legal. */
  legalMoves: LegalMove[]
  mustDiscard: boolean
}

export function viewFor(state: GameState, playerId: string): GameView {
  const youIndex: 0 | 1 = state.players[0].id === playerId ? 0 : 1
  const yourTurn = state.status === 'playing' && state.turnIndex === youIndex

  const players = state.players.map((p): PlayerView => {
    const isYou = p.id === playerId
    return {
      id: p.id,
      nickname: p.nickname,
      pigs: structuredClone(p.pigs),
      hand: isYou ? structuredClone(p.hand) : null,
      handCount: p.hand.length,
    }
  }) as [PlayerView, PlayerView]

  return {
    id: state.id,
    youIndex,
    players,
    turnIndex: state.turnIndex,
    turnNumber: state.turnNumber,
    yourTurn,
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    discardTop: state.discard.length ? structuredClone(state.discard[state.discard.length - 1]!) : null,
    status: state.status,
    winnerId: state.winnerId,
    endReason: state.endReason,
    log: structuredClone(state.log),
    config: state.config,
    legalMoves: yourTurn ? legalMoves(state) : [],
    mustDiscard: yourTurn ? mustDiscard(state) : false,
  }
}
