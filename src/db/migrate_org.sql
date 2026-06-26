-- ============================================================
-- Migration : Structure organisationnelle
-- Ministère de la Communication et des Médias du Mali
-- ============================================================

-- ── 1. Nouvelles tables ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS bureaux (
  id           SERIAL       PRIMARY KEY,
  division_id  INTEGER      REFERENCES divisions(id) ON DELETE SET NULL,
  direction_id INTEGER      REFERENCES directions(id) ON DELETE SET NULL,
  code         VARCHAR(30)  UNIQUE NOT NULL,
  libelle      VARCHAR(200) NOT NULL,
  description  TEXT,
  actif        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS postes (
  id           SERIAL       PRIMARY KEY,
  code         VARCHAR(30)  UNIQUE NOT NULL,
  libelle      VARCHAR(200) NOT NULL,
  description  TEXT,
  categorie    CHAR(1)      CHECK (categorie IN ('A','B','C','D')),
  niveau       INTEGER      NOT NULL DEFAULT 5,
  direction_id INTEGER      REFERENCES directions(id) ON DELETE SET NULL,
  actif        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 2. Mise à jour des directions existantes ─────────────────

UPDATE directions SET
  libelle     = 'Direction Générale',
  description = 'Autorité suprême de direction du ministère',
  actif       = TRUE
WHERE code = 'DG';

UPDATE directions SET
  libelle     = 'Direction des Ressources Humaines',
  description = 'Gestion du capital humain, des carrières et du bien-être des agents',
  actif       = TRUE
WHERE code = 'DRH';

UPDATE directions SET
  libelle     = 'Direction Administrative et Financière',
  description = 'Gestion administrative, budgétaire et comptable',
  actif       = TRUE
WHERE code = 'DAF';

UPDATE directions SET
  code        = 'DEP',
  libelle     = 'Direction Études et Planification',
  description = 'Études sectorielles, planification stratégique et statistiques',
  actif       = TRUE
WHERE code = 'DPL';

-- DIJ → DAN (aucun agent lié)
UPDATE directions SET
  code        = 'DAN',
  libelle     = 'Direction Archives et NTIC',
  description = 'Archives, documentation et nouvelles technologies de l''information',
  actif       = TRUE
WHERE code = 'DIJ';

-- DIT absorbée dans DAN, désactivée
UPDATE directions SET actif = FALSE WHERE code = 'DIT';

-- Agents liés à DIT (id=5) → rattachés à DAN
UPDATE agents SET direction_id = (SELECT id FROM directions WHERE code = 'DAN')
WHERE direction_id = (SELECT id FROM directions WHERE code = 'DIT' AND actif = FALSE);

UPDATE directions SET
  code        = 'IG',
  libelle     = 'Inspection Générale',
  description = 'Contrôle, audit interne et inspection des services',
  actif       = TRUE
WHERE code = 'INSP';

-- ── 3. Nouvelles directions ──────────────────────────────────

INSERT INTO directions (code, libelle, description) VALUES
  ('DMA',  'Direction des Médias Audiovisuels',
           'Régulation, promotion et développement de l''audiovisuel national'),
  ('DPE',  'Direction de la Presse Écrite',
           'Régulation, promotion et développement de la presse écrite'),
  ('DCI',  'Direction de la Communication Institutionnelle',
           'Communication de l''État, relations publiques et protocole'),
  ('DCIN', 'Direction du Cinéma',
           'Promotion, développement et réglementation de l''industrie cinématographique'),
  ('DPB',  'Direction de la Publicité',
           'Réglementation de la publicité et des annonces légales'),
  ('SDEC', 'Services Déconcentrés',
           'Divisions provinciales et services régionaux déconcentrés')
ON CONFLICT (code) DO UPDATE
  SET libelle = EXCLUDED.libelle, description = EXCLUDED.description, actif = TRUE;

-- ── 4. Divisions ─────────────────────────────────────────────

INSERT INTO divisions (direction_id, code, libelle) VALUES
-- Direction Générale
((SELECT id FROM directions WHERE code='DG'),   'DG-CAB',   'Cabinet du Directeur Général'),
((SELECT id FROM directions WHERE code='DG'),   'DG-SEC',   'Secrétariat de Direction'),

-- Inspection Générale
((SELECT id FROM directions WHERE code='IG'),   'IG-CTRL',  'Division Contrôle et Vérification'),
((SELECT id FROM directions WHERE code='IG'),   'IG-AUD',   'Division Audit Interne'),

-- Direction des Ressources Humaines
((SELECT id FROM directions WHERE code='DRH'),  'DCH',      'Division Capital Humain'),
((SELECT id FROM directions WHERE code='DRH'),  'DGDC',     'Division Gestion et Développement des Compétences'),
((SELECT id FROM directions WHERE code='DRH'),  'DAS',      'Division Actions Sociales'),

-- Direction Administrative et Financière
((SELECT id FROM directions WHERE code='DAF'),  'DAF-BCB',  'Division Budget et Comptabilité'),
((SELECT id FROM directions WHERE code='DAF'),  'DAF-MPA',  'Division Marchés Publics et Approvisionnement'),
((SELECT id FROM directions WHERE code='DAF'),  'DAF-PAT',  'Division Patrimoine et Équipement'),

-- Direction Études et Planification
((SELECT id FROM directions WHERE code='DEP'),  'DEP-ETR',  'Division Études et Recherche'),
((SELECT id FROM directions WHERE code='DEP'),  'DEP-PSE',  'Division Planification et Suivi-Évaluation'),
((SELECT id FROM directions WHERE code='DEP'),  'DEP-STA',  'Division Statistiques et Cartographie'),

-- Direction Archives et NTIC
((SELECT id FROM directions WHERE code='DAN'),  'DAN-ARC',  'Division Archives et Documentation'),
((SELECT id FROM directions WHERE code='DAN'),  'DAN-NTI',  'Division NTIC et Systèmes d''Information'),

-- Direction des Médias Audiovisuels
((SELECT id FROM directions WHERE code='DMA'),  'DMA-TEL',  'Division Télévision'),
((SELECT id FROM directions WHERE code='DMA'),  'DMA-RAD',  'Division Radio'),
((SELECT id FROM directions WHERE code='DMA'),  'DMA-NUM',  'Division Médias Numériques'),
((SELECT id FROM directions WHERE code='DMA'),  'DMA-REG',  'Division Réglementation Audiovisuelle'),

-- Direction de la Presse Écrite
((SELECT id FROM directions WHERE code='DPE'),  'DPE-PRE',  'Division Presse et Publications'),
((SELECT id FROM directions WHERE code='DPE'),  'DPE-IMP',  'Division Imprimerie et Édition'),
((SELECT id FROM directions WHERE code='DPE'),  'DPE-REG',  'Division Réglementation de la Presse'),

-- Direction de la Communication Institutionnelle
((SELECT id FROM directions WHERE code='DCI'),  'DCI-CGO',  'Division Communication Gouvernementale'),
((SELECT id FROM directions WHERE code='DCI'),  'DCI-REL',  'Division Relations Publiques et Protocole'),
((SELECT id FROM directions WHERE code='DCI'),  'DCI-MED',  'Division Relations avec les Médias'),

-- Direction du Cinéma
((SELECT id FROM directions WHERE code='DCIN'), 'DCIN-PRD', 'Division Production Cinématographique'),
((SELECT id FROM directions WHERE code='DCIN'), 'DCIN-DIF', 'Division Distribution et Diffusion'),

-- Direction de la Publicité
((SELECT id FROM directions WHERE code='DPB'),  'DPB-PUB',  'Division Réglementation Publicitaire'),
((SELECT id FROM directions WHERE code='DPB'),  'DPB-ANN',  'Division Annonces Légales'),

-- Services Déconcentrés — Divisions Provinciales
((SELECT id FROM directions WHERE code='SDEC'), 'DP-BAM',   'Division Provinciale de Bamako'),
((SELECT id FROM directions WHERE code='SDEC'), 'DP-KAY',   'Division Provinciale de Kayes'),
((SELECT id FROM directions WHERE code='SDEC'), 'DP-KOU',   'Division Provinciale de Koulikoro'),
((SELECT id FROM directions WHERE code='SDEC'), 'DP-SIK',   'Division Provinciale de Sikasso'),
((SELECT id FROM directions WHERE code='SDEC'), 'DP-SEG',   'Division Provinciale de Ségou'),
((SELECT id FROM directions WHERE code='SDEC'), 'DP-MOP',   'Division Provinciale de Mopti'),
((SELECT id FROM directions WHERE code='SDEC'), 'DP-TOM',   'Division Provinciale de Tombouctou'),
((SELECT id FROM directions WHERE code='SDEC'), 'DP-GAO',   'Division Provinciale de Gao'),
((SELECT id FROM directions WHERE code='SDEC'), 'DP-KID',   'Division Provinciale de Kidal'),
((SELECT id FROM directions WHERE code='SDEC'), 'DP-TAO',   'Division Provinciale de Taoudéni'),
((SELECT id FROM directions WHERE code='SDEC'), 'DP-MEN',   'Division Provinciale de Ménaka')
ON CONFLICT (code) DO UPDATE
  SET libelle = EXCLUDED.libelle, direction_id = EXCLUDED.direction_id;

-- ── 5. Bureaux DRH ──────────────────────────────────────────

INSERT INTO bureaux (division_id, direction_id, code, libelle, description) VALUES
-- Division Capital Humain
((SELECT id FROM divisions WHERE code='DCH'),  (SELECT id FROM directions WHERE code='DRH'),
 'DCH-CAR', 'Bureau Carrières et Mutations',       'Avancements, mutations, détachements et disponibilités'),
((SELECT id FROM divisions WHERE code='DCH'),  (SELECT id FROM directions WHERE code='DRH'),
 'DCH-PAI', 'Bureau Paie et Rémunérations',        'Traitement des salaires, indemnités et avantages en nature'),
((SELECT id FROM divisions WHERE code='DCH'),  (SELECT id FROM directions WHERE code='DRH'),
 'DCH-QVT', 'Bureau Qualité de Vie au Travail',    'Conditions de travail, médecine du travail, bien-être'),

-- Division Gestion et Développement des Compétences
((SELECT id FROM divisions WHERE code='DGDC'), (SELECT id FROM directions WHERE code='DRH'),
 'DGDC-FM', 'Bureau Formation et Perfectionnement', 'Plans de formation, stages et renforcement des capacités'),
((SELECT id FROM divisions WHERE code='DGDC'), (SELECT id FROM directions WHERE code='DRH'),
 'DGDC-GP', 'Bureau GPEEC',                        'Gestion Prévisionnelle des Emplois, Effectifs et Compétences'),

-- Division Actions Sociales
((SELECT id FROM divisions WHERE code='DAS'),  (SELECT id FROM directions WHERE code='DRH'),
 'DAS-ASS', 'Bureau Assistance Sociale',            'Aide sociale, secours, mutuelles et œuvres sociales'),
((SELECT id FROM divisions WHERE code='DAS'),  (SELECT id FROM directions WHERE code='DRH'),
 'DAS-ACT', 'Bureau Activités Culturelles et Sportives', 'Activités culturelles, sportives et récréatives')
ON CONFLICT (code) DO UPDATE
  SET libelle = EXCLUDED.libelle, description = EXCLUDED.description;

-- ── 6. Postes de référence ───────────────────────────────────

INSERT INTO postes (code, libelle, description, categorie, niveau) VALUES
('DG-MIN',    'Directeur Général',                     'Directeur Général du Ministère',                  'A', 1),
('DIR',       'Directeur',                             'Directeur de direction centrale',                 'A', 2),
('ADJ-DIR',   'Directeur Adjoint',                     'Directeur adjoint de direction',                  'A', 2),
('INSP-GEN',  'Inspecteur Général',                    'Chef de l''Inspection Générale',                  'A', 2),
('INSP',      'Inspecteur',                            'Inspecteur des services',                         'A', 3),
('CH-DIV',    'Chef de Division',                      'Responsable de division',                         'A', 3),
('ADJ-DIV',   'Chef de Division Adjoint',              'Adjoint au chef de division',                     'A', 3),
('CH-BUR',    'Chef de Bureau',                        'Responsable de bureau',                           'A', 4),
('ADJ-BUR',   'Chef de Bureau Adjoint',                'Adjoint au chef de bureau',                       'B', 4),
('CON-RH',    'Conseiller en Ressources Humaines',     'Expert en gestion RH et administration du personnel', 'A', 4),
('CON-JUR',   'Conseiller Juridique',                  'Expert en droit public et administratif',         'A', 4),
('CON-FIN',   'Conseiller Financier',                  'Expert en finances publiques et comptabilité',    'A', 4),
('CON-COM',   'Conseiller en Communication',           'Expert en communication institutionnelle',        'A', 4),
('CON-INF',   'Conseiller Informatique',               'Expert en systèmes d''information',               'A', 4),
('AUD-INT',   'Auditeur Interne',                      'Spécialiste en audit et contrôle interne',        'A', 4),
('TECH-RH',   'Technicien RH',                         'Agent de gestion administrative des ressources humaines', 'B', 5),
('TECH-FIN',  'Technicien Financier',                  'Agent des opérations financières et comptables',  'B', 5),
('TECH-INFO', 'Technicien Informatique',               'Agent de maintenance informatique et réseaux',    'B', 5),
('TECH-DOC',  'Technicien Documentation',              'Documentaliste et archiviste',                    'B', 5),
('TECH-COM',  'Technicien Communication',              'Agent de communication et relations presse',      'B', 5),
('REDAC',     'Rédacteur',                             'Agent de rédaction et d''analyse administrative', 'B', 5),
('AGENT-ADM', 'Agent Administratif',                   'Agent d''exécution administrative',               'C', 5),
('SECR',      'Secrétaire',                            'Secrétaire de direction ou de division',          'C', 5),
('COMPT',     'Comptable',                             'Agent en charge de la tenue des comptes',         'C', 5),
('CHAUF',     'Chauffeur',                             'Chauffeur de service',                            'D', 5),
('AGENT-SER', 'Agent de Service',                      'Agent d''entretien et de service général',        'D', 5),
('GARDN',     'Gardien',                               'Agent de sécurité et gardiennage',                'D', 5)
ON CONFLICT (code) DO UPDATE
  SET libelle = EXCLUDED.libelle, description = EXCLUDED.description, categorie = EXCLUDED.categorie;

-- ── 7. Grades de référence ───────────────────────────────────

TRUNCATE grades RESTART IDENTITY CASCADE;

INSERT INTO grades (libelle, categorie, corps) VALUES
-- Catégorie A — Cadres supérieurs
('Administrateur Civil Hors Classe',        'A', 'Administration Civile'),
('Administrateur Civil 1ère Classe',        'A', 'Administration Civile'),
('Administrateur Civil 2ème Classe',        'A', 'Administration Civile'),
('Attaché d''Administration Hors Classe',   'A', 'Administration Civile'),
('Attaché d''Administration 1ère Classe',   'A', 'Administration Civile'),
('Attaché d''Administration 2ème Classe',   'A', 'Administration Civile'),
('Ingénieur Hors Classe',                   'A', 'Corps Technique et Scientifique'),
('Ingénieur 1ère Classe',                   'A', 'Corps Technique et Scientifique'),
('Ingénieur 2ème Classe',                   'A', 'Corps Technique et Scientifique'),
('Conseiller des Affaires Étrangères',      'A', 'Corps Diplomatique'),
('Conseiller Pédagogique Hors Classe',      'A', 'Corps Enseignant'),
('Conseiller Pédagogique 1ère Classe',      'A', 'Corps Enseignant'),
-- Catégorie B — Agents de maîtrise
('Technicien Supérieur Hors Classe',        'B', 'Corps Technique et Scientifique'),
('Technicien Supérieur 1ère Classe',        'B', 'Corps Technique et Scientifique'),
('Technicien Supérieur 2ème Classe',        'B', 'Corps Technique et Scientifique'),
('Adjoint Administratif Principal',         'B', 'Administration Civile'),
('Adjoint Administratif 1ère Classe',       'B', 'Administration Civile'),
('Adjoint Administratif 2ème Classe',       'B', 'Administration Civile'),
('Secrétaire d''Administration Principale', 'B', 'Administration Civile'),
('Secrétaire d''Administration',            'B', 'Administration Civile'),
('Inspecteur du Travail',                   'B', 'Inspection du Travail'),
-- Catégorie C — Employés qualifiés
('Agent Technique Hors Classe',             'C', 'Corps Technique et Scientifique'),
('Agent Technique 1ère Classe',             'C', 'Corps Technique et Scientifique'),
('Agent Technique 2ème Classe',             'C', 'Corps Technique et Scientifique'),
('Commis d''Administration Principal',      'C', 'Administration Civile'),
('Commis d''Administration',                'C', 'Administration Civile'),
('Sténo-Dactylographe Principal',           'C', 'Administration Civile'),
('Sténo-Dactylographe',                     'C', 'Administration Civile'),
-- Catégorie D — Agents d'exécution
('Huissier Principal',                      'D', 'Services Généraux'),
('Huissier',                                'D', 'Services Généraux'),
('Chauffeur de Véhicule Principal',         'D', 'Services Généraux'),
('Chauffeur de Véhicule',                   'D', 'Services Généraux'),
('Agent de Service Principal',              'D', 'Services Généraux'),
('Agent de Service',                        'D', 'Services Généraux'),
('Gardien Principal',                       'D', 'Services Généraux'),
('Gardien',                                 'D', 'Services Généraux');

-- ── 8. Index ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_divisions_direction ON divisions(direction_id);
CREATE INDEX IF NOT EXISTS idx_bureaux_division    ON bureaux(division_id);
CREATE INDEX IF NOT EXISTS idx_bureaux_direction   ON bureaux(direction_id);
CREATE INDEX IF NOT EXISTS idx_postes_categorie    ON postes(categorie);
CREATE INDEX IF NOT EXISTS idx_grades_categorie    ON grades(categorie);
