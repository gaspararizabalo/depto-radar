import { CARD_KINDS, DEFAULT_CONFIG } from './config.js'
import { shuffle } from './rng.js'
import type {
  Action,
  ApplyResult,
  Card,
  CardKind,
  DistributiveOmit,
  GameConfig,
  GameState,
  LegalMove,
  LogEntry,
  Pig,
  PlayerState,
  TargetRef,
} from './types.js'

/** La lluvia es la unica carta que no elige objetivo: pega en toda la mesa. */
export function needsTarget(kind: CardKind): boolean {
  return kind !== 'RAIN'
}

/** Las cartas que se quedan pegadas al cerdo en vez de irse al descarte. */
export function isAttachment(kind: CardKind): boolean {
  return kind === 'BARN' || kind === 'LIGHTNING_ROD' || kind === 'BARN_LOCK'
}

function clone<T>(v: T): T {
  return structuredClone(v)
}

function buildDeck(config: GameConfig): Card[] {
  const cards: Card[] = []
  for (const kind of CARD_KINDS) {
    const n = config.deck[kind] ?? 0
    for (let i = 0; i < n; i++) {
      cards.push({ id: `${kind}-${String(i).padStart(2, '0')}`, kind })
    }
  }
  return cards
}

function makePigs(playerId: string, count: number): Pig[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${playerId}-pig-${i}`,
    dirty: false,
    barn: null,
    rod: null,
    lock: null,
  }))
}

export function createGame(opts: {
  id: string
  seed: number
  players: [{ id: string; nickname: string }, { id: string; nickname: string }]
  config?: GameConfig
  /** Fijar quien empieza. Por defecto se sortea. Util en tests. */
  firstPlayerIndex?: 0 | 1
}): GameState {
  const config = opts.config ?? DEFAULT_CONFIG
  const shuffled = shuffle(buildDeck(config), opts.seed)
  const deck = shuffled.value
  let rng = shuffled.rng

  const players = opts.players.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    pigs: makePigs(p.id, config.pigsPerPlayer),
    hand: [] as Card[],
  })) as [PlayerState, PlayerState]

  // Reparto alternado, como en la mesa real.
  for (let i = 0; i < config.handSize; i++) {
    for (const p of players) {
      const c = deck.pop()
      if (c) p.hand.push(c)
    }
  }

  let turnIndex: 0 | 1
  if (opts.firstPlayerIndex !== undefined) {
    turnIndex = opts.firstPlayerIndex
  } else {
    // Empezar es una ventaja real en una carrera, asi que se sortea.
    const r = shuffle([0, 1], rng)
    rng = r.rng
    turnIndex = r.value[0] as 0 | 1
  }

  return {
    id: opts.id,
    players,
    turnIndex,
    turnNumber: 1,
    deck,
    discard: [],
    rng,
    status: 'playing',
    winnerId: null,
    endReason: null,
    log: [],
    seq: 0,
    config,
  }
}

function indexOfPlayer(state: GameState, playerId: string): 0 | 1 | -1 {
  if (state.players[0].id === playerId) return 0
  if (state.players[1].id === playerId) return 1
  return -1
}

function findPig(state: GameState, ref: TargetRef): Pig | null {
  const idx = indexOfPlayer(state, ref.playerId)
  if (idx === -1) return null
  return state.players[idx].pigs.find((p) => p.id === ref.pigId) ?? null
}

/** Un cerdo se moja con la lluvia salvo que este bajo techo. */
function exposedToRain(pig: Pig): boolean {
  return pig.dirty && pig.barn === null
}

/**
 * Objetivos validos de una carta. Devuelve [] para la lluvia (no elige objetivo)
 * y tambien para una carta sin jugadas posibles: usar `isPlayable` para
 * distinguir los dos casos.
 */
export function targetsFor(state: GameState, actorIndex: 0 | 1, kind: CardKind): TargetRef[] {
  const me = state.players[actorIndex]
  const opp = state.players[actorIndex === 0 ? 1 : 0]
  const ref = (owner: PlayerState) => (p: Pig): TargetRef => ({ playerId: owner.id, pigId: p.id })

  switch (kind) {
    case 'MUD':
      return me.pigs.filter((p) => !p.dirty).map(ref(me))
    case 'RAIN':
      return []
    case 'BARN':
      // El establo se levanta sobre un cerdo YA sucio: es para conservar barro.
      return me.pigs.filter((p) => p.dirty && p.barn === null).map(ref(me))
    case 'LIGHTNING':
      return opp.pigs.filter((p) => p.barn !== null && p.rod === null).map(ref(opp))
    case 'LIGHTNING_ROD':
      return me.pigs.filter((p) => p.barn !== null && p.rod === null).map(ref(me))
    case 'FARMER':
      // El establo NO frena al granjero: para eso esta el cerrojo.
      return opp.pigs.filter((p) => p.dirty && !(p.barn !== null && p.lock !== null)).map(ref(opp))
    case 'BARN_LOCK':
      return me.pigs.filter((p) => p.barn !== null && p.lock === null).map(ref(me))
  }
}

export function isPlayable(state: GameState, actorIndex: 0 | 1, kind: CardKind): boolean {
  if (kind === 'RAIN') {
    // Solo se puede llover si hay algo que lavar. Evita quemar turnos en vano.
    return state.players.some((p) => p.pigs.some(exposedToRain))
  }
  return targetsFor(state, actorIndex, kind).length > 0
}

/** Todas las jugadas disponibles para el jugador de turno, listas para la UI. */
export function legalMoves(state: GameState): LegalMove[] {
  if (state.status !== 'playing') return []
  const actorIndex = state.turnIndex
  const actor = state.players[actorIndex]
  const moves: LegalMove[] = []
  for (const card of actor.hand) {
    if (!isPlayable(state, actorIndex, card.kind)) continue
    moves.push({
      cardId: card.id,
      kind: card.kind,
      targets: targetsFor(state, actorIndex, card.kind),
    })
  }
  return moves
}

/**
 * Descartar solo esta permitido cuando no hay NINGUNA jugada legal. Sin esta
 * regla, dos jugadores podrian descartar en loop y la partida no avanzaria.
 */
export function mustDiscard(state: GameState): boolean {
  return state.status === 'playing' && legalMoves(state).length === 0
}

type LogInput = DistributiveOmit<LogEntry, 'seq' | 'turn'>

function log(state: GameState, entry: LogInput): void {
  state.seq += 1
  state.log.push({ ...entry, seq: state.seq, turn: state.turnNumber } as LogEntry)
}

/** Roba hasta completar la mano, remezclando el descarte si hace falta. */
function drawUp(state: GameState, playerIndex: 0 | 1): void {
  const p = state.players[playerIndex]
  while (p.hand.length < state.config.handSize) {
    if (state.deck.length === 0) {
      if (state.discard.length === 0) break // no queda nada en circulacion
      const r = shuffle(state.discard, state.rng)
      state.deck = r.value
      state.rng = r.rng
      state.discard = []
      log(state, { type: 'RESHUFFLE', actorId: p.id })
    }
    const c = state.deck.pop()
    if (!c) break
    p.hand.push(c)
  }
}

function allDirty(p: PlayerState): boolean {
  return p.pigs.length > 0 && p.pigs.every((pig) => pig.dirty)
}

function dirtyCount(p: PlayerState): number {
  return p.pigs.filter((pig) => pig.dirty).length
}

function finish(state: GameState, winnerId: string | null, reason: GameState['endReason']): void {
  state.status = 'finished'
  state.winnerId = winnerId
  state.endReason = reason
  log(state, { type: 'END', actorId: winnerId ?? '', reason: reason!, winnerId })
}

/**
 * Desempate para finales sin ganador limpio (limite de turnos, mazo agotado).
 * Gana quien tenga mas cerdos sucios; si empatan, es empate de verdad.
 * Preferimos esto a un empate seco porque el ranked necesita un resultado.
 */
function finishByTiebreak(state: GameState, reason: GameState['endReason']): void {
  const [a, b] = state.players
  const da = dirtyCount(a)
  const db = dirtyCount(b)
  finish(state, da === db ? null : da > db ? a.id : b.id, reason)
}

function resolveCard(state: GameState, actorIndex: 0 | 1, card: Card, target?: TargetRef): TargetRef[] {
  const cleaned: TargetRef[] = []

  switch (card.kind) {
    case 'MUD': {
      const pig = findPig(state, target!)!
      pig.dirty = true
      break
    }
    case 'RAIN': {
      for (const p of state.players) {
        for (const pig of p.pigs) {
          if (exposedToRain(pig)) {
            pig.dirty = false
            cleaned.push({ playerId: p.id, pigId: pig.id })
          }
        }
      }
      break
    }
    case 'BARN': {
      findPig(state, target!)!.barn = card
      break
    }
    case 'LIGHTNING': {
      const pig = findPig(state, target!)!
      // El establo cae y se lleva puesto todo lo que tenia encima.
      for (const c of [pig.barn, pig.rod, pig.lock]) {
        if (c) state.discard.push(c)
      }
      pig.barn = null
      pig.rod = null
      pig.lock = null
      break
    }
    case 'LIGHTNING_ROD': {
      findPig(state, target!)!.rod = card
      break
    }
    case 'FARMER': {
      const pig = findPig(state, target!)!
      pig.dirty = false
      // El establo queda en pie: el granjero lava al cerdo, no demuele nada.
      cleaned.push({ playerId: target!.playerId, pigId: pig.id })
      break
    }
    case 'BARN_LOCK': {
      findPig(state, target!)!.lock = card
      break
    }
  }

  return cleaned
}

function endTurn(state: GameState): void {
  if (state.status !== 'playing') return

  state.turnIndex = state.turnIndex === 0 ? 1 : 0
  state.turnNumber += 1

  if (state.turnNumber > state.config.maxTurns) {
    finishByTiebreak(state, 'TURN_LIMIT')
    return
  }
  // Si al que le toca no le quedan cartas, no queda nada en circulacion.
  if (state.players[state.turnIndex].hand.length === 0) {
    finishByTiebreak(state, 'DECK_EXHAUSTED')
  }
}

/**
 * Unica puerta de entrada para mutar una partida. Pura: no muta `state`.
 * El servidor la usa como autoridad; el cliente la usa solo para predecir la UI.
 */
export function applyAction(prev: GameState, action: Action): ApplyResult {
  if (prev.status !== 'playing') {
    return { ok: false, error: 'La partida ya termino.' }
  }

  const actorIndex = indexOfPlayer(prev, action.playerId)
  if (actorIndex === -1) return { ok: false, error: 'Ese jugador no esta en la partida.' }

  if (action.type === 'FORFEIT') {
    const state = clone(prev)
    finish(state, state.players[actorIndex === 0 ? 1 : 0].id, 'FORFEIT')
    return { ok: true, state }
  }

  if (actorIndex !== prev.turnIndex) {
    return { ok: false, error: 'No es tu turno.' }
  }

  const inHand = prev.players[actorIndex].hand.find((c) => c.id === action.cardId)
  if (!inHand) return { ok: false, error: 'No tenes esa carta en la mano.' }

  if (action.type === 'DISCARD') {
    if (!mustDiscard(prev)) {
      return { ok: false, error: 'Solo podes descartar cuando no tenes ninguna jugada legal.' }
    }
    const state = clone(prev)
    const actor = state.players[actorIndex]
    const idx = actor.hand.findIndex((c) => c.id === action.cardId)
    const [card] = actor.hand.splice(idx, 1)
    state.discard.push(card!)
    log(state, { type: 'DISCARD', actorId: actor.id, card: card!.kind })
    drawUp(state, actorIndex)
    endTurn(state)
    return { ok: true, state }
  }

  // --- PLAY ---
  if (!isPlayable(prev, actorIndex, inHand.kind)) {
    return { ok: false, error: 'Esa carta no tiene ningun efecto posible ahora.' }
  }

  if (needsTarget(inHand.kind)) {
    if (!action.target) return { ok: false, error: 'Esa carta necesita un objetivo.' }
    const valid = targetsFor(prev, actorIndex, inHand.kind).some(
      (t) => t.playerId === action.target!.playerId && t.pigId === action.target!.pigId,
    )
    if (!valid) return { ok: false, error: 'Objetivo invalido para esa carta.' }
  }

  const state = clone(prev)
  const actor = state.players[actorIndex]
  const idx = actor.hand.findIndex((c) => c.id === action.cardId)
  const [card] = actor.hand.splice(idx, 1)

  const cleaned = resolveCard(state, actorIndex, card!, action.target)

  // Las cartas que se pegan al cerdo NO van al descarte: quedan sobre la mesa.
  if (!isAttachment(card!.kind)) {
    state.discard.push(card!)
  }

  log(state, {
    type: 'PLAY',
    actorId: actor.id,
    card: card!.kind,
    ...(action.target ? { target: action.target } : {}),
    ...(cleaned.length ? { cleaned } : {}),
  })

  drawUp(state, actorIndex)

  // Solo el barro ensucia, asi que unicamente el que acaba de jugar puede ganar.
  // Chequeamos a los dos igual: es barato y nos cubre si agregamos cartas nuevas.
  const winner = state.players.find(allDirty)
  if (winner) {
    finish(state, winner.id, 'ALL_DIRTY')
    return { ok: true, state }
  }

  endTurn(state)
  return { ok: true, state }
}

/** Jugada automatica para timeouts del servidor. Prefiere barro, luego lo que haya. */
export function autoAction(state: GameState): Action | null {
  if (state.status !== 'playing') return null
  const actor = state.players[state.turnIndex]
  const moves = legalMoves(state)

  if (moves.length === 0) {
    const card = actor.hand[0]
    if (!card) return null
    return { type: 'DISCARD', playerId: actor.id, cardId: card.id }
  }

  const preferred = moves.find((m) => m.kind === 'MUD') ?? moves[0]!
  return {
    type: 'PLAY',
    playerId: actor.id,
    cardId: preferred.cardId,
    ...(preferred.targets[0] ? { target: preferred.targets[0] } : {}),
  }
}
