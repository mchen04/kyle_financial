# Gross-to-net validation

Research date: 2026-07-12. All scenarios assume one wage job, no dependents,
no credits, the standard deduction, no local/city tax, and no employee benefits
or other pre-tax deductions. “Kyle net” is annual cash take-home from the 2026
pure engine. The exact intermediate Kyle values are asserted in
`src/domain/tax/engine.test.ts`; randomized invariant coverage runs 1,000 cases
per property.

## Live external calculator gate

SmartAsset's live **Federal Income Tax Calculator – Estimator for 2025-2026**
was captured through `agent-browser` session `wave1-external`. Although the
page title spans 2025-2026, every result explicitly said “Your 2025 Federal
Income and FICA Taxes” and the breakdown column said “2025 Taxes,” so the
external values below are labeled 2025 rather than inferred as 2026.
The raw DOM strings, exact inputs, source URL, and independently recomputed
deltas are preserved in
[`evidence/smartasset-2025-live.json`](evidence/smartasset-2025-live.json).
The validator locks the five-scenario matrix and recomputes Kyle's federal,
FICA, state, total-tax, and net values directly from those inputs. Recorded
Kyle values are retained only as a human-readable trace. The companion
[`evidence/smartasset-2025-live.manifest.json`](evidence/smartasset-2025-live.manifest.json)
records which original raw artifacts were retained and provides paths for
attaching future DOM or screenshot corroboration without implying that a
replay is the original capture.

The annual income-tax calculator was used instead of treating paycheck
withholding as tax liability. Therefore pay frequency and W-4 allowances are
not applicable. For every run, the visible inputs were household wage income,
the listed location, filing status, Standard Deduction, $0 401(k), $0
traditional IRA, $0 credits, 0 dependent deductions, and $0 other pre-tax
deductions.

| Scenario                          | SmartAsset location | External federal | External FICA | External state | External local | External 2025 net | Kyle 2026 net | Net delta vs. Kyle |
| --------------------------------- | ------------------- | ---------------: | ------------: | -------------: | -------------: | ----------------: | ------------: | -----------------: |
| TX, Single, $100,000              | Austin, TX          |          $13,449 |        $7,650 |             $0 |             $0 |           $78,901 |    $79,180.00 |             -0.35% |
| IL, MFJ, $180,000                 | Springfield, IL     |          $22,498 |       $13,528 |         $8,628 |             $0 |          $135,346 |   $135,669.57 |             -0.24% |
| CA, Single, $150,000              | Sacramento, CA      |          $25,067 |       $11,475 |         $9,844 |             $0 |          $103,614 |   $103,917.58 |             -0.29% |
| NY state (not NYC), MFJ, $250,000 | Albany, NY          |          $38,134 |       $14,543 |        $12,777 |             $0 |          $184,546 |   $184,805.20 |             -0.14% |
| FL, Single, $300,000              | Orlando, FL         |          $69,035 |       $16,168 |             $0 |             $0 |          $214,797 |   $215,176.75 |             -0.18% |

Percent delta is `(SmartAsset net - Kyle net) / Kyle net`. The largest
absolute delta is 0.35%, so all five scenarios pass the required ±2% external
net sanity gate. Because the external results are for 2025 while Kyle uses
2026 law, this comparison demonstrates broad gross-to-net agreement; it is not
an exact independent oracle for Kyle's 2026 tax amounts.

HSA planning records eligibility separately for the primary owner and spouse.
For MFJ family coverage, two eligible spouses default to an equal split but
may record an agreed 0–100 allocation; a sole eligible spouse receives the
full family cap. Employee and employer contributions consume that owner's
share together, with employee payroll contributions allocated first for the
deterministic wage calculation.
Each selected HSA-eligible owner who is age 55 or older at year-end receives
the versioned $1,000 catch-up in addition to that owner's base share. A spouse's
catch-up is never transferred through the family allocation and must be made to
that spouse's own HSA.

## Captured result details and divergence analysis

- **TX:** SmartAsset displayed total tax $21,099 and annual take-home $78,901.
  Its FICA exactly matches Kyle; its 2025 federal estimate is $279 higher than
  Kyle's 2026 federal estimate, exactly explaining the $279 lower net.
- **IL:** SmartAsset displayed federal-plus-FICA $36,026, total tax $44,654,
  and take-home $135,346. Relative to Kyle, federal is $558 higher, FICA is
  $242 lower, and state tax is $7.57 higher. Those components reconcile to the
  $323.57 net difference.
- **CA:** SmartAsset displayed federal-plus-FICA $36,542, total tax $46,386,
  and take-home $103,614. Relative to Kyle, federal is $333 higher, FICA is
  identical, and state income tax is $29.42 lower. This annual liability result
  does not include California SDI, matching Kyle's current income-tax-only
  state table. SmartAsset's separate paycheck calculator groups state
  insurance with FICA; that withholding surface would add an intentionally
  non-comparable payroll charge and is not substituted into this gate.
- **NY:** Albany kept local tax at $0. SmartAsset displayed federal-plus-FICA
  $52,677, total tax $65,454, and take-home $184,546. Relative to Kyle,
  federal is $666 higher, FICA is $521 lower, and state tax is $114.20 higher,
  reconciling to the $259.20 net difference.
- **FL:** SmartAsset displayed total tax $85,203 and take-home $214,797.
  Relative to Kyle, federal is $900.75 higher and FICA is $521 lower,
  reconciling to the $379.75 net difference.

The direction of the capped-wage FICA differences is expected: SmartAsset's
result is explicitly for 2025, while Kyle uses the 2026 $184,500 Social
Security wage base. Federal differences likewise reflect 2025 versus 2026
brackets and standard deductions. The small IL, CA, and NY differences reflect
the calculators' different state-table years and rounding. No scenario was
tuned to the expected answer.

## Kyle engine values under test

| Scenario                          |    Federal |       FICA |      State |    Kyle net |
| --------------------------------- | ---------: | ---------: | ---------: | ----------: |
| TX, Single, $100,000              | $13,170.00 |  $7,650.00 |      $0.00 |  $79,180.00 |
| IL, MFJ, $180,000                 | $21,940.00 | $13,770.00 |  $8,620.43 | $135,669.57 |
| CA, Single, $150,000              | $24,734.00 | $11,475.00 |  $9,873.42 | $103,917.58 |
| NY state (not NYC), MFJ, $250,000 | $37,468.00 | $15,064.00 | $12,662.80 | $184,805.20 |
| FL, Single, $300,000              | $68,134.25 | $16,689.00 |      $0.00 | $215,176.75 |
