-- ============================================================
-- SIRH — Schéma PostgreSQL
-- Ministère de la Fonction Publique
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- UTILISATEURS (authentification)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  nom           VARCHAR(100) NOT NULL,
  prenom        VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(50)  NOT NULL DEFAULT 'AGENT',  -- ADMIN, DRH, CHEF_SERVICE, AGENT
  actif         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- ORGANISATION
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS directions (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(20)  UNIQUE NOT NULL,
  libelle     VARCHAR(200) NOT NULL,
  description TEXT,
  actif       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS divisions (
  id           SERIAL PRIMARY KEY,
  direction_id INTEGER      REFERENCES directions(id) ON DELETE SET NULL,
  code         VARCHAR(20)  UNIQUE NOT NULL,
  libelle      VARCHAR(200) NOT NULL,
  actif        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grades (
  id         SERIAL PRIMARY KEY,
  libelle    VARCHAR(200) NOT NULL,
  categorie  CHAR(1)      NOT NULL CHECK (categorie IN ('A','B','C','D')),
  corps      VARCHAR(200),
  actif      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fonctions (
  id         SERIAL PRIMARY KEY,
  libelle    VARCHAR(200) NOT NULL,
  direction_id INTEGER    REFERENCES directions(id) ON DELETE SET NULL,
  actif      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- AGENTS (fonctionnaires)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id                    SERIAL       PRIMARY KEY,
  matricule             VARCHAR(20)  UNIQUE NOT NULL,
  -- Identité
  nom_famille           VARCHAR(100) NOT NULL,
  prenom                VARCHAR(100) NOT NULL,
  prenom_secondaire     VARCHAR(100),
  nom_jeune_fille       VARCHAR(100),
  sexe                  VARCHAR(20)  NOT NULL,
  date_naissance        DATE,
  lieu_naissance        VARCHAR(100),
  region_naissance      VARCHAR(100),
  pays_naissance        VARCHAR(100) DEFAULT 'Mali',
  nationalite           VARCHAR(100) DEFAULT 'Malienne',
  situation_familiale   VARCHAR(50),
  nb_enfants            INTEGER      NOT NULL DEFAULT 0,
  groupe_sanguin        VARCHAR(10),
  -- Pièce d'identité
  type_piece            VARCHAR(50),
  numero_piece          VARCHAR(100),
  date_expiration_piece DATE,
  -- Adresse
  adresse_rue           VARCHAR(200),
  adresse_ville         VARCHAR(100),
  adresse_region        VARCHAR(100),
  adresse_pays          VARCHAR(100) DEFAULT 'Mali',
  -- Contact
  telephone_fixe        VARCHAR(20),
  telephone_mobile      VARCHAR(20),
  email_pro             VARCHAR(150),
  email_personnel       VARCHAR(150),
  -- Urgence
  urgence_nom           VARCHAR(200),
  urgence_relation      VARCHAR(100),
  urgence_telephone     VARCHAR(20),
  -- Administratif
  corps                 VARCHAR(200),
  grade                 VARCHAR(200),
  categorie             CHAR(1)      CHECK (categorie IN ('A','B','C','D')),
  classe                VARCHAR(50),
  echelon               INTEGER,
  indice                INTEGER,
  date_recrutement      DATE,
  date_prise_fonction   DATE,
  date_titularisation   DATE,
  mode_recrutement      VARCHAR(100),
  numero_decision       VARCHAR(100),
  date_decision         DATE,
  reference_jo          VARCHAR(100),
  ministere_origine     VARCHAR(200),
  type_contrat          VARCHAR(100),
  situation_admin       VARCHAR(100) DEFAULT 'En activité',
  numero_cnss           VARCHAR(50),
  numero_retraite       VARCHAR(50),
  rib                   VARCHAR(50),
  banque                VARCHAR(100),
  -- Affectation
  ministere_affectation VARCHAR(200),
  direction_id          INTEGER      REFERENCES directions(id) ON DELETE SET NULL,
  division_id           INTEGER      REFERENCES divisions(id) ON DELETE SET NULL,
  service               VARCHAR(200),
  bureau                VARCHAR(200),
  poste                 VARCHAR(200),
  lieu_affectation      VARCHAR(200),
  region_affectation    VARCHAR(100),
  -- Formation
  niveau_etudes         VARCHAR(100),
  diplome               VARCHAR(200),
  specialite            VARCHAR(200),
  etablissement         VARCHAR(200),
  pays_formation        VARCHAR(100),
  annee_obtention       INTEGER,
  mention               VARCHAR(50),
  -- Système
  actif                 BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Historique des carrières
CREATE TABLE IF NOT EXISTS agent_evenements (
  id           SERIAL PRIMARY KEY,
  agent_id     INTEGER      NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type         VARCHAR(100) NOT NULL,
  date_effet   DATE         NOT NULL,
  description  TEXT,
  reference    VARCHAR(200),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Documents administratifs
CREATE TABLE IF NOT EXISTS agent_documents (
  id          SERIAL PRIMARY KEY,
  agent_id    INTEGER      NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type_doc    VARCHAR(100) NOT NULL,
  nom_fichier VARCHAR(300) NOT NULL,
  chemin      TEXT         NOT NULL,
  taille      INTEGER,
  uploaded_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- CONGÉS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conges (
  id               SERIAL PRIMARY KEY,
  agent_id         INTEGER      NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type             VARCHAR(50)  NOT NULL,  -- ANNUEL, MALADIE, MATERNITE, PATERNITE, SANS_SOLDE, EXCEPTIONNEL
  date_debut       DATE         NOT NULL,
  date_fin         DATE         NOT NULL,
  nb_jours         INTEGER      NOT NULL,
  motif            TEXT,
  status           VARCHAR(30)  NOT NULL DEFAULT 'PENDING_CHEF',
  -- Validation chef
  validation_chef_date  DATE,
  validation_chef_par   VARCHAR(200),
  validation_chef_com   TEXT,
  -- Validation DRH
  validation_drh_date   DATE,
  validation_drh_par    VARCHAR(200),
  validation_drh_com    TEXT,
  -- Rejet
  rejet_date       DATE,
  rejet_par        VARCHAR(200),
  rejet_motif      TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- PRÉSENCES (pointage)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS presences (
  id           SERIAL PRIMARY KEY,
  agent_id     INTEGER      NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  date_presence DATE        NOT NULL,
  heure_entree  TIME,
  heure_sortie  TIME,
  mode_pointage VARCHAR(50) DEFAULT 'MANUEL',  -- MANUEL, BIOMETRIQUE, BADGE
  statut        VARCHAR(30) DEFAULT 'PRESENT', -- PRESENT, ABSENT, RETARD, CONGE, FERIE
  observation   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, date_presence)
);

-- ────────────────────────────────────────────────────────────
-- PAIE
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elements_paie (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(20)  UNIQUE NOT NULL,
  designation  VARCHAR(200) NOT NULL,
  type         VARCHAR(30)  NOT NULL CHECK (type IN ('PRIME','INDEMNITE','RETENUE','COTISATION')),
  base         VARCHAR(50)  NOT NULL DEFAULT 'FIXE',  -- FIXE, INDICE, % BASE, % BRUT
  taux         NUMERIC(12,4) NOT NULL DEFAULT 0,
  imposable    BOOLEAN      NOT NULL DEFAULT FALSE,
  actif        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bulletins_paie (
  id               SERIAL PRIMARY KEY,
  agent_id         INTEGER      NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  mois             INTEGER      NOT NULL CHECK (mois BETWEEN 1 AND 12),
  annee            INTEGER      NOT NULL,
  periode          VARCHAR(50),
  indice           INTEGER,
  salaire_base     NUMERIC(14,2) NOT NULL DEFAULT 0,
  salaire_brut     NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_retenues   NUMERIC(14,2) NOT NULL DEFAULT 0,
  salaire_net      NUMERIC(14,2) NOT NULL DEFAULT 0,
  mode_paiement    VARCHAR(30)  DEFAULT 'VIREMENT',
  banque           VARCHAR(100),
  num_compte       VARCHAR(50),
  statut           VARCHAR(30)  NOT NULL DEFAULT 'CALCULE',  -- CALCULE, VALIDE, VIRE, REJETE
  reference        VARCHAR(100) UNIQUE,
  date_generation  DATE,
  date_validation  DATE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, mois, annee)
);

CREATE TABLE IF NOT EXISTS bulletin_lignes (
  id              SERIAL PRIMARY KEY,
  bulletin_id     INTEGER      NOT NULL REFERENCES bulletins_paie(id) ON DELETE CASCADE,
  element_code    VARCHAR(20)  NOT NULL,
  designation     VARCHAR(200) NOT NULL,
  type            VARCHAR(30)  NOT NULL,
  montant         NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS virements (
  id               SERIAL PRIMARY KEY,
  reference        VARCHAR(100) UNIQUE NOT NULL,
  mois             INTEGER      NOT NULL,
  annee            INTEGER      NOT NULL,
  periode          VARCHAR(50),
  date_virement    DATE,
  montant_total    NUMERIC(16,2) NOT NULL DEFAULT 0,
  nb_beneficiaires INTEGER      NOT NULL DEFAULT 0,
  banque           VARCHAR(200),
  statut           VARCHAR(30)  NOT NULL DEFAULT 'EN_ATTENTE',  -- EN_ATTENTE, TRAITE, REJETE
  fichier          VARCHAR(300),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS declarations_sociales (
  id                    SERIAL PRIMARY KEY,
  type                  VARCHAR(30)  NOT NULL,  -- INPS, CANAM, IMPOTS
  libelle               VARCHAR(200) NOT NULL,
  periode               VARCHAR(50),
  mois                  INTEGER,
  annee                 INTEGER,
  montant               NUMERIC(14,2) NOT NULL DEFAULT 0,
  cotisation_patronale  NUMERIC(14,2) NOT NULL DEFAULT 0,
  montant_total         NUMERIC(14,2) NOT NULL DEFAULT 0,
  date_limite           DATE,
  date_declaration      DATE,
  reference             VARCHAR(100),
  statut                VARCHAR(30)  NOT NULL DEFAULT 'EN_ATTENTE',  -- EN_ATTENTE, SOUMISE, VALIDEE, REJETEE
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- RECRUTEMENT
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offres_emploi (
  id              SERIAL PRIMARY KEY,
  titre           VARCHAR(300) NOT NULL,
  direction_id    INTEGER      REFERENCES directions(id) ON DELETE SET NULL,
  type_contrat    VARCHAR(100),
  description     TEXT,
  profil_requis   TEXT,
  nb_postes       INTEGER      NOT NULL DEFAULT 1,
  date_limite     DATE,
  statut          VARCHAR(30)  NOT NULL DEFAULT 'OUVERTE',  -- OUVERTE, FERMEE, POURVUE
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidats (
  id              SERIAL PRIMARY KEY,
  offre_id        INTEGER      REFERENCES offres_emploi(id) ON DELETE SET NULL,
  nom             VARCHAR(100) NOT NULL,
  prenom          VARCHAR(100) NOT NULL,
  email           VARCHAR(150),
  telephone       VARCHAR(20),
  cv_chemin       TEXT,
  lettre_chemin   TEXT,
  statut          VARCHAR(30)  NOT NULL DEFAULT 'RECU',  -- RECU, SELECTIONNE, EN_ENTRETIEN, ADMIS, REJETE
  note            NUMERIC(4,2),
  commentaire     TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entretiens (
  id              SERIAL PRIMARY KEY,
  candidat_id     INTEGER      NOT NULL REFERENCES candidats(id) ON DELETE CASCADE,
  offre_id        INTEGER      REFERENCES offres_emploi(id) ON DELETE SET NULL,
  date_entretien  TIMESTAMPTZ,
  lieu            VARCHAR(200),
  type            VARCHAR(50)  DEFAULT 'ORAL',  -- ORAL, ECRIT, PRATIQUE
  jury            TEXT,
  note            NUMERIC(4,2),
  resultat        VARCHAR(30),  -- ADMIS, AJOURNE, ELIMINE
  observations    TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- INDEX
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_agents_matricule       ON agents(matricule);
CREATE INDEX IF NOT EXISTS idx_agents_direction       ON agents(direction_id);
CREATE INDEX IF NOT EXISTS idx_agents_situation_admin ON agents(situation_admin);
CREATE INDEX IF NOT EXISTS idx_conges_agent           ON conges(agent_id);
CREATE INDEX IF NOT EXISTS idx_conges_status          ON conges(status);
CREATE INDEX IF NOT EXISTS idx_presences_agent_date   ON presences(agent_id, date_presence);
CREATE INDEX IF NOT EXISTS idx_bulletins_agent        ON bulletins_paie(agent_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_periode      ON bulletins_paie(mois, annee);
CREATE INDEX IF NOT EXISTS idx_candidats_offre        ON candidats(offre_id);
