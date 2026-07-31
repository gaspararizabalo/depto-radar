import { describe, expect, it } from 'vitest'
import { chooseAction, type Difficulty } from '../src/bot.js'
import { applyAction, autoAction, createGame } from '../src/game.js'
import type { Action, CardKind, GameState } from '../src/types.js'

/** Un "jugador" es cualquier cosa que sepa elegir una acción. */
type Player = (state: GameState) => Action | null

const bot = (d: Difficulty): Player => (s) => chooseAction(s, d)
/** El bot voraz del motor: juega barro y si no lo primero que encuentre. */
const greedy: Player = (s) => autoAction(s)

function newGame(seed: number, first: 0 | 1): GameState {
  return createGame({
    id: `t${seed}`,
    seed,
    players: [
      { id: 'p1', nickname: 'Uno' },
      { id: 'p2', nickname: 'Dos' },
    ],
    firstPlayerIndex: first,
  })
}

/** Enfrenta a dos jugadores y devuelve el índice del ganador (o null si empate). */
function duel(a: Player, b: Player, seed: number, first: 0 | 1): 0 | 1 | null {
  let g = newGame(seed, first)
  let guard = 0
  while (g.status === 'playing' && guard++ < 3000) {
    const action = (g.turnIndex === 0 ? a : b)(g)
    if (!action) break
    const r = applyAction(g, action)
    if (!r.ok) throw new Error(`el bot propuso una jugada ilegal: ${r.error}`)
    g = r.state
  }
  if (g.winnerId === 'p1') return 0
  if (g.winnerId === 'p2') return 1
  return null
}

/**
 * Winrate de `a` contra `b`, alternando quién abre.
 *
 * OJO CON ESTO: abrir vale ~57% de winrate (ver la tabla de balance del README),
 * así que si uno de los dos abre siempre, la medición queda inflada ~7 puntos y
 * no mide al bot sino al sorteo. La primera versión de esta función intercambiaba
 * los asientos pero pasaba `firstPlayerIndex` apuntando al asiento, con lo cual
 * `a` terminaba abriendo igual en todas las partidas.
 *
 * Ahora abre SIEMPRE el asiento 0 y lo que alterna es quién se sienta ahí.
 * Chequeo de cordura: winrate(x, y) y winrate(y, x) tienen que sumar ~100%.
 */
function winrate(a: Player, b: Player, games = 300): number {
  let wins = 0
  let decided = 0
  for (let i = 0; i < games; i++) {
    const aIsSeatZero = i % 2 === 0
    const result = aIsSeatZero ? duel(a, b, i, 0) : duel(b, a, i, 0)
    if (result === null) continue
    decided++
    const aWon = aIsSeatZero ? result === 0 : result === 1
    if (aWon) wins++
  }
  return decided === 0 ? 0.5 : wins / decided
}

