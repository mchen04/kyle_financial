ALTER TABLE benefits
  DROP CONSTRAINT IF EXISTS benefits_type;

ALTER TABLE benefits
  ADD CONSTRAINT benefits_type CHECK (type IN (
    'traditional401k', 'roth401k', 'employer401kMatch', 'espp', 'hsa',
    'employerHsa', 'healthFsa', 'dependentCareFsa', 'section125Premium',
    'commuter', 'commuterParking', 'lifeDisabilityInsurance', 'custom'
  ));
