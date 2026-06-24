const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const path     = require('path');
const jwt      = require('jsonwebtoken');
const multer   = require('multer');
const { body, validationResult } = require('express-validator');
const pool     = require('../db');
const auth     = require('../middleware/auth');
const { sendWelcomeEmail } = require('../utils/mailer');

// Multer pour photo de profil (self)
const photoStorage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/users'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `user-${req.user.id}-${Date.now()}${ext}`);
  },
});
const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Seules les images sont acceptées (JPEG, PNG, WEBP).'));
  },
});

function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let pwd = '';
  const bytes = crypto.randomBytes(10);
  for (let i = 0; i < 8; i++) pwd += chars[bytes[i] % chars.length];
  return pwd + '!';
}

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
      user: { id: user.id, nom: user.nom, prenom: user.prenom, email: user.email, role: user.role, photo: user.photo },
    });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nom, prenom, email, role, photo FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/auth/register — ADMIN uniquement, mot de passe auto-généré
router.post('/register', auth, async (req, res, next) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Seul un administrateur peut créer des comptes.' });
    }

    const { prenom, nom, email, role } = req.body;
    if (!prenom || !nom || !email) {
      return res.status(400).json({ message: 'Prénom, nom et email sont requis.' });
    }

    const { rows: exist } = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exist.length) return res.status(409).json({ message: 'Cet email est déjà utilisé.' });

    const ROLES = ['RH', 'CHEF', 'DRH', 'ADMIN', 'SUPER_USER', 'SG'];
    const userRole = ROLES.includes(role) ? role : 'RH';

    const motDePasse = generatePassword();
    const hash = await bcrypt.hash(motDePasse, 10);

    const { rows } = await pool.query(
      'INSERT INTO users (prenom, nom, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, prenom, nom, email, role',
      [prenom, nom, email, hash, userRole]
    );
    const newUser = rows[0];

    // Envoi email (async, non bloquant)
    const emailEnvoye = await sendWelcomeEmail(email, prenom, nom, motDePasse).catch(() => false);

    // Notification admins
    const { createNotification } = require('./notifications');
    const { rows: creatRows } = await pool.query('SELECT prenom, nom, email FROM users WHERE id=$1', [req.user.id]);
    const cr = creatRows[0] || {};
    const createur = `${cr.prenom || ''} ${cr.nom || ''}`.trim() || cr.email || `User #${req.user.id}`;
    await createNotification(
      'UTILISATEUR',
      'Nouvel utilisateur créé',
      `${createur} a créé un compte pour ${prenom} ${nom} (${email}) avec le rôle ${userRole}.`,
      'ADMIN'
    ).catch(() => {});

    res.status(201).json({
      message: 'Compte créé avec succès.',
      user: newUser,
      motDePasse,       // retourné pour l'afficher dans l'UI si email non envoyé
      emailEnvoye,
    });
  } catch (err) { next(err); }
});

// PATCH /api/auth/change-password — changer son propre mot de passe
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
    res.json({ message: 'Mot de passe modifié avec succès.' });
  } catch (err) { next(err); }
});

// PATCH /api/auth/me/photo — changer sa propre photo de profil
router.patch('/me/photo', auth, uploadPhoto.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu.' });
    const filePath = `/uploads/users/${req.file.filename}`;
    const { rows } = await pool.query(
      'UPDATE users SET photo=$1, updated_at=NOW() WHERE id=$2 RETURNING id, prenom, nom, email, role, photo',
      [filePath, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
