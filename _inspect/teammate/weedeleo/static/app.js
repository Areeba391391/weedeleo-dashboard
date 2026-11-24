const $ = s => document.querySelector(s);
let S = null, sel = null, drag = null, pending = false;
const esc = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clock = n => [n / 3600, n % 3600 / 60, n % 60].map(v => String(Math.floor(v)).padStart(2, '0')).join(':');

function toast(msg, bad) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3200);
}

async function api(path, body, quiet) {
  try {
    const r = await fetch(path, body === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const j = await r.json();
    if (!j.ok && !quiet) toast(j.error || 'Request failed', true);
    return j;
  } catch (e) {
    if (!quiet) toast('Server unreachable', true);
    return {ok: false};
  }
}

async function act(path, body, msg) {
  pending = true; if (S) render(S);
  const j = await api(path, body);
  if (j.ok && msg) toast(msg);
  pending = false; await poll();
  return j;
}

function chip(text, cls) { return `<span class="chip ${cls}">${esc(text)}</span>`; }

function render(s) {
  S = s;
  const st = s.state, idle = st === 'IDLE', running = st === 'RUNNING';
  $('#badge').textContent = st; $('#badge').className = 'badge ' + st;
  $('#link').textContent = `${s.link.type === 'wifi' ? 'Wi-Fi' : 'Bluetooth'}: ${s.link.ok ? 'connected' : 'lost'}`;
  $('#link').className = 'chip ' + (s.link.ok ? 'ok' : 'bad');
  $('#uptime').textContent = clock(s.stats.uptime_s);
  $('#s-det').textContent = s.stats.detections; $('#s-area').textContent = s.stats.weeds_in_area;
  $('#s-tr').textContent = s.stats.treated; $('#s-sk').textContent = s.stats.skipped; $('#s-fps').textContent = s.stats.fps;
  $('#vbanner').hidden = s.mode !== 'video';
  $('#fault').hidden = !s.fault_reason; $('#fault').textContent = s.fault_reason ? `${s.fault_reason}. Press Reset when it is safe.` : '';
  const d = s.device;
  $('#chips').innerHTML = chip('Laser module: ' + d.laser_module, 'warn') + chip('Interlock: ' + (d.interlock_closed ? 'closed' : 'OPEN'), d.interlock_closed ? 'ok' : 'bad') +
    chip('Camera: ' + d.camera, d.camera === 'simulated' ? 'warn' : 'ok') + chip('Emergency stop: ' + (d.estop ? 'ACTIVE' : 'clear'), d.estop ? 'bad' : 'ok') + chip('Detector: ' + d.detector, 'ok') +
    (d.laser_last ? chip(`Last target: X ${d.laser_last[0]} Y ${d.laser_last[1]} mm`, 'ok') : '');
  const off = x => pending || !x;
  $('#start').disabled = off(idle); $('#stop').disabled = off(running); $('#reset').disabled = off(st === 'FAULT' || st === 'ESTOP');
  $('#estop').disabled = pending; $('#setArea').disabled = off(!running && sel); $('#clearArea').disabled = off(!running && s.area);
  document.querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('on', b.dataset.mode === s.mode); b.disabled = off(idle); });
  if (document.activeElement !== $('#interlock')) $('#interlock').checked = d.interlock_closed;
}

async function poll() {
  const j = await api('/api/state', undefined, true);
  $('#offline').hidden = !!j.ok;
  if (j.ok) render(j);
}
(function loop() { poll().finally(() => setTimeout(loop, 500)); })();

/* ----- area selection ----- */
const cv = $('#cv'), ctx = cv.getContext('2d');
function fit() { cv.width = cv.clientWidth; cv.height = cv.clientHeight; draw(); }
new ResizeObserver(fit).observe($('.vwrap'));
function draw() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!sel) return;
  ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.strokeStyle = '#ffd34d'; ctx.fillStyle = 'rgba(255,211,77,.15)';
  const x = sel.x * cv.width, y = sel.y * cv.height, w = sel.w * cv.width, h = sel.h * cv.height;
  ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
}
const pos = e => { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
cv.addEventListener('pointerdown', e => { if (S && S.state === 'RUNNING') return toast('Stop the task before changing the area', true); drag = pos(e); sel = null; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => {
  if (!drag) return; const [x, y] = pos(e);
  sel = {x: Math.min(drag[0], x), y: Math.min(drag[1], y), w: Math.abs(x - drag[0]), h: Math.abs(y - drag[1])}; draw();
});
cv.addEventListener('pointerup', () => { drag = null; if (sel && (sel.w < .02 || sel.h < .02)) sel = null; draw(); if (S) render(S); });

$('#setArea').onclick = async () => { const j = await act('/api/area', sel, 'Working area set'); if (j.ok) { sel = null; draw(); } };
$('#clearArea').onclick = () => { sel = null; draw(); act('/api/area/clear', {}, 'Working area cleared'); };
$('#start').onclick = () => act('/api/start', {}, 'Task started');
$('#stop').onclick = () => act('/api/stop', {}, 'Task stopped');
$('#reset').onclick = () => act('/api/reset', {}, 'System reset');
$('#estop').onclick = () => act('/api/estop', {}, 'Emergency stop activated');
$('#interlock').onchange = e => act('/api/sim/interlock', {closed: e.target.checked});
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => act('/api/mode', {mode: b.dataset.mode}, 'Mode changed'));

/* ----- logs and report ----- */
async function logs() {
  const p = new URLSearchParams({limit: 100, level: $('#lvl').value, q: $('#q').value});
  const j = await api('/api/logs?' + p, undefined, true);
  if (!j.ok) return;
  $('#logbody').innerHTML = j.logs.length ? j.logs.map(l => `<tr><td>${new Date(l.ts * 1000).toLocaleTimeString()}</td><td class="lv-${l.level}">${l.level}</td><td>${esc(l.message)}</td></tr>`).join('')
    : '<tr><td colspan="3">No events yet. Set an area and press Start.</td></tr>';
}
setInterval(logs, 2000); logs();
$('#lvl').onchange = logs; $('#q').oninput = logs;

$('#report').onclick = async () => {
  const j = await api('/api/report'); if (!j.ok) return; const r = j.report;
  const reasons = Object.entries(r.skip_reasons).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('') || '<tr><td colspan="2">None</td></tr>';
  $('#repbody').innerHTML = `<table><tr><td>Run</td><td>${r.run_id ?? 'none yet'}</td></tr><tr><td>Mode</td><td>${r.mode}</td></tr><tr><td>Duration</td><td>${r.duration_s} s</td></tr>
    <tr><td>Treated</td><td>${r.treated}</td></tr><tr><td>Skipped</td><td>${r.skipped}</td></tr><tr><td>Faults</td><td>${r.faults.map(esc).join(', ') || 'None'}</td></tr></table>
    <h3>Why targets were skipped</h3><table>${reasons}</table>`;
  $('#modal').hidden = false;
};
$('#closeRep').onclick = () => $('#modal').hidden = true;
