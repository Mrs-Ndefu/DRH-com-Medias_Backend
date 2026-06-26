const AfricasTalking = require('africastalking');

let _at = null;
let _sms = null;

function getClient() {
  if (!_sms) {
    const apiKey  = process.env.AT_API_KEY  || '';
    const username = process.env.AT_USERNAME || 'sandbox';
    _at  = AfricasTalking({ apiKey, username });
    _sms = _at.SMS;
  }
  return _sms;
}

/**
 * Normalise un numéro en format international +243...
 * Accepte : 0813191430, 243813191430, +243813191430
 */
function normalizeNumber(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('243')) return `+${digits}`;
  if (digits.startsWith('0'))   return `+243${digits.slice(1)}`;
  return `+${digits}`;
}

/**
 * Envoie un SMS.
 * @param {string} to    – numéro du destinataire (format local ou international)
 * @param {string} message – texte du SMS (max 160 caractères)
 */
async function sendSMS(to, message) {
  const number = normalizeNumber(to);
  if (!number) {
    console.warn('[SMS] Numéro invalide :', to);
    return;
  }

  const apiKey = process.env.AT_API_KEY;

  // Si pas de clé API : log console (mode dev)
  if (!apiKey) {
    console.warn('\n⚠️  [SMS] AT_API_KEY manquant dans backend/.env — SMS non envoyé.');
    console.log(`📱 [SMS SIMULÉ] → ${number}\n${message}\n`);
    return { status: 'simulated', to: number };
  }

  try {
    const smsClient = getClient();
    const payload = { to: [number], message };
    // Africa's Talking sandbox n'accepte pas de sender ID personnalisé
    const username = process.env.AT_USERNAME || 'sandbox';
    if (username !== 'sandbox') payload.from = 'SIRH-MCM';

    const result = await smsClient.send(payload);
    const recipients = result.SMSMessageData?.Recipients || [];
    recipients.forEach((r) => {
      console.log(`[SMS] ${r.status} → ${r.number} (coût: ${r.cost})`);
    });
    return result;
  } catch (err) {
    console.error('[SMS] Erreur envoi :', err.message || err);
    // On ne propage pas l'erreur — le SMS est best-effort
  }
}

module.exports = { sendSMS, normalizeNumber };
