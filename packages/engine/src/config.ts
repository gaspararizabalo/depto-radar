import type { CardKind, GameConfig } from './types.js'

/**
 * PERILLAS DE BALANCE. Todo lo tuneable vive aca a proposito: cuando tengamos
 * partidas reales queremos poder mover estos numeros sin tocar la logica.
 *
 * La composicion de mazo replica la del juego fisico (54 cartas de accion).
 * OJO: esta pensada para 3-4 jugadores. En 1v1 la lluvia pega mucho mas fuerte
 * porque solo hay dos tableros que limpiar, asi que es el primer numero a
 * revisar cuando midamos duracion de partida y tasa de remontadas.
 */
export const DEFAULT_DECK: Record<CardKind, number> = {
  MUD: 21,
  RAIN: 8,
  BARN: 9,
  LIGHTNING: 4,
  LIGHTNING_ROD: 4,
  FARMER: 4,
  BARN_LOCK: 4,
}

export const DEFAULT_CONFIG: GameConfig = {
  /**
   * 3 en vez de los 4-5 del juego fisico. En 1v1 con 4+ cerdos las partidas se
   * estiran y el loop lluvia-vs-barro se vuelve tedioso. 3 deja partidas de
   * 3-5 minutos, que es lo que queremos para el "revancha" instantaneo.
   */
  pigsPerPlayer: 3,
  handSize: 3,
  /** Red de seguridad contra tablas eternas. Si se llega aca, es empate. */
  maxTurns: 300,
  deck: DEFAULT_DECK,
}

/**
 * Reglas de la SERIE (no de la ronda). Viven en el motor y no en el servidor
 * porque también las necesita el modo contra la máquina, que corre entero en el
 * navegador. Si esto se duplicara, tarde o temprano las dos copias divergirían.
 */
export const SERIES = {
  /** Rondas para llevarse la serie. 2 = al mejor de 3. */
  target: 2,
  turnMs: 30_000,
  roundBreakMs: 4_500,
  /** Tres timeouts seguidos y se pierde la serie entera. */
  maxConsecutiveTimeouts: 3,
} as const

/**
 * Quién abre la próxima ronda.
 *
 * Se alterna, salvo en la ronda decisiva (empate a `target - 1`), donde se
 * sortea de nuevo: si alternáramos, uno llegaría al desempate habiendo abierto
 * dos veces, y abrir da ~57% de winrate. Ver la tabla de balance del README.
 */
export function nextFirstPlayer(
  previousFirst: 0 | 1,
  scores: readonly [number, number],
  target: number = SERIES.target,
  coinFlip: () => boolean = () => Math.random() < 0.5,
): 0 | 1 {
  const isDecider = scores[0] === scores[1] && scores[0] === target - 1
  if (isDecider) return coinFlip() ? 0 : 1
  return previousFirst === 0 ? 1 : 0
}

export const CARD_KINDS: CardKind[] = [
  'MUD',
  'RAIN',
  'BARN',
  'LIGHTNING',
  'LIGHTNING_ROD',
  'FARMER',
  'BARN_LOCK',
]

/** Cuantas cartas de accion tiene el mazo con una config dada. */
export function deckSize(config: GameConfig): number {
  return CARD_KINDS.reduce((n, k) => n + (config.deck[k] ?? 0), 0)
}
