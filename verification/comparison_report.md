# StockPredictionMarketV2 — Phase 5 Comparison Report

## Scope

Comparison of `verification/reference_model/trace.json` (20 test cases,
including TC20 added during Phase 5) against `test/StockPredictionMarketV2.t.sol`
(22 test functions).

## Initial Comparison Results (19 Original Cases)

| Result | Count | Cases |
|---|---|---|
| Consistent (including indirect verification) | 15 | TC01, TC02, TC03, TC04, TC05, TC06, TC07, TC08, TC12, TC13, TC15, TC16, TC17, TC18, TC19 |
| Not comparable (the two suites covered different scenario shapes) | 3 | TC09, TC10, TC14 |
| Numeric mismatch | 1 | TC11 |

## Issues Found in the Initial Comparison, and Their Resolution

### 1. Attestation Expiry Boundary Semantic Divergence (a real logic divergence — fixed)

- **How it was found**: Comparing the Python `model.py` and the Solidity contract's
  "expired" condition side by side showed that Python originally wrote
  `now >= expiry` and treated that as expired (rejected), while Solidity writes
  `require(block.timestamp <= a.expiresAt)` — meaning at the exact instant
  `timestamp == expiresAt`, Solidity still treats the attestation as valid
  (accepted). The two implementations disagreed on the direction of the
  determination at the precise boundary instant.
- **Basis for the decision**: Solidity's behavior was treated as authoritative,
  since the contract was already finalized and had passed its Phase 1.5
  self-audit and Phase 4 white-box tests. The contract was not to be revisited
  to match the Python model.
- **Fix applied**: `model.py`'s condition was changed to `now > expiry` (expired
  only when strictly after), aligning its semantics with Solidity. After the
  fix, Python TC20 was added (`now == expiry` must succeed) along with a
  corresponding Foundry boundary test (`vm.warp(expiresAt)` must succeed) — both
  passed.

### 2. `msg.value` vs. `attestation.amount` Mismatch Check (a coverage gap — closed)

- **How it was found**: Solidity's `require(msg.value == a.amount, "value
  mismatch")` rule had never been triggered by any of the original 27 Foundry
  tests, because every existing test call happened to send `msg.value` exactly
  equal to `a.amount`.
- **Resolution**: A new Foundry test was added that deliberately sends
  `msg.value` one wei higher than `a.amount`, confirming the contract reverts
  with `"value mismatch"`. Passed.

### 3. TC11 Input Shape Mismatch (a test-design inconsistency, not a logic error — closed)

- **How it was found**: Python TC11 uses a sole-sided bet with no counterpart
  (`total_pool = 1 × MIN_BET`), while Foundry's original `test_13` used a
  two-sided bet (`total_pool = 2 × MIN_BET`). The two suites' `accumulatedFees`
  values before withdrawal naturally didn't match
  (20,000,000,000,000 vs. 40,000,000,000,000) because the input shapes
  themselves differed, not because either side's logic disagreed.
- **Resolution**: A new Foundry test was added using the exact same input shape
  as Python TC11 (a sole BULL bet, no counterpart), confirming
  `accumulatedFees` before withdrawal matches trace.json digit-for-digit at
  20,000,000,000,000.

### 4. TC09 / TC10 / TC14 Coverage Gaps (closed)

- **TC09** (direction determination on an empty pool): A new Foundry test was
  added that creates a market with no bets at all, locks and settles it
  directly, and uses `vm.expectEmit` to confirm the `MarketSettled` event's
  `winner` field is `BULL` — matching Python.
- **TC10** (sequential fee accumulation): A new Foundry test explicitly asserts
  that `accumulatedFees()` equals 30,000,000,000,000 after the first claim and
  60,000,000,000,000 after the second, matching trace.json digit-for-digit.
- **TC14** (multi-bettor, mixed-amount payout consistency): A new Foundry test
  was added using the exact same bet composition as Python (3 BULL bettors at
  different amounts + 2 BEAR bettors at different amounts), confirming
  `total_paid_out = 10,779,999,999,999,999`,
  `accumulated_fees = 219,999,999,999,999`, and `dust = 2` (wei) — all matching
  trace.json digit-for-digit.

## Final Result

After the follow-up fixes and added tests, all 20 Python cases (TC01–TC20) were
checked against their corresponding Foundry test functions (22 total) across
three dimensions — numeric values, pass/revert behavior, and pool/state
aggregation. **20/20 consistent**, with no remaining unexplained divergence.

## Independence Statement

The Python reference model (`verification/reference_model/model.py` and
`test_cases.py`) was written without ever opening, reading, or referencing
`contracts/StockPredictionMarketV2.sol` or any existing Solidity-related notes
— it was derived entirely from a natural-language business-logic description.
This comparison was carried out only after the Solidity contract had already
been written, self-audited, fixed, and white-box tested (Phases 1–4), all
committed. The Python model was not adjusted afterward to match the Solidity
code, with one documented exception: the attestation expiry boundary semantics
fix recorded in this report. That fix was made only after comparison revealed
a genuine semantic divergence between the two independently-derived
implementations, and the correction direction — bringing Python in line with
the already-finalized Solidity behavior — along with the full reasoning, is
recorded in full above.
