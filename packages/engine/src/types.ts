/**
 * Tipos del motor de juego.
 *
 * NOTA DE NAMING: los nombres de carta son los del juego original (Drecksau, de
 * Frank Bebenroth / Kosmos) y estan usados como PLACEHOLDER mientras prototipamos.
 * Antes de publicar hay que reemplazar nombres, arte y textos por material propio.
 * La mecanica en si no es apropiable; la marca y el arte si.
 */

export type CardKind =
  /** Matsch: ensucia un cerdo propio limpio. Es la carta que te hace ganar. */
  | 'MUD'
  /** Regen: limpia TODOS los cerdos sucios sin establo, incluidos los tuyos. */
  | 'RAIN'
  /** Stall: se pone sobre un cerdo sucio propio. Lo vuelve inmune a la lluvia. */
  | 'BARN'
  /** Blitz: destruye un establo rival que no tenga pararrayos. */
  | 'LIGHTNING'
  /** Blitzableiter: protege un establo propio del rayo. */
  | 'LIGHTNING_ROD'
  /** Bauer: lava un cerdo sucio rival que no este tras un establo con cerrojo. */
  | 'FARMER'
  /** Stallsperre: protege un establo propio del granjero. */
  | 'BARN_LOCK'

export interface Card {
  id: string
  kind: CardKind
}

export interface Pig {
  id: string
  /** Objetivo del juego: tener todos tus cerdos sucios a la vez. */
  dirty: boolean
  /**
   * Establo. Protege de la lluvia. Guardamos la carta y no un booleano porque
   * las cartas pegadas a un cerdo SALEN de circulacion: no vuelven al descarte
   * hasta que un rayo tira el establo abajo. Eso cambia la densidad del mazo a
   * medida que avanza la partida (queda proporcionalmente mas barro), que es
   * una dinamica real del juego y no queremos perderla.
   */
  barn: Card | null
  /** Pararrayos. Solo existe si hay establo. Protege el establo del rayo. */
  rod: Card | null
  /** Cerrojo. Solo existe si hay establo. Protege al cerdo del granjero. */
  lock: Card | null
}

export interface PlayerState {
  id: string
  nickname: string
  pigs: Pig[]
  hand: Card[]
}

export type EndReason = 'ALL_DIRTY' | 'FORFEIT' | 'TURN_LIMIT' | 'DECK_EXHAUSTED'

export interface GameConfig {
  pigsPerPlayer: number
  handSize: number
  /** Corta la partida en empate si nadie gana. Evita loops infinitos lluvia/barro. */
  maxTurns: number
  deck: Record<CardKind, number>
}

export interface TargetRef {
  playerId: string
  pigId: string
}

/**
 * Omit sobre una union la colapsa a sus claves comunes. Este la distribuye
 * miembro a miembro, que es lo que necesitamos para construir LogEntry sin
 * repetir `seq` y `turn` en cada variante.
 */
export type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never

export type LogEntry =
  | { seq: number; turn: number; type: 'PLAY'; actorId: string; card: CardKind; target?: TargetRef; cleaned?: TargetRef[] }
  | { seq: number; turn: number; type: 'DISCARD'; actorId: string; card: CardKind }
  | { seq: number; turn: number; type: 'RESHUFFLE'; actorId: string }
  | { seq: number; turn: number; type: 'END'; actorId: string; reason: EndReason; winnerId: string | null }

export interface GameState {
  id: string
  players: [PlayerState, PlayerState]
  /** Indice en `players` del jugador al que le toca. */
  turnIndex: 0 | 1
  turnNumber: number
  deck: Card[]
  discard: Card[]
  /** Estado del PRNG. Mantiene applyAction puro y determinista. */
  rng: number
  status: 'playing' | 'finished'
  winnerId: string | null
  endReason: EndReason | null
  log: LogEntry[]
  seq: number
  config: GameConfig
}

export type Action =
  | { type: 'PLAY'; playerId: string; cardId: string; target?: TargetRef }
  | { type: 'DISCARD'; playerId: string; cardId: string }
  | { type: 'FORFEIT'; playerId: string }

export type ApplyResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string }

/** Una jugada concreta que el jugador de turno puede hacer ahora mismo. */
export interface LegalMove {
  cardId: string
  kind: CardKind
  /** Vacio = la carta no necesita objetivo (lluvia). */
  targets: TargetRef[]
}
