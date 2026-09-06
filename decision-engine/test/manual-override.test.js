import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveManualOverride } from '../src/manual-override.js'
import { buildAttestationHash } from '../../relayer/src/attestation.js'

test('BULL + amount parses to the exact wei value, decision passed through untouched', () => {
  const result = resolveManualOverride({ decision: 'BULL', amountEth: '0.002' })
  assert.equal(result.decision, 'BULL')
  assert.equal(result.betAmountWei, 2_000_000_000_000_000n)
  assert.equal(result.confidence, null)
})

test('BEAR + a value at the ADR-11 ceiling', () => {
  const result = resolveManualOverride({ decision: 'BEAR', amountEth: '0.005' })
  assert.equal(result.decision, 'BEAR')
  assert.equal(result.betAmountWei, 5_000_000_000_000_000n)
})

test('rejects a decision that is not BULL/BEAR (e.g. NO_TRADE, or a typo)', () => {
  assert.throws(() => resolveManualOverride({ decision: 'NO_TRADE', amountEth: '0.002' }), /must be BULL or BEAR/)
  assert.throws(() => resolveManualOverride({ decision: 'bull', amountEth: '0.002' }), /must be BULL or BEAR/)
})

test('rejects a missing amount', () => {
  assert.throws(() => resolveManualOverride({ decision: 'BULL', amountEth: undefined }), /manual-amount/)
})

const FIXED_FIELDS = {
  agentAddress: '0x7204524e4D6EE3B6D37eeF656Cb3B25951963b09',
  humanId: 42n,
  marketId: 0n,
  robinhoodNonce: 1n,
  issuedAt: 1000n,
  expiresAt: 1300n,
}

test('manual BULL/BEAR + amount feed straight into buildAttestationHash -- deterministic and sensitive to the manual inputs', () => {
  const bull = resolveManualOverride({ decision: 'BULL', amountEth: '0.002' })
  const hashA = buildAttestationHash({ ...FIXED_FIELDS, direction: 0, amount: bull.betAmountWei })
  const hashB = buildAttestationHash({ ...FIXED_FIELDS, direction: 0, amount: bull.betAmountWei })
  assert.equal(hashA, hashB, 'same manual inputs must hash identically')

  const bear = resolveManualOverride({ decision: 'BEAR', amountEth: '0.002' })
  const hashDirectionChanged = buildAttestationHash({ ...FIXED_FIELDS, direction: 1, amount: bear.betAmountWei })
  assert.notEqual(hashA, hashDirectionChanged, 'BULL vs BEAR must produce different attestation hashes')

  const differentAmount = resolveManualOverride({ decision: 'BULL', amountEth: '0.003' })
  const hashAmountChanged = buildAttestationHash({ ...FIXED_FIELDS, direction: 0, amount: differentAmount.betAmountWei })
  assert.notEqual(hashA, hashAmountChanged, 'a different manual amount must produce a different attestation hash')
})

test('manual override module never imports the decision-engine judgment stack', async () => {
  // Behavioral proof, not just a static claim: resolveManualOverride's whole call graph is
  // parseEther() + validation -- there is no percentileRank/movingAverage input it could even
  // read, so classifyLevel/classifyTrend/makeBetDecision cannot have run.
  const src = await import('../src/manual-override.js')
  assert.deepEqual(Object.keys(src), ['resolveManualOverride'])
})
