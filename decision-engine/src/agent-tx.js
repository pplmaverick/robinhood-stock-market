// Phase D: agent's own wallet client. Human architect's call: the agent pays for its own bet --
// the relayer only ever signs the attestation, it never funds or broadcasts anything. This
// module builds and (optionally) sends the placeAgentBet() transaction from the agent's own
// AGENT_PRIVATE_KEY, matching contracts/StockPredictionMarketV2.sol's actual signature:
//   function placeAgentBet(Attestation calldata a, uint8 v, bytes32 r, bytes32 s) external payable
import { createWalletClient, createPublicClient, http, encodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const PLACE_AGENT_BET_ABI = [
  {
    name: 'placeAgentBet',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'a',
        type: 'tuple',
        components: [
          { name: 'agentAddress', type: 'address' },
          { name: 'humanId', type: 'uint256' },
          { name: 'marketId', type: 'uint256' },
          { name: 'direction', type: 'uint8' },
          { name: 'amount', type: 'uint256' },
          { name: 'robinhoodNonce', type: 'uint256' },
          { name: 'issuedAt', type: 'uint256' },
          { name: 'expiresAt', type: 'uint256' },
        ],
      },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
]

function attestationToTuple(a) {
  return {
    agentAddress: a.agentAddress,
    humanId: a.humanId,
    marketId: a.marketId,
    direction: a.direction,
    amount: a.amount,
    robinhoodNonce: a.robinhoodNonce,
    issuedAt: a.issuedAt,
    expiresAt: a.expiresAt,
  }
}

/**
 * @param {{ agentPrivateKeyHex: `0x${string}`, rpcUrl: string, chainId: number }} args
 */
function createAgentClients({ agentPrivateKeyHex, rpcUrl, chainId }) {
  const account = privateKeyToAccount(agentPrivateKeyHex)
  const chain = {
    id: chainId,
    name: 'robinhood',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  }
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) })
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })
  return { account, walletClient, publicClient }
}

/** Pure -- no network. Used by dry-runs to print exactly what would be sent. */
function buildPlaceAgentBetCalldata({ attestation, v, r, s }) {
  return encodeFunctionData({
    abi: PLACE_AGENT_BET_ABI,
    functionName: 'placeAgentBet',
    args: [attestationToTuple(attestation), v, r, s],
  })
}

/** Read-only eth_call simulation -- no transaction sent, no state change, no gas spent. */
async function simulatePlaceAgentBet({ publicClient, contractAddress, account, attestation, v, r, s }) {
  try {
    await publicClient.simulateContract({
      address: contractAddress,
      abi: PLACE_AGENT_BET_ABI,
      functionName: 'placeAgentBet',
      args: [attestationToTuple(attestation), v, r, s],
      account,
      value: attestation.amount,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: describeError(e) }
  }
}

/**
 * Actually broadcasts placeAgentBet(). Never called by any dry-run script in this codebase --
 * only wire this up behind an explicit human confirmation step.
 */
async function submitPlaceAgentBet({ walletClient, publicClient, contractAddress, account, attestation, v, r, s }) {
  let hash
  try {
    hash = await walletClient.writeContract({
      address: contractAddress,
      abi: PLACE_AGENT_BET_ABI,
      functionName: 'placeAgentBet',
      args: [attestationToTuple(attestation), v, r, s],
      account,
      value: attestation.amount,
    })
  } catch (e) {
    return { ok: false, error: describeError(e) }
  }

  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') {
      return { ok: false, error: `transaction reverted on-chain (status=${receipt.status})`, txHash: hash }
    }
    return { ok: true, txHash: hash, receipt }
  } catch (e) {
    return { ok: false, error: `failed waiting for receipt: ${describeError(e)}`, txHash: hash }
  }
}

/** Translates viem's error shapes into messages an operator can act on without reading a stack trace. */
function describeError(e) {
  const msg = e?.shortMessage || e?.details || e?.message || String(e)
  if (/insufficient funds/i.test(msg)) {
    return `agent wallet has insufficient ETH to cover the bet amount + gas: ${msg}`
  }
  if (/nonce too low|nonce too high|already known/i.test(msg)) {
    return `transaction nonce conflict (stale/duplicate pending tx from this agent wallet?): ${msg}`
  }
  if (/revert|reverted/i.test(msg)) {
    return `transaction would revert: ${msg}`
  }
  return msg
}

export {
  createAgentClients,
  buildPlaceAgentBetCalldata,
  simulatePlaceAgentBet,
  submitPlaceAgentBet,
  PLACE_AGENT_BET_ABI,
}
