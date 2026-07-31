import { useEffect, useRef } from 'react'
import { useGame } from './net.js'
import { Home } from './screens/Home.js'
import { Game } from './screens/Game.js'

export function App() {
  const [state, actions] = useGame()
  const autoJoined = useRef(false)

  // Link compartible: /?sala=ABCD entra derecho a la sala del amigo.
  // Es el motor de crecimiento del juego, asi que tiene que ser un solo click.
  useEffect(() => {
    if (autoJoined.current || !state.connected || state.phase !== 'home') return
    const code = new URLSearchParams(location.search).get('sala')
    if (!code) return
    autoJoined.current = true
    history.replaceState(null, '', location.pathname)
    actions.joinRoom(code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))
  }, [state.connected, state.phase, actions])

  return (
    <div className="app">
      {state.phase === 'playing' ? <Game state={state} actions={actions} /> : <Home state={state} actions={actions} />}
      {state.toast && <div className="toast">{state.toast}</div>}
    </div>
  )
}
