import { useEffect, useRef, useState } from 'react'
import type { Pig as PigModel } from '@drecksau/engine'
import { BarnIcon, LockIcon, RodIcon } from '../icons.js'

/**
 * El cerdo es la pieza central de toda la lectura del tablero: de un vistazo
 * tenes que saber quien esta sucio, quien esta techado y quien esta trabado.
 * Por eso el estado sucio cambia el COLOR del cuerpo (no solo agrega manchas)
 * y las protecciones van como insignias abajo, siempre en el mismo orden.
 */

interface Props {
  pig: PigModel
  targetable: boolean
  onSelect?: () => void
}

export function Pig({ pig, targetable, onSelect }: Props) {
  const [flash, setFlash] = useState<'dirty' | 'clean' | null>(null)
  const prevDirty = useRef(pig.dirty)

  useEffect(() => {
    if (prevDirty.current !== pig.dirty) {
      setFlash(pig.dirty ? 'dirty' : 'clean')
      prevDirty.current = pig.dirty
      const t = setTimeout(() => setFlash(null), 650)
      return () => clearTimeout(t)
    }
    return undefined
  }, [pig.dirty])

  const uid = pig.id.replace(/[^a-zA-Z0-9]/g, '')
  const bodyFill = pig.dirty ? `url(#mud-${uid})` : `url(#skin-${uid})`

  const className = [
    'pig',
    targetable ? 'pig-target' : '',
    flash === 'dirty' ? 'pig-justdirtied' : '',
    flash === 'clean' ? 'pig-justcleaned' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const label = pig.dirty ? 'Sucio' : 'Limpio'
  const protections = [
    pig.barn ? 'con establo' : null,
    pig.rod ? 'con pararrayos' : null,
    pig.lock ? 'con cerrojo' : null,
  ].filter(Boolean)

  const Wrapper = targetable ? 'button' : 'div'

  return (
    <Wrapper
      className={className}
      {...(targetable
        ? {
            onClick: onSelect,
            type: 'button' as const,
            'aria-label': `Elegir cerdo ${label.toLowerCase()} ${protections.join(' ')}`,
          }
        : { 'aria-label': `Cerdo ${label.toLowerCase()} ${protections.join(' ')}` })}
    >
      <svg className="pig-svg" viewBox="0 0 100 88" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`skin-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffc2d3" />
            <stop offset="100%" stopColor="#e58aa5" />
          </linearGradient>
          <linearGradient id={`mud-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9c6c42" />
            <stop offset="100%" stopColor="#5f3f24" />
          </linearGradient>
          <clipPath id={`head-${uid}`}>
            <rect x="14" y="16" width="72" height="64" rx="30" />
          </clipPath>
        </defs>

        {/* orejas */}
        <path
          d="M22 30C16 12 26 6 36 12c5 3 8 8 9 13Z"
          fill={bodyFill}
          stroke="rgba(0,0,0,.18)"
          strokeWidth="1.5"
        />
        <path
          d="M78 30C84 12 74 6 64 12c-5 3-8 8-9 13Z"
          fill={bodyFill}
          stroke="rgba(0,0,0,.18)"
          strokeWidth="1.5"
        />

        {/* cabeza */}
        <rect
          x="14"
          y="16"
          width="72"
          height="64"
          rx="30"
          fill={bodyFill}
          stroke="rgba(0,0,0,.2)"
          strokeWidth="1.5"
        />

        {/* manchas de barro, recortadas contra la cabeza */}
        {pig.dirty && (
          <g clipPath={`url(#head-${uid})`} fill="#3f2915" opacity=".45">
            <circle cx="30" cy="34" r="9" />
            <circle cx="70" cy="28" r="7" />
            <circle cx="80" cy="52" r="10" />
            <circle cx="22" cy="60" r="8" />
            <circle cx="52" cy="22" r="6" />
          </g>
        )}

        {/* ojos */}
        <circle cx="36" cy="42" r="4.6" fill="#2a1a12" />
        <circle cx="64" cy="42" r="4.6" fill="#2a1a12" />
        <circle cx="37.6" cy="40.4" r="1.6" fill="#fff" opacity=".85" />
        <circle cx="65.6" cy="40.4" r="1.6" fill="#fff" opacity=".85" />

        {/* hocico */}
        <ellipse
          cx="50"
          cy="60"
          rx="16"
          ry="12"
          fill={pig.dirty ? '#7d5330' : '#f2a3b8'}
          stroke="rgba(0,0,0,.2)"
          strokeWidth="1.5"
        />
        <ellipse cx="44" cy="60" rx="2.8" ry="4" fill="#3a2318" />
        <ellipse cx="56" cy="60" rx="2.8" ry="4" fill="#3a2318" />
      </svg>

      <div className="pig-badges">
        {pig.barn && (
          <span className="badge badge-barn" title="Bajo techo: la lluvia no lo toca">
            <BarnIcon size={14} />
          </span>
        )}
        {pig.rod && (
          <span className="badge badge-rod" title="Pararrayos: el establo aguanta el rayo">
            <RodIcon size={14} />
          </span>
        )}
        {pig.lock && (
          <span className="badge badge-lock" title="Cerrojo: el granjero no puede entrar">
            <LockIcon size={13} />
          </span>
        )}
      </div>

      <span className={`pig-label ${pig.dirty ? 'pig-label-dirty' : ''}`}>{label}</span>
    </Wrapper>
  )
}
