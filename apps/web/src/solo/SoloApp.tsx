import { useState } from 'react'
import type { CardKind, Difficulty } from '@drecksau/engine'
import { CARD_META } from '../cards.js'
import { CardIcon } from '../icons.js'
import { Game } from '../screens/Game.js'
import { useSoloGame } from './useSoloGame.js'


const RULE_ORDER: CardKind[] = ['MUD', 'RAIN', 'BARN', 'LIGHTNING', 'LIGHTNING_ROD', 'FARMER', 'BARN_LOCK']

const LEVELS: { id: Difficulty; label: string; hint: string }[] = [
  { id: 'facil', label: 'Fácil', hint: 'Se le escapan jugadas' },
  { id: 'normal', label: 'Normal', hint: 'Juega bien, no perfecto' },
  { id: 'dificil', label: 'Difícil', hint: 'Piensa tu respuesta' },
]

export function SoloApp() {
  const [nickname, setNickname] = useState('Vos')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [showRules, setShowRules] = useState(false)
  const { state, actions, startSeries } = useSoloGame(nickname, difficulty)

  if (state.phase === 'playing') {
    return (
      <div className="app">
        <Game state={state} actions={actions} />
        {state.toast && <div className="toast">{state.toast}</div>}
      </div>
    )
  }

  return (
    <div className="app">
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
              value={nickname}
              maxLength={16}
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>

          <div className="field">
            <span className="field-label">Dificultad</span>
            <div className="level-row">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  className={`level ${difficulty === l.id ? 'level-on' : ''}`}
                  onClick={() => setDifficulty(l.id)}
                >
                  <span className="level-name">{l.label}</span>
                  <span className="level-hint">{l.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="stack">
            <button
              className="btn btn-primary btn-block"
              disabled={nickname.trim().length < 2}
              onClick={startSeries}
            >
              Jugar contra la máquina
            </button>
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

          <p className="solo-note">
            Esta es la versión de un jugador, corre entera en tu navegador. El multijugador online
            (matchmaking y salas con amigos) necesita servidor y está en el repo, sin deployar.
          </p>
        </div>
      </div>
    </div>
  )
}
