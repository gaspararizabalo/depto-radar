import { useEffect, useState } from 'react'
import type { CardKind } from '@drecksau/engine'
import { CARD_META } from '../cards.js'
import { CardIcon } from '../icons.js'
import type { AppState, GameActions } from '../net.js'

const RULE_ORDER: CardKind[] = ['MUD', 'RAIN', 'BARN', 'LIGHTNING', 'LIGHTNING_ROD', 'FARMER', 'BARN_LOCK']

interface Props {
  state: AppState
  actions: GameActions
}

export function Home({ state, actions }: Props) {
  const [nick, setNick] = useState(state.nickname)
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [showRules, setShowRules] = useState(false)

  useEffect(() => {
    if (state.nickname && !nick) setNick(state.nickname)
  }, [state.nickname, nick])

  const ready = state.connected && nick.trim().length >= 2

  const commitNick = () => {
    const clean = nick.trim()
    if (clean.length >= 2 && clean !== state.nickname) actions.setNickname(clean)
  }

  const start = (fn: () => void) => {
    commitNick()
    fn()
  }

  if (state.phase === 'queued') {
    return <Searching onCancel={actions.cancelQueue} />
  }

  if (state.phase === 'waitingRoom' && state.roomCode) {
    return <WaitingRoom code={state.roomCode} onCancel={actions.goHome} onToast={actions.toast} />
  }

  return (
    <div className="center-wrap">
      <div className="panel">
        <p className="eyebrow">Juego de cartas 1v1</p>
        <h1 className="title">Drecksau</h1>
        <p className="subtitle">
          Ensuciá a tus tres cerdos antes que tu rival. Cuidado con la lluvia: te lava los tuyos también.
        </p>

        <label className="field">
          <span className="field-label">Tu nombre</span>
          <input
            className="input"
            value={nick}
            maxLength={16}
            placeholder="Cómo te ven los demás"
            onChange={(e) => setNick(e.target.value)}
            onBlur={commitNick}
            autoComplete="nickname"
          />
        </label>

        <div className="stack">
          <button
            className="btn btn-primary btn-block"
            disabled={!ready}
            onClick={() => start(actions.queue)}
          >
            Jugar online
          </button>
          <button className="btn btn-block" disabled={!ready} onClick={() => start(actions.createRoom)}>
            Crear sala privada
          </button>
        </div>

        <div className="divider">o entrá con un código</div>

        {joining ? (
          <div className="stack">
            <input
              className="input input-code"
              value={code}
              maxLength={4}
              autoFocus
              placeholder="————"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && code.length === 4) start(() => actions.joinRoom(code))
              }}
            />
            <div className="row">
              <button className="btn btn-ghost btn-block" onClick={() => setJoining(false)}>
                Volver
              </button>
              <button
                className="btn btn-gold btn-block"
                disabled={!ready || code.length !== 4}
                onClick={() => start(() => actions.joinRoom(code))}
              >
                Entrar
              </button>
            </div>
          </div>
        ) : (
          <div className="stack">
            <button className="btn btn-ghost btn-block" onClick={() => setJoining(true)}>
              Tengo un código
            </button>
          </div>
        )}

        <div className="stack">
          <button className="btn btn-ghost btn-block btn-sm" onClick={() => setShowRules((v) => !v)}>
            {showRules ? 'Ocultar las reglas' : 'Cómo se juega'}
          </button>
        </div>

        {showRules && (
          <div className="rules">
            {RULE_ORDER.map((kind) => (
              <div className="rule-row" key={kind}>
                <span className={`rule-chip tone-${CARD_META[kind].tone}`}>
                  <CardIcon kind={kind} size={20} />
                </span>
                <span>
                  <span className="rule-name">{CARD_META[kind].name}.</span> {CARD_META[kind].description}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="online-pill">
          <span className={`dot ${state.connected ? '' : 'dot-off'}`} />
          {state.connected ? `${state.online} jugando ahora` : 'Conectando…'}
        </div>
      </div>
    </div>
  )
}

function Searching({ onCancel }: { onCancel: () => void }) {
  const [dots, setDots] = useState(1)
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d % 3) + 1), 450)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="center-wrap">
      <div className="panel" style={{ textAlign: 'center' }}>
        <p className="eyebrow">Partida pública</p>
        <h1 className="title" style={{ fontSize: '2rem' }}>
          Buscando rival{'.'.repeat(dots)}
        </h1>
        <p className="subtitle">Al mejor de 3 rondas. En cuanto aparezca alguien, arrancamos.</p>
        <div className="stack">
          <button className="btn btn-ghost btn-block" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

function WaitingRoom({
  code,
  onCancel,
  onToast,
}: {
  code: string
  onCancel: () => void
  onToast: (m: string) => void
}) {
  const link = `${location.origin}/?sala=${code}`

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      onToast(`${what} copiado.`)
    } catch {
      // Sin permiso de portapapeles (o http sin TLS): que lo copie a mano.
      onToast('No pude copiar. Copialo a mano.')
    }
  }

  return (
    <div className="center-wrap">
      <div className="panel" style={{ textAlign: 'center' }}>
        <p className="eyebrow">Sala privada</p>
        <h1 className="title" style={{ fontSize: '1.9rem' }}>
          Esperando a tu rival
        </h1>
        <p className="subtitle">Pasale el código o el link. La partida arranca sola cuando entre.</p>

        <div className="code-display">{code}</div>

        <div className="row">
          <button className="btn btn-block" onClick={() => copy(code, 'Código')}>
            Copiar código
          </button>
          <button className="btn btn-gold btn-block" onClick={() => copy(link, 'Link')}>
            Copiar link
          </button>
        </div>

        <div className="stack">
          <button className="btn btn-ghost btn-block" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
