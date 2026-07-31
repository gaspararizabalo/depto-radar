/**
 * Empaqueta el modo un jugador en UN solo archivo HTML autocontenido.
 *
 *   npm run build:solo -w @drecksau/web -- [destino.html]
 *
 * Toma la salida de vite (que ya es un solo chunk) y mete el JS y el CSS dentro
 * del HTML. El resultado no pide un solo recurso externo, que es lo que exige
 * el entorno donde se publica.
 *
 * Emite un FRAGMENTO, no un documento: sin doctype, <html>, <head> ni <body>.
 * El host lo envuelve en su propio esqueleto y los tags duplicados romperian.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'

const webRoot = resolve(import.meta.dirname, '..')
const distDir = join(webRoot, 'dist-solo')
const out = resolve(process.argv[2] ?? join(distDir, 'artifact.html'))

const html = await readFile(join(distDir, 'solo.html'), 'utf8')

const assetsDir = join(distDir, 'assets')
const assets = await readdir(assetsDir)
const jsFile = assets.find((f) => f.endsWith('.js'))
const cssFile = assets.find((f) => f.endsWith('.css'))
if (!jsFile) throw new Error('no encontré el bundle JS en dist-solo/assets')

const js = await readFile(join(assetsDir, jsFile), 'utf8')
const css = cssFile ? await readFile(join(assetsDir, cssFile), 'utf8') : ''

// Un `</script>` dentro de una cadena del bundle cerraria el tag antes de tiempo.
// Escaparlo es inocuo: en JS "<\/script>" es exactamente "</script>".
const safeJs = js.replace(/<\/script/gi, '<\\/script')

const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? 'Drecksau').trim()

const fragment = `<title>${title}</title>
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${safeJs}
</script>
`

await writeFile(out, fragment, 'utf8')

const kb = (n) => `${(n / 1024).toFixed(1)} kB`
console.log(`archivo:  ${out}`)
console.log(`css:      ${kb(css.length)}`)
console.log(`js:       ${kb(js.length)}`)
console.log(`total:    ${kb(fragment.length)}`)
/*
 * URLs que aparecen en el bundle pero NO generan pedidos de red:
 *  - w3.org: identificadores de namespace XML/SVG, nunca se descargan
 *  - react.dev/errors: texto de los mensajes de error de React
 * Cualquier otra hay que mirarla: bajo CSP estricta un fetch externo falla.
 */
const BENIGN = [/^https?:\/\/www\.w3\.org\//, /^https:\/\/react\.dev\/errors/]
const suspicious = [...new Set(fragment.match(/https?:\/\/[a-zA-Z0-9._/-]+/g) ?? [])].filter(
  (u) => !BENIGN.some((re) => re.test(u)),
)
if (suspicious.length) {
  console.warn('\n⚠️  URLs externas a revisar:')
  for (const u of suspicious) console.warn('   ', u)
} else {
  console.log('externas: ninguna (autocontenido)')
}
void dirname
