import type { CardKind, GameConfig } from './types.js'

/**
 * PERILLAS DE BALANCE. Todo lo tuneable vive aca a proposito: cuando tengamos
 * partidas reales queremos poder mover estos numeros sin tocar la logica.
 *
 * La composicion replica la del juego fisico (54 cartas de accion).
 *
 * NO BAJES EL BARRO PARA "QUE NO SEA UNA CARRERA". Suena logico y esta medido
 * que hace lo contrario, porque el barro es la unica carta casi siempre jugable:
 * al sacarlo te quedan mas manos de establos sin cerdo sucio y granjeros sin
 * objetivo, o sea MAS turnos sin decision, y ademas las rondas se alargan mucho.
 *
 *   barro   turnos forzados   turnos/ronda
 *     21        45.7%             19.1
 *     16        53.5%             34.2
 *     12        60.0%             68.4
 *     10        63.8%            106.4
 *
 * La palanca que si funciona para dar profundidad es `handSize`. Ver abajo.
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
   * 3 en vez de los 4-5 del juego fisico. En 1v1 con 4+ cerdos las rondas se van
   * a ~37 turnos y una serie al mejor de 3 pasa de 10 minutos. 3 deja rondas de
   * ~20 turnos, que es lo que hace viable el boton de revancha.
   */
  pigsPerPlayer: 3,
  /**
   * 5, no 3.
   *
   * ESTE ES EL NUMERO QUE ARREGLA LA PROFUNDIDAD DEL JUEGO. Con mano de 3, el
   * 45.7% de los turnos tenia UNA sola jugada legal: no habia nada que decidir,
   * solo ejecutabas. Con mano de 5 eso baja al 22.2% y los turnos con 3 o mas
   * opciones pasan de 19.9% a 57.7%.
   *
   * Medido (misma metodologia que `npm run balance`):
   *
   *   mano  opc/turno  forzados  manos muertas  brecha  turnos/ronda
   *     3      1.74      45.7%       24.4%       56.2%      19.1
   *     5      2.77      22.2%        7.8%       63.8%      19.9
   *
   * "brecha" = winrate del bot optimo contra uno que tira al azar el 45% de las
   * veces. Que suba de 56% a 64% significa que jugar bien pesa mas.
   *
   * Y lo mejor: la duracion no cambia (19.1 -> 19.9 turnos). Sale gratis.
   */
  handSize: 5,
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
