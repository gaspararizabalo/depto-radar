import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, deckSize } from '../src/config.js'
import {
  applyAction,
  autoAction,
  createGame,
  isPlayable,
  legalMoves,
  mustDiscard,
  targetsFor,
} from '../src/game.js'
import type { Action, Card, CardKind, GameState, Pig } from '../src/types.js'
import { viewFor } from '../src/view.js'

const P1 = { id: 'p1', nickname: 'Ana' }
const P2 = { id: 'p2', nickname: 'Beto' }

function newGame(seed = 42, firstPlayerIndex: 0 | 1 = 0): GameState {
  return createGame({ id: 'g1', seed, players: [P1, P2], firstPlayerIndex })
}

let cardCounter = 0
function testCard(kind: CardKind): Card {
  cardCounter += 1
  return { id: `test-${kind}-${cardCounter}`, kind }
}

/** Pone una carta concreta en la mano de un jugador y devuelve un estado nuevo. */
function withCard(state: GameState, playerIndex: 0 | 1, kind: CardKind): { state: GameState; card: Card } {
  const next = structuredClone(state)
  const card = testCard(kind)
  next.players[playerIndex].hand.push(card)
  return { state: next, card }
}

function pigOf(state: GameState, playerIndex: 0 | 1, pigIndex: number): Pig {
  return state.players[playerIndex].pigs[pigIndex]!
}

function ref(state: GameState, playerIndex: 0 | 1, pigIndex: number) {
  return { playerId: state.players[playerIndex].id, pigId: pigOf(state, playerIndex, pigIndex).id }
}

/** Aplica una accion y explota si el motor la rechaza. Ruido fuera de los tests. */
function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action)
  if (!r.ok) throw new Error(`accion rechazada: ${r.error}`)
  return r.state
}

