import type { Difficulty } from '@drecksau/engine'

/**
 * Pausa artificial antes de que juegue la máquina.
 *
 * Es puro "feel", por eso vive acá y no en el motor: sin la pausa el bot
 * responde en el mismo frame y no llegás a ver qué carta jugó ni por qué te
 * cambió el tablero. La variación aleatoria evita que se sienta un metrónomo.
 */
export function thinkingDelay(difficulty: Difficulty): number {
  const base = difficulty === 'dificil' ? 700 : 550
  return base + Math.random() * 650
}
