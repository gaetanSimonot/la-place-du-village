/**
 * POSTER AI — CLI. Génère des visuels d'événement via OpenAI (gpt-image-1).
 *
 * USAGE (depuis la racine la-place-du-village) :
 *   node scripts/poster-ai/generate.mjs                         # dernier event, style moderne, les 3 formats
 *   node scripts/poster-ai/generate.mjs <eventId>
 *   node scripts/poster-ai/generate.mjs <eventId> --only carre --all-styles --quality low
 *   node scripts/poster-ai/generate.mjs <eventId> --style magazine --only affiche
 *   node scripts/poster-ai/generate.mjs --file mon-event.json
 *
 * Flags : --style <magazine|classique|moderne> · --all-styles · --only <affiche|carre|banniere>
 *         --quality <low|medium|high> · --file <chemin.json>
 * Sortie : scripts/poster-ai/output/<eventId>/<format>-<style>.png (+ event.json, prompts.txt)
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  OUT_DIR, STYLES, FORMATS, buildPrompt, generateImage,
  fetchEventById, fetchLatestEvent, whenText, eventLieu, OPENAI_API_KEY,
} from './lib.mjs'

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null }
function has(name) { return process.argv.includes(name) }

async function main() {
  if (!OPENAI_API_KEY) { console.error('OPENAI_API_KEY manquante'); process.exit(1) }

  const quality = arg('--quality') || 'low'
  const onlyFmt = arg('--only')
  const styleArg = arg('--style')
  const allStyles = has('--all-styles')
  const filePath = arg('--file')

  let ev
  if (filePath) ev = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  else {
    const id = process.argv.slice(2).find(a => !a.startsWith('--') &&
      a !== quality && a !== onlyFmt && a !== styleArg)
    ev = id ? await fetchEventById(id) : await fetchLatestEvent()
  }

  const formats = onlyFmt ? [onlyFmt] : Object.keys(FORMATS)
  const styles = allStyles ? Object.keys(STYLES) : [styleArg || 'moderne']

  console.log(`\nÉvénement : « ${ev.titre} »  (${ev.categorie || 'autre'})`)
  console.log(`Date : ${whenText(ev) || '—'}  |  Lieu : ${eventLieu(ev) || '—'}`)
  console.log(`Qualité : ${quality}  |  Formats : ${formats.join(', ')}  |  Styles : ${styles.join(', ')}\n`)

  const dir = path.join(OUT_DIR, String(ev.id || 'sample'))
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'event.json'), JSON.stringify(ev, null, 2))

  const prompts = []
  for (const fmt of formats) {
    if (!FORMATS[fmt]) { console.error(`Format inconnu : ${fmt}`); continue }
    for (const st of styles) {
      if (!STYLES[st]) { console.error(`Style inconnu : ${st}`); continue }
      const prompt = buildPrompt(ev, fmt, st)
      prompts.push(`### ${fmt} — ${st} (${FORMATS[fmt].size})\n${prompt}\n`)
      console.log(`→ ${FORMATS[fmt].label} · ${STYLES[st].label} [${FORMATS[fmt].size}, ${quality}]…`)
      try {
        const img = await generateImage(prompt, FORMATS[fmt].size, quality)
        const file = path.join(dir, `${fmt}-${st}.png`)
        fs.writeFileSync(file, img)
        console.log(`  ✓ ${path.basename(file)}  (${(img.length / 1024).toFixed(0)} Ko)`)
      } catch (e) {
        console.error(`  ✗ ${fmt}-${st} : ${e.message}`)
      }
    }
  }
  fs.writeFileSync(path.join(dir, 'prompts.txt'), prompts.join('\n'))
  console.log(`\nTerminé → ${dir}\n`)
}

main().catch(e => { console.error('ERREUR :', e.message); process.exit(1) })
