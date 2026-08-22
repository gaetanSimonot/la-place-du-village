/**
 * POSTER AI — interface web locale de prototypage.
 * Lance :  node scripts/poster-ai/server.mjs
 * Puis ouvre : http://localhost:4545
 *
 * Permet de : choisir un événement (ID ou dernier publié), un style, un format,
 * une qualité ; VOIR le prompt exact ; générer l'image et la visualiser.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import {
  OUT_DIR, STYLES, FORMATS, buildPrompt, generateImage,
  fetchEventById, fetchLatestEvent, whenText, eventLieu,
} from './lib.mjs'

const PORT = 4545

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
const readBody = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)) })
const getEvent = async id => (id ? fetchEventById(id) : fetchLatestEvent())

const HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Poster AI — prototypage</title><style>
*{box-sizing:border-box} body{font-family:system-ui,sans-serif;margin:0;background:#FBF1DD;color:#2E211A}
.wrap{max-width:1000px;margin:0 auto;padding:24px}
h1{font-size:22px;margin:0 0 4px} .sub{color:#8A7D70;font-size:13px;margin:0 0 20px}
.card{background:#fff;border:1px solid #EFE7D6;border-radius:14px;padding:16px;margin-bottom:16px}
label{display:block;font-size:12px;font-weight:700;color:#6E6256;margin:0 0 4px}
input,select{width:100%;padding:9px 11px;border:1px solid #E0D6C2;border-radius:9px;font-size:14px;background:#fff}
.row{display:flex;gap:12px;flex-wrap:wrap} .row>div{flex:1;min-width:150px}
button{background:#C14A2B;color:#fff;border:none;border-radius:10px;padding:11px 18px;font-size:14px;font-weight:700;cursor:pointer}
button.ghost{background:#3E7A52} button:disabled{opacity:.5;cursor:default}
.evt{font-size:13px;color:#2E211A;background:#F7F1E6;border-radius:9px;padding:10px 12px;margin-top:10px;display:none}
pre{white-space:pre-wrap;background:#2E211A;color:#F5ECD8;border-radius:10px;padding:14px;font-size:12px;line-height:1.5;max-height:340px;overflow:auto}
.imgbox{display:flex;flex-wrap:wrap;gap:14px;margin-top:14px} .imgbox figure{margin:0;text-align:center}
.imgbox img{max-width:300px;border:1px solid #E0D6C2;border-radius:10px;display:block} figcaption{font-size:12px;color:#6E6256;margin-top:4px}
.muted{color:#8A7D70;font-size:12px}
</style></head><body><div class="wrap">
<h1>🎨 Poster AI — prototypage</h1>
<p class="sub">Événement de la prod → visuel de com. Choisis, vérifie le prompt, génère.</p>

<div class="card">
  <div class="row">
    <div style="flex:2"><label>ID événement (vide = dernier publié)</label><input id="eid" placeholder="ex: 2d5c6eef-..."></div>
    <div style="flex:0"><label>&nbsp;</label><button class="ghost" onclick="loadEvent()">Charger</button></div>
  </div>
  <div class="evt" id="evt"></div>
</div>

<div class="card">
  <div class="row">
    <div><label>Style</label><select id="style"></select></div>
    <div><label>Format</label><select id="format"></select></div>
    <div><label>Qualité</label><select id="quality">
      <option value="low">low (~0,01€ · texte approx.)</option>
      <option value="medium" selected>medium (~0,04€)</option>
      <option value="high">high (~0,15€ · texte net)</option>
    </select></div>
  </div>
  <div class="row" style="margin-top:12px">
    <div><label><input type="checkbox" id="allstyles" style="width:auto"> Générer les 3 styles</label></div>
  </div>
  <div style="margin-top:12px;display:flex;gap:10px">
    <button class="ghost" onclick="showPrompt()">👁 Voir le prompt</button>
    <button onclick="generate()" id="genbtn">✨ Générer</button>
    <span class="muted" id="status" style="align-self:center"></span>
  </div>
</div>

<div class="card"><label>Prompt envoyé à OpenAI</label><pre id="prompt">—</pre></div>
<div class="card"><label>Résultat</label><div class="imgbox" id="result"><span class="muted">Rien encore.</span></div></div>
</div><script>
let CFG={styles:{},formats:{}}
async function init(){
  CFG=await (await fetch('/api/config')).json()
  const st=document.getElementById('style'); for(const k in CFG.styles){const o=document.createElement('option');o.value=k;o.textContent=CFG.styles[k].label;st.appendChild(o)}
  const fm=document.getElementById('format'); for(const k in CFG.formats){const o=document.createElement('option');o.value=k;o.textContent=CFG.formats[k].label;fm.appendChild(o)}
}
async function loadEvent(){
  const id=document.getElementById('eid').value.trim()
  const el=document.getElementById('evt'); el.style.display='block'; el.textContent='Chargement…'
  try{const e=await (await fetch('/api/event?id='+encodeURIComponent(id))).json()
    if(e.error){el.textContent='⚠ '+e.error;return}
    document.getElementById('eid').value=e.id
    el.innerHTML='<b>'+e.titre+'</b> ('+e.categorie+')<br>'+(e.when||'sans date')+' · '+(e.lieu||'—')
  }catch(err){el.textContent='⚠ '+err.message}
}
async function showPrompt(){
  const q=params(); const p=document.getElementById('prompt'); p.textContent='…'
  const r=await (await fetch('/api/prompt?'+q)).json()
  p.textContent=r.error?('⚠ '+r.error):r.prompt
}
function params(){const u=new URLSearchParams();u.set('id',document.getElementById('eid').value.trim());u.set('style',document.getElementById('style').value);u.set('format',document.getElementById('format').value);return u.toString()}
async function generate(){
  const btn=document.getElementById('genbtn'),stt=document.getElementById('status'),box=document.getElementById('result')
  btn.disabled=true; stt.textContent='Génération…'; box.innerHTML=''
  const styles=document.getElementById('allstyles').checked?Object.keys(CFG.styles):[document.getElementById('style').value]
  try{
    for(const s of styles){
      stt.textContent='Génération '+CFG.styles[s].label+'…'
      const body={id:document.getElementById('eid').value.trim(),style:s,format:document.getElementById('format').value,quality:document.getElementById('quality').value}
      const r=await (await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json()
      if(r.error){box.innerHTML+='<span class="muted">⚠ '+s+' : '+r.error+'</span>';continue}
      document.getElementById('prompt').textContent=r.prompt
      const f=document.createElement('figure');f.innerHTML='<img src="'+r.url+'?t='+Date.now()+'"><figcaption>'+CFG.styles[s].label+'</figcaption>';box.appendChild(f)
    }
    stt.textContent='✓ Terminé'
  }catch(err){stt.textContent='⚠ '+err.message}
  btn.disabled=false
}
init()
</script></body></html>`

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(HTML) }

    if (url.pathname === '/api/config') {
      const styles = Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, { label: v.label }]))
      const formats = Object.fromEntries(Object.entries(FORMATS).map(([k, v]) => [k, { label: v.label, size: v.size }]))
      return json(res, 200, { styles, formats })
    }
    if (url.pathname === '/api/event') {
      const ev = await getEvent(url.searchParams.get('id'))
      return json(res, 200, { id: ev.id, titre: ev.titre, categorie: ev.categorie || 'autre', when: whenText(ev), lieu: eventLieu(ev) })
    }
    if (url.pathname === '/api/prompt') {
      const ev = await getEvent(url.searchParams.get('id'))
      return json(res, 200, { prompt: buildPrompt(ev, url.searchParams.get('format'), url.searchParams.get('style')) })
    }
    if (url.pathname === '/api/generate' && req.method === 'POST') {
      const { id, style, format, quality } = JSON.parse(await readBody(req) || '{}')
      const ev = await getEvent(id)
      const prompt = buildPrompt(ev, format, style)
      const img = await generateImage(prompt, FORMATS[format].size, quality || 'medium')
      const dir = path.join(OUT_DIR, String(ev.id))
      fs.mkdirSync(dir, { recursive: true })
      const name = `${format}-${style}.png`
      fs.writeFileSync(path.join(dir, name), img)
      return json(res, 200, { url: `/output/${ev.id}/${name}`, prompt })
    }
    if (url.pathname.startsWith('/output/')) {
      const p = path.join(OUT_DIR, decodeURIComponent(url.pathname.slice('/output/'.length)))
      if (!p.startsWith(OUT_DIR) || !fs.existsSync(p)) { res.writeHead(404); return res.end('not found') }
      res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(fs.readFileSync(p))
    }
    res.writeHead(404); res.end('not found')
  } catch (e) { json(res, 500, { error: e.message }) }
})

server.listen(PORT, () => console.log(`\n🎨 Poster AI — interface sur http://localhost:${PORT}\n`))
