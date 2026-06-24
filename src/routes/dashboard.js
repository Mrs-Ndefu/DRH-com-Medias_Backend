const router = require('express').Router();
const pool   = require('../db');
const auth   = require('../middleware/auth');

// GET /api/dashboard  — statistiques globales
router.get('/', auth, async (req, res, next) => {
  try {
    const [agents, conges, presences, recrutement] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE situation_admin='En activité') AS actifs,
          COUNT(*) FILTER (WHERE sexe='Féminin') AS femmes,
          COUNT(*) FILTER (WHERE sexe='Masculin') AS hommes,
          COUNT(*) FILTER (WHERE categorie='A') AS cat_a,
          COUNT(*) FILTER (WHERE categorie='B') AS cat_b,
          COUNT(*) FILTER (WHERE categorie='C') AS cat_c
        FROM agents WHERE actif=TRUE
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status='PENDING_CHEF') AS en_attente_chef,
          COUNT(*) FILTER (WHERE status='PENDING_DRH')  AS en_attente_drh,
          COUNT(*) FILTER (WHERE status='APPROVED' AND date_fin >= CURRENT_DATE) AS en_cours,
          COUNT(*) FILTER (WHERE status='APPROVED' AND date_fin < CURRENT_DATE)  AS termines
        FROM conges
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE statut='PRESENT') AS presents,
          COUNT(*) FILTER (WHERE statut='ABSENT')  AS absents
        FROM presences WHERE date_presence = CURRENT_DATE
      `),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM offres_emploi WHERE statut='OUVERTE') AS offres_ouvertes,
          (SELECT COUNT(*) FROM candidats) AS total_candidats
        FROM (SELECT 1) AS dummy
      `),
    ]);

    const a = agents.rows[0];
    const c = conges.rows[0];
    const p = presences.rows[0];
    const r = recrutement.rows[0];

    res.json({
      agents:      a,
      conges:      c,
      presences:   p,
      recrutement: r,
      stats: {
        agents_actifs:        parseInt(a.actifs)          || 0,
        conges_en_attente:    parseInt(c.en_attente_chef) + parseInt(c.en_attente_drh) || 0,
        presences_aujourd_hui: parseInt(p.presents)       || 0,
        bulletins_ce_mois:    0,
        offres_ouvertes:      parseInt(r.offres_ouvertes) || 0,
        total_candidats:      parseInt(r.total_candidats) || 0,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
