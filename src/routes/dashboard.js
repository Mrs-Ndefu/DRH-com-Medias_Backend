const router = require('express').Router();
const pool   = require('../db');
const auth   = require('../middleware/auth');

const JOURS_FR = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}

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

    // ── Présence — 7 derniers jours ──────────────────────────────────────
    const today = new Date();
    const debut7 = new Date(today); debut7.setDate(debut7.getDate() - 6);
    const { rows: presRows } = await pool.query(`
      SELECT date_presence,
        COUNT(*) FILTER (WHERE statut IN ('PRESENT','RETARD')) AS present,
        COUNT(*) FILTER (WHERE statut='ABSENT') AS absents,
        COUNT(*) FILTER (WHERE statut='CONGE')  AS conge
      FROM presences
      WHERE date_presence BETWEEN $1 AND $2
      GROUP BY date_presence
    `, [localDateStr(debut7), localDateStr(today)]);
    const presMap = {};
    presRows.forEach(r2 => { presMap[localDateStr(new Date(r2.date_presence))] = r2; });

    const presence_semaine = [];
    for (let i = 0; i < 7; i++) {
      const d  = new Date(debut7); d.setDate(d.getDate() + i);
      const ds = localDateStr(d);
      const row = presMap[ds];
      presence_semaine.push({
        date:       ds,
        jour:       `${JOURS_FR[d.getDay()]} ${d.getDate()}`,
        present:    parseInt(row?.present || 0),
        absents:    parseInt(row?.absents || 0),
        conge:      parseInt(row?.conge   || 0),
        is_weekend: d.getDay() === 0 || d.getDay() === 6,
      });
    }

    // ── Répartition par direction ────────────────────────────────────────
    const { rows: directions } = await pool.query(`
      SELECT d.id, d.code AS sigle, d.libelle AS nom, COUNT(ag.id) AS agents
      FROM directions d
      LEFT JOIN agents ag ON ag.direction_id = d.id AND ag.actif = TRUE
      WHERE d.actif = TRUE
      GROUP BY d.id, d.code, d.libelle
      HAVING COUNT(ag.id) > 0
      ORDER BY agents DESC
      LIMIT 6
    `);

    // ── Alertes RH (dérivées des données réelles) ────────────────────────
    const alertes = [];
    const congesAttente = parseInt(c.en_attente_chef) + parseInt(c.en_attente_drh);
    if (congesAttente > 0) {
      alertes.push({
        id: 'conges', niveau: 'warning', icon: 'ph-clock', titre: 'Congés en attente',
        message: `${congesAttente} demande(s) de congé en attente de validation`, lien: '/leaves',
      });
    }

    const { rows: postesVacants } = await pool.query(`
      SELECT o.id, o.titre, d.libelle AS direction, o.created_at,
        (SELECT COUNT(*) FROM candidats WHERE offre_id = o.id) AS nb_candidats
      FROM offres_emploi o
      LEFT JOIN directions d ON d.id = o.direction_id
      WHERE o.statut = 'OUVERTE'
      ORDER BY o.created_at ASC
    `);
    postesVacants.filter(o => parseInt(o.nb_candidats) === 0).slice(0, 2).forEach(o => {
      const jours = Math.floor((Date.now() - new Date(o.created_at)) / 86400000);
      alertes.push({
        id: `poste-${o.id}`, niveau: 'info', icon: 'ph-briefcase', titre: 'Poste vacant',
        message: `${o.direction || 'N/A'} : "${o.titre}" ouvert depuis ${jours} jour(s), aucun candidat`, lien: '/recruitment',
      });
    });

    const { rows: integrations } = await pool.query(`
      SELECT COUNT(*) AS nb FROM agents
      WHERE actif = TRUE AND created_at >= NOW() - INTERVAL '7 days'
    `);
    if (parseInt(integrations[0].nb) > 0) {
      alertes.push({
        id: 'integrations', niveau: 'success', icon: 'ph-user-plus', titre: 'Intégrations',
        message: `${integrations[0].nb} nouvel(le)s agent(s) ajouté(s) cette semaine`, lien: '/agents',
      });
    }

    const { rows: entretiensProches } = await pool.query(`
      SELECT COUNT(*) AS nb FROM entretiens
      WHERE date_entretien BETWEEN NOW() AND NOW() + INTERVAL '7 days' AND resultat IS NULL
    `);
    if (parseInt(entretiensProches[0].nb) > 0) {
      alertes.push({
        id: 'entretiens', niveau: 'info', icon: 'ph-calendar', titre: 'Entretiens à venir',
        message: `${entretiensProches[0].nb} entretien(s) de recrutement dans les 7 prochains jours`, lien: '/recruitment',
      });
    }

    // ── Activités récentes (fusion multi-tables, triées par date) ───────
    const [recAgents, recConges, recCandidats] = await Promise.all([
      pool.query(`
        SELECT a.id, a.prenom, a.nom_famille, d.libelle AS direction, a.created_at
        FROM agents a LEFT JOIN directions d ON d.id = a.direction_id
        ORDER BY a.created_at DESC LIMIT 5
      `),
      pool.query(`
        SELECT c.id, c.status, c.type, c.updated_at, a.prenom, a.nom_famille
        FROM conges c JOIN agents a ON a.id = c.agent_id
        ORDER BY c.updated_at DESC LIMIT 5
      `),
      pool.query(`
        SELECT cd.id, cd.statut, cd.updated_at, cd.prenom, cd.nom, o.titre
        FROM candidats cd LEFT JOIN offres_emploi o ON o.id = cd.offre_id
        ORDER BY cd.updated_at DESC LIMIT 5
      `),
    ]);

    const activites = [];
    recAgents.rows.forEach(a2 => activites.push({
      id: `agent-${a2.id}`, icon: 'ph-user-plus', color: 'primary', date: a2.created_at,
      msg: `Nouvel agent créé : ${a2.prenom} ${a2.nom_famille}${a2.direction ? ' — ' + a2.direction : ''}`,
    }));
    recConges.rows.forEach(c2 => {
      const labels = { PENDING_CHEF: 'soumise pour validation', PENDING_DRH: 'transmise à la DRH', APPROVED: 'approuvée', REJECTED: 'rejetée' };
      activites.push({
        id: `conge-${c2.id}`, icon: 'ph-calendar-check',
        color: c2.status === 'APPROVED' ? 'success' : c2.status === 'REJECTED' ? 'danger' : 'warning',
        date: c2.updated_at,
        msg: `Demande de congé (${c2.type}) ${labels[c2.status] || c2.status} — ${c2.prenom} ${c2.nom_famille}`,
      });
    });
    recCandidats.rows.forEach(cd => {
      const labels = { RECU: 'reçu', SELECTIONNE: 'sélectionné', EN_ENTRETIEN: 'en entretien', ADMIS: 'admis', REJETE: 'rejeté' };
      activites.push({
        id: `candidat-${cd.id}`, icon: 'ph-briefcase', color: cd.statut === 'ADMIS' ? 'success' : cd.statut === 'REJETE' ? 'danger' : 'info',
        date: cd.updated_at,
        msg: `Candidature ${labels[cd.statut] || cd.statut} : ${cd.prenom} ${cd.nom}${cd.titre ? ' — ' + cd.titre : ''}`,
      });
    });
    activites.sort((x, y) => new Date(y.date) - new Date(x.date));

    // ── Calendrier RH — congés et entretiens du mois courant ────────────
    const moisDebut = new Date(today.getFullYear(), today.getMonth(), 1);
    const moisFin   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const [congesMois, entretiensMois] = await Promise.all([
      pool.query(`
        SELECT c.date_debut, c.date_fin, c.status, a.prenom, a.nom_famille
        FROM conges c JOIN agents a ON a.id = c.agent_id
        WHERE c.status IN ('APPROVED','PENDING_DRH','PENDING_CHEF')
          AND c.date_debut <= $2 AND c.date_fin >= $1
      `, [localDateStr(moisDebut), localDateStr(moisFin)]),
      pool.query(`
        SELECT e.date_entretien, cd.prenom, cd.nom
        FROM entretiens e JOIN candidats cd ON cd.id = e.candidat_id
        WHERE e.date_entretien BETWEEN $1 AND $2
      `, [moisDebut.toISOString(), moisFin.toISOString()]),
    ]);

    const calendrier = {};
    const pushEvent = (ds, label, type) => {
      if (!calendrier[ds]) calendrier[ds] = [];
      calendrier[ds].push({ label, type });
    };
    congesMois.rows.forEach(cg => {
      const d1 = new Date(cg.date_debut), d2 = new Date(cg.date_fin);
      const cur = new Date(Math.max(d1, moisDebut));
      const fin = new Date(Math.min(d2, moisFin));
      const type = cg.status === 'APPROVED' ? 'conge-approuve' : 'conge-attente';
      while (cur <= fin) {
        pushEvent(localDateStr(cur), `Congé ${cg.prenom} ${cg.nom_famille}`, type);
        cur.setDate(cur.getDate() + 1);
      }
    });
    entretiensMois.rows.forEach(e => {
      if (!e.date_entretien) return;
      pushEvent(localDateStr(new Date(e.date_entretien)), `Entretien ${e.prenom} ${e.nom}`, 'entretien');
    });

    res.json({
      agents:      a,
      conges:      c,
      presences:   p,
      recrutement: r,
      presence_semaine,
      directions,
      alertes,
      activites: activites.slice(0, 8),
      calendrier,
      stats: {
        agents_actifs:        parseInt(a.actifs)          || 0,
        conges_en_attente:    congesAttente || 0,
        presences_aujourd_hui: parseInt(p.presents)       || 0,
        bulletins_ce_mois:    0,
        offres_ouvertes:      parseInt(r.offres_ouvertes) || 0,
        total_candidats:      parseInt(r.total_candidats) || 0,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
