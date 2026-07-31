import {
  applyAction,
  autoAction,
  createGame,
  nextFirstPlayer,
  SERIES,
  viewFor,
  type Action,
  type GameState,
  type SeriesState,
  type ServerMessage,
} from '@drecksau/engine'

/*
 * Las constantes de la serie viven en el motor (`SERIES`) porque el modo contra
 * la maquina, que corre en el navegador sin servidor, usa exactamente las mismas.
 * Se reexportan con estos nombres para no tocar el resto del server.
 */
export const TURN_MS = SERIES.turnMs
export const ROUND_BREAK_MS = SERIES.roundBreakMs
export const SERIES_TARGET = SERIES.target
export const MAX_CONSECUTIVE_TIMEOUTS = SERIES.maxConsecutiveTimeouts

export interface Slot {
  playerId: string
  nickname: string
}

type Send = (playerId: string, msg: ServerMessage) => void

let matchSeq = 0

export class Match {
  readonly id: string
  readonly players: [Slot, Slot]
  readonly roomCode: string | null
  readonly ranked: boolean

  state: GameState
  round = 1
  scores: [number, number] = [0, 0]
  seriesOver = false
  seriesWinnerId: string | null = null
  rematchVotes = new Set<string>()
  ended = false

  private turnTimer: NodeJS.Timeout | null = null
  private roundTimer: NodeJS.Timeout | null = null
  private turnDeadline = 0
  private consecutiveTimeouts: Record<string, number> = {}
  /** Quien abrio la ronda en curso. Lo necesitamos para alternar en la siguiente. */
  private firstOfCurrentRound: 0 | 1 = 0
  private readonly send: Send

  constructor(opts: { players: [Slot, Slot]; roomCode?: string | null; ranked: boolean; send: Send }) {
    matchSeq += 1
    this.id = `m${matchSeq}-${Date.now().toString(36)}`
    this.players = opts.players
    this.roomCode = opts.roomCode ?? null
    this.ranked = opts.ranked
    this.send = opts.send
    this.consecutiveTimeouts = { [opts.players[0].playerId]: 0, [opts.players[1].playerId]: 0 }
    this.state = this.freshRound(Math.random() < 0.5 ? 0 : 1)
  }

  private freshRound(firstPlayerIndex: 0 | 1): GameState {
    this.firstOfCurrentRound = firstPlayerIndex
    return createGame({
      id: `${this.id}-r${this.round}`,
      seed: (Math.random() * 2 ** 31) | 0,
      players: [
        { id: this.players[0].playerId, nickname: this.players[0].nickname },
        { id: this.players[1].playerId, nickname: this.players[1].nickname },
      ],
      firstPlayerIndex,
    })
  }

  series(): SeriesState {
    return {
      round: this.round,
      scores: [this.scores[0], this.scores[1]],
      target: SERIES_TARGET,
      over: this.seriesOver,
      winnerId: this.seriesWinnerId,
    }
  }

  has(playerId: string): boolean {
    return this.players.some((p) => p.playerId === playerId)
  }

  opponentOf(playerId: string): Slot {
    return this.players[0].playerId === playerId ? this.players[1] : this.players[0]
  }

  start(): void {
    for (const p of this.players) {
      this.send(p.playerId, {
        t: 'matchFound',
        gameId: this.id,
        opponentNickname: this.opponentOf(p.playerId).nickname,
        ranked: this.ranked,
      })
    }
    this.armTurnTimer()
    this.broadcast()
  }

  /** Manda a cada jugador SU vista. Nunca el estado crudo. */
  broadcast(): void {
    const clock = { msLeft: Math.max(0, this.turnDeadline - Date.now()), turnMs: TURN_MS }
    const series = this.series()
    for (const p of this.players) {
      this.send(p.playerId, { t: 'state', view: viewFor(this.state, p.playerId), clock, series })
    }
  }

  /** Reenvia el estado a un solo jugador (reconexion). */
  resync(playerId: string): void {
    this.send(playerId, {
      t: 'state',
      view: viewFor(this.state, playerId),
      clock: { msLeft: Math.max(0, this.turnDeadline - Date.now()), turnMs: TURN_MS },
      series: this.series(),
    })
  }

