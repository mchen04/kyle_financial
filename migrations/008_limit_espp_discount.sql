ALTER TABLE benefits
  DROP CONSTRAINT IF EXISTS benefits_discount_range;

UPDATE benefits
SET discount_rate_ppm = 150000
WHERE discount_rate_ppm > 150000;

ALTER TABLE benefits
  ADD CONSTRAINT benefits_discount_range CHECK (
    discount_rate_ppm IS NULL OR discount_rate_ppm BETWEEN 0 AND 150000
  );
