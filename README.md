# Drecksau Online

Juego de cartas **1v1 online** con mecánica tipo *Drecksau*: ganás cuando **todos tus cerdos están sucios** a la vez. Sin cuentas — nickname y a jugar.

Matchmaking público o salas privadas con link compartible. Series al mejor de 3.

> ⚠️ **El nombre y los textos de carta son placeholder.** La mecánica de un juego no
> es apropiable, pero el nombre *Drecksau*, el arte y los textos originales son de
> Kosmos / Frank Bebenroth. Antes de publicar o monetizar hay que reemplazar
> nombre, arte y textos por material propio. Ver [Cómo cambiar la marca](#cómo-cambiar-la-marca).

---

## Arrancar

```bash
npm install
npm run build
npm start                 # todo en http://localhost:8787
```

Para desarrollar con recarga en caliente:

```bash
npm run dev               # servidor en :8787, cliente en :5173
```

Abrí `http://localhost:5173` en dos pestañas (o dos navegadores) para probar 1v1.

Otros comandos:

```bash
npm test                            # tests del motor de reglas
npm run typecheck                   # chequeo de tipos de todo el monorepo
npm run balance -w @drecksau/engine # simulación de balance
```

---

## Deploy

Hay dos caminos, los dos sirven desde el celular sin tocar la compu:

**Render** (más simple): `render.yaml` es un Blueprint. En render.com hacés
*New → Blueprint*, conectás el repo y listo. El plan free duerme tras ~15 min sin
tráfico, así que la primera visita después de un rato tarda ~30 s en despertar.

**Contenedor** (Fly.io, Railway): usá el `Dockerfile` de la raíz.

En los dos casos el servidor lee `PORT` del entorno y un solo proceso sirve el
cliente y el WebSocket. El cliente elige `ws://` o `wss://` según el protocolo de
la página, así que detrás del proxy TLS del host funciona sin configurar nada.

---

## Modo un jugador

Además del online hay una versión contra la máquina que corre **entera en el
navegador**, sin servidor:

```bash
npm run build:solo -w @drecksau/web -- salida.html
```

Genera un único archivo HTML autocontenido —JS, CSS y SVG embebidos, cero
pedidos externos— pensado para entornos con CSP estricta. Reusa la misma
pantalla de juego que el online: lo único que cambia es de dónde sale el estado.

---

## Cómo está armado

```
packages/engine    Reglas puras + bot. Sin red, sin React, sin strings de UI.
apps/server        Node + WebSocket. Autoridad total sobre la partida.
apps/web           Vite + React. Solo dibuja lo que el servidor le manda.
```

Tres decisiones que sostienen todo lo demás:

**1. El servidor es la única fuente de verdad.** Cada acción del cliente vuelve a
validarse con `applyAction` del motor: turno, posesión de la carta y legalidad
del objetivo. El cliente no puede inventar una jugada aunque modifique su código.

**2. El cliente nunca recibe el estado completo.** `viewFor(state, playerId)`
arma una vista filtrada: la mano del rival llega como `null` (solo la cantidad)
y el mazo nunca se envía. Sin esto, cualquiera abre el DevTools y ve las cartas
del otro, y el ranked no vale nada.

**3. El motor es puro y determinista.** `applyAction` no muta su entrada y el
PRNG vive dentro del estado. Misma semilla + mismas acciones = misma partida.
Eso hace los tests reproducibles y deja la puerta abierta a replays.

---

## Las reglas

Cada jugador tiene 3 cerdos limpios y 5 cartas en mano. En tu turno jugás una
carta y robás. **Si tenés alguna jugada legal, estás obligado a jugarla** — solo
podés descartar cuando no tenés ninguna. Sin esa regla, dos jugadores podrían
descartar en loop para siempre.

| Carta | Efecto |
|---|---|
| **Barro** | Ensucia un cerdo limpio **tuyo**. Es la única carta que te acerca a ganar. |
| **Lluvia** | Lava **todos** los cerdos sucios sin establo, los tuyos incluidos. |
| **Establo** | Se levanta sobre un cerdo sucio tuyo. La lluvia deja de afectarlo. |
| **Rayo** | Voltea un establo rival, salvo que tenga pararrayos. |
| **Pararrayos** | Tu establo se vuelve inmune al rayo. |
| **Granjero** | Baña un cerdo sucio del rival. El establo **solo** no lo frena. |
| **Cerrojo** | Traba tu establo. Ahora sí el granjero no puede entrar. |

Detalles que importan y son fáciles de olvidar:

- El **establo frena la lluvia, no al granjero**. El **cerrojo frena al granjero**.
  Un cerdo bajo establo sin cerrojo sigue siendo bañable.
- Establo, pararrayos y cerrojo **salen de circulación** mientras están sobre un
  cerdo: no vuelven al descarte hasta que un rayo tira el establo. Eso hace que el
  mazo se vaya cargando de barro con el correr de la partida.
- El granjero **no demuele** el establo, solo lava al cerdo. El establo queda en pie.

---

## Balance

`npm run balance -w @drecksau/engine` simula partidas con un bot voraz. Estado
actual sobre 4000 partidas:

| métrica | valor | lectura |
|---|---|---|
| duración media | ~20 turnos | partidas de 3-5 min |
| gana el que abre (ronda) | ~60% | se neutraliza en la serie |
| **gana el que abre (serie)** | **48-51%** | el mejor de 3 lo resuelve |
| mano inicial injugable | 7.8% | era 24% con mano de 3 |
| turnos forzados | 22.2% | era 45.7% con mano de 3 |
| empates | 0% | siempre hay resultado |

**Por eso se juega al mejor de 3**, con primer jugador alternado y sorteo fresco
en el desempate. Con partida única el resultado lo decidía el sorteo inicial.

Las perillas están todas en `packages/engine/src/config.ts`.

> El bot no defiende ni guarda cartas para el momento justo. Los números sirven
> para **comparar** entre cambios de balance, no para predecir el juego real.

### Profundidad de decisión: por qué la mano es de 5

La primera versión repartía manos de 3 y el juego se sentía una carrera: agarrás
barro, lo tirás, listo. Medido, era cierto — **el 45.7% de los turnos tenía una
sola jugada legal**. No había nada que decidir.

La intuición natural es bajar el barro para que no sea una carrera. Está medido y
hace exactamente lo contrario:

| barro | opciones/turno | turnos forzados | turnos/ronda | manos muertas |
|---|---|---|---|---|
| 21 (actual) | 1.74 | 45.7% | 19.1 | 24.4% |
| 16 | 1.63 | 53.5% | 34.2 | 35.2% |
| 12 | 1.53 | 60.0% | 68.4 | 48.4% |
| 10 | 1.47 | 63.8% | 106.4 | 54.4% |

El barro es la única carta casi siempre jugable. Sacándolo aumentan las manos de
establos sin cerdo sucio que techar y granjeros sin objetivo, o sea **más** turnos
sin decisión, con rondas cinco veces más largas de yapa.

La palanca que sí funciona es el tamaño de la mano:

| mano | opciones/turno | turnos forzados | ≥3 opciones | manos muertas | brecha | turnos/ronda |
|---|---|---|---|---|---|---|
| 3 | 1.74 | 45.7% | 19.9% | 24.4% | 56.2% | 19.1 |
| **5** | **2.77** | **22.2%** | **57.7%** | **7.8%** | **63.8%** | **19.9** |

Los turnos forzados se parten a la mitad, los turnos con tres o más opciones casi
se triplican, las manos iniciales injugables bajan de 24% a 8% — y la duración de
la ronda no se mueve. Sale gratis.

"brecha" es el winrate del bot óptimo contra uno que tira al azar el 45% de las
veces: cuánto pesa jugar bien. Con la mano de 5 subió de 56% a 64%, y contra el
bot voraz del motor llega a 72%.

**La ventaja de abrir se mide a nivel serie, no de ronda.** Por ronda es ~60%, que
asusta, pero al mejor de 3 con primer jugador alternado y sorteo en el desempate
queda en 48-51%. Cualquier cambio de balance hay que evaluarlo con esa métrica.

### Si querés rondas más largas

Subir a 4 cerdos por jugador es la palanca directa: la brecha sube a 67.8% (más
lugar donde jugar bien importa) pero las rondas se van de 20 a 37 turnos, o sea
series de ~10 minutos. Es un cambio de una línea en `config.ts`; la decisión es de
producto, no de datos.

## Reconexión y abandonos

- **45 s de gracia** si se te cae la red. Volvés a la misma partida donde estabas
  (la identidad vive en `localStorage`).
- **30 s por turno.** Al vencerse, el servidor juega por vos para que la partida no
  se cuelgue. **Tres timeouts seguidos y perdés la serie.**
- Rendirse o cerrar la pestaña más de 45 s da la serie al rival.

---

## Cómo cambiar la marca

El motor no conoce un solo string de presentación, así que el rebrand toca pocos archivos:

| Qué | Dónde |
|---|---|
| Nombres y descripciones de carta | `apps/web/src/cards.ts` |
| Íconos de carta (SVG) | `apps/web/src/icons.tsx` |
| El cerdo | `apps/web/src/components/Pig.tsx` |
| Paleta y estilos | `apps/web/src/styles.css` |
| Título y textos de portada | `apps/web/src/screens/Home.tsx`, `apps/web/index.html` |

Los identificadores internos (`MUD`, `RAIN`, `BARN`…) son nombres de código y no
se muestran nunca al jugador: no hace falta tocarlos.

---

## Lo que todavía no está

- Cuentas, Elo y ranking por temporadas (hoy el matchmaking es FIFO puro).
- Persistencia: todo vive en memoria, reiniciar el servidor corta las partidas.
- Escala horizontal: un solo proceso. Para varias instancias hace falta mover
  salas y cola a Redis.
- Sonido y cosméticos.
