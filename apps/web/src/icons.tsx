/**
 * Iconos de carta en SVG.
 *
 * Van dibujados a mano y no con emoji a proposito: los emoji cambian de forma
 * en cada sistema operativo y el tablero termina viendose distinto en cada
 * maquina. Ademas, estos son los que despues se reemplazan por el arte propio.
 */
import type { CardKind } from '@drecksau/engine'
import type { JSX } from 'react'

interface IconProps {
  size?: number
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 48 48',
  fill: 'none' as const,
  xmlns: 'http://www.w3.org/2000/svg',
})

export function MudIcon({ size = 34 }: IconProps) {
  /*
   * Salpicadura con puntas. Ojo con este icono: las dos versiones anteriores
   * eran blobs redondeados y a tamaño de carta se leian como una NUBE, o sea
   * identicas a Lluvia — que hace exactamente lo contrario. Los contornos
   * redondeados leen como nube; las puntas leen como salpicadura. Si algun dia
   * se rediseña, mantener las puntas.
   */
  return (
    <svg {...base(size)}>
      <path
        d="M24 6l3.5 7.5L35 9l-1 8.5 8.5-1.5-5 7 7.5 3.5-7.5 3.5 4 7-8-1 .5 8-6.5-4.5L24 45l-3.5-5.5L14 44l.5-8-8 1 4-7L3 26.5 10.5 23l-5-7L14 17.5 13 9l7.5 4.5z"
        fill="currentColor"
      />
      <circle cx="41" cy="40" r="2.6" fill="currentColor" opacity=".85" />
      <circle cx="7" cy="38" r="2" fill="currentColor" opacity=".7" />
      <circle cx="24" cy="24" r="5" fill="#000" fillOpacity=".18" />
    </svg>
  )
}

export function RainIcon({ size = 34 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M14 25a7 7 0 0 1 .6-13.9A10 10 0 0 1 34 13a6.5 6.5 0 0 1 .5 12.9Z"
        fill="currentColor"
        opacity=".9"
      />
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".75">
        <path d="M15 31v5" />
        <path d="M24 32v7" />
        <path d="M33 31v5" />
      </g>
    </svg>
  )
}

export function BarnIcon({ size = 34 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M24 7 42 18v3H6v-3Z" fill="currentColor" opacity=".95" />
      <rect x="9" y="21" width="30" height="20" rx="2" fill="currentColor" opacity=".8" />
      <path d="M24 24v17M15 24v17M33 24v17" stroke="#000" strokeOpacity=".25" strokeWidth="1.5" />
      <rect x="20" y="30" width="8" height="11" rx="1" fill="#000" fillOpacity=".3" />
    </svg>
  )
}

export function LightningIcon({ size = 34 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M27 4 12 27h9l-4 17 19-25h-10l4-15Z" fill="currentColor" />
    </svg>
  )
}

export function RodIcon({ size = 34 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M24 4v22" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="24" cy="5" r="3.5" fill="currentColor" />
      <path d="M24 26 40 35v3H8v-3Z" fill="currentColor" opacity=".75" />
      <rect x="11" y="38" width="26" height="6" rx="1.5" fill="currentColor" opacity=".55" />
      <path d="M31 10l5-4M17 10l-5-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity=".6" />
    </svg>
  )
}

export function FarmerIcon({ size = 34 }: IconProps) {
  return (
    <svg {...base(size)}>
      {/* balde y cepillo: el granjero viene a bañar al cerdo */}
      <path d="M11 22h26l-3 20a2 2 0 0 1-2 1.8H16a2 2 0 0 1-2-1.8Z" fill="currentColor" opacity=".85" />
      <rect x="8" y="18" width="32" height="5" rx="2.5" fill="currentColor" />
      <circle cx="19" cy="12" r="4" fill="currentColor" opacity=".55" />
      <circle cx="29" cy="8" r="3" fill="currentColor" opacity=".45" />
      <circle cx="26" cy="15" r="2.2" fill="currentColor" opacity=".35" />
    </svg>
  )
}

export function LockIcon({ size = 34 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M16 21v-6a8 8 0 0 1 16 0v6"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect x="10" y="21" width="28" height="21" rx="4" fill="currentColor" opacity=".9" />
      <circle cx="24" cy="30" r="3.2" fill="#000" fillOpacity=".4" />
      <rect x="22.6" y="31" width="2.8" height="6" rx="1.4" fill="#000" fillOpacity=".4" />
    </svg>
  )
}

const ICONS: Record<CardKind, (p: IconProps) => JSX.Element> = {
  MUD: MudIcon,
  RAIN: RainIcon,
  BARN: BarnIcon,
  LIGHTNING: LightningIcon,
  LIGHTNING_ROD: RodIcon,
  FARMER: FarmerIcon,
  BARN_LOCK: LockIcon,
}

export function CardIcon({ kind, size }: { kind: CardKind; size?: number }) {
  const Cmp = ICONS[kind]
  return <Cmp {...(size !== undefined ? { size } : {})} />
}
