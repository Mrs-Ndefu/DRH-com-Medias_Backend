const nodemailer = require('nodemailer');

let transporter = null;

if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendWelcomeEmail(to, prenom, nom, motDePasse) {
  const html = `
<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1)">
        <tr>
          <td style="background:#0d6efd;padding:28px 32px;text-align:center;">
            <h2 style="color:#fff;margin:0;font-size:16px;letter-spacing:.04em;text-transform:uppercase;">
              Ministère de la Communication et des Médias
            </h2>
            <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:13px;">
              Système d'Information des Ressources Humaines
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;color:#212529;">Bonjour <strong>${prenom} ${nom}</strong>,</p>
            <p style="margin:0 0 24px;color:#495057;line-height:1.6;">
              Un compte SIRH a été créé pour vous. Voici vos identifiants de connexion :
            </p>
            <table width="100%" cellpadding="12" cellspacing="0" style="background:#f8f9fa;border-radius:8px;border:1px solid #dee2e6;margin-bottom:24px;">
              <tr>
                <td style="color:#6c757d;font-size:13px;width:140px;">Adresse email</td>
                <td style="color:#212529;font-weight:bold;">${to}</td>
              </tr>
              <tr style="border-top:1px solid #dee2e6;">
                <td style="color:#6c757d;font-size:13px;">Mot de passe</td>
                <td style="color:#0d6efd;font-weight:bold;font-size:18px;letter-spacing:.08em;">${motDePasse}</td>
              </tr>
            </table>
            <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
              <p style="margin:0;color:#856404;font-size:13px;">
                ⚠️ <strong>Important :</strong> Connectez-vous et modifiez votre mot de passe dès votre première connexion depuis
                <strong>Paramètres → Mon profil</strong>.
              </p>
            </div>
            <p style="margin:0;color:#6c757d;font-size:13px;line-height:1.6;">
              Ce message est généré automatiquement, merci de ne pas y répondre.<br/>
              En cas de problème, contactez l'administrateur système.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f9fa;padding:16px 32px;text-align:center;border-top:1px solid #dee2e6;">
            <p style="margin:0;color:#adb5bd;font-size:12px;">
              © ${new Date().getFullYear()} Ministère de la Communication et des Médias (MCM)
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  if (!transporter) {
    console.log(`\n[MAILER] SMTP non configuré — identifiants pour ${to}:`);
    console.log(`         Email    : ${to}`);
    console.log(`         Password : ${motDePasse}\n`);
    return false;
  }

  await transporter.sendMail({
    from:    process.env.SMTP_FROM || `"SIRH MCM" <noreply@ministere.ml>`,
    to,
    subject: 'Vos identifiants SIRH — Ministère de la Communication et des Médias',
    html,
  });
  return true;
}

module.exports = { sendWelcomeEmail };
