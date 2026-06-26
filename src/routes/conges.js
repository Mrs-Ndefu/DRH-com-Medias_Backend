const router = require('express').Router();
const pool   = require('../db');
const auth   = require('../middleware/auth');
const { createNotification } = require('./notifications');
const { sendSMS }            = require('../services/sms');

const CONGES_ROLES = ['ADMIN', 'DRH', 'RH', 'CHEF'];
function requireAccess(req, res, next) {
  if (!CONGES_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ message: 'Accès refusé.' });
  }
  next();
}
router.use(auth, requireAccess);

// GET /api/conges
router.get('/', async (req, res, next) => {
  try {
    const { agent_id, status, type } = req.query;
    const params = [];
    const conditions = [];

    if (agent_id) { params.push(parseInt(agent_id)); conditions.push(`c.agent_id=$${params.length}`); }
    if (status)   { params.push(status);              conditions.push(`c.status=$${params.length}`); }
    if (type)     { params.push(type);                conditions.push(`c.type=$${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(`
      SELECT c.*,
             a.nom_famille, a.prenom AS agent_prenom, a.matricule, a.poste,
             a.nom_famille AS agent_nom,
             d.libelle AS direction_libelle
      FROM conges c
      JOIN agents a ON a.id = c.agent_id
      LEFT JOIN directions d ON d.id = a.direction_id
      ${where}
      ORDER BY c.created_at DESC
    `, params);
    res.json({ data: rows, total: rows.length });
  } catch (err) { next(err); }
});

// GET /api/conges/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, a.nom_famille, a.prenom, a.matricule, a.poste, d.libelle AS direction_libelle
      FROM conges c
      JOIN agents a ON a.id = c.agent_id
      LEFT JOIN directions d ON d.id = a.direction_id
      WHERE c.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Congé introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/conges
router.post('/', async (req, res, next) => {
  try {
    const { agent_id, date_debut, date_fin, nb_jours, motif, telephone } = req.body;
    const type = (req.body.type || '').toUpperCase();
    const { rows } = await pool.query(`
      INSERT INTO conges (agent_id, type, date_debut, date_fin, nb_jours, motif, telephone_sms, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING_DRH') RETURNING *
    `, [agent_id, type, date_debut, date_fin, nb_jours, motif || null, telephone || null]);

    // Récupérer le nom de l'agent pour la notification
    const agentRes = await pool.query('SELECT nom_famille, prenom FROM agents WHERE id=$1', [agent_id]);
    const agent = agentRes.rows[0];
    const agentNom = agent ? `${agent.prenom} ${agent.nom_famille}` : `Agent #${agent_id}`;
    await createNotification(
      'CONGE',
      `Nouvelle demande de congé`,
      `${agentNom} a soumis une demande de congé ${type} du ${new Date(date_debut).toLocaleDateString('fr-FR')} au ${new Date(date_fin).toLocaleDateString('fr-FR')} (${nb_jours} jour(s)).`,
      'ADMIN,DRH,CHEF'
    ).catch(() => {});

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ── helper : récupère agent + congé pour SMS ─────────────────
async function getCongeAgent(congeId) {
  const { rows } = await pool.query(`
    SELECT c.type, c.date_debut, c.date_fin, c.nb_jours,
           c.telephone_sms,
           a.nom_famille, a.prenom, a.matricule, a.telephone_mobile
    FROM conges c
    JOIN agents a ON a.id = c.agent_id
    WHERE c.id = $1
  `, [congeId]);
  if (!rows[0]) return null;
  const r = rows[0];
  // Priorité : téléphone saisi dans la demande, sinon celui de l'agent
  r.tel_dest = r.telephone_sms || r.telephone_mobile || null;
  return r;
}

// PATCH /api/conges/:id/valider-chef
router.patch('/:id/valider-chef', async (req, res, next) => {
  try {
    const { par, commentaire, approuve } = req.body;
    if (approuve) {
      const { rows } = await pool.query(`
        UPDATE conges SET
          status='PENDING_DRH',
          validation_chef_date=CURRENT_DATE,
          validation_chef_par=$1,
          validation_chef_com=$2,
          updated_at=NOW()
        WHERE id=$3 AND status='PENDING_CHEF' RETURNING *
      `, [par, commentaire || null, req.params.id]);
      if (!rows.length) return res.status(400).json({ message: 'Action impossible sur ce congé.' });
      res.json(rows[0]);
    } else {
      const { rows } = await pool.query(`
        UPDATE conges SET
          status='REJECTED',
          rejet_date=CURRENT_DATE,
          rejet_par=$1,
          rejet_motif=$2,
          updated_at=NOW()
        WHERE id=$3 AND status='PENDING_CHEF' RETURNING *
      `, [par, commentaire || null, req.params.id]);
      if (!rows.length) return res.status(400).json({ message: 'Action impossible sur ce congé.' });

      // SMS rejet par chef
      const info = await getCongeAgent(req.params.id).catch(() => null);
      if (info?.tel_dest) {
        const debut = new Date(info.date_debut).toLocaleDateString('fr-FR');
        const fin   = new Date(info.date_fin).toLocaleDateString('fr-FR');
        sendSMS(info.tel_dest,
          `SIRH-MCM: Agent ${info.matricule} ${info.prenom} ${info.nom_famille} - votre demande de conge ${info.type} du ${debut} au ${fin} a ete REFUSEE. Motif: ${commentaire || 'non precise'}.`
        ).catch(() => {});
      }

      res.json(rows[0]);
    }
  } catch (err) { next(err); }
});

// PATCH /api/conges/:id/valider-drh  (validation finale SG ou DRH)
router.patch('/:id/valider-drh', async (req, res, next) => {
  try {
    const { par, commentaire, approuve } = req.body;

    // Récupérer les infos avant la mise à jour pour le SMS
    const info = await getCongeAgent(req.params.id).catch(() => null);

    if (approuve) {
      const { rows } = await pool.query(`
        UPDATE conges SET
          status='APPROVED',
          validation_drh_date=CURRENT_DATE,
          validation_drh_par=$1,
          validation_drh_com=$2,
          updated_at=NOW()
        WHERE id=$3 AND status IN ('PENDING_DRH','PENDING_CHEF') RETURNING *
      `, [par, commentaire || null, req.params.id]);
      if (!rows.length) return res.status(400).json({ message: 'Action impossible sur ce congé.' });

      // SMS approbation
      if (info?.tel_dest) {
        const debut = new Date(info.date_debut).toLocaleDateString('fr-FR');
        const fin   = new Date(info.date_fin).toLocaleDateString('fr-FR');
        sendSMS(info.tel_dest,
          `SIRH-MCM: Agent ${info.matricule} ${info.prenom} ${info.nom_famille} - votre demande de conge ${info.type} du ${debut} au ${fin} (${info.nb_jours} jour(s)) a ete APPROUVEE par la DRH. Bonne conge!`
        ).catch(() => {});
      }

      res.json(rows[0]);
    } else {
      const { rows } = await pool.query(`
        UPDATE conges SET
          status='REJECTED',
          rejet_date=CURRENT_DATE,
          rejet_par=$1,
          rejet_motif=$2,
          updated_at=NOW()
        WHERE id=$3 AND status IN ('PENDING_DRH','PENDING_CHEF') RETURNING *
      `, [par, commentaire || null, req.params.id]);
      if (!rows.length) return res.status(400).json({ message: 'Action impossible sur ce congé.' });

      // SMS rejet DRH
      if (info?.tel_dest) {
        const debut = new Date(info.date_debut).toLocaleDateString('fr-FR');
        const fin   = new Date(info.date_fin).toLocaleDateString('fr-FR');
        sendSMS(info.tel_dest,
          `SIRH-MCM: Agent ${info.matricule} ${info.prenom} ${info.nom_famille} - votre demande de conge ${info.type} du ${debut} au ${fin} a ete REFUSEE par la DRH. Motif: ${commentaire || 'non precise'}.`
        ).catch(() => {});
      }

      res.json(rows[0]);
    }
  } catch (err) { next(err); }
});

// DELETE /api/conges/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM conges WHERE id=$1 AND status='PENDING_CHEF'",
      [req.params.id]
    );
    if (!rowCount) return res.status(400).json({ message: 'Suppression impossible.' });
    res.json({ message: 'Demande annulée.' });
  } catch (err) { next(err); }
});

module.exports = router;
