const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool    = require('../db');
const auth    = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().withMessage('Email invalide'),
  body('password').notEmpty().withMessage('Mot de passe requis'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!rows.length) return res.status(401).json({ message: 'Identifiants incorrects.' });

    const user = rows[0];
    if (!user.actif) return res.status(403).json({ message: 'Compte désactivé.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Identifiants incorrects.' });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      token,
      user: { id: user.id, nom: user.nom, prenom: user.prenom, email: user.email, role: user.role },
    });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nom, prenom, email, role FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/auth/register
router.post('/register', [
  body('email').isEmail().withMessage('Email invalide'),
  body('password').isLength({ min: 6 }).withMessage('Minimum 6 caractères'),
  body('prenom').notEmpty().withMessage('Prénom requis'),
  body('nom').notEmpty().withMessage('Nom requis'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const { prenom, nom, email, password, role } = req.body;
    const { rows: exist } = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exist.length) return res.status(409).json({ message: 'Cet email est déjà utilisé.' });

    const ROLES = ['RH', 'CHEF', 'DRH', 'ADMIN', 'SUPER_USER', 'SG'];
    const userRole = ROLES.includes(role) ? role : 'RH';
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (prenom, nom, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, prenom, nom, email, role',
      [prenom, nom, email, hash, userRole]
    );
    res.status(201).json({ message: 'Compte créé avec succès.', user: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/auth/change-password
router.post('/change-password', auth, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 }).withMessage('Minimum 6 caractères'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const ok = await bcrypt.compare(req.body.currentPassword, rows[0].password_hash);
    if (!ok) return res.status(400).json({ message: 'Mot de passe actuel incorrect.' });

    const newHash = await bcrypt.hash(req.body.newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user.id]);
    res.json({ message: 'Mot de passe modifié.' });
  } catch (err) { next(err); }
});

module.exports = router;
