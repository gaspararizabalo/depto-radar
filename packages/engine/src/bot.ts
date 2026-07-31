import { applyAction, legalMoves } from './game.js'
import type { Action, GameState, PlayerState } from './types.js'

/**
 * Rival para el modo contra la máquina.
 *
 * No tiene reglas escritas a mano del tipo "si pasa X jugá Y". Aprovecha que
 * `applyAction` es puro: simula cada jugada posible, mira cómo queda el tablero
 * y elige la mejor. Eso hace que juegue razonable con cualquier carta nueva que
 * agreguemos, sin tocar el bot.
 */

export type Difficulty = 'facil' | 'normal' | 'dificil'

interface Weights {
  /** Probabilidad de tirar una jugada al azar en vez de la mejor. */
  blunder: number
}

/*
 * POR QUE NO HAY BUSQUEDA A DOS NIVELES.
 *
 * La primera version miraba la mejor respuesta del rival antes de decidir. Se
 * saco por una razon de correctitud, no de fuerza: para simular esas respuestas
 * hay que leer la MANO DEL RIVAL, que es informacion oculta. Un bot que ve tus
 * cartas no es un rival dificil, es un rival que hace trampa — y ademas lo
 * volvia cobarde, porque al ver una lluvia en la mano contraria nunca se
 * animaba a ensuciar un cerdo.
 *
 * Con un solo nivel el bot mira unicamente el tablero resultante: cerdos,
 * establos, pararrayos y cerrojos, que son publicos. No usa nada que vos no
 * puedas ver.
 *
 * (Nota historica: hubo una medicion que parecia mostrar que el lookahead jugaba
 * PEOR. Estaba mal: el harness le daba a un bando la ventaja de abrir siempre,
 * que vale ~7 puntos. Ver el comentario de `winrate` en test/bot.test.ts. La
 * razon buena para no tener lookahead sigue siendo la informacion oculta.)
 *
 * La dificultad es cada cuanto el bot NO elige la mejor jugada. Se siente mas
 * humano que un rival que juega raro de forma consistente.
 */
const PROFILES: Record<Difficulty, Weights> = {
  facil: { blunder: 0.45 },
  normal: { blunder: 0.28 },
  dificil: { blunder: 0 },
}

function dirty(p: PlayerState): number {
  return p.pigs.filter((pig) => pig.dirty).length
}

/** Sucio y bajo techo: progreso que la lluvia ya no puede borrar. */
function secured(p: PlayerState): number {
  return p.pigs.filter((pig) => pig.dirty && pig.barn !== null).length
}

/** Sucio, techado y trabado: intocable salvo por un rayo. */
function locked(p: PlayerState): number {
  return p.pigs.filter((pig) => pig.dirty && pig.barn !== null && pig.lock !== null).length
}

/**
 * Puntaje del tablero desde el punto de vista de `meIndex`.
 * Un cerdo sucio vale, pero uno sucio y protegido vale bastante más: el barro
 * sin techo te lo borra la primera lluvia.
 */
function evaluate(state: GameState, meIndex: 0 | 1): number {
  const me = state.players[meIndex]
  const them = state.players[meIndex === 0 ? 1 : 0]

  if (state.status === 'finished') {
    if (state.winnerId === me.id) return 10_000
    if (state.winnerId === them.id) return -10_000
    return 0
  }

  const mine = dirty(me) * 10 + secured(me) * 6 + locked(me) * 3
  const theirs = dirty(them) * 10 + secured(them) * 6 + locked(them) * 3

  // Estar a un cerdo de ganar es mucho más valioso que la suma de las partes;
  // y que el rival esté a uno es una emergencia.
  const meToWin = me.pigs.length - dirty(me)
  const themToWin = them.pigs.length - dirty(them)
  const urgency = (themToWin === 1 ? -35 : 0) + (meToWin === 1 ? 25 : 0)

  return mine - theirs + urgency
}

function allMoves(state: GameState): Action[] {
  const actor = state.players[state.turnIndex]
  const moves = legalMoves(state)

  if (moves.length === 0) {
    return actor.hand.map((c) => ({ type: 'DISCARD' as const, playerId: actor.id, cardId: c.id }))
  }

  const out: Action[] = []
  for (const m of moves) {
    if (m.targets.length === 0) {
      out.push({ type: 'PLAY', playerId: actor.id, cardId: m.cardId })
    } else {
      for (const t of m.targets) {
        out.push({ type: 'PLAY', playerId: actor.id, cardId: m.cardId, target: t })
      }
    }
  }
  return out
}

export function chooseAction(state: GameState, difficulty: Difficulty): Action | null {
  if (state.status !== 'playing') return null

  const meIndex = state.turnIndex
  const profile = PROFILES[difficulty]
  const options = allMoves(state)
  if (options.length === 0) return null

  if (profile.blunder > 0 && Math.random() < profile.blunder) {
    return options[Math.floor(Math.random() * options.length)]!
  }

  let best: Action | null = null
  let bestScore = -Infinity

  for (const action of options) {
    const r = applyAction(state, action)
    if (!r.ok) continue

    // Solo mira el tablero que queda: cerdos, establos, pararrayos y cerrojos.
    // Todo eso es informacion publica, asi que el bot no ve nada que vos no veas.
    let score = evaluate(r.state, meIndex)
    // Desempate al azar para que no repita siempre la misma linea.
    score += Math.random() * 0.01

    if (score > bestScore) {
      bestScore = score
      best = action
    }
  }

  return best ?? options[0]!
}

