/**
 * Measurement regime.
 *
 * Batch rows are appended to a log and pooled across runs to get sample sizes a
 * single run cannot reach. Pooling is only valid within a regime: if the engine
 * or a prompt changes in a way that moves the distributions, older rows are not
 * commensurable with newer ones and averaging them together produces a number
 * that describes neither.
 *
 * **Bump this whenever a change invalidates comparison with earlier rows.** The
 * appraisal recalibration in docs §4.3.3 is the canonical example: it moved every
 * mood-derived quantity in the engine, so rows either side of it must never be
 * pooled. Adding a metric, fixing a display bug, or changing the UI does not
 * warrant a bump, only things that move what the numbers measure.
 */
export const MEASUREMENT_REGIME = 'r4-no-mood-feedback';

/** One line of provenance, recorded on every persisted row. */
export const REGIME_NOTES: Record<string, string> = {
  'r1-offset-appraisal':
    'Appraisal coder applied the 0-1 calibration to the signed dimensions, so every ' +
    'turn carried roughly +0.5 of offset. Mood could not go negative. Do not pool ' +
    'with anything later.',
  'r2-centred-appraisal':
    'Signed appraisal dimensions calibrated separately from the 0-1 responsiveness ' +
    'components, centred on zero. Intimacy growth scaled by remaining headroom. ' +
    'Still described a forgettable turn as 0.0 to 0.2, so the coder put its neutral ' +
    'point at +0.15 and floored above zero on any date that was going well.',
  'r3-zero-neutral':
    'REVERTED. Forgettable turn defined as -0.1 to +0.1 plus an instruction to score ' +
    'turns independently of the date. Six matched pairs showed it made the target ' +
    'worse: appraisal valence rose, negative share halved, causal skill fell. Rows ' +
    'kept as the record of a failed experiment; never pool them with r2.',
  'r4-no-mood-feedback':
    'Listener mood and intimacy removed from the appraisal prompt. Both are computed ' +
    'from earlier appraisals, so passing them back closed a feedback loop and double ' +
    'counted an effect the code layer already applies. Structural change where r3 ' +
    'tried instructions.',
};
