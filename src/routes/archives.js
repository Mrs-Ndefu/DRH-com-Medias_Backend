const path   = require('path');
const fs     = require('fs');
const router = require('express').Router();
const multer = require('multer');
const pool   = require('../db');
const auth   = require('../middleware/auth');

// ── Multer config ─────────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, '../../uploads/archives');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  }
});

const ALLOWED_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'text/plain',
];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Type de fichier non autorisé. Formats acceptés : PDF, Word, Excel, images.'));
  }
});

// ── Token via query param (pour liens <a download> navigateur) ────────────────
router.use((req, res, next) => {
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
});

// ── Rôles ─────────────────────────────────────────────────────────────────────
const ARCHIVES_ROLES = ['ADMIN', 'DRH', 'SUPER_USER'];
function requireAccess(req, res, next) {
  if (!ARCHIVES_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ message: 'Accès refusé.' });
  }
  next();
}
router.use(auth, requireAccess);

// ── Agents archivés ───────────────────────────────────────────────────────────

// GET /api/archives/agents
router.get('/agents', async (req, res, next) => {
  try {
    const { search, situation, page = 1, limit = 15 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = ["(a.actif = FALSE OR a.situation_admin IN ('À la retraite','Suspendu','En disponibilité','En détachement'))"];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(a.nom_famille ILIKE $${params.length} OR a.prenom ILIKE $${params.length} OR a.matricule ILIKE $${params.length})`);
    }
    if (situation) {
      params.push(situation);
      conditions.push(`a.situation_admin = $${params.length}`);
    }

    const where = conditions.join(' AND ');
    const { rows: cnt } = await pool.query(
      `SELECT COUNT(*) FROM agents a WHERE ${where}`,
      params
    );

    params.push(parseInt(limit), offset);
    const { rows } = await pool.query(`
      SELECT a.id, a.matricule, a.nom_famille, a.prenom, a.grade,
             a.categorie, a.situation_admin, a.date_recrutement,
             a.updated_at AS date_archivage,
             d.libelle AS direction_libelle
      FROM agents a
      LEFT JOIN directions d ON d.id = a.direction_id
      WHERE ${where}
      ORDER BY a.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({ data: rows, total: parseInt(cnt[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/archives/stats
router.get('/stats', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) AS total_archives,
        COUNT(*) FILTER (WHERE situation_admin = 'À la retraite')   AS retraites,
        COUNT(*) FILTER (WHERE situation_admin = 'En disponibilité') AS disponibilite,
        COUNT(*) FILTER (WHERE situation_admin = 'En détachement')   AS detachement,
        COUNT(*) FILTER (WHERE situation_admin = 'Suspendu')         AS suspendus,
        COUNT(*) FILTER (WHERE sexe = 'Féminin')  AS femmes,
        COUNT(*) FILTER (WHERE sexe = 'Masculin') AS hommes,
        COUNT(*) FILTER (WHERE categorie = 'A') AS cat_a,
        COUNT(*) FILTER (WHERE categorie = 'B') AS cat_b,
        COUNT(*) FILTER (WHERE categorie = 'C') AS cat_c
      FROM agents WHERE actif = FALSE OR situation_admin IN ('À la retraite','Suspendu','En disponibilité','En détachement')
    `);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/archives/agents/:id/restaurer
router.patch('/agents/:id/restaurer', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE agents SET actif=TRUE, situation_admin='En activité', updated_at=NOW()
       WHERE id=$1 AND actif=FALSE RETURNING id, matricule, nom_famille, prenom`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Agent archivé introuvable.' });
    res.json({ message: 'Agent restauré avec succès.', agent: rows[0] });
  } catch (err) { next(err); }
});

// ── Documents archives ────────────────────────────────────────────────────────

// GET /api/archives/documents
router.get('/documents', async (req, res, next) => {
  try {
    const { search, type } = req.query;
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(titre ILIKE $${params.length} OR reference ILIKE $${params.length})`);
    }
    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT id, reference, type, titre, emetteur, date_document, description,
              statut, created_by, created_at,
              fichier_nom, fichier_taille, fichier_mimetype,
              CASE WHEN fichier_chemin IS NOT NULL THEN TRUE ELSE FALSE END AS has_file
       FROM documents_archives ${where}
       ORDER BY date_document DESC, created_at DESC`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { next(err); }
});

// GET /api/archives/documents/:id — détails complets
router.get('/documents/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, reference, type, titre, emetteur, date_document, description,
              statut, created_by, created_at, updated_at,
              fichier_nom, fichier_taille, fichier_mimetype,
              CASE WHEN fichier_chemin IS NOT NULL THEN TRUE ELSE FALSE END AS has_file
       FROM documents_archives WHERE id=$1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Document introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/archives/documents/:id/telecharger — téléchargement du fichier
router.get('/documents/:id/telecharger', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT fichier_chemin, fichier_nom FROM documents_archives WHERE id=$1',
      [req.params.id]
    );
    if (!rows.length || !rows[0].fichier_chemin) {
      return res.status(404).json({ message: 'Aucun fichier attaché à ce document.' });
    }
    const { fichier_chemin, fichier_nom } = rows[0];
    if (!fs.existsSync(fichier_chemin)) {
      return res.status(404).json({ message: 'Fichier introuvable sur le serveur.' });
    }
    res.download(fichier_chemin, fichier_nom);
  } catch (err) { next(err); }
});

// POST /api/archives/documents — ADMIN seulement (avec upload fichier optionnel)
router.post('/documents', (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Seul un ADMIN peut archiver des documents.' });
  }
  upload.single('fichier')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Erreur upload : ${err.message}` });
    }
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, async (req, res, next) => {
  try {
    const { reference, type, titre, emetteur, date_document, description } = req.body;
    if (!reference || !type || !titre || !date_document) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Champs obligatoires : référence, type, titre, date.' });
    }

    const created_by = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim() || req.user.email;
    const fichier_nom     = req.file ? req.file.originalname          : null;
    const fichier_chemin  = req.file ? req.file.path                  : null;
    const fichier_taille  = req.file ? req.file.size                  : null;
    const fichier_mimetype = req.file ? req.file.mimetype             : null;

    const { rows } = await pool.query(
      `INSERT INTO documents_archives
         (reference, type, titre, emetteur, date_document, description, created_by,
          fichier_nom, fichier_chemin, fichier_taille, fichier_mimetype)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [reference, type, titre, emetteur || null, date_document,
       description || null, created_by,
       fichier_nom, fichier_chemin, fichier_taille, fichier_mimetype]
    );
    // Ne pas renvoyer le chemin disque dans la réponse
    const doc = { ...rows[0] };
    delete doc.fichier_chemin;
    doc.has_file = !!fichier_nom;
    res.status(201).json(doc);
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    if (err.code === '23505') {
      return res.status(409).json({ message: `La référence "${req.body.reference}" existe déjà.` });
    }
    next(err);
  }
});

// DELETE /api/archives/documents/:id — ADMIN seulement
router.delete('/documents/:id', async (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Seul un ADMIN peut supprimer un document archivé.' });
  }
  try {
    const { rows } = await pool.query(
      'DELETE FROM documents_archives WHERE id=$1 RETURNING fichier_chemin',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Document introuvable.' });
    // Supprimer le fichier physique si existant
    if (rows[0].fichier_chemin && fs.existsSync(rows[0].fichier_chemin)) {
      fs.unlinkSync(rows[0].fichier_chemin);
    }
    res.json({ message: 'Document supprimé.' });
  } catch (err) { next(err); }
});

module.exports = router;
