import type { WebSocket } from 'ws'
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '@drecksau/engine'
import { Match, type Slot } from './match.js'

/** Ventana para volver despues de una caida de red antes de perder por abandono. */
export const DISCONNECT_GRACE_MS = 45_000
/** Sin letras/numeros ambiguos: nada de O/0 ni I/1/L. Se dictan por telefono. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 4
const MAX_NICK = 16

export interface Client {
  playerId: string
  nickname: string
  ws: WebSocket | null
  matchId: string | null
  roomCode: string | null
  lastSeen: number
}

interface Room {
  code: string
  hostId: string
  guestId: string | null
}

function sanitizeNickname(raw: string): string {
  const clean = [...String(raw ?? '')]
    .filter((ch) => {
      const c = ch.codePointAt(0)!
      if (c < 0x20 || c === 0x7f) return false // caracteres de control
      if (c >= 0x200b && c <= 0x200f) return false // ancho cero y marcas bidi
      if (c >= 0x202a && c <= 0x202e) return false // overrides de direccion
      if (c === 0xfeff || c === 0x00ad) return false // BOM y guion blando
      return true
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NICK)
  return clean.length >= 2 ? clean : `Cerdo${Math.floor(Math.random() * 9000 + 1000)}`
}

export class Hub {
  private clients = new Map<string, Client>()
  private matches = new Map<string, Match>()
  private rooms = new Map<string, Room>()
  private queue: string[] = []
  private graceTimers = new Map<string, NodeJS.Timeout>()

  // ---------- envio ----------

  private send = (playerId: string, msg: ServerMessage): void => {
    const c = this.clients.get(playerId)
    if (!c?.ws || c.ws.readyState !== 1) return
    try {
      c.ws.send(JSON.stringify(msg))
    } catch {
      /* socket muerto; el close handler se encarga */
    }
  }

  private error(playerId: string, message: string, fatal = false): void {
    this.send(playerId, { t: 'error', message, ...(fatal ? { fatal } : {}) })
  }

  stats() {
    return {
      online: [...this.clients.values()].filter((c) => c.ws).length,
      queued: this.queue.length,
      matches: this.matches.size,
      rooms: this.rooms.size,
    }
  }

  // ---------- ciclo de vida de la conexion ----------

  onMessage(ws: WebSocket, ctx: { playerId: string | null }, raw: string): void {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw) as ClientMessage
    } catch {
      return
    }
    if (!msg || typeof msg.t !== 'string') return

    if (msg.t === 'hello') {
      this.onHello(ws, ctx, msg)
      return
    }

    if (!ctx.playerId) {
      this.sendRaw(ws, { t: 'error', message: 'Mandá `hello` primero.', fatal: true })
      return
    }
    const client = this.clients.get(ctx.playerId)
    if (!client) return
    client.lastSeen = Date.now()

    switch (msg.t) {
      case 'ping':
        this.send(client.playerId, { t: 'pong' })
        break
      case 'queue':
        this.enqueue(client)
        break
      case 'cancelQueue':
        this.dequeue(client.playerId)
        this.send(client.playerId, { t: 'queueCancelled' })
        break
      case 'createRoom':
        this.createRoom(client)
        break
      case 'joinRoom':
        this.joinRoom(client, msg.code)
        break
      case 'leaveRoom':
        this.leaveEverything(client, 'leave')
        break
      case 'play':
        this.act(client, { type: 'PLAY', playerId: client.playerId, cardId: msg.cardId, ...(msg.target ? { target: msg.target } : {}) })
        break
      case 'discard':
        this.act(client, { type: 'DISCARD', playerId: client.playerId, cardId: msg.cardId })
        break
      case 'forfeit':
        this.surrender(client)
        break
      case 'rematch':
        this.voteRematch(client)
        break
    }
  }

  private sendRaw(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg))
  }

  private onHello(ws: WebSocket, ctx: { playerId: string | null }, msg: Extract<ClientMessage, { t: 'hello' }>): void {
    if (msg.version !== PROTOCOL_VERSION) {
      this.sendRaw(ws, { t: 'error', message: 'Versión desactualizada. Recargá la página.', fatal: true })
      return
    }

    const playerId = typeof msg.playerId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(msg.playerId)
      ? msg.playerId
      : `p_${Math.random().toString(36).slice(2, 14)}`
    const nickname = sanitizeNickname(msg.nickname)

    const existing = this.clients.get(playerId)
    if (existing?.ws && existing.ws !== ws && existing.ws.readyState === 1) {
      // Misma identidad desde otra pestania: la vieja se cae, gana la nueva.
      this.sendRaw(existing.ws, { t: 'error', message: 'Abriste el juego en otra pestaña.', fatal: true })
      try {
        existing.ws.close()
      } catch { /* ya estaba cerrada */ }
    }

    const client: Client = existing ?? {
      playerId,
      nickname,
      ws,
      matchId: null,
      roomCode: null,
      lastSeen: Date.now(),
    }
    client.ws = ws
    client.nickname = nickname
    client.lastSeen = Date.now()
    this.clients.set(playerId, client)
    ctx.playerId = playerId

    this.send(playerId, { t: 'welcome', playerId, nickname, online: this.stats().online })

    // Volvio dentro de la ventana de gracia: cancelamos el abandono y resincronizamos.
    const grace = this.graceTimers.get(playerId)
    if (grace) {
      clearTimeout(grace)
      this.graceTimers.delete(playerId)
    }
    const match = client.matchId ? this.matches.get(client.matchId) : null
    if (match && !match.ended) {
      this.send(match.opponentOf(playerId).playerId, { t: 'opponentReconnected' })
      match.resync(playerId)
    } else if (match?.ended) {
      match.resync(playerId)
    }
  }

  onClose(ctx: { playerId: string | null }): void {
    if (!ctx.playerId) return
    const client = this.clients.get(ctx.playerId)
    if (!client) return
    client.ws = null

    this.dequeue(client.playerId)

    const match = client.matchId ? this.matches.get(client.matchId) : null
    if (match && !match.ended) {
      // No lo damos por perdido enseguida: puede ser un tunel o un cambio de red.
      this.send(match.opponentOf(client.playerId).playerId, {
        t: 'opponentDisconnected',
        msUntilForfeit: DISCONNECT_GRACE_MS,
      })
      const timer = setTimeout(() => {
        this.graceTimers.delete(client.playerId)
        const m = client.matchId ? this.matches.get(client.matchId) : null
        if (m && !m.ended && !this.clients.get(client.playerId)?.ws) {
          m.forfeitSeries(client.playerId)
          this.closeMatch(m)
        }
      }, DISCONNECT_GRACE_MS)
      this.graceTimers.set(client.playerId, timer)
      return
    }

    // Si estaba esperando en una sala privada, la sala se libera.
    if (client.roomCode) this.leaveRoomOnly(client)
    this.clients.delete(client.playerId)
  }

  // ---------- matchmaking publico ----------

  private enqueue(client: Client): void {
    if (client.matchId) return this.error(client.playerId, 'Ya estás en una partida.')
    if (this.queue.includes(client.playerId)) return

    this.leaveRoomOnly(client)
    this.queue.push(client.playerId)

    // FIFO puro. Con volumen real esto se reemplaza por buckets de Elo, pero
    // hasta entonces la espera importa mas que el emparejamiento fino.
    while (this.queue.length >= 2) {
      const aId = this.queue.shift()!
      const bId = this.queue.shift()!
      const a = this.clients.get(aId)
      const b = this.clients.get(bId)
      if (!a?.ws) {
        if (b?.ws) this.queue.unshift(bId)
        continue
      }
      if (!b?.ws) {
        this.queue.unshift(aId)
        continue
      }
      this.startMatch(a, b, null, true)
      return
    }

    this.send(client.playerId, { t: 'queued', position: this.queue.indexOf(client.playerId) + 1 })
  }

  private dequeue(playerId: string): void {
    const i = this.queue.indexOf(playerId)
    if (i >= 0) this.queue.splice(i, 1)
  }

  // ---------- salas privadas ----------

  private newCode(): string {
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = ''
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
      }
      if (!this.rooms.has(code)) return code
    }
    return `${Date.now().toString(36).toUpperCase().slice(-5)}`
  }

  private createRoom(client: Client): void {
    if (client.matchId) return this.error(client.playerId, 'Ya estás en una partida.')
    this.dequeue(client.playerId)
    this.leaveRoomOnly(client)

    const code = this.newCode()
    this.rooms.set(code, { code, hostId: client.playerId, guestId: null })
    client.roomCode = code
    this.send(client.playerId, { t: 'roomCreated', code })
  }

  private joinRoom(client: Client, rawCode: string): void {
    if (client.matchId) return this.error(client.playerId, 'Ya estás en una partida.')
    const code = String(rawCode ?? '').toUpperCase().trim()
    const room = this.rooms.get(code)
    if (!room) return this.error(client.playerId, 'No existe ninguna sala con ese código.')
    if (room.hostId === client.playerId) return this.error(client.playerId, 'Esa es tu propia sala.')
    if (room.guestId) return this.error(client.playerId, 'Esa sala ya está llena.')

    const host = this.clients.get(room.hostId)
    if (!host?.ws) {
      this.rooms.delete(code)
      return this.error(client.playerId, 'El anfitrión se desconectó.')
    }

    this.dequeue(client.playerId)
    this.leaveRoomOnly(client)
    room.guestId = client.playerId
    client.roomCode = code

    this.send(client.playerId, { t: 'roomJoined', code, opponentNickname: host.nickname })
    this.send(host.playerId, { t: 'roomJoined', code, opponentNickname: client.nickname })
    this.startMatch(host, client, code, false)
  }

  private leaveRoomOnly(client: Client): void {
    if (!client.roomCode) return
    const room = this.rooms.get(client.roomCode)
    if (room && !room.guestId && room.hostId === client.playerId) {
      this.rooms.delete(room.code)
    }
    client.roomCode = null
  }

  // ---------- partidas ----------

  private startMatch(a: Client, b: Client, roomCode: string | null, ranked: boolean): void {
    const players: [Slot, Slot] = [
      { playerId: a.playerId, nickname: a.nickname },
      { playerId: b.playerId, nickname: b.nickname },
    ]
    const match = new Match({ players, roomCode, ranked, send: this.send })
    this.matches.set(match.id, match)
    a.matchId = match.id
    b.matchId = match.id
    match.start()
  }

  private act(client: Client, action: Parameters<Match['handleAction']>[1]): void {
    const match = client.matchId ? this.matches.get(client.matchId) : null
    if (!match) return this.error(client.playerId, 'No estás en ninguna partida.')
    const err = match.handleAction(client.playerId, action)
    if (err) {
      this.error(client.playerId, err)
      // Si el cliente se desincronizo, devolverle la verdad lo re-alinea.
      match.resync(client.playerId)
      return
    }
    if (match.ended) this.closeMatch(match)
  }

  private surrender(client: Client): void {
    const match = client.matchId ? this.matches.get(client.matchId) : null
    if (!match || match.ended) return
    match.forfeitSeries(client.playerId)
    this.closeMatch(match)
  }

  private voteRematch(client: Client): void {
    const match = client.matchId ? this.matches.get(client.matchId) : null
    if (!match || !match.ended) return this.error(client.playerId, 'Todavía no terminó la partida.')

    match.rematchVotes.add(client.playerId)
    const opponent = match.opponentOf(client.playerId)
    this.send(opponent.playerId, { t: 'rematchOffered', byYou: false })
    this.send(client.playerId, { t: 'rematchOffered', byYou: true })

    if (match.rematchVotes.size < 2) return

    const a = this.clients.get(match.players[0].playerId)
    const b = this.clients.get(match.players[1].playerId)
    if (!a?.ws || !b?.ws) return this.error(client.playerId, 'Tu rival ya no está.')

    const code = match.roomCode
    const ranked = match.ranked
    this.disposeMatch(match)
    this.startMatch(a, b, code, ranked)
  }

  /** Cierra una serie terminada pero deja a los jugadores enganchados por si piden revancha. */
  private closeMatch(match: Match): void {
    if (match.roomCode) {
      const room = this.rooms.get(match.roomCode)
      if (room) this.rooms.delete(room.code)
    }
    for (const p of match.players) {
      const c = this.clients.get(p.playerId)
      if (c) c.roomCode = null
    }
  }

  private disposeMatch(match: Match): void {
    match.dispose()
    this.matches.delete(match.id)
    for (const p of match.players) {
      const c = this.clients.get(p.playerId)
      if (c) c.matchId = null
    }
  }

  private leaveEverything(client: Client, _reason: string): void {
    this.dequeue(client.playerId)
    this.leaveRoomOnly(client)
    const match = client.matchId ? this.matches.get(client.matchId) : null
    if (match) {
      if (!match.ended) {
        match.forfeitSeries(client.playerId)
        this.send(match.opponentOf(client.playerId).playerId, { t: 'opponentLeft' })
      }
      this.disposeMatch(match)
    }
    client.matchId = null
  }

  /** Barrido periodico de partidas terminadas y clientes fantasma. */
  sweep(): void {
    const now = Date.now()
    for (const match of [...this.matches.values()]) {
      if (!match.ended) continue
      const anyoneHere = match.players.some((p) => this.clients.get(p.playerId)?.ws)
      if (!anyoneHere) this.disposeMatch(match)
    }
    for (const client of [...this.clients.values()]) {
      if (!client.ws && !client.matchId && now - client.lastSeen > DISCONNECT_GRACE_MS * 2) {
        this.clients.delete(client.playerId)
      }
    }
    for (const room of [...this.rooms.values()]) {
      const host = this.clients.get(room.hostId)
      if (!host?.ws) this.rooms.delete(room.code)
    }
  }
}
