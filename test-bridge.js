// Test du pont WebSocket fp-bridge depuis Node.js
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8091');

ws.on('open', () => {
  console.log('[✓] Connexion WebSocket OK');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('[MSG]', JSON.stringify(msg));

  if (msg.type === 'ready') {
    console.log('[→] Démarrage enrollment...');
    ws.send(JSON.stringify({ action: 'start_enrollment' }));
    console.log('[!] Posez votre doigt sur le lecteur (4 fois)...');
  }

  if (msg.type === 'enrolled') {
    console.log('[✓] SUCCÈS - FMD capturé :', msg.fmd.substring(0, 50) + '...');
    console.log('[✓] Longueur FMD :', msg.fmd.length, 'chars base64');
    ws.close();
  }

  if (msg.type === 'error') {
    console.error('[✗] ERREUR :', msg.message);
    ws.close();
  }
});

ws.on('error', (err) => {
  console.error('[✗] WebSocket error:', err.message);
});

ws.on('close', () => {
  console.log('[−] Connexion fermée');
  process.exit(0);
});

// Timeout de sécurité
setTimeout(() => {
  console.log('[!] Timeout 3 minutes');
  ws.close();
}, 180000);
