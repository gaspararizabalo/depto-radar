import type { Card } from '@drecksau/engine'
import { CARD_META } from '../cards.js'
import { CardIcon } from '../icons.js'

interface Props {
  card: Card
  playable: boolean
  selected: boolean
  onClick?: () => void
}

export function CardView({ card, playable, selected, onClick }: Props) {
  const meta = CARD_META[card.kind]
  const className = [
    'card',
    `tone-${meta.tone}`,
    playable ? 'card-playable' : 'card-dead',
    selected ? 'card-selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={!playable && !onClick}
      title={meta.description}
      aria-label={`${meta.name}. ${meta.description}${playable ? '' : ' No se puede jugar ahora.'}`}
    >
      <span className="card-icon">
        <CardIcon kind={card.kind} size={42} />
      </span>
      <span className="card-name">{meta.name}</span>
    </button>
  )
}

/** Dorso: lo que ves de la mano del rival. */
export function CardBack() {
  return <div className="opp-card" aria-hidden="true" />
}
