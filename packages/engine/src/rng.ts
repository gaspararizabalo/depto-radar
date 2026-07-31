/**
 * PRNG determinista (mulberry32). Lo guardamos como un entero en el GameState
 * para que applyAction siga siendo una funcion pura: mismo estado + misma accion
 * => mismo resultado. Eso hace los tests reproducibles y permite re-simular una
 * partida entera desde el log si algun dia queremos replays.
 */

export interface RngResult<T> {
  value: T
  rng: number
}

function next(seed: number): { value: number; rng: number } {
  let t = (seed + 0x6d2b79f5) | 0
  let r = t
  r = Math.imul(r ^ (r >>> 15), r | 1)
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, rng: t }
}

/** Entero en [0, max). */
export function randomInt(seed: number, max: number): RngResult<number> {
  const { value, rng } = next(seed)
  return { value: Math.floor(value * max), rng }
}

/** Fisher-Yates. No muta el array de entrada. */
export function shuffle<T>(items: readonly T[], seed: number): RngResult<T[]> {
  const out = items.slice()
  let rng = seed
  for (let i = out.length - 1; i > 0; i--) {
    const r = randomInt(rng, i + 1)
    rng = r.rng
    const j = r.value
    const a = out[i] as T
    const b = out[j] as T
    out[i] = b
    out[j] = a
  }
  return { value: out, rng }
}

export function seedFromString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h | 0
}