describe('bot', () => {
  it('nunca propone una jugada que el motor rechace', () => {
    for (const d of ['facil', 'normal', 'dificil'] as Difficulty[]) {
      let g = newGame(7, 0)
      for (let i = 0; i < 200 && g.status === 'playing'; i++) {
        const action = chooseAction(g, d)
        if (!action) break
        const r = applyAction(g, action)
        expect(r.ok).toBe(true)
        if (!r.ok) break
        g = r.state
      }
    }
  })

  it('devuelve null cuando la partida ya terminó', () => {
    const g = newGame(1, 0)
    const done = applyAction(g, { type: 'FORFEIT', playerId: 'p1' })
    expect(done.ok).toBe(true)
    if (done.ok) expect(chooseAction(done.state, 'dificil')).toBeNull()
  })

  it('remata: si puede ganar en el turno, gana', () => {
    const g = newGame(3, 0)
    // Dos cerdos ya sucios y barro en mano: la única jugada correcta es cerrar.
    g.players[0].pigs[0]!.dirty = true
    g.players[0].pigs[1]!.dirty = true
    g.players[0].hand = [
      { id: 'x-mud', kind: 'MUD' as CardKind },
      { id: 'x-barn', kind: 'BARN' as CardKind },
      { id: 'x-rod', kind: 'LIGHTNING_ROD' as CardKind },
    ]

    const action = chooseAction(g, 'dificil')
    expect(action).not.toBeNull()
    const r = applyAction(g, action!)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state.status).toBe('finished')
      expect(r.state.winnerId).toBe('p1')
    }
  })

  it('frena al rival que está a un cerdo de ganar', () => {
    const g = newGame(5, 0)
    // El rival tiene 2 de 3 sucios y sin proteger: hay que lavarle uno ya.
    g.players[1].pigs[0]!.dirty = true
    g.players[1].pigs[1]!.dirty = true
    g.players[0].hand = [
      { id: 'x-farmer', kind: 'FARMER' as CardKind },
      { id: 'x-rod', kind: 'LIGHTNING_ROD' as CardKind },
      { id: 'x-lock', kind: 'BARN_LOCK' as CardKind },
    ]

    const action = chooseAction(g, 'dificil')
    expect(action).not.toBeNull()
    const r = applyAction(g, action!)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const stillDirty = r.state.players[1].pigs.filter((p) => p.dirty).length
      expect(stillDirty).toBe(1)
    }
  })

  it('prefiere techar el barro antes que dejarlo a la intemperie', () => {
    const g = newGame(11, 0)
    // Un cerdo sucio sin techo y establo en mano. Ensuciar otro lo deja todo
    // expuesto a la primera lluvia; techar consolida lo ganado.
    g.players[0].pigs[0]!.dirty = true
    g.players[0].hand = [
      { id: 'x-barn', kind: 'BARN' as CardKind },
      { id: 'x-lock', kind: 'BARN_LOCK' as CardKind },
    ]

    const action = chooseAction(g, 'dificil')
    expect(action?.type).toBe('PLAY')
    expect(action && 'cardId' in action && action.cardId).toBe('x-barn')
  })

  /*
   * UMBRALES: medidos, no aspiracionales.
   *
   * Los efectos reales son de ~58-60%, no de 70-80% como uno esperaría entre un
   * bot óptimo y uno que tira al azar el 45% de las veces. El motivo es del
   * JUEGO, no del bot: con la regla de "jugá si podés" y manos de 3 cartas, la
   * mayoría de los turnos tienen una o dos opciones legales y casi siempre la
   * obvia es barro. Hay menos decisiones reales por partida de lo que parece.
   *
   * Eso importa para el producto: un juego con poca profundidad de decisión
   * aguanta mal una ladder competitiva, porque el ranking termina midiendo
   * suerte de reparto más que habilidad. Es la primera cosa a atacar si el
   * ranked va en serio (manos más grandes, más cartas de respuesta).
   *
   * Con 600 partidas el error estándar es ~2%, así que 0.53 queda a más de 2
   * desvíos del efecto medido y no debería titilar.
   */
  it('difícil le gana al voraz del motor', () => {
    const rate = winrate(bot('dificil'), greedy, 600)
    console.log(`    difícil vs voraz: ${(rate * 100).toFixed(1)}%`)
    expect(rate).toBeGreaterThan(0.53)
  }, 30_000)

  it('difícil le gana a fácil', () => {
    const rate = winrate(bot('dificil'), bot('facil'), 600)
    console.log(`    difícil vs fácil: ${(rate * 100).toFixed(1)}%`)
    expect(rate).toBeGreaterThan(0.53)
  }, 30_000)

  it('normal queda entre fácil y difícil', () => {
    const vsEasy = winrate(bot('normal'), bot('facil'), 400)
    const vsHard = winrate(bot('normal'), bot('dificil'), 400)
    console.log(`    normal vs fácil: ${(vsEasy * 100).toFixed(1)}%  |  normal vs difícil: ${(vsHard * 100).toFixed(1)}%`)
    expect(vsEasy).toBeGreaterThan(0.5)
    expect(vsHard).toBeLessThan(0.5)
  }, 30_000)

  it('fácil no es un muñeco: le gana alguna al difícil', () => {
    // Si fácil ganara el 0%, el modo dejaría de ser divertido para un principiante.
    const rate = winrate(bot('facil'), bot('dificil'), 200)
    console.log(`    fácil vs difícil: ${(rate * 100).toFixed(1)}%`)
    expect(rate).toBeGreaterThan(0.1)
  }, 30_000)

  it('la medición es simétrica (guarda contra el sesgo de quién abre)', () => {
    // Si esto falla, el harness está midiendo la ventaja de abrir y no al bot.
    const ab = winrate(bot('dificil'), bot('facil'), 400)
    const ba = winrate(bot('facil'), bot('dificil'), 400)
    console.log(`    simetría: ${(ab * 100).toFixed(1)}% + ${(ba * 100).toFixed(1)}% = ${((ab + ba) * 100).toFixed(1)}%`)
    expect(ab + ba).toBeGreaterThan(0.88)
    expect(ab + ba).toBeLessThan(1.12)
  }, 30_000)
})
