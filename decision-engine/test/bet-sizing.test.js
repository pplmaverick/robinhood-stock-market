import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeAgentBetAmountWei } from '../src/bet-sizing.js'

const MIN = 1_000_000_000_000_000n // 0.001 ETH
const MAX = 5_000_000_000_000_000n // 0.005 ETH

test('confidence 0 -> the floor (MIN_BET_SIZE_WEI)', () => {
  assert.equal(computeAgentBetAmountWei(0), MIN)
})

test('confidence 1 -> the ceiling (MAX_BET_SIZE_WEI)', () => {
  assert.equal(computeAgentBetAmountWei(1), MAX)
})

test('confidence 0.5 -> the midpoint', () => {
  assert.equal(computeAgentBetAmountWei(0.5), MIN + (MAX - MIN) / 2n)
})

test('result is always within [MIN, MAX] for any confidence in [0,1]', () => {
  for (const c of [0, 0.1, 0.3, 0.6, 0.7, 0.9, 1]) {
    const wei = computeAgentBetAmountWei(c)
    assert.ok(wei >= MIN, `confidence=${c} gave ${wei} < MIN`)
    assert.ok(wei <= MAX, `confidence=${c} gave ${wei} > MAX`)
  }
})

test('out-of-range confidence is clamped, not extrapolated', () => {
  assert.equal(computeAgentBetAmountWei(-1), MIN)
  assert.equal(computeAgentBetAmountWei(2), MAX)
})
