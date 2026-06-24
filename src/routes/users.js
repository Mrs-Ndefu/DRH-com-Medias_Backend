const router = require('express').Router();
const bcrypt = require('bcryptjs');
const path   = require('path');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const pool   = require('../db');
const auth   = require('../middleware/auth');

const ADMIN_ROLES = ['ADMIN'];

function requireAdmin(req, res, next) {
  if (!ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ message: 'Accès refusé.' });
  }
  next();
}

// Multer pour photos utilisateurs
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/users'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `user-${req.params.id}-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Seules les images sont acceptées (JPEG, PNG, WEBP).'));
  },
});

// GET /api/users — liste tous les utilisateurs (ADMIN)
router.get('/', auth, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, prenom, nom, email, role, actif, photo, created_at FROM users ORDER BY nom, prenom'
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { next(err); }
});

// PATCH /api/users/:id/photo — upload photo de profil
router.patch('/:id/photo', auth, requireAdmin, upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu.' });
    const filePath = `/uploads/users/${req.file.filename}`;
    const { rows } = await pool.query(
      'UPDATE users SET photo=$1, updated_at=NOW() WHERE id=$2 RETURNING id, photo',
      [filePath, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Utilisateur introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/users/:id — modifier rôle ou statut actif (ADMIN seulement)
router.patch('/:id', auth, requireAdmin, [
  body('role').optional().isIn(['RH', 'CHEF', 'DRH', 'ADMIN', 'SUPER_USER', 'SG']),
  body('actif').optional().isBoolean(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const { role, actif } = req.body;
    const fields = [];
    const params = [];

    if (role !== undefined)  { params.push(role);  fields.push(`role=$${params.length}`); }
    if (actif !== undefined) { params.push(actif); fields.push(`actif=$${params.length}`); }
    if (!fields.length) return res.status(400).json({ message: 'Aucune modification.' });

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${params.length} RETURNING id, prenom, nom, email, role, actif`,
      params
    );
    if (!rows.length) return res.status(404).json({ message: 'Utilisateur introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/users/:id — supprimer (ADMIN seulement)
router.delete('/:id', auth, requireAdmin, async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ message: 'Vous ne pouvez pas supprimer votre propre compte.' });
    }
    const { rowCount } = await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Utilisateur introuvable.' });
    res.json({ message: 'Utilisateur supprimé.' });
  } catch (err) { next(err); }
});

module.exports = router;
