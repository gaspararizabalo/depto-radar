import type { CardKind } from '@drecksau/engine'

/**
 * Textos y color de cada carta.
 *
 * PLACEHOLDER: los nombres salen del juego original (Drecksau). Cuando pasemos
 * a marca propia se reemplazan aca y en ningun otro lado — el motor no conoce
 * ni un solo string de presentacion.
 */
export interface CardMeta {
  name: string
  short: string
  description: string
  /** Familia visual: define el color de la carta en el tablero. */
  tone: 'mud' | 'water' | 'wood' | 'storm' | 'metal'
}

export const CARD_META: Record<CardKind, CardMeta> = {
  MUD: {
    name: 'Barro',
    short: 'Barro',
    description: 'Ensuciá uno de tus cerdos limpios. Es la carta que te hace ganar.',
    tone: 'mud',
  },
  RAIN: {
    name: 'Lluvia',
    short: 'Lluvia',
    description: 'Lava todos los cerdos sucios que estén a la intemperie. Los tuyos también.',
    tone: 'water',
  },
  BARN: {
    name: 'Establo',
    short: 'Establo',
    description: 'Techá a un cerdo sucio tuyo. La lluvia deja de afectarlo.',
    tone: 'wood',
  },
  LIGHTNING: {
    name: 'Rayo',
    short: 'Rayo',
    description: 'Voltea un establo del rival, salvo que tenga pararrayos.',
    tone: 'storm',
  },
  LIGHTNING_ROD: {
    name: 'Pararrayos',
    short: 'Pararrayos',
    description: 'Tu establo se vuelve inmune al rayo.',
    tone: 'metal',
  },
  FARMER: {
    name: 'Granjero',
    short: 'Granjero',
    description: 'Baña un cerdo sucio del rival. El establo solo no lo frena: hace falta cerrojo.',
    tone: 'water',
  },
  BARN_LOCK: {
    name: 'Cerrojo',
    short: 'Cerrojo',
    description: 'Trabá tu establo. El granjero ya no puede entrar a bañar al cerdo.',
    tone: 'metal',
  },
}

export function cardName(kind: CardKind): string {
  return CARD_META[kind].name
}
