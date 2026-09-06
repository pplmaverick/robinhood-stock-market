# Architectural Directive: Manual Override Mode for the Agent Transaction Pipeline

Decision Date: 2026-09-06

## Decision Context (Human Architect)

Testing the agent's on-chain transaction path — attestation signing,
nonce handling, the AgentBook lookup, and the placeAgentBet() call
itself — depends on decision-engine actually producing a BULL or BEAR
call to send. During the weekend data freeze, live decisions kept
resolving to NO_TRADE, which meant there was no way to exercise any of
that transaction-sending code without waiting for the market to move.

The eight days remaining before the ETH Online deadline made waiting
for a naturally occurring BULL or BEAR call an unacceptable bottleneck
for verifying a piece of infrastructure that had never been built or
tested at all — the agent wallet had zero balance and no code existed
yet to sign or broadcast a transaction on its own.

The fix was to decouple two questions that had been bundled together:
whether the transaction pipeline works, and whether decision-engine's
live judgment happens to produce a directional call on any given day.
A manual override path answers the first question without waiting on
the second.

## Core Directives Given to Claude Code

Add a manual override entry point
(--manual-decision=BULL --manual-amount=0.002, in
src/manual-override.js) that skips bet-decision.js and
decision-engine.js entirely and feeds an operator-specified direction
and amount straight into the attestation-signing and
transaction-sending logic.

manual-override.js must not import bet-decision.js or
decision-engine.js under any circumstance — this needs to be true
structurally, not just by convention, so a manual-mode test can never
accidentally exercise or be confused with real decision output.

## Implementation & Trade-off Constraints

A successful manual-mode test proves the pipeline can sign an
attestation and attempt a transaction correctly. It proves nothing
about decision-engine's judgment — those remain two separate claims,
verified separately.

The relayer's AgentBook check (unbacked / backed / unknown) still
applies in manual mode. This override bypasses the decision logic
only, not the human-backing verification gate — the one safeguard
ADR-07 named as load-bearing stays in place regardless of which path
produced the bet.
