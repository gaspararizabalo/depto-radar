# Notas para trabajar en este repo

Juego de cartas 1v1 online. Monorepo con npm workspaces. Leé el `README.md` para
las reglas y la arquitectura; acá van solo las convenciones de trabajo.

## Reglas que no se negocian

**El motor no sabe nada de presentación.** `packages/engine` no importa React, no
tiene strings en español visibles al jugador y no conoce la red. Si necesitás un
texto para la UI, va en `apps/web/src/cards.ts`. El log del motor emite datos
estructurados; el formateo a español vive en `apps/web/src/screens/Game.tsx`.

**El servidor no confía en el cliente. Nunca.** Toda acción entrante vuelve a
pasar por `applyAction`. Si agregás un mensaje nuevo al protocolo que modifique
la partida, tiene que validarse en el motor, no en el handler.

**El cliente no recibe información oculta.** Todo lo que sale hacia un jugador
pasa por `viewFor`. Si agregás un campo al `GameView`, preguntate si revela la
mano del rival o el orden del mazo. Hay tests que lo cubren en
`packages/engine/test/game.test.ts` (bloque "niebla de guerra") — no los borres.

**`applyAction` es puro.** No mutes el estado que recibe. Cloná primero (ya lo
hace) y devolvé uno nuevo. El PRNG vive en `state.rng` justamente para eso.

## Al tocar balance

Los números están en `packages/engine/src/config.ts` y en ningún otro lado.
Después de cambiarlos, corré:

```bash
npm run balance -w @drecksau/engine
```

y comparalo contra la tabla del README.

Dos trampas ya pisadas, para no repetirlas:

**No bajes el barro para que "no sea una carrera".** Está medido: sube los turnos
forzados (45% → 64%) y multiplica por cinco la duración de la ronda. El barro es
la única carta casi siempre jugable; sacarlo deja más manos sin nada que hacer.
La palanca para dar profundidad es `handSize`.

**La ventaja de abrir se mide en la SERIE, no en la ronda.** Por ronda da ~60% y
parece roto, pero el mejor de 3 con alternancia la deja en ~50%. Si medís por
ronda vas a "arreglar" algo que no está roto.

Y si comparás bots entre sí, alterná quién abre: abrir vale ~7 puntos y si no lo
hacés estás midiendo el sorteo. El test de simetría en `test/bot.test.ts` existe
para atrapar ese error.

## Flujo

```bash
npm test          # motor de reglas — corré esto antes de cada commit
npm run typecheck # tipos de todo el monorepo
npm run build     # engine -> server -> web, en ese orden
```

El engine tiene que estar compilado antes que server y web: los dos importan
`@drecksau/engine` desde `dist/`.

## Idioma

Código, tipos e identificadores en inglés. Comentarios, textos de UI y mensajes
de error hacia el jugador en español rioplatense. Los comentarios explican **por
qué**, no qué hace la línea de abajo.

## Marca

Los nombres de carta son placeholder del juego original (Drecksau, de Kosmos /
Frank Bebenroth). La mecánica no es apropiable pero el nombre, el arte y los
textos sí. Antes de publicar hay que reemplazarlos — ver la sección "Cómo cambiar
la marca" del README. No agregues arte o textos copiados del juego físico.
