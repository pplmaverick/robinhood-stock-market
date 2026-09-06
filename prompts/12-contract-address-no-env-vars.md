# Architectural Directive: Contract Address Stays Hardcoded, No Environment Variables

Decision Date: 2026-09-06

## Decision Context (Human Architect)

Phase 0 investigation into the frontend's V2 migration found there was
no real three-way sync to break in the first place. deployment.json had
the V2 address, but frontend/.env.local didn't exist and Vercel's
Production and Preview environments were both empty. The contract
address had been hardcoded directly in frontend/src/constants.js the
whole time, pointing at the old, now-deprecated contract.

The instinct was to fix this properly by introducing environment
variables — that's the textbook answer to "the same value lives in
three places and they disagree." But the team has already hit contract
address desync between deployment.json and the live frontend at least
twice, and every one of those incidents traced back to a human-maintained
copy of the address going stale somewhere. Adding environment variables
here would recreate the exact failure mode this project has already
paid for twice, just with a third human-maintained copy added to the
mix.

Environment variables earn their complexity when the same code needs to
behave differently across environments. This project has one production
frontend pointing at one contract. There's no second environment that
needs a different address. The architect chose to keep the address
hardcoded in constants.js — the one place that's git-tracked and
requires no manual dashboard step to stay current.

## Core Directives Given to Claude Code

Update frontend/src/constants.js directly with the new contract address
and the real ABI pulled from the Foundry build output
(out/StockPredictionMarketV2.sol/StockPredictionMarketV2.json), not
hand-transcribed. Do not create frontend/.env.local. Do not add or
modify any Vercel environment variables for the contract address.

## Implementation & Trade-off Constraints

Any future contract redeployment means editing constants.js and
redeploying — there is no way to point staging and production at
different contracts without a code change. That's an accepted trade-off
given this project has exactly one production target.

Copying the ABI from the Foundry build artifact rather than
hand-transcribing it matters more than it sounds: the V2 contract's Bet
struct reorders fields relative to the old contract
(amount, direction, claimed vs. the old direction, amount, claimed).
A hand-copied ABI carries a high risk of silently preserving the old
field order, which would make the frontend read amount and direction
swapped with no error thrown. This exact bug did surface later during
the MyBets.jsx read path — the ABI itself was correct, but the manual
index fallback used in one file hadn't been updated to match.
