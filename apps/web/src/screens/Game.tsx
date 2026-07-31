import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameView, LegalMove, LogEntry, TargetRef } from '@drecksau/engine'
import { CardBack, CardView } from '../components/CardView.js'
import { Pig } from '../components/Pig.js'
import { CARD_META } from '../cards.js'
import { CardIcon } from '../icons.js'
import type { AppState, GameActions } from '../net.js'

interface Props {
  state: AppState
  actions: GameActions
}

export function Game({ state, actions }: Props) {
  const view = state.view
  const [selected, setSelected] = useState<string | null>(null)

  // Al cambiar el turno o la ronda, cualquier seleccion a medias deja de valer.
  useEffect(() => {
    setSelected(null)
  }, [view?.turnNumber, view?.id])

  if (!view || !state.series) {
    return (
      <div className="center-wrap">
        <div className="panel" style={{ textAlign: 'center' }}>
          <p className="subtitle">Cargando la partida…</p>
        </div>
      </div>
    )
  }

  const you = view.players[view.youIndex]
  const oppIndex = view.youIndex === 0 ? 1 : 0
  const opp = view.players[oppIndex]
  const yourScore = state.series.scores[view.youIndex]
  const oppScore = state.series.scores[oppIndex]

  const moveFor = (cardId: string): LegalMove | undefined =>
    view.legalMoves.find((m) => m.cardId === cardId)

  const selectedMove = selected ? moveFor(selected) : undefined
  const activeTargets: TargetRef[] = selectedMove?.targets ?? []

  const isTargetable = (playerId: string, pigId: string) =>
    activeTargets.some((t) => t.playerId === playerId && t.pigId === pigId)

  const onCardClick = (cardId: string) => {
    if (!view.yourTurn) return

    if (view.mustDiscard) {
      actions.discard(cardId)
      return
    }

    const move = moveFor(cardId)
    if (!move) return

    // Sin objetivo (la lluvia): se juega de una.
    if (move.targets.length === 0) {
      actions.play(cardId)
      setSelected(null)
      return
    }

    // Un solo objetivo posible: no tiene sentido hacer elegir.
    if (move.targets.length === 1) {
      actions.play(cardId, move.targets[0]!)
      setSelected(null)
      return
    }

    setSelected((cur) => (cur === cardId ? null : cardId))
  }

  const onPigClick = (target: TargetRef) => {
    if (!selected) return
    actions.play(selected, target)
    setSelected(null)
  }

  return (
    <div className="board">
      <TopBar
        oppName={opp.nickname}
        oppHand={opp.handCount}
        yourName={you.nickname}
        yourScore={yourScore}
        oppScore={oppScore}
        target={state.series.target}
        round={state.series.round}
        clock={state.clock}
        yourTurn={view.yourTurn}
        onForfeit={() => {
          if (confirm('¿Seguro que querés abandonar? Se te cuenta como derrota.')) actions.forfeit()
        }}
      />

      <div className="field-area">
        <OpponentHandStrip count={opp.handCount} />

        <div className={`pen ${activeTargets.some((t) => t.playerId === opp.id) ? 'pen-targetable' : ''}`}>
          {opp.pigs.map((pig) => (
            <Pig
              key={pig.id}
              pig={pig}
              targetable={isTargetable(opp.id, pig.id)}
              onSelect={() => onPigClick({ playerId: opp.id, pigId: pig.id })}
            />
          ))}
        </div>

        <div className="midline">
          <div className="pile">
            <div className={`pile-box ${view.deckCount === 0 ? 'pile-box-empty' : ''}`}>
              {view.deckCount}
            </div>
            Mazo
          </div>

          <div className={`turn-banner ${view.yourTurn ? 'turn-yours' : 'turn-theirs'}`}>
            {view.yourTurn ? 'Tu turno' : `Juega ${opp.nickname}`}
          </div>

          <div className="pile">
            <div
              className={`pile-box ${view.discardTop ? `tone-${CARD_META[view.discardTop.kind].tone}` : 'pile-box-empty'}`}
              title={view.discardTop ? CARD_META[view.discardTop.kind].name : 'Descarte vacío'}
            >
              {view.discardTop ? <CardIcon kind={view.discardTop.kind} size={26} /> : '—'}
            </div>
            Descarte
          </div>
        </div>

        <div className={`pen ${activeTargets.some((t) => t.playerId === you.id) ? 'pen-targetable' : ''}`}>
          {you.pigs.map((pig) => (
            <Pig
              key={pig.id}
              pig={pig}
              targetable={isTargetable(you.id, pig.id)}
              onSelect={() => onPigClick({ playerId: you.id, pigId: pig.id })}
            />
          ))}
        </div>
      </div>

      <div className="hand-area">
        <div className="hint">
          <Hint view={view} selected={selectedMove} />
        </div>
        <div className="hand">
          {(you.hand ?? []).map((card) => (
            <CardView
              key={card.id}
              card={card}
              playable={view.yourTurn && (view.mustDiscard || Boolean(moveFor(card.id)))}
              selected={selected === card.id}
              onClick={() => onCardClick(card.id)}
            />
          ))}
        </div>
      </div>

      <ActivityLog view={view} />
      <ScreenEffects view={view} />

      {state.opponentAway !== null && !state.series.over && (
        <AwayOverlay until={state.opponentAway} name={opp.nickname} />
      )}

      {state.roundBreak && !state.series.over && (
        <RoundOverlay
          youWon={state.roundBreak.roundWinnerId === you.id}
          winnerId={state.roundBreak.roundWinnerId}
          until={state.roundBreak.until}
          yourScore={yourScore}
          oppScore={oppScore}
        />
      )}

      {state.series.over && (
        <SeriesOverlay
          youWon={state.series.winnerId === you.id}
          yourScore={yourScore}
          oppScore={oppScore}
          rematch={state.rematch}
          onRematch={actions.rematch}
          onHome={actions.goHome}
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- barra */

function TopBar(props: {
  oppName: string
  oppHand: number
  yourName: string
  yourScore: number
  oppScore: number
  target: number
  round: number
  clock: AppState['clock']
  yourTurn: boolean
  onForfeit: () => void
}) {
  return (
    <div className="topbar">
      <div className="who">
        <div className="avatar">{props.oppName.slice(0, 2).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <div className="who-name">{props.oppName}</div>
          <div className="who-sub">{props.oppHand} cartas</div>
        </div>
      </div>

      <div className="score" title={`Ronda ${props.round} · al mejor de ${props.target * 2 - 1}`}>
        <div className="score-side">
          {Array.from({ length: props.target }, (_, i) => (
            <span key={i} className={`pip ${i < props.yourScore ? 'pip-on' : ''}`} />
          ))}
        </div>
        <span className="score-label">R{props.round}</span>
        <div className="score-side">
          {Array.from({ length: props.target }, (_, i) => (
            <span key={i} className={`pip ${i < props.oppScore ? 'pip-on' : ''}`} />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <TurnClock clock={props.clock} active={props.yourTurn} />
        <button className="btn btn-danger btn-sm" onClick={props.onForfeit}>
          Rendirse
        </button>
      </div>
    </div>
  )
}

function TurnClock({ clock, active }: { clock: AppState['clock']; active: boolean }) {
  const [, force] = useState(0)

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [])

  if (!clock) return null

  const msLeft = Math.max(0, clock.deadline - Date.now())
  const seconds = Math.ceil(msLeft / 1000)
  const ratio = Math.max(0, Math.min(1, msLeft / clock.turnMs))
  const circumference = 2 * Math.PI * 14
  // Solo avisamos cuando el reloj corre CONTRA VOS: si es turno del rival,
  // que se ponga rojo no te aporta nada y solo genera ansiedad.
  const warn = active && seconds <= 8

  return (
    <div className={`clock ${warn ? 'clock-warn' : ''}`} title="Tiempo del turno">
      <svg className="clock-ring" viewBox="0 0 34 34">
        <circle className="clock-bg" cx="17" cy="17" r="14" />
        <circle
          className="clock-fg"
          cx="17"
          cy="17"
          r="14"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <span>{seconds}</span>
    </div>
  )
}

/* --------------------------------------------------------------- ayudas */

function Hint({ view, selected }: { view: GameView; selected: LegalMove | undefined }) {
  if (view.status !== 'playing') return <span>Ronda terminada.</span>
  if (!view.yourTurn) return <span>Esperando a tu rival…</span>
  if (view.mustDiscard) {
    return <span className="hint-strong">No tenés ninguna jugada. Tocá una carta para descartarla.</span>
  }
  if (selected) {
    return <span className="hint-strong">Elegí sobre qué cerdo jugar {CARD_META[selected.kind].name}.</span>
  }
  return <span>Tocá una carta para jugarla.</span>
}

function OpponentHandStrip({ count }: { count: number }) {
  return (
    <div className="opp-hand" aria-label={`Tu rival tiene ${count} cartas`}>
      {Array.from({ length: count }, (_, i) => (
        <CardBack key={i} />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------- registro */

function describe(entry: LogEntry, view: GameView): { text: string; mine: boolean } | null {
  const you = view.players[view.youIndex]
  const mine = 'actorId' in entry && entry.actorId === you.id
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.nickname ?? '?'

  switch (entry.type) {
    case 'PLAY': {
      const card = CARD_META[entry.card].name
      const who = mine ? 'Vos' : nameOf(entry.actorId)
      if (entry.card === 'RAIN') {
        const n = entry.cleaned?.length ?? 0
        return { text: `${who}: Lluvia — ${n} cerdo${n === 1 ? '' : 's'} lavado${n === 1 ? '' : 's'}.`, mine }
      }
      return { text: `${who}: ${card}.`, mine }
    }
    case 'DISCARD':
      return { text: `${mine ? 'Vos' : nameOf(entry.actorId)} descartó ${CARD_META[entry.card].name}.`, mine }
    case 'RESHUFFLE':
      return { text: 'Se remezcló el mazo.', mine: false }
    case 'END':
      return null
  }
}

function ActivityLog({ view }: { view: GameView }) {
  const ref = useRef<HTMLDivElement>(null)
  const lines = useMemo(
    () =>
      view.log
        .map((e) => ({ seq: e.seq, d: describe(e, view) }))
        .filter((x): x is { seq: number; d: { text: string; mine: boolean } } => x.d !== null)
        .slice(-40),
    [view],
  )

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines.length])

  if (!lines.length) return null

  return (
    <div className="log" ref={ref} aria-live="polite">
      {lines.map(({ seq, d }) => (
        <div key={seq} className={`log-line ${d.mine ? 'log-you' : 'log-them'}`}>
          {d.text}
        </div>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------- efectos */

/**
 * Lluvia y rayo son las dos cartas que cambian el tablero de golpe, asi que
 * merecen un efecto a pantalla completa: sin eso te perdes lo que paso mientras
 * mirabas tu mano.
 */
function ScreenEffects({ view }: { view: GameView }) {
  const [fx, setFx] = useState<'rain' | 'flash' | null>(null)
  const lastSeq = useRef(0)

  useEffect(() => {
    const fresh = view.log.filter((e) => e.seq > lastSeq.current)
    if (!fresh.length) return
    lastSeq.current = view.log[view.log.length - 1]?.seq ?? lastSeq.current

    const notable = [...fresh]
      .reverse()
      .find((e) => e.type === 'PLAY' && (e.card === 'RAIN' || e.card === 'LIGHTNING'))
    if (!notable || notable.type !== 'PLAY') return

    setFx(notable.card === 'RAIN' ? 'rain' : 'flash')
    const t = setTimeout(() => setFx(null), notable.card === 'RAIN' ? 1500 : 520)
    return () => clearTimeout(t)
  }, [view.log])

  // Reiniciamos el contador entre rondas: cada ronda arranca su log de cero.
  useEffect(() => {
    lastSeq.current = 0
  }, [view.id])

  if (!fx) return null
  return <div className={`fx fx-${fx}`} aria-hidden="true" />
}

/* -------------------------------------------------------------- overlays */

function useCountdown(until: number): number {
  const [left, setLeft] = useState(() => Math.max(0, until - Date.now()))
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, until - Date.now())), 200)
    return () => clearInterval(t)
  }, [until])
  return Math.ceil(left / 1000)
}

function RoundOverlay(props: {
  youWon: boolean
  winnerId: string | null
  until: number
  yourScore: number
  oppScore: number
}) {
  const seconds = useCountdown(props.until)
  return (
    <div className="overlay">
      <div className="overlay-card">
        <p className="eyebrow">Fin de la ronda</p>
        <h2 className={`result-title ${props.youWon ? 'result-win' : 'result-lose'}`}>
          {props.winnerId === null ? 'Empate' : props.youWon ? '¡Ganaste la ronda!' : 'Perdiste la ronda'}
        </h2>
        <p className="result-sub">
          Vas {props.yourScore}–{props.oppScore}. La próxima arranca en{' '}
          <span className="countdown">{seconds}</span>…
        </p>
      </div>
    </div>
  )
}

function SeriesOverlay(props: {
  youWon: boolean
  yourScore: number
  oppScore: number
  rematch: { you: boolean; them: boolean }
  onRematch: () => void
  onHome: () => void
}) {
  return (
    <div className="overlay">
      <div className="overlay-card">
        <p className="eyebrow">Fin de la partida</p>
        <h2 className={`result-title ${props.youWon ? 'result-win' : 'result-lose'}`}>
          {props.youWon ? '¡Ganaste!' : 'Perdiste'}
        </h2>
        <p className="result-sub">
          {props.yourScore}–{props.oppScore} en la serie.
          {props.rematch.them && !props.rematch.you ? ' Tu rival quiere la revancha.' : ''}
        </p>
        <div className="stack">
          <button className="btn btn-primary btn-block" onClick={props.onRematch} disabled={props.rematch.you}>
            {props.rematch.you ? 'Esperando a tu rival…' : 'Revancha'}
          </button>
          <button className="btn btn-ghost btn-block" onClick={props.onHome}>
            Volver al inicio
          </button>
        </div>
      </div>
    </div>
  )
}

function AwayOverlay({ until, name }: { until: number; name: string }) {
  const seconds = useCountdown(until)
  return (
    <div className="overlay">
      <div className="overlay-card">
        <p className="eyebrow">Conexión</p>
        <h2 className="result-title result-lose" style={{ fontSize: '1.5rem' }}>
          {name} se desconectó
        </h2>
        <p className="result-sub">
          Le quedan <span className="countdown">{seconds}s</span> para volver antes de perder por abandono.
        </p>
      </div>
    </div>
  )
}
