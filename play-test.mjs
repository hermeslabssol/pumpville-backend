// Full end-to-end player simulation against the live backend.
// Mimics exactly what the React shell does: nonce -> login -> WS -> wallet_connected -> game_state -> play.
import WebSocket from 'ws';

const BACKEND = process.env.BACKEND || 'pv-server-4h5e.onrender.com';
const HTTP = `https://${BACKEND}`;
const WS = `wss://${BACKEND}`;
const WALLET = 'PlayTest' + Math.random().toString(36).slice(2, 10) + '1111111111111111';

const log = (...a) => console.log(...a);
const seen = new Set();
let gotGameState = false;
let gotZoneStates = false;
let gotPlayerCount = false;
let movementEcho = false;

async function http(path, opts = {}) {
  const res = await fetch(HTTP + path, opts);
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; }
  catch { return { status: res.status, text }; }
}

(async () => {
  log('=== STEP 1: AUTH NONCE ===');
  const nonceRes = await http(`/auth/nonce?wallet=${WALLET}`);
  log('  status', nonceRes.status, JSON.stringify(nonceRes.json || nonceRes.text));
  const nonce = nonceRes.json?.nonce;
  if (!nonce) { log('  ❌ NO NONCE — auth broken'); process.exit(1); }
  log('  ✅ nonce:', nonce);

  log('\n=== STEP 2: AUTH LOGIN (sign + submit) ===');
  const loginRes = await http('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet: WALLET, signature: 'simulated_signature_bytes', message: `Sign in to Pumpville\nNonce: ${nonce}` }),
  });
  log('  status', loginRes.status, JSON.stringify(loginRes.json || loginRes.text));
  const token = loginRes.json?.token;
  if (!loginRes.json?.success || !token) { log('  ❌ LOGIN FAILED'); process.exit(1); }
  log('  ✅ token:', token.slice(0, 24) + '...');

  log('\n=== STEP 3: USER INFO ===');
  const info = await http(`/user/info?wallet=${WALLET}`);
  log('  status', info.status, 'coins:', info.json?.coins, 'zone:', info.json?.zone, 'sprite:', info.json?.sprite, 'hp:', info.json?.hp);

  log('\n=== STEP 4: OPEN WEBSOCKET ===');
  const ws = new WebSocket(WS);

  const done = new Promise((resolve) => {
    ws.on('open', () => {
      log('  ✅ WS OPEN');
      log('\n=== STEP 5: SEND wallet_connected ===');
      ws.send(JSON.stringify({ type: 'wallet_connected', token, wallet: WALLET, sprite: 'pepe', pet: null }));
    });

    ws.on('message', (data) => {
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
      const t = msg.type || '(no-type)';
      if (!seen.has(t)) { seen.add(t); log(`  📨 first "${t}":`, JSON.stringify(msg).slice(0, 200)); }
      if (t === 'game_state') {
        gotGameState = true;
        const pc = msg.players?.length ?? msg.zone_players?.length ?? '?';
        log(`     -> game_state OK. player obj: ${msg.player ? 'yes' : 'no'}, zone players: ${pc}`);
        // STEP 6: move
        setTimeout(() => { log('\n=== STEP 6: player_move ==='); ws.send(JSON.stringify({ type: 'player_move', x: 333, y: 333, direction: 'right', animation: 'walk' })); }, 800);
        // STEP 7: chat
        setTimeout(() => { log('=== STEP 7: chat_message ==='); ws.send(JSON.stringify({ type: 'chat_message', message: 'gm from play-test' })); }, 1600);
        // STEP 8: zone change
        setTimeout(() => { log('=== STEP 8: zone_change -> fishing ==='); ws.send(JSON.stringify({ type: 'zone_change', zone: 'fishing' })); }, 2400);
      }
      if (t === 'zone_player_states' || t === 'zone_players') gotZoneStates = true;
      if (t === 'player_count') gotPlayerCount = true;
      if (t === 'chat_message' && /play-test/.test(JSON.stringify(msg))) log('     -> chat echoed back ✅');
      if (t === 'zone_changed' || (t === 'game_state' && msg.zone === 'fishing')) log('     -> zone change ack');
      if (t === 'zone_player_states') { if (JSON.stringify(msg).includes('333')) movementEcho = true; }
    });

    ws.on('error', (e) => { log('  ❌ WS ERROR:', e.message); resolve(); });
    ws.on('close', (c) => { log('  WS CLOSED', c); resolve(); });

    setTimeout(() => { ws.close(); resolve(); }, 12000);
  });

  await done;

  log('\n================ SUMMARY ================');
  log('  auth nonce+login : ✅');
  log('  WS open          :', seen.size > 0 ? '✅' : '❌');
  log('  game_state recv  :', gotGameState ? '✅' : '❌  <-- THE GAME WONT ENTER WITHOUT THIS');
  log('  zone_player_states:', gotZoneStates ? '✅' : '❌');
  log('  player_count     :', gotPlayerCount ? '✅' : '⚠️');
  log('  movement broadcast:', movementEcho ? '✅' : '⚠️');
  log('  message types seen:', [...seen].join(', '));
  log('========================================');
  process.exit(0);
})();
