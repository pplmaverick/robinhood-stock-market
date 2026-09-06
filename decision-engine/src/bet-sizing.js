// Step 2 addition (ADR-11): maps confidence (bet-decision.js's extremityScore(), already
// clamped to [0,1]) linearly onto the agent's bet-size range -- confidence 0 -> MIN_BET_SIZE_WEI
// (the contract's MIN_BET floor), confidence 1 -> MAX_BET_SIZE_WEI (the deployed maxAgentBetWei
// ceiling). This only decides HOW MUCH to bet; it never touches level/trend/decision, which stay
// exactly as sealed by the Independent Reference Model Testing.
import { MIN_BET_SIZE_WEI, MAX_BET_SIZE_WEI } from './config.js'

/**
 * @param {number} confidence 0..1
 * @returns {bigint} wei amount in [MIN_BET_SIZE_WEI, MAX_BET_SIZE_WEI]
 */
function computeAgentBetAmountWei(confidence) {
  const clamped = Math.max(0, Math.min(1, confidence))
  const range = MAX_BET_SIZE_WEI - MIN_BET_SIZE_WEI
  const scaled = BigInt(Math.round(Number(range) * clamped))
  return MIN_BET_SIZE_WEI + scaled
}

export { computeAgentBetAmountWei }
