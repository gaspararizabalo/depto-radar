import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SoloApp } from './solo/SoloApp.js'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Falta el div #root')

createRoot(root).render(
  <StrictMode>
    <SoloApp />
  </StrictMode>,
)
