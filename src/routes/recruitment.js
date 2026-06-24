const router = require('express').Router();
const pool   = require('../db');
const auth   = require('../middleware/auth');

const REC_ROLES = ['ADMIN', 'DRH', 'RH'];
function requireAccess(req, res, next) {
  if (!REC_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ message: 'Accès refusé.' });
  }
  next();
}
router.use(auth, requireAccess);

// ── Offres d'emploi ───────────────────────────────────────────

router.get('/offres', async (req, res, next) => {
  try {
    const { statut } = req.query;
    const params = statut ? [statut] : [];
    const where  = statut ? 'WHERE o.statut=$1' : '';
    const { rows } = await pool.query(`
      SELECT o.*, d.libelle AS direction_libelle,
             COUNT(c.id) AS nb_candidats
      FROM offres_emploi o
      LEFT JOIN directions d ON d.id = o.direction_id
      LEFT JOIN candidats c ON c.offre_id = o.id
      ${where}
      GROUP BY o.id, d.libelle
      ORDER BY o.created_at DESC
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/offres', async (req, res, next) => {
  try {
    const { titre, direction_id, type_contrat, description, profil_requis, nb_postes, date_limite } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO offres_emploi (titre,direction_id,type_contrat,description,profil_requis,nb_postes,date_limite)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [titre, direction_id || null, type_contrat || null, description || null, profil_requis || null, nb_postes || 1, date_limite || null]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/offres/:id', async (req, res, next) => {
  try {
    const { titre, type_contrat, description, profil_requis, nb_postes, date_limite, statut } = req.body;
    const { rows } = await pool.query(`
      UPDATE offres_emploi SET titre=$1,type_contrat=$2,description=$3,profil_requis=$4,
        nb_postes=$5,date_limite=$6,statut=$7,updated_at=NOW()
      WHERE id=$8 RETURNING *
    `, [titre, type_contrat || null, description || null, profil_requis || null, nb_postes || 1, date_limite || null, statut || 'OUVERTE', req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Offre introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Candidats ─────────────────────────────────────────────────

router.get('/candidats', async (req, res, next) => {
  try {
    const { offre_id, statut } = req.query;
    const params = [];
    const cond = [];
    if (offre_id) { params.push(parseInt(offre_id)); cond.push(`c.offre_id=$${params.length}`); }
    if (statut)   { params.push(statut);             cond.push(`c.statut=$${params.length}`); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const { rows } = await pool.query(`
      SELECT c.*, o.titre AS offre_titre
      FROM candidats c
      LEFT JOIN offres_emploi o ON o.id = c.offre_id
      ${where}
      ORDER BY c.created_at DESC
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/candidats', async (req, res, next) => {
  try {
    const { offre_id, nom, prenom, email, telephone } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO candidats (offre_id,nom,prenom,email,telephone)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [offre_id || null, nom, prenom, email || null, telephone || null]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/candidats/:id/statut', async (req, res, next) => {
  try {
    const { statut, note, commentaire } = req.body;
    const { rows } = await pool.query(
      'UPDATE candidats SET statut=$1,note=$2,commentaire=$3,updated_at=NOW() WHERE id=$4 RETURNING *',
      [statut, note || null, commentaire || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Candidat introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Entretiens ────────────────────────────────────────────────

router.get('/entretiens', async (req, res, next) => {
  try {
    const { offre_id, candidat_id } = req.query;
    const params = [];
    const cond = [];
    if (offre_id)    { params.push(parseInt(offre_id));    cond.push(`e.offre_id=$${params.length}`); }
    if (candidat_id) { params.push(parseInt(candidat_id)); cond.push(`e.candidat_id=$${params.length}`); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const { rows } = await pool.query(`
      SELECT e.*, c.nom, c.prenom, o.titre AS offre_titre
      FROM entretiens e
      JOIN candidats c ON c.id = e.candidat_id
      LEFT JOIN offres_emploi o ON o.id = e.offre_id
      ${where}
      ORDER BY e.date_entretien DESC
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/entretiens', async (req, res, next) => {
  try {
    const { candidat_id, offre_id, date_entretien, lieu, type, jury } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO entretiens (candidat_id,offre_id,date_entretien,lieu,type,jury)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [candidat_id, offre_id || null, date_entretien || null, lieu || null, type || 'ORAL', jury || null]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/entretiens/:id/resultat', async (req, res, next) => {
  try {
    const { note, resultat, observations } = req.body;
    const { rows } = await pool.query(
      'UPDATE entretiens SET note=$1,resultat=$2,observations=$3 WHERE id=$4 RETURNING *',
      [note || null, resultat || null, observations || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Entretien introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
