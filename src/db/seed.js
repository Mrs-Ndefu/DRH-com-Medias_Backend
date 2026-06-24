const bcrypt = require('bcryptjs');
const pool   = require('../db');

async function seed() {
  console.log('Insertion des données initiales…');

  // ── Utilisateurs ─────────────────────────────────────────
  const hash = await bcrypt.hash('admin1234', 10);
  await pool.query(`
    INSERT INTO users (nom, prenom, email, password_hash, role)
    VALUES ('Administrateur', 'Système', 'admin@ministere.ml', $1, 'ADMIN')
    ON CONFLICT (email) DO NOTHING
  `, [hash]);

  // ── Directions ───────────────────────────────────────────
  const directions = [
    ['DRH',  'Direction des Ressources Humaines'],
    ['DAF',  "Direction de l'Administration et des Finances"],
    ['DPL',  'Direction de la Planification'],
    ['DIJ',  "Direction de l'Inspection et de la Justice"],
    ['DIT',  "Direction des Systèmes d'Information"],
    ['DG',   'Direction Générale'],
    ['INSP', 'Inspection Générale'],
  ];
  for (const [code, libelle] of directions) {
    await pool.query(
      `INSERT INTO directions (code, libelle) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING`,
      [code, libelle]
    );
  }

  // ── Éléments de paie ─────────────────────────────────────
  const elements = [
    ['SB',   'Salaire de base',             'PRIME',      'INDICE', 2000,   true],
    ['IFO',  'Indemnité de fonction',       'INDEMNITE',  'FIXE',   250000, false],
    ['ILG',  'Indemnité de logement',       'INDEMNITE',  'FIXE',   120000, false],
    ['ITR',  'Indemnité de transport',      'INDEMNITE',  'FIXE',   40000,  false],
    ['IFA',  'Indemnité familiale',         'INDEMNITE',  'FIXE',   15000,  false],
    ['IREP', 'Indemnité de représentation', 'INDEMNITE',  'FIXE',   200000, false],
    ['PPR',  'Prime de performance',        'PRIME',      '% BASE', 15,     true],
    ['INPS', 'Cotisation INPS (retraite)',  'COTISATION', '% BASE', 3.6,    false],
    ['CAN',  'Cotisation CANAM (santé)',    'COTISATION', '% BASE', 1.5,    false],
    ['IR',   'Impôt sur le revenu',         'RETENUE',    '% BRUT', 0,      false],
    ['AVA',  'Avance sur salaire',          'RETENUE',    'FIXE',   0,      false],
    ['ABS',  'Retenue pour absence',        'RETENUE',    'FIXE',   0,      false],
  ];
  for (const [code, designation, type, base, taux, imposable] of elements) {
    await pool.query(
      `INSERT INTO elements_paie (code, designation, type, base, taux, imposable)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (code) DO NOTHING`,
      [code, designation, type, base, taux, imposable]
    );
  }

  // ── Agents ───────────────────────────────────────────────
  const { rows: dirs } = await pool.query('SELECT id, code FROM directions');
  const dirMap = Object.fromEntries(dirs.map(d => [d.code, d.id]));

  const agents = [
    {
      matricule: '2019045', nom_famille: 'Koné', prenom: 'Mamadou', prenom_secondaire: 'Ibrahim',
      sexe: 'Masculin', date_naissance: '1978-05-12', lieu_naissance: 'Bamako',
      situation_familiale: 'Marié(e)', nb_enfants: 3, groupe_sanguin: 'O+',
      type_piece: 'CIN', numero_piece: 'CIN19045A', date_expiration_piece: '2029-05-12',
      adresse_rue: 'Quartier Hippodrome, BP 123', adresse_ville: 'Bamako',
      telephone_mobile: '+223 76 00 00 01', email_pro: 'mkone@ministere.ml',
      urgence_nom: 'Fatoumata Koné', urgence_relation: 'Épouse', urgence_telephone: '+223 76 00 00 02',
      corps: 'Administration générale', grade: 'Administrateur civil principal',
      categorie: 'A', classe: '1ère classe', echelon: 5, indice: 840,
      date_recrutement: '2019-03-15', date_prise_fonction: '2019-04-01', date_titularisation: '2020-04-01',
      mode_recrutement: 'Concours externe', type_contrat: 'Fonctionnaire titulaire',
      situation_admin: 'En activité', rib: 'ML12 0001 0001 0000123456789', banque: 'BDM-SA',
      ministere_affectation: 'Ministère de la Communication et des Médias', direction_code: 'DRH',
      poste: 'Directeur adjoint', lieu_affectation: 'Bamako',
      niveau_etudes: 'Master / DEA / DESS (Bac+5)', diplome: 'Master en Droit Public',
      specialite: 'Administration publique', etablissement: 'USJPB', annee_obtention: 2004,
    },
    {
      matricule: '2020112', nom_famille: 'Traoré', prenom: 'Aminata', nom_jeune_fille: 'Diallo',
      sexe: 'Féminin', date_naissance: '1985-11-20', lieu_naissance: 'Sikasso',
      situation_familiale: 'Marié(e)', nb_enfants: 2, groupe_sanguin: 'A+',
      type_piece: 'CIN', numero_piece: 'CIN20112B',
      adresse_rue: 'ACI 2000, Rue 405', adresse_ville: 'Bamako',
      telephone_mobile: '+223 76 00 00 03', email_pro: 'atraore@ministere.ml',
      corps: 'Administration générale', grade: "Attachée principale d'administration",
      categorie: 'A', classe: '2ème classe', echelon: 3, indice: 620,
      date_recrutement: '2020-01-06', date_prise_fonction: '2020-02-01',
      mode_recrutement: 'Concours interne', type_contrat: 'Fonctionnaire titulaire',
      situation_admin: 'En activité', banque: 'BNDA',
      ministere_affectation: 'Ministère de la Communication et des Médias', direction_code: 'DRH',
      poste: 'Chef de service RH', lieu_affectation: 'Bamako',
      niveau_etudes: 'Licence (Bac+3)', diplome: 'Licence en Sciences de Gestion',
      specialite: 'RH', etablissement: 'FSEG', annee_obtention: 2007,
    },
    {
      matricule: '2018033', nom_famille: 'Yao', prenom: 'Jean-Baptiste',
      sexe: 'Masculin', date_naissance: '1974-03-08', lieu_naissance: 'Ségou',
      situation_familiale: 'Marié(e)', nb_enfants: 4, groupe_sanguin: 'B+',
      type_piece: 'CIN', numero_piece: 'CIN18033C',
      adresse_rue: 'Hamdallaye ACI 2000', adresse_ville: 'Bamako',
      telephone_mobile: '+223 76 00 00 04', email_pro: 'jbyao@ministere.ml',
      corps: 'Administration générale', grade: 'Administrateur civil',
      categorie: 'A', classe: '1ère classe', echelon: 7, indice: 920,
      date_recrutement: '2018-07-01', type_contrat: 'Fonctionnaire titulaire',
      situation_admin: 'En activité', banque: 'BNDA',
      ministere_affectation: 'Ministère de la Communication et des Médias', direction_code: 'DAF',
      poste: 'Administrateur principal', lieu_affectation: 'Bamako',
      niveau_etudes: 'Master / DEA / DESS (Bac+5)', diplome: 'DEA en Droit Administratif',
      specialite: 'Droit public', etablissement: 'Paris I Panthéon-Sorbonne', annee_obtention: 1999,
    },
    {
      matricule: '2021089', nom_famille: 'Camara', prenom: 'Fatoumata', nom_jeune_fille: 'Keita',
      sexe: 'Féminin', date_naissance: '1990-07-15', lieu_naissance: 'Kayes',
      situation_familiale: 'Célibataire', nb_enfants: 0, groupe_sanguin: 'O-',
      type_piece: 'CIN', numero_piece: 'CIN21089D',
      adresse_rue: 'Quinzambougou, Rue 320', adresse_ville: 'Bamako',
      telephone_mobile: '+223 76 00 00 05', email_pro: 'fcamara@ministere.ml',
      corps: 'Corps commun des administrations', grade: 'Secrétaire',
      categorie: 'B', classe: '2ème classe', echelon: 2, indice: 380,
      date_recrutement: '2021-03-01', type_contrat: 'Fonctionnaire titulaire',
      situation_admin: 'En activité', banque: 'Coris Bank',
      ministere_affectation: 'Ministère de la Communication et des Médias', direction_code: 'DG',
      poste: 'Secrétaire de direction', lieu_affectation: 'Bamako',
      niveau_etudes: 'BTS / DUT / DEUG', diplome: 'BTS Secrétariat de direction',
      etablissement: 'CFPA Bamako', annee_obtention: 2012,
    },
    {
      matricule: '2022156', nom_famille: 'Diallo', prenom: 'Ousmane',
      sexe: 'Masculin', date_naissance: '1995-01-30', lieu_naissance: 'Mopti',
      situation_familiale: 'Célibataire', nb_enfants: 0, groupe_sanguin: 'AB+',
      type_piece: 'CIN', numero_piece: 'CIN22156E',
      adresse_ville: 'Bamako', telephone_mobile: '+223 76 00 00 06', email_pro: 'odiallo@ministere.ml',
      corps: 'Corps commun des administrations', grade: 'Agent de bureau',
      categorie: 'C', classe: '3ème classe', echelon: 1, indice: 260,
      date_recrutement: '2022-06-01', type_contrat: 'Fonctionnaire stagiaire',
      situation_admin: 'En activité', banque: 'UBA Mali',
      ministere_affectation: 'Ministère de la Communication et des Médias', direction_code: 'DIT',
      poste: 'Agent de bureau', lieu_affectation: 'Bamako',
      niveau_etudes: 'Baccalauréat', diplome: 'Baccalauréat série G', etablissement: 'Lycée Prosper Kamara', annee_obtention: 2015,
    },
    {
      matricule: '2020078', nom_famille: 'Sow', prenom: 'Ndeye', nom_jeune_fille: 'Ba',
      sexe: 'Féminin', date_naissance: '1988-09-05', lieu_naissance: 'Gao',
      situation_familiale: 'Marié(e)', nb_enfants: 1, groupe_sanguin: 'A-',
      type_piece: 'Passeport', numero_piece: 'PA2020078',
      adresse_rue: 'Badalabougou Est, Rue 12', adresse_ville: 'Bamako',
      telephone_mobile: '+223 76 00 00 07', email_pro: 'nsow@ministere.ml',
      corps: 'Administration générale', grade: 'Chargée de mission',
      categorie: 'A', classe: '2ème classe', echelon: 4, indice: 680,
      date_recrutement: '2020-09-01', type_contrat: 'Fonctionnaire titulaire',
      situation_admin: 'En activité', banque: 'Ecobank',
      ministere_affectation: 'Ministère de la Communication et des Médias', direction_code: 'DPL',
      poste: 'Chargée de mission', lieu_affectation: 'Bamako',
      niveau_etudes: 'Master / DEA / DESS (Bac+5)', diplome: 'Master en Planification du Développement',
      etablissement: 'ENA Bamako', annee_obtention: 2012,
    },
    {
      matricule: '2017022', nom_famille: 'Barry', prenom: 'Abdoulaye', prenom_secondaire: 'Moussa',
      sexe: 'Masculin', date_naissance: '1970-12-22', lieu_naissance: 'Tombouctou',
      situation_familiale: 'Marié(e)', nb_enfants: 5, groupe_sanguin: 'B-',
      type_piece: 'CIN', numero_piece: 'CIN17022F',
      adresse_rue: 'Kalaban Coura, Rue 47', adresse_ville: 'Bamako',
      telephone_mobile: '+223 76 00 00 08', email_pro: 'abarry@ministere.ml',
      corps: 'Administration générale', grade: 'Inspecteur principal',
      categorie: 'A', classe: '1ère classe', echelon: 9, indice: 1050,
      date_recrutement: '2017-01-10', type_contrat: 'Fonctionnaire titulaire',
      situation_admin: 'En activité', banque: 'BDM-SA',
      ministere_affectation: 'Ministère de la Communication et des Médias', direction_code: 'INSP',
      poste: 'Inspecteur principal', lieu_affectation: 'Bamako',
      niveau_etudes: 'Master / DEA / DESS (Bac+5)', diplome: 'Master en Audit & Contrôle de Gestion',
      etablissement: 'CESAG Dakar', annee_obtention: 1995,
    },
    {
      matricule: '2023201', nom_famille: 'Bah', prenom: 'Marie-Claire', nom_jeune_fille: 'Coulibaly',
      sexe: 'Féminin', date_naissance: '1993-04-18', lieu_naissance: 'Koulikoro',
      situation_familiale: 'Célibataire', nb_enfants: 0, groupe_sanguin: 'O+',
      type_piece: 'CIN', numero_piece: 'CIN23201G',
      adresse_rue: 'Niarela, BP 789', adresse_ville: 'Bamako',
      telephone_mobile: '+223 76 00 00 09', email_pro: 'mcbah@ministere.ml',
      corps: 'Corps commun des administrations', grade: "Attachée d'administration",
      categorie: 'B', classe: '1ère classe', echelon: 1, indice: 420,
      date_recrutement: '2023-02-01', type_contrat: 'Fonctionnaire stagiaire',
      situation_admin: 'En activité',
      ministere_affectation: 'Ministère de la Communication et des Médias', direction_code: 'DAF',
      poste: "Attachée d'administration", lieu_affectation: 'Bamako',
      niveau_etudes: 'Licence (Bac+3)', diplome: 'Licence en Administration des Entreprises',
      etablissement: 'FSEG', annee_obtention: 2016,
    },
  ];

  for (const a of agents) {
    const dirId = dirMap[a.direction_code] || null;
    await pool.query(`
      INSERT INTO agents (
        matricule, nom_famille, prenom, prenom_secondaire, nom_jeune_fille,
        sexe, date_naissance, lieu_naissance, situation_familiale, nb_enfants, groupe_sanguin,
        type_piece, numero_piece, date_expiration_piece,
        adresse_rue, adresse_ville,
        telephone_mobile, email_pro,
        urgence_nom, urgence_relation, urgence_telephone,
        corps, grade, categorie, classe, echelon, indice,
        date_recrutement, date_prise_fonction, date_titularisation,
        mode_recrutement, type_contrat, situation_admin, banque, rib,
        ministere_affectation, direction_id, poste, lieu_affectation,
        niveau_etudes, diplome, specialite, etablissement, annee_obtention
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,$11,
        $12,$13,$14,
        $15,$16,
        $17,$18,
        $19,$20,$21,
        $22,$23,$24,$25,$26,$27,
        $28,$29,$30,
        $31,$32,$33,$34,$35,
        $36,$37,$38,$39,
        $40,$41,$42,$43,$44
      ) ON CONFLICT (matricule) DO NOTHING
    `, [
      a.matricule, a.nom_famille, a.prenom, a.prenom_secondaire || null, a.nom_jeune_fille || null,
      a.sexe, a.date_naissance || null, a.lieu_naissance || null, a.situation_familiale || null, a.nb_enfants || 0, a.groupe_sanguin || null,
      a.type_piece || null, a.numero_piece || null, a.date_expiration_piece || null,
      a.adresse_rue || null, a.adresse_ville || null,
      a.telephone_mobile || null, a.email_pro || null,
      a.urgence_nom || null, a.urgence_relation || null, a.urgence_telephone || null,
      a.corps || null, a.grade || null, a.categorie || null, a.classe || null, a.echelon || null, a.indice || null,
      a.date_recrutement || null, a.date_prise_fonction || null, a.date_titularisation || null,
      a.mode_recrutement || null, a.type_contrat || null, a.situation_admin || 'En activité', a.banque || null, a.rib || null,
      a.ministere_affectation || null, dirId, a.poste || null, a.lieu_affectation || null,
      a.niveau_etudes || null, a.diplome || null, a.specialite || null, a.etablissement || null, a.annee_obtention || null,
    ]);
  }

  console.log('Données initiales insérées avec succès.');
  await pool.end();
}

seed().catch(err => {
  console.error('Erreur seed :', err.message);
  process.exit(1);
});
