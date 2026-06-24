const router = require('express').Router();
const pool   = require('../db');
const auth   = require('../middleware/auth');

const PRES_ROLES = ['ADMIN', 'DRH', 'SUPER_USER', 'RH'];
function requireAccess(req, res, next) {
  if (!PRES_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ message: 'Accès refusé.' });
  }
  next();
}
router.use(auth, requireAccess);

// GET /api/presences?date=YYYY-MM-DD&agent_id=&direction_id=
router.get('/', async (req, res, next) => {
  try {
    const { date, agent_id, direction_id, mois, annee } = req.query;
    const params = [];
    const conditions = [];

    if (date)         { params.push(date);                   conditions.push(`p.date_presence=$${params.length}`); }
    if (agent_id)     { params.push(parseInt(agent_id));     conditions.push(`p.agent_id=$${params.length}`); }
    if (direction_id) { params.push(parseInt(direction_id)); conditions.push(`a.direction_id=$${params.length}`); }
    if (mois && annee) {
      params.push(parseInt(mois), parseInt(annee));
      conditions.push(`EXTRACT(MONTH FROM p.date_presence)=$${params.length-1} AND EXTRACT(YEAR FROM p.date_presence)=$${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(`
      SELECT p.*, a.nom_famille, a.prenom, a.matricule, d.libelle AS direction_libelle
      FROM presences p
      JOIN agents a ON a.id = p.agent_id
      LEFT JOIN directions d ON d.id = a.direction_id
      ${where}
      ORDER BY p.date_presence DESC, a.nom_famille
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/presences  (pointage manuel ou import)
router.post('/', async (req, res, next) => {
  try {
    const { agent_id, date_presence, heure_entree, heure_sortie, mode_pointage, statut, observation } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO presences (agent_id, date_presence, heure_entree, heure_sortie, mode_pointage, statut, observation)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (agent_id, date_presence)
      DO UPDATE SET heure_entree=$3, heure_sortie=$4, mode_pointage=$5, statut=$6, observation=$7
      RETURNING *
    `, [agent_id, date_presence, heure_entree || null, heure_sortie || null,
        mode_pointage || 'MANUEL', statut || 'PRESENT', observation || null]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/presences/batch  (plusieurs pointages en une fois)
router.post('/batch', async (req, res, next) => {
  try {
    const { pointages } = req.body; // [{agent_id, date_presence, heure_entree, heure_sortie, statut}]
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const p of pointages) {
        const { rows } = await client.query(`
          INSERT INTO presences (agent_id, date_presence, heure_entree, heure_sortie, mode_pointage, statut)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (agent_id, date_presence)
          DO UPDATE SET heure_entree=$3, heure_sortie=$4, statut=$6
          RETURNING *
        `, [p.agent_id, p.date_presence, p.heure_entree || null, p.heure_sortie || null,
            p.mode_pointage || 'BIOMETRIQUE', p.statut || 'PRESENT']);
        results.push(rows[0]);
      }
      await client.query('COMMIT');
      res.status(201).json({ count: results.length, data: results });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (err) { next(err); }
});

// GET /api/presences/rapport  — statistiques mensuelles
router.get('/rapport', async (req, res, next) => {
  try {
    const { mois, annee, direction_id } = req.query;
    const params = [parseInt(mois), parseInt(annee)];
    let dirCondition = '';
    if (direction_id) { params.push(parseInt(direction_id)); dirCondition = `AND a.direction_id=$${params.length}`; }

    const { rows } = await pool.query(`
      SELECT
        a.id AS agent_id, a.matricule, a.nom_famille, a.prenom,
        d.libelle AS direction,
        COUNT(*) FILTER (WHERE p.statut='PRESENT')  AS nb_presents,
        COUNT(*) FILTER (WHERE p.statut='ABSENT')   AS nb_absents,
        COUNT(*) FILTER (WHERE p.statut='RETARD')   AS nb_retards,
        COUNT(*) FILTER (WHERE p.statut='CONGE')    AS nb_conges
      FROM agents a
      LEFT JOIN presences p ON p.agent_id=a.id
        AND EXTRACT(MONTH FROM p.date_presence)=$1
        AND EXTRACT(YEAR  FROM p.date_presence)=$2
      LEFT JOIN directions d ON d.id=a.direction_id
      WHERE a.actif=TRUE ${dirCondition}
      GROUP BY a.id, a.matricule, a.nom_famille, a.prenom, d.libelle
      ORDER BY a.nom_famille
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