describe('createGame', () => {
  it('reparte manos completas y arranca con todos los cerdos limpios', () => {
    const g = newGame()
    expect(g.players[0].hand).toHaveLength(DEFAULT_CONFIG.handSize)
    expect(g.players[1].hand).toHaveLength(DEFAULT_CONFIG.handSize)
    expect(g.players[0].pigs).toHaveLength(DEFAULT_CONFIG.pigsPerPlayer)
    expect(g.players.every((p) => p.pigs.every((pig) => !pig.dirty))).toBe(true)
    expect(g.status).toBe('playing')
  })

  it('no pierde ni duplica cartas al repartir', () => {
    const g = newGame()
    const total = g.deck.length + g.players[0].hand.length + g.players[1].hand.length
    expect(total).toBe(deckSize(DEFAULT_CONFIG))
    const ids = [...g.deck, ...g.players[0].hand, ...g.players[1].hand].map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('es determinista: misma semilla, misma partida', () => {
    const a = newGame(123)
    const b = newGame(123)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('semillas distintas dan repartos distintos', () => {
    expect(JSON.stringify(newGame(1))).not.toBe(JSON.stringify(newGame(2)))
  })
})

describe('barro (MUD)', () => {
  it('ensucia un cerdo propio limpio', () => {
    const { state, card } = withCard(newGame(), 0, 'MUD')
    const next = must(state, { type: 'PLAY', playerId: 'p1', cardId: card.id, target: ref(state, 0, 0) })
    expect(pigOf(next, 0, 0).dirty).toBe(true)
  })

  it('no puede ensuciar cerdos del rival', () => {
    const { state, card } = withCard(newGame(), 0, 'MUD')
    const r = applyAction(state, { type: 'PLAY', playerId: 'p1', cardId: card.id, target: ref(state, 1, 0) })
    expect(r.ok).toBe(false)
  })

  it('no puede ensuciar un cerdo que ya esta sucio', () => {
    let g = newGame()
    g.players[0].pigs[0]!.dirty = true
    const { state, card } = withCard(g, 0, 'MUD')
    const r = applyAction(state, { type: 'PLAY', playerId: 'p1', cardId: card.id, target: ref(state, 0, 0) })
    expect(r.ok).toBe(false)
  })

  it('ensuciar el ultimo cerdo gana la partida', () => {
    const g = newGame()
    g.players[0].pigs[0]!.dirty = true
    g.players[0].pigs[1]!.dirty = true
    const { state, card } = withCard(g, 0, 'MUD')
    const next = must(state, { type: 'PLAY', playerId: 'p1', cardId: card.id, target: ref(state, 0, 2) })
    expect(next.status).toBe('finished')
    expect(next.winnerId).toBe('p1')
    expect(next.endReason).toBe('ALL_DIRTY')
  })
})

describe('lluvia (RAIN)', () => {
  it('limpia los cerdos sucios de LOS DOS jugadores', () => {
    const g = newGame()
    g.players[0].pigs[0]!.dirty = true
    g.players[1].pigs[0]!.dirty = true
    const { state, card } = withCard(g, 0, 'RAIN')
    const next = must(state, { type: 'PLAY', playerId: 'p1', cardId: card.id })
    expect(pigOf(next, 0, 0).dirty).toBe(false)
    expect(pigOf(next, 1, 0).dirty).toBe(false)
  })

  it('no toca a los cerdos bajo techo', () => {
    const g = newGame()
    g.players[1].pigs[0]!.dirty = true
    g.players[1].pigs[0]!.barn = testCard('BARN')
    g.players[1].pigs[1]!.dirty = true
    const { state, card } = withCard(g, 0, 'RAIN')
    const next = must(state, { type: 'PLAY', playerId: 'p1', cardId: card.id })
    expect(pigOf(next, 1, 0).dirty).toBe(true) // protegido
    expect(pigOf(next, 1, 1).dirty).toBe(false) // a la intemperie
  })

  it('no se puede jugar si no hay nada que lavar', () => {
    const g = newGame() // todos limpios
    expect(isPlayable(g, 0, 'RAIN')).toBe(false)
  })

  it('registra en el log que cerdos limpio', () => {
    const g = newGame()
    g.players[1].pigs[0]!.dirty = true
    const { state, card } = withCard(g, 0, 'RAIN')
    const next = must(state, { type: 'PLAY', playerId: 'p1', cardId: card.id })
    const entry = next.log.find((l) => l.type === 'PLAY')
    expect(entry && 'cleaned' in entry && entry.cleaned).toHaveLength(1)
  })
})

describe('establo (BARN)', () => {
  it('solo se puede levantar sobre un cerdo propio y sucio', () => {
    const g = newGame()
    expect(targetsFor(g, 0, 'BARN')).toHaveLength(0) // ninguno sucio todavia
    g.players[0].pigs[0]!.dirty = true
    expect(targetsFor(g, 0, 'BARN')).toHaveLength(1)
  })

  it('no va al descarte: se queda sobre el cerdo', () => {
    const g = newGame()
    g.players[0].pigs[0]!.dirty = true
    const { state, card } = withCard(g, 0, 'BARN')
    const before = state.discard.length
    const next = must(state, { type: 'PLAY', playerId: 'p1', cardId: card.id, target: ref(state, 0, 0) })
    expect(pigOf(next, 0, 0).barn?.id).toBe(card.id)
    expect(next.discard.length).toBe(before)
  })

  it('no se puede apilar un segundo establo', () => {
    const g = newGame()
    g.players[0].pigs[0]!.dirty = true
    g.players[0].pigs[0]!.barn = testCard('BARN')
    expect(targetsFor(g, 0, 'BARN')).toHaveLength(0)
  })
})

describe('rayo (LIGHTNING) y pararrayos', () => {
  it('voltea el establo del rival y devuelve las cartas al descarte', () => {
    const g = newGame()
    g.players[1].pigs[0]!.dirty = true
    g.players[1].pigs[0]!.barn = testCard('BARN')
    g.players[1].pigs[0]!.lock = testCard('BARN_LOCK')
    const { state, card } = withCard(g, 0, 'LIGHTNING')
    const before = state.discard.length
    const next = must(state, { type: 'PLAY', playerId: 'p1', cardId: card.id, target: ref(state, 1, 0) })
    expect(pigOf(next, 1, 0).barn).toBeNull()
    expect(pigOf(next, 1, 0).lock).toBeNull()
    // vuelven a circulacion el establo, el cerrojo y el propio rayo
    expect(next.discard.length).toBe(before + 3)
    expect(pigOf(next, 1, 0).dirty).toBe(true) // el rayo no lava, solo demuele
  })

  it('el pararrayos hace inmune al establo', () => {
    const g = newGame()
    g.players[1].pigs[0]!.dirty = true
    g.players[1].pigs[0]!.barn = testCard('BARN')
    g.players[1].pigs[0]!.rod = testCard('LIGHTNING_ROD')
    expect(targetsFor(g, 0, 'LIGHTNING')).toHaveLength(0)
  })

  it('no se puede tirar un rayo sobre el propio establo', () => {
    const g = newGame()
    g.players[0].pigs[0]!.dirty = true
    g.players[0].pigs[0]!.barn = testCard('BARN')
    expect(targetsFor(g, 0, 'LIGHTNING')).toHaveLength(0)
  })

  it('el pararrayos necesita un establo debajo', () => {
    const g = newGame()
    expect(targetsFor(g, 0, 'LIGHTNING_ROD')).toHaveLength(0)
    g.players[0].pigs[0]!.dirty = true
    g.players[0].pigs[0]!.barn = testCard('BARN')
    expect(targetsFor(g, 0, 'LIGHTNING_ROD')).toHaveLength(1)
  })
})

describe('granjero (FARMER) y cerrojo', () => {
  it('lava un cerdo sucio del rival', () => {
    const g = newGame()
    g.players[1].pigs[0]!.dirty = true
    const { state, card } = withCard(g, 0, 'FARMER')
    const next = must(state, { type: 'PLAY', playerId: 'p1', cardId: card.id, target: ref(state, 1, 0) })
    expect(pigOf(next, 1, 0).dirty).toBe(false)
  })

  it('el establo SOLO no alcanza para frenarlo', () => {
    const g = newGame()
    g.players[1].pigs[0]!.dirty = true
    g.players[1].pigs[0]!.barn = testCard('BARN')
    expect(targetsFor(g, 0, 'FARMER')).toHaveLength(1)
  })

  it('establo + cerrojo si lo frenan', () => {
    const g = newGame()
    g.players[1].pigs[0]!.dirty = true
    g.players[1].pigs[0]!.barn = testCard('BARN')
    g.players[1].pigs[0]!.lock = testCard('BARN_LOCK')
    expect(targetsFor(g, 0, 'FARMER')).toHaveLength(0)
  })

  it('el establo sigue en pie despues del lavado', () => {
    const g = newGame()
    g.players[1].pigs[0]!.dirty = true
    g.players[1].pigs[0]!.barn = testCard('BARN')
    const { state, card } = withCard(g, 0, 'FARMER')
    const next = must(state, { type: 'PLAY', playerId: 'p1', cardId: card.id, target: ref(state, 1, 0) })
    expect(pigOf(next, 1, 0).dirty).toBe(false)
    expect(pigOf(next, 1, 0).barn).not.toBeNull()
  })

  it('no se puede lavar un cerdo que ya esta limpio', () => {
    const g = newGame()
    expect(targetsFor(g, 0, 'FARMER')).toHaveLength(0)
  })

  it('el cerrojo necesita un establo debajo', () => {
    const g = newGame()
    expect(targetsFor(g, 0, 'BARN_LOCK')).toHaveLength(0)
  })
})

describe('flujo de turno', () => {
  it('el turno pasa al rival despues de jugar', () => {
    const { state, card } = withCard(newGame(1, 0), 0, 'MUD')
    const next = must(state, { type: 'PLAY', playerId: 'p1', cardId: card.id, target: ref(state, 0, 0) })
    expect(next.turnIndex).toBe(1)
    expect(next.turnNumber).toBe(2)
  })

  it('rechaza jugadas fuera de turno', () => {
    const { state, card } = withCard(newGame(1, 0), 1, 'MUD')
    const r = applyAction(state, { type: 'PLAY', playerId: 'p2', cardId: card.id, target: ref(state, 1, 0) })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toMatch(/turno/i)
  })

  it('rechaza jugar una carta que no tenes', () => {
    const r = applyAction(newGame(1, 0), { type: 'PLAY', playerId: 'p1', cardId: 'no-existe' })
    expect(r.ok).toBe(false)
  })

  it('roba del mazo hasta completar la mano', () => {
    const g = newGame(1, 0)
    g.players[0].hand = [testCard('MUD'), testCard('MUD'), testCard('MUD')]
    const deckBefore = g.deck.length

    const move = legalMoves(g)[0]!
    const next = must(g, { type: 'PLAY', playerId: 'p1', cardId: move.cardId, target: move.targets[0]! })

    expect(next.players[0].hand).toHaveLength(DEFAULT_CONFIG.handSize)
    expect(next.deck).toHaveLength(deckBefore - 1)
  })

  it('NO deja descartar si hay alguna jugada legal', () => {
    const g = newGame(1, 0)
    g.players[0].hand = [testCard('MUD'), testCard('BARN'), testCard('FARMER')]
    expect(mustDiscard(g)).toBe(false)

    // El barro es jugable, asi que descartar el establo tiene que ser rechazado.
    const barn = g.players[0].hand[1]!
    const r = applyAction(g, { type: 'DISCARD', playerId: 'p1', cardId: barn.id })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toMatch(/descartar/i)
  })

  it('deja descartar cuando no hay ninguna jugada legal', () => {
    const g = newGame(1, 0)
    // Mano de puros establos sin ningun cerdo sucio: nada es jugable.
    g.players[0].hand = [testCard('BARN'), testCard('BARN'), testCard('BARN')]
    expect(mustDiscard(g)).toBe(true)
    const next = must(g, { type: 'DISCARD', playerId: 'p1', cardId: g.players[0].hand[0]!.id })
    expect(next.turnIndex).toBe(1)
  })

  it('abandonar da la victoria al rival', () => {
    const next = must(newGame(1, 0), { type: 'FORFEIT', playerId: 'p1' })
    expect(next.winnerId).toBe('p2')
    expect(next.endReason).toBe('FORFEIT')
  })

  it('no acepta acciones sobre una partida terminada', () => {
    const done = must(newGame(1, 0), { type: 'FORFEIT', playerId: 'p1' })
    const r = applyAction(done, { type: 'FORFEIT', playerId: 'p2' })
    expect(r.ok).toBe(false)
  })
})

describe('pureza y consistencia', () => {
  it('applyAction no muta el estado anterior', () => {
    const { state, card } = withCard(newGame(1, 0), 0, 'MUD')
    const snapshot = JSON.stringify(state)
    applyAction(state, { type: 'PLAY', playerId: 'p1', cardId: card.id, target: ref(state, 0, 0) })
    expect(JSON.stringify(state)).toBe(snapshot)
  })

  it('ninguna carta se pierde ni se duplica durante la partida', () => {
    let g = newGame(7, 0)
    const expected = deckSize(DEFAULT_CONFIG)

    for (let i = 0; i < 120 && g.status === 'playing'; i++) {
      const action = autoAction(g)
      if (!action) break
      g = must(g, action)
    }

    const onPigs = g.players.flatMap((p) =>
      p.pigs.flatMap((pig) => [pig.barn, pig.rod, pig.lock].filter(Boolean)),
    )
    const all = [
      ...g.deck,
      ...g.discard,
      ...g.players[0].hand,
      ...g.players[1].hand,
      ...(onPigs as Card[]),
    ]
    expect(all).toHaveLength(expected)
    expect(new Set(all.map((c) => c.id)).size).toBe(expected)
  })

  it('una partida jugada sola siempre termina', () => {
    let g = newGame(99, 0)
    let guard = 0
    while (g.status === 'playing' && guard < 2000) {
      const action = autoAction(g)
      if (!action) break
      g = must(g, action)
      guard++
    }
    expect(g.status).toBe('finished')
    expect(g.endReason).not.toBeNull()
  })

  it('autoAction siempre devuelve una accion que el motor acepta', () => {
    let g = newGame(5, 0)
    for (let i = 0; i < 60 && g.status === 'playing'; i++) {
      const action = autoAction(g)
      if (!action) break
      const r = applyAction(g, action)
      expect(r.ok).toBe(true)
      if (!r.ok) break
      g = r.state
    }
  })
})

describe('observaciones de balance', () => {
  it('al inicio de la partida SOLO el barro es jugable', () => {
    // Nada esta sucio todavia, asi que establo, granjero, lluvia, rayo, pararrayos
    // y cerrojo no tienen objetivo posible. Consecuencia: una mano inicial sin
    // barro es un turno muerto (arranca descartando).
    const g = newGame(1, 0)
    for (const kind of ['RAIN', 'BARN', 'LIGHTNING', 'LIGHTNING_ROD', 'FARMER', 'BARN_LOCK'] as const) {
      expect(isPlayable(g, 0, kind)).toBe(false)
    }
    expect(isPlayable(g, 0, 'MUD')).toBe(true)
  })

  it('mide cuantas manos iniciales arrancan muertas (sin barro)', () => {
    // Con 21 barros sobre 54 cartas da ~22%. Es alto: uno de cada cinco jugadores
    // arranca sin poder hacer nada. Candidato numero uno a tunear (subir MUD o
    // repartir manos iniciales con al menos un barro garantizado).
    let dead = 0
    const samples = 400
    for (let seed = 0; seed < samples; seed++) {
      if (legalMoves(newGame(seed, 0)).length === 0) dead++
    }
    const rate = dead / samples
    expect(rate).toBeGreaterThan(0.1)
    expect(rate).toBeLessThan(0.35)
  })

  it('las partidas automaticas terminan en una cantidad razonable de turnos', () => {
    const lengths: number[] = []
    for (let seed = 0; seed < 60; seed++) {
      let g = newGame(seed, 0)
      let guard = 0
      while (g.status === 'playing' && guard < 2000) {
        const a = autoAction(g)
        if (!a) break
        g = must(g, a)
        guard++
      }
      lengths.push(g.turnNumber)
    }
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
    // Referencia contra regresiones: si un cambio de balance dispara esto,
    // las partidas se volvieron largas y el loop de revancha se muere.
    expect(avg).toBeLessThan(DEFAULT_CONFIG.maxTurns)
  })
})

describe('niebla de guerra', () => {
  it('nunca expone la mano del rival', () => {
    const g = newGame(1, 0)
    const v = viewFor(g, 'p1')
    expect(v.players[0].hand).not.toBeNull()
    expect(v.players[1].hand).toBeNull()
    expect(v.players[1].handCount).toBe(DEFAULT_CONFIG.handSize)
  })

  it('no filtra el orden del mazo: ningun id de carta del mazo aparece en la vista', () => {
    const g = newGame(1, 0)
    const v = viewFor(g, 'p1')
    expect(v).not.toHaveProperty('deck')
    expect(v.deckCount).toBe(g.deck.length)

    const serialized = JSON.stringify(v)
    for (const card of g.deck) {
      expect(serialized).not.toContain(card.id)
    }
  })

  it('no filtra la mano del rival: ninguno de sus ids aparece en la vista', () => {
    const g = newGame(1, 0)
    const serialized = JSON.stringify(viewFor(g, 'p1'))
    for (const card of g.players[1].hand) {
      expect(serialized).not.toContain(card.id)
    }
  })

  it('solo trae jugadas legales cuando es tu turno', () => {
    const { state } = withCard(newGame(1, 0), 0, 'MUD')
    expect(viewFor(state, 'p1').legalMoves.length).toBeGreaterThan(0)
    expect(viewFor(state, 'p2').legalMoves).toHaveLength(0)
    expect(viewFor(state, 'p2').yourTurn).toBe(false)
  })

  it('los cerdos y lo que tienen encima son publicos', () => {
    const g = newGame(1, 0)
    g.players[1].pigs[0]!.dirty = true
    g.players[1].pigs[0]!.barn = testCard('BARN')
    const v = viewFor(g, 'p1')
    expect(v.players[1].pigs[0]!.dirty).toBe(true)
    expect(v.players[1].pigs[0]!.barn).not.toBeNull()
  })
})
