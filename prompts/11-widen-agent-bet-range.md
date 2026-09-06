# Architectural Directive: Widening the Agent Bet Size from a Fixed Amount to a Range

Decision Date: 2026-09-06

## Decision Context (Human Architect)

ADR-10's original deployment parameters set maxAgentBetWei equal to
MIN_BET, both 0.001 ETH. That equality was carried over from the
handoff spec without being questioned at the time it was written. Once
StockPredictionMarketV2.sol compiled, Claude Code flagged the
consequence directly: with the floor and the ceiling set to the same
number, an agent bet can only ever be exactly 0.001 ETH. There's no
range for the agent to choose within, which sits oddly next to a
project whose whole pitch is an autonomous, calibrated decision.

The question of what to raise the ceiling to came down to which
audience the number needs to satisfy. From a commercial standpoint,
0.001 to 0.005 ETH is a small range no matter where the ceiling sits.
That's a question for after the project has real traffic, not
something to settle eight days before a hackathon deadline. From the
hackathon standpoint, the number only needs to do one job: give a
judge watching the demo something to see besides a single hardcoded
value. A fixed 0.001 ETH bet reads like a hobbled version of the
feature. A range the agent actually chooses within reads like the
feature working as described. The architect optimized for the
hackathon framing, since that's the audience and the timeline this
decision actually has to serve.

## Core Directives Given to Claude Code

Change the maxAgentBetWei value used at deployment from 1000000000000000
(0.001 ETH) to 5000000000000000 (0.005 ETH). StockPredictionMarketV2.sol
already accepts maxAgentBetWei as a constructor argument and enforces
it generically. This is a deployment parameter change, and nothing in
the already-committed contract needs to be touched. MIN_BET stays
fixed at 0.001 ETH as the floor for both betting paths, unchanged from
ADR-10.

decision-engine/src/config.js may still hardcode MAX_BET_SIZE_WEI at
the old 0.001 ETH figure. Re-reading that file and updating it to use
the new range is folded into the work already planned for
decision-engine, alongside wiring up the as-yet-unbuilt logic that
actually signs and broadcasts placeAgentBet() transactions. Widening
the contract's ceiling does nothing on its own if the agent's decision
logic keeps sending a fixed 0.001 ETH regardless.

## Implementation & Trade-off Constraints

maxAgentBetWei is declared immutable, set once in the constructor and
never adjustable afterward by any function, including by the owner.
Raising it further later means deploying a new contract version, the
same pattern this project already used going from the original
StockPredictionMarket to StockPredictionMarketV2. The existing
contract already has this property; this decision just has to deploy
within it.

This change only affects the deployment parameter. StockPredictionMarketV2.sol,
its Independent Reference Model Testing, and its Foundry test suite
were all completed using 0.001 ETH as an illustrative constructor
argument in tests, not as a value baked into contract logic. None of
that work needs to be redone. The new figure only takes effect at
actual deployment time, which hasn't happened yet.
