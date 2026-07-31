/**
 * Simulador de balance.
 *
 *   npm run balance -w @drecksau/engine
 *   npm run balance -w @drecksau/engine -- 20000
 *
 * Juega N partidas con un bot voraz (siempre barro si puede) y reporta las
 * metricas que importan para el diseño: cuanto duran, cuanta ventaja da abrir
 * y cuantas manos iniciales son injugables.
 *
 * OJO AL INTERPRETAR: el bot es tonto a proposito — no defiende, no guarda
 * lluvia para el momento justo. Los numeros son una LINEA DE BASE comparable
 * entre cambios de balance, no una prediccion de como juega la gente. Lo que
 * vale es la variacion entre corridas cuando movemos el mazo.
 */
import { applyAction, autoAction, createGame, legalMoves } from '../dist/index.js'

const N = Number(process.argv[2] ?? 4000)

let deadHands = 0
let firstWins = 0
let secondWins = 0
let draws = 0
const byReason = {}
const lengths = []

for (let seed = 0; seed < N; seed++) {
  let g = createGame({
    id: `sim-${seed}`,
    seed,
    players: [
      { id: 'p1', nickname: 'A' },
      { id: 'p2', nickname: 'B' },
    ],
    // Fijamos quien abre para poder MEDIR la ventaja de abrir.
    firstPlayerIndex: 0,
  })

  if (legalMoves(g).length === 0) deadHands++

  let guard = 0
  while (g.status === 'playing' && guard++ < 5000) {
    const action = autoAction(g)
    if (!action) break
    const r = applyAction(g, action)
    if (!r.ok) throw new Error(`el motor rechazo su propia jugada: ${r.error}`)
    g = r.state
  }

  lengths.push(g.turnNumber)
  byReason[g.endReason ?? 'SIN_FIN'] = (byReason[g.endReason ?? 'SIN_FIN'] ?? 0) + 1
  if (g.winnerId === 'p1') firstWins++
  else if (g.winnerId === 'p2') secondWins++
  else draws++
}

lengths.sort((a, b) => a - b)
const pct = (n) => `${((n / N) * 100).toFixed(1)}%`
const at = (q) => lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * q))]
const avg = (lengths.reduce((a, b) => a + b, 0) / N).toFixed(1)

console.log(`\npartidas simuladas       ${N}`)
console.log(`mano inicial injugable   ${pct(deadHands)}`)
console.log(`gana el que abre         ${pct(firstWins)}   <- 50% seria perfecto`)
console.log(`gana el segundo          ${pct(secondWins)}`)
console.log(`empates                  ${pct(draws)}`)
console.log(`turnos  avg ${avg}  p50 ${at(0.5)}  p90 ${at(0.9)}  p99 ${at(0.99)}  max ${lengths[N - 1]}`)
console.log('finales:', Object.entries(byReason).map(([k, v]) => `${k} ${pct(v)}`).join('  '))
console.log()
