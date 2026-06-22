-- 008_strain_dominance.sql — genetic lean classification for strains

ALTER TABLE strains
  ADD COLUMN dominance VARCHAR(20)
    CHECK (dominance IN ('true_sativa', 'sativa_dominant', 'balanced', 'indica_dominant', 'true_indica'));
