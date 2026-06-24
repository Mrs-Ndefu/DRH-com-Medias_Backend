const jwt  = require('jsonwebtoken');
const pool = require('../db');

module.exports = async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token manquant.' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query('SELECT id, role, actif FROM users WHERE id = $1', [payload.id]);
    if (!rows.length || !rows[0].actif) {
      return res.status(401).json({ message: 'Compte inactif ou introuvable.' });
    }
    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ message: 'Token invalide ou expiré.' });
  }
};
