// Phase D manual test mode: lets an operator drive the attestation -> agent-tx pipeline with a
// chosen direction/amount instead of the real decision-engine judgment, so the pipeline (nonce,
// signature, calldata) can be exercised while real subgraph data is frozen (weekend) and would
// otherwise deterministically produce NO_TRADE. This module never imports bet-decision.js,
// query-decision.js, or decision-engine.js -- calling it is by construction a bypass of that
// judgment, not a code path that happens to agree with it.
import { parseEther } from 'viem'

/**
 * @param {{ decision: string | undefined, amountEth: string | undefined }} args raw CLI values
 * @returns {{ decision: 'BULL' | 'BEAR', betAmountWei: bigint, confidence: null }}
 * @throws {Error} if decision isn't BULL/BEAR or amountEth is missing/invalid
 */
function resolveManualOverride({ decision, amountEth }) {
  if (decision !== 'BULL' && decision !== 'BEAR') {
    throw new Error(`--manual-decision must be BULL or BEAR, got: ${decision}`)
  }
  if (!amountEth) {
    throw new Error('--manual-amount=<ETH amount> is required with --manual-decision')
  }
  return { decision, betAmountWei: parseEther(amountEth), confidence: null }
}

export { resolveManualOverride }
