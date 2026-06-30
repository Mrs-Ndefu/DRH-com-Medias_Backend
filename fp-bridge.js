'use strict';
// WebSocket bridge — fingerprint reader ↔ browser
// ws://localhost:8091

const { WebSocketServer } = require('ws');
const { spawn }           = require('child_process');
const path                = require('path');

const PORT   = 8091;
const PS_DIR = __dirname;

const wss = new WebSocketServer({ port: PORT });

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function runPs(script, args, ws, onData) {
  const fullPath = path.join(PS_DIR, script);
  console.log(`[bridge] Lancement: ${script}`, args.join(' '));

  const ps = spawn('powershell.exe', [
    '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', fullPath,
    ...args,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  let buf = '';
  ps.stdout.on('data', chunk => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      console.log(`[bridge] PS →`, trimmed);
      try {
        const msg = JSON.parse(trimmed);
        onData(msg, ws);
      } catch {
        // non-JSON line, ignore
      }
    }
  });

  ps.stderr.on('data', d => {
    const txt = d.toString().trim();
    if (txt) {
      console.error(`[bridge] PS stderr:`, txt);
      send(ws, { type: 'error', message: txt });
    }
  });

  ps.on('close', (code) => {
    console.log(`[bridge] PS terminé (code ${code})`);
    if (buf.trim()) {
      console.log(`[bridge] PS flush:`, buf.trim());
      try { onData(JSON.parse(buf.trim()), ws); } catch {}
    }
  });

  return ps;
}

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin || 'inconnu';
  console.log(`[bridge] Client connecté (origin: ${origin})`);
  send(ws, { type: 'ready' });
  let currentPs = null;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    console.log(`[bridge] Action reçue: ${msg.action}`);

    if (msg.action === 'capture') {
      if (currentPs) { currentPs.kill(); currentPs = null; }
      send(ws, { type: 'waiting' });
      currentPs = runPs('fp-capture.ps1', ['-Timeout', '30000'], ws, (result, sock) => {
        if (result.success) {
          send(sock, { type: 'captured', fmd: result.fmd });
        } else {
          send(sock, { type: 'error', message: result.error });
        }
      });
    }

    if (msg.action === 'start_enrollment') {
      if (currentPs) { currentPs.kill(); currentPs = null; }
      currentPs = runPs('fp-enroll.ps1', ['-NbCaptures', '4', '-Timeout', '30000'], ws, (result, sock) => {
        send(sock, result);
      });
    }

    if (msg.action === 'cancel') {
      if (currentPs) { currentPs.kill(); currentPs = null; }
      send(ws, { type: 'cancelled' });
    }
  });

  ws.on('close', () => {
    console.log('[bridge] Client déconnecté');
    if (currentPs) { currentPs.kill(); currentPs = null; }
  });
});

console.log(`[fp-bridge] WebSocket fingerprint bridge sur ws://localhost:${PORT}`);
