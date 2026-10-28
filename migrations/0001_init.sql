-- État de l'app synchronisé entre appareils : une seule ligne ("main").
CREATE TABLE IF NOT EXISTS app_state (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Filet de sécurité : une copie au plus par heure, 60 conservées.
CREATE TABLE IF NOT EXISTS app_state_history (
  saved_at INTEGER PRIMARY KEY,
  data TEXT NOT NULL
);