  private armTurnTimer(): void {
    this.clearTurnTimer()
    if (this.state.status !== 'playing' || this.ended) return
    this.turnDeadline = Date.now() + TURN_MS
    this.turnTimer = setTimeout(() => this.onTurnTimeout(), TURN_MS)
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer)
    this.turnTimer = null
  }

  private onTurnTimeout(): void {
    if (this.ended || this.state.status !== 'playing') return
    const laggard = this.state.players[this.state.turnIndex].id

    this.consecutiveTimeouts[laggard] = (this.consecutiveTimeouts[laggard] ?? 0) + 1
    if (this.consecutiveTimeouts[laggard]! >= MAX_CONSECUTIVE_TIMEOUTS) {
      this.forfeitSeries(laggard)
      return
    }

    // Todavia tiene margen: jugamos por el para que la partida no se cuelgue.
    const action = autoAction(this.state)
    if (!action) {
      this.forfeitSeries(laggard)
      return
    }
    const r = applyAction(this.state, action)
    if (r.ok) this.state = r.state
    this.afterAction()
  }

  /**
   * Punto unico donde se valida una accion del cliente. El servidor NUNCA
   * confia en lo que le manda el front: `applyAction` re-verifica turno,
   * posesion de la carta y legalidad del objetivo.
   */
  handleAction(playerId: string, action: Action): string | null {
    if (this.ended) return 'La partida ya termino.'
    if (this.state.status !== 'playing') return 'La ronda ya termino.'
    if (!this.has(playerId)) return 'No estas en esta partida.'

    const r = applyAction(this.state, action)
    if (!r.ok) return r.error

    this.state = r.state
    this.consecutiveTimeouts[playerId] = 0
    this.afterAction()
    return null
  }

  private afterAction(): void {
    if (this.state.status === 'finished') {
      this.onRoundEnd()
      return
    }
    this.armTurnTimer()
    this.broadcast()
  }

  private onRoundEnd(): void {
    this.clearTurnTimer()

    const winnerId = this.state.winnerId
    if (winnerId) {
      const idx = this.players[0].playerId === winnerId ? 0 : 1
      this.scores[idx] += 1
    }

    if (this.scores[0] >= SERIES_TARGET || this.scores[1] >= SERIES_TARGET) {
      this.seriesOver = true
      this.seriesWinnerId =
        this.scores[0] >= SERIES_TARGET ? this.players[0].playerId : this.players[1].playerId
      this.ended = true
      this.broadcast()
      return
    }

    this.broadcast()
    for (const p of this.players) {
      this.send(p.playerId, {
        t: 'roundOver',
        series: this.series(),
        roundWinnerId: winnerId,
        nextInMs: ROUND_BREAK_MS,
      })
    }

    this.roundTimer = setTimeout(() => this.startNextRound(), ROUND_BREAK_MS)
  }

  private startNextRound(): void {
    if (this.ended) return
    const previousFirst = this.firstOfCurrentRound
    this.round += 1

    const next = nextFirstPlayer(previousFirst, this.scores, SERIES_TARGET)
    this.state = this.freshRound(next)
    this.consecutiveTimeouts = { [this.players[0].playerId]: 0, [this.players[1].playerId]: 0 }
    this.armTurnTimer()
    this.broadcast()
  }

  /** Abandono explicito o por desconexion/timeouts: se pierde la SERIE entera. */
  forfeitSeries(playerId: string): void {
    if (this.ended) return
    this.clearTurnTimer()
    if (this.roundTimer) clearTimeout(this.roundTimer)
    this.roundTimer = null

    const r = applyAction(this.state, { type: 'FORFEIT', playerId })
    if (r.ok) this.state = r.state

    const winner = this.opponentOf(playerId)
    const winnerIdx = this.players[0].playerId === winner.playerId ? 0 : 1
    this.scores[winnerIdx] = SERIES_TARGET
    this.seriesOver = true
    this.seriesWinnerId = winner.playerId
    this.ended = true
    this.broadcast()
  }

  dispose(): void {
    this.ended = true
    this.clearTurnTimer()
    if (this.roundTimer) clearTimeout(this.roundTimer)
    this.roundTimer = null
  }
}
