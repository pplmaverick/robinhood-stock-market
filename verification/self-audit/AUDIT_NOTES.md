# StockPredictionMarketV2 Self-Audit Notes

Date: 2026-09-06
Scope: contracts/StockPredictionMarketV2.sol
Method: Claude Code ran a recon pass covering the full function list,
the access control matrix, fund flow paths, and external call
dependencies. The project architect reviewed the recon output and
selected which findings needed a fix. Claude Code then implemented
the fixes.

This is separate from the Independent Reference Model Testing under
verification/reference_model/. That process checks whether the
contract's logic correctly implements the spec. This self-audit checks
whether the spec itself has an exploitable design gap. Neither replaces
the other. It runs after the contract is written but before the Python
reference model, so that any fix here happens before traces get sealed
with SHA-256, rather than forcing a re-seal later.

## What was checked

Access control on createMarket, lockMarket, settleMarket, and
withdrawFees is limited to the owner in all four cases, with no gaps.
placeBet, placeAgentBet, and claimWinnings are open to any address as
intended, with no accidental permission restrictions.

claimWinnings and withdrawFees both update state (b.claimed, and
accumulatedFees reset to zero) before the external transfer call,
following checks-effects-interactions. The transfer uses .transfer(),
whose gas stipend doesn't leave room for a reentrant call.

lockMarket and settleMarket are triggered manually by the owner, who
could in theory watch the market before deciding when to lock or
settle. The owner here is the project architect, not an operator of a
public product serving other users, so this is recorded as a known
limitation rather than fixed.

The payout and accumulatedFees calculations in claimWinnings both
involve a multiply-then-divide step. Solidity's integer division
rounds down, so small amounts of wei accumulate in the contract over
time with no way to retrieve them. This behavior carries over from the
original StockPredictionMarket.sol contract and isn't new to this
version, so it's recorded as a known limitation.

usedAttestations is marked after all require checks pass and before
any state changes, leaving no window for a replay to slip through
between validation and the write. Full correctness of the attestation
logic is covered separately in the Independent Reference Model
Testing; this check only confirmed the marking happens at the right
point.

## Issues found and fixed

Two problems needed a code change.

The empty receive() function let anyone send ETH directly to the
contract address. That ETH wouldn't be recorded against any bet, any
market's pool, or the accumulated fees counter, and no function in the
contract had a path to move an unrecorded balance. A mistaken transfer
would be permanently stuck. The fix removes receive() entirely, so a
direct transfer now reverts instead of succeeding and getting lost.

The constructor didn't check whether the relayer address was the zero
address. On its own this is a low-probability deployment mistake, but
it compounds with another behavior: ecrecover returns the zero address
for an invalid signature. If the relayer address were also zero, any
invalid signature would pass the signer check, and the attestation
mechanism would provide no real protection. The fix adds a
zero-address check in the constructor, so deploying with a zero
relayer address now fails the deployment instead of silently shipping
a broken check.

## Known limitations left for the README

A few findings aren't bugs, they're accepted trade-offs in the design,
and will be disclosed in the README rather than repeated here: ETH from
winning bets that are never claimed stays in the contract with no
withdrawal path, and losing bets' principal is never refunded.
createMarket doesn't validate that the stock token or price feed
address it's given is well-formed, and sets no minimum on market
duration, so an owner mistake at market creation can leave a market
stuck in a state where it can't be settled. The agent bet size range
and the Bet struct's field order relative to the original contract are
noted separately as integration concerns rather than security issues.
