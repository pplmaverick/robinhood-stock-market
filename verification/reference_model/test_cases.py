"""
Test-case runner for the StockPredictionMarketV2 Python reference model (Phase 2).

Each case exercises exactly one business-logic behavior from the natural-language
spec the model was built from. Inputs and outcomes are captured into trace.json
for a later, separate comparison against the actual Solidity implementation
(Phase 5) -- that comparison is explicitly NOT performed here.

Run: python3 verification/reference_model/test_cases.py
"""

import json
import os
import sys

from eth_account import Account

from model import (
    Attestation,
    Direction,
    MarketState,
    ModelError,
    PredictionMarketModel,
    sign_attestation,
    MIN_BET_WEI,
    FEE_BPS,
    BPS_DENOMINATOR,
)

ADMIN = "0x0000000000000000000000000000000000AD41"

_signer_account = Account.create()
AUTHORIZED_SIGNER_ADDRESS = _signer_account.address
AUTHORIZED_SIGNER_KEY = _signer_account.key.hex()

_other_account = Account.create()
UNAUTHORIZED_SIGNER_KEY = _other_account.key.hex()

AGENT_BET_CAP_WEI = MIN_BET_WEI  # mirrors the demo-scale config: cap == min bet

results = []


def jsonable(value):
    if isinstance(value, (Direction, MarketState)):
        return value.name
    if isinstance(value, bytes):
        return "0x" + value.hex()
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    return value


def run_case(name, category, description, inputs, action):
    try:
        result = action()
        outcome = {"status": "success", "result": jsonable(result)}
    except ModelError as e:
        outcome = {"status": "reverted", "reason": str(e)}
    entry = {
        "name": name,
        "category": category,
        "description": description,
        "inputs": jsonable(inputs),
        "outcome": outcome,
    }
    results.append(entry)
    return entry


def new_model(cap=AGENT_BET_CAP_WEI):
    return PredictionMarketModel(
        admin=ADMIN, authorized_signer_address=AUTHORIZED_SIGNER_ADDRESS, agent_bet_cap_wei=cap
    )


def new_market(model, open_time=0, close_time=1000, symbol="TSLA"):
    return model.create_market(symbol, "mock-price-source-1", open_time, close_time)


# ---------------------------------------------------------------------------
# Required behaviors
# ---------------------------------------------------------------------------


def tc01_normal_bet():
    model = new_model()
    market_id = new_market(model)
    bettor = "0x0000000000000000000000000000000000B0B1"
    inputs = {"market_id": market_id, "bettor": bettor, "direction": Direction.BULL, "amount": MIN_BET_WEI, "now": 500}

    def action():
        model.place_bet(market_id, bettor, Direction.BULL, MIN_BET_WEI, now=500)
        bet = model.bets[(market_id, bettor)]
        m = model.markets[market_id]
        return {"recorded_amount": bet.amount, "recorded_direction": bet.direction, "bull_total": m.bull_total, "bear_total": m.bear_total}

    run_case("TC01_normal_bet", "normal_bet", "A direct bet at exactly the minimum threshold, inside the open betting window, is accepted and recorded.", inputs, action)


def tc02_normal_claim():
    model = new_model()
    market_id = new_market(model)
    bettor_a = "0x0000000000000000000000000000000000B0B2"
    bettor_b = "0x0000000000000000000000000000000000B0B3"
    bear_bettor = "0x0000000000000000000000000000000000BEA1"

    model.place_bet(market_id, bettor_a, Direction.BULL, MIN_BET_WEI, now=100)
    model.place_bet(market_id, bettor_b, Direction.BULL, MIN_BET_WEI, now=100)
    model.place_bet(market_id, bear_bettor, Direction.BEAR, MIN_BET_WEI, now=100)
    model.lock_market(market_id, ADMIN, external_price=100, now=1000)
    model.settle_market(market_id, ADMIN, external_price=110)  # BULL wins (110 >= 100)

    inputs = {
        "market_id": market_id,
        "bull_bettors": [bettor_a, bettor_b],
        "bear_bettors": [bear_bettor],
        "each_bet_amount": MIN_BET_WEI,
        "lock_price": 100,
        "settle_price": 110,
        "claimant": bettor_a,
    }

    def action():
        payout = model.claim_winnings(market_id, bettor_a)
        # Manual re-derivation, independent of the model's own arithmetic, to
        # self-check internal consistency (requirement 4).
        total_pool = 3 * MIN_BET_WEI
        fee = (total_pool * FEE_BPS) // BPS_DENOMINATOR
        expected_payout = ((total_pool - fee) * MIN_BET_WEI) // (2 * MIN_BET_WEI)
        assert payout == expected_payout, f"payout mismatch: model={payout} manual={expected_payout}"
        return {"payout": payout, "manually_recomputed_payout": expected_payout}

    run_case("TC02_normal_claim", "normal_claim", "A winning bettor claims after settlement; payout is total pool minus 2% fee, split proportional to the winning side's total.", inputs, action)


def tc03_agent_bet_replay():
    model = new_model()
    market_id = new_market(model)
    agent = "0x0000000000000000000000000000000000A6E1"
    attestation = Attestation(agent_address=agent, direction=Direction.BULL, amount=MIN_BET_WEI, market_id=market_id, nonce=1, expiry=2000)
    signature = sign_attestation(attestation, AUTHORIZED_SIGNER_KEY)
    inputs = {"market_id": market_id, "agent": agent, "amount": MIN_BET_WEI, "nonce": 1, "expiry": 2000, "note": "same attestation submitted twice"}

    def action():
        model.place_agent_bet(attestation, signature, now=500)  # first call: succeeds
        model.place_agent_bet(attestation, signature, now=600)  # second call: must be rejected as replay

    run_case("TC03_agent_bet_replay", "replay_protection", "Submitting the identical attestation a second time is rejected even though the first submission succeeded.", inputs, action)


def tc04_attestation_expired():
    model = new_model()
    market_id = new_market(model)
    agent = "0x0000000000000000000000000000000000A6E2"
    attestation = Attestation(agent_address=agent, direction=Direction.BULL, amount=MIN_BET_WEI, market_id=market_id, nonce=2, expiry=100)
    signature = sign_attestation(attestation, AUTHORIZED_SIGNER_KEY)
    inputs = {"market_id": market_id, "agent": agent, "expiry": 100, "now": 200}

    def action():
        model.place_agent_bet(attestation, signature, now=200)  # now >= expiry

    run_case("TC04_attestation_expired", "expiry", "An attestation submitted at or after its expiry timestamp is rejected.", inputs, action)


def tc05_signer_mismatch():
    model = new_model()
    market_id = new_market(model)
    agent = "0x0000000000000000000000000000000000A6E3"
    attestation = Attestation(agent_address=agent, direction=Direction.BULL, amount=MIN_BET_WEI, market_id=market_id, nonce=3, expiry=2000)
    signature = sign_attestation(attestation, UNAUTHORIZED_SIGNER_KEY)  # signed by the wrong key
    inputs = {"market_id": market_id, "agent": agent, "signed_by": "unauthorized_key", "authorized_signer": AUTHORIZED_SIGNER_ADDRESS}

    def action():
        model.place_agent_bet(attestation, signature, now=500)

    run_case("TC05_signer_mismatch", "signer_mismatch", "An attestation signed by a key other than the authorized signer is rejected, regardless of otherwise-valid contents.", inputs, action)


def tc06_amount_below_minimum():
    model = new_model()
    market_id = new_market(model)
    bettor = "0x0000000000000000000000000000000000B0B4"
    amount = MIN_BET_WEI - 1
    inputs = {"market_id": market_id, "bettor": bettor, "amount": amount, "min_bet": MIN_BET_WEI}

    def action():
        model.place_bet(market_id, bettor, Direction.BULL, amount, now=500)

    run_case("TC06_amount_below_minimum", "amount_bounds", "A direct bet one wei below the minimum threshold is rejected.", inputs, action)


def tc07_amount_above_agent_cap():
    cap = MIN_BET_WEI
    model = new_model(cap=cap)
    market_id = new_market(model)
    agent = "0x0000000000000000000000000000000000A6E4"
    amount = cap + 1
    attestation = Attestation(agent_address=agent, direction=Direction.BULL, amount=amount, market_id=market_id, nonce=4, expiry=2000)
    signature = sign_attestation(attestation, AUTHORIZED_SIGNER_KEY)
    inputs = {"market_id": market_id, "agent": agent, "amount": amount, "agent_bet_cap_wei": cap}

    def action():
        model.place_agent_bet(attestation, signature, now=500)

    run_case("TC07_amount_above_agent_cap", "amount_bounds", "An agent bet one wei above the agent-specific cap is rejected.", inputs, action)


def tc08_duplicate_bet():
    model = new_model()
    market_id = new_market(model)
    bettor = "0x0000000000000000000000000000000000B0B5"
    inputs = {"market_id": market_id, "bettor": bettor, "first_direction": Direction.BULL, "second_direction": Direction.BEAR}

    def action():
        model.place_bet(market_id, bettor, Direction.BULL, MIN_BET_WEI, now=100)  # first: succeeds
        model.place_bet(market_id, bettor, Direction.BEAR, MIN_BET_WEI, now=200)  # second: must be rejected

    run_case("TC08_duplicate_bet", "duplicate_bet", "The same address betting twice on the same market is rejected on the second attempt, regardless of direction.", inputs, action)


def tc09_tie_settlement():
    model = new_model()
    market_id = new_market(model)
    inputs = {"market_id": market_id, "lock_price": 100, "settle_price": 100}

    def action():
        model.lock_market(market_id, ADMIN, external_price=100, now=1000)
        model.settle_market(market_id, ADMIN, external_price=100)  # settle_price == lock_price
        return {"winning_direction": model.winning_direction(market_id)}

    run_case("TC09_tie_settlement", "tie_settlement", "When the settlement price exactly equals the lock price, BULL is declared the winner.", inputs, action)


def tc10_fee_accumulation():
    model = new_model()
    market_id = new_market(model)
    bettor_a = "0x0000000000000000000000000000000000B0B6"
    bettor_b = "0x0000000000000000000000000000000000B0B7"
    bear_bettor = "0x0000000000000000000000000000000000BEA2"

    model.place_bet(market_id, bettor_a, Direction.BULL, MIN_BET_WEI, now=100)
    model.place_bet(market_id, bettor_b, Direction.BULL, MIN_BET_WEI, now=100)
    model.place_bet(market_id, bear_bettor, Direction.BEAR, MIN_BET_WEI, now=100)
    model.lock_market(market_id, ADMIN, external_price=100, now=1000)
    model.settle_market(market_id, ADMIN, external_price=110)

    inputs = {"market_id": market_id, "claimants": [bettor_a, bettor_b], "each_bet_amount": MIN_BET_WEI}

    def action():
        assert model.accumulated_fees == 0
        model.claim_winnings(market_id, bettor_a)
        fees_after_first = model.accumulated_fees
        model.claim_winnings(market_id, bettor_b)
        fees_after_second = model.accumulated_fees

        total_pool = 3 * MIN_BET_WEI
        fee = (total_pool * FEE_BPS) // BPS_DENOMINATOR
        expected_share_each = (fee * MIN_BET_WEI) // (2 * MIN_BET_WEI)
        assert fees_after_first == expected_share_each, f"{fees_after_first} != {expected_share_each}"
        assert fees_after_second == 2 * expected_share_each, f"{fees_after_second} != {2 * expected_share_each}"
        return {"accumulated_fees_after_first_claim": fees_after_first, "accumulated_fees_after_second_claim": fees_after_second}

    run_case("TC10_fee_accumulation", "fee_accumulation", "Each successful claim adds that bet's proportional share of the 2% fee to the global accumulated-fees counter.", inputs, action)


def tc11_withdraw_success():
    model = new_model()
    market_id = new_market(model)
    bettor = "0x0000000000000000000000000000000000B0B8"
    model.place_bet(market_id, bettor, Direction.BULL, MIN_BET_WEI, now=100)
    model.lock_market(market_id, ADMIN, external_price=100, now=1000)
    model.settle_market(market_id, ADMIN, external_price=110)
    model.claim_winnings(market_id, bettor)

    inputs = {"market_id": market_id, "accumulated_fees_before_withdraw": model.accumulated_fees, "caller": ADMIN}

    def action():
        withdrawn = model.withdraw_fees(ADMIN)
        return {"withdrawn_amount": withdrawn, "accumulated_fees_after": model.accumulated_fees}

    run_case("TC11_withdraw_success", "withdraw_success", "Admin withdraws a non-zero accumulated-fees balance; the counter resets to zero.", inputs, action)


def tc12_withdraw_zero_fails():
    model = new_model()
    inputs = {"accumulated_fees": model.accumulated_fees, "caller": ADMIN}

    def action():
        model.withdraw_fees(ADMIN)

    run_case("TC12_withdraw_zero_fails", "withdraw_failure", "Admin attempting to withdraw when the accumulated-fees counter is zero is rejected.", inputs, action)


# ---------------------------------------------------------------------------
# Additional self-consistency checks (beyond the required list) -- these exist
# to satisfy requirement 4 ("confirm the model itself is internally consistent"),
# not as behaviors to be cross-checked against Solidity in Phase 5.
# ---------------------------------------------------------------------------


def tc13_state_order_enforced():
    model = new_model()
    market_id = new_market(model)
    inputs = {"market_id": market_id, "attempted": "settle before lock, and lock twice"}

    def action():
        outcomes = {}
        try:
            model.settle_market(market_id, ADMIN, external_price=100)
            outcomes["settle_before_lock"] = "did not raise (UNEXPECTED)"
        except ModelError as e:
            outcomes["settle_before_lock"] = f"rejected: {e}"

        model.lock_market(market_id, ADMIN, external_price=100, now=1000)
        try:
            model.lock_market(market_id, ADMIN, external_price=105, now=1100)
            outcomes["lock_twice"] = "did not raise (UNEXPECTED)"
        except ModelError as e:
            outcomes["lock_twice"] = f"rejected: {e}"
        return outcomes

    run_case("TC13_state_order_enforced", "state_machine", "OPEN -> LOCKED -> SETTLED cannot be skipped or repeated (bonus check, not in the required list).", inputs, action)


def tc14_multi_bettor_payout_consistency():
    model = new_model()
    market_id = new_market(model)
    bull_bettors = [f"0x{'B0' + str(i).zfill(2)}" + "0" * 34 for i in range(3)]
    bear_bettors = [f"0x{'BE' + str(i).zfill(2)}" + "0" * 34 for i in range(2)]
    amounts = {}

    for i, b in enumerate(bull_bettors):
        amt = MIN_BET_WEI * (i + 1)
        amounts[b] = amt
        model.place_bet(market_id, b, Direction.BULL, amt, now=100)
    for i, b in enumerate(bear_bettors):
        amt = MIN_BET_WEI * (i + 2)
        amounts[b] = amt
        model.place_bet(market_id, b, Direction.BEAR, amt, now=100)

    model.lock_market(market_id, ADMIN, external_price=100, now=1000)
    model.settle_market(market_id, ADMIN, external_price=110)  # BULL wins

    m = model.markets[market_id]
    total_pool = m.bull_total + m.bear_total
    inputs = {"market_id": market_id, "bull_amounts": [amounts[b] for b in bull_bettors], "bear_amounts": [amounts[b] for b in bear_bettors], "total_pool": total_pool}

    def action():
        total_paid_out = 0
        for b in bull_bettors:
            total_paid_out += model.claim_winnings(market_id, b)
        for b in bear_bettors:
            try:
                model.claim_winnings(market_id, b)
                raise AssertionError("a losing bettor was allowed to claim (UNEXPECTED)")
            except ModelError:
                pass

        assert total_paid_out <= total_pool, "sum of payouts exceeds total pool"
        assert total_paid_out + model.accumulated_fees <= total_pool, "payouts + fees exceed total pool"
        dust = total_pool - total_paid_out - model.accumulated_fees
        assert dust >= 0, "negative dust implies over-payment"
        return {"total_paid_out": total_paid_out, "accumulated_fees": model.accumulated_fees, "rounding_dust_left_in_pool": dust}

    run_case("TC14_multi_bettor_payout_consistency", "self_consistency", "With multiple winners of different bet sizes, sum(payouts) + accumulated_fees never exceeds the total pool (bonus check, not in the required list).", inputs, action)


# ---------------------------------------------------------------------------
# Coverage follow-up: four gaps identified after reviewing the first 14 cases
# against the original seven required scenarios (agent claim, human+agent
# shared pool, agent-path duplicate bet via a distinct attestation, and a full
# claim flow through a tie). model.py is not modified here.
# ---------------------------------------------------------------------------


def tc15_agent_bet_full_flow():
    model = new_model()
    market_id = new_market(model)
    agent = "0x0000000000000000000000000000000000A6E5"
    bear_bettor = "0x0000000000000000000000000000000000BEA3"

    attestation = Attestation(agent_address=agent, direction=Direction.BULL, amount=MIN_BET_WEI, market_id=market_id, nonce=10, expiry=2000)
    signature = sign_attestation(attestation, AUTHORIZED_SIGNER_KEY)

    model.place_agent_bet(attestation, signature, now=500)
    model.place_bet(market_id, bear_bettor, Direction.BEAR, MIN_BET_WEI, now=500)
    model.lock_market(market_id, ADMIN, external_price=100, now=1000)
    model.settle_market(market_id, ADMIN, external_price=110)  # BULL wins

    inputs = {"market_id": market_id, "agent": agent, "agent_amount": MIN_BET_WEI, "bear_bettor": bear_bettor, "bear_amount": MIN_BET_WEI, "lock_price": 100, "settle_price": 110}

    def action():
        payout = model.claim_winnings(market_id, agent)
        total_pool = 2 * MIN_BET_WEI
        fee = (total_pool * FEE_BPS) // BPS_DENOMINATOR
        expected_payout = ((total_pool - fee) * MIN_BET_WEI) // MIN_BET_WEI  # agent is sole BULL bettor, winner_total == agent's own amount
        expected_fee_share = (fee * MIN_BET_WEI) // MIN_BET_WEI
        assert payout == expected_payout, f"payout mismatch: model={payout} manual={expected_payout}"
        assert model.accumulated_fees == expected_fee_share, f"fee_share mismatch: model={model.accumulated_fees} manual={expected_fee_share}"
        return {"payout": payout, "manually_recomputed_payout": expected_payout, "accumulated_fees": model.accumulated_fees, "manually_recomputed_fee_share": expected_fee_share}

    run_case("TC15_agent_bet_full_flow", "agent_claim", "An agent places a winning bet via place_agent_bet, the market settles, and the agent itself successfully claims; payout and fee-share match the same formula used for human claims.", inputs, action)


def tc16_mixed_human_agent_same_direction():
    model = new_model()
    market_id = new_market(model)
    human = "0x0000000000000000000000000000000000B0C1"
    agent = "0x0000000000000000000000000000000000A6E6"
    bear_bettor = "0x0000000000000000000000000000000000BEA4"

    model.place_bet(market_id, human, Direction.BULL, MIN_BET_WEI, now=100)
    attestation = Attestation(agent_address=agent, direction=Direction.BULL, amount=MIN_BET_WEI, market_id=market_id, nonce=20, expiry=2000)
    signature = sign_attestation(attestation, AUTHORIZED_SIGNER_KEY)
    model.place_agent_bet(attestation, signature, now=200)
    model.place_bet(market_id, bear_bettor, Direction.BEAR, MIN_BET_WEI, now=200)

    model.lock_market(market_id, ADMIN, external_price=100, now=1000)
    model.settle_market(market_id, ADMIN, external_price=110)  # BULL wins

    inputs = {"market_id": market_id, "human": human, "human_direction": Direction.BULL, "agent": agent, "agent_direction": Direction.BULL, "bear_bettor": bear_bettor, "each_amount": MIN_BET_WEI, "lock_price": 100, "settle_price": 110}

    def action():
        m = model.markets[market_id]
        assert m.bull_total == 2 * MIN_BET_WEI, f"shared bull_total not aggregating human+agent: {m.bull_total}"

        human_payout = model.claim_winnings(market_id, human)
        agent_payout = model.claim_winnings(market_id, agent)

        total_pool = 3 * MIN_BET_WEI
        fee = (total_pool * FEE_BPS) // BPS_DENOMINATOR
        winner_total = 2 * MIN_BET_WEI
        expected_each = ((total_pool - fee) * MIN_BET_WEI) // winner_total

        assert human_payout == expected_each, f"human payout mismatch: model={human_payout} manual={expected_each}"
        assert agent_payout == expected_each, f"agent payout mismatch: model={agent_payout} manual={expected_each}"
        return {"bull_total_after_both_bets": m.bull_total, "human_payout": human_payout, "agent_payout": agent_payout, "manually_recomputed_payout_each": expected_each}

    run_case("TC16_mixed_human_agent_same_direction", "shared_pool", "A human and an agent both bet BULL on the same market (a third bettor bets BEAR and loses); bull_total correctly aggregates both sources into one pool, and both claimants receive the same proportional payout.", inputs, action)


def tc17_mixed_human_agent_opposite_direction():
    model = new_model()
    market_id = new_market(model)
    human = "0x0000000000000000000000000000000000B0C2"
    agent = "0x0000000000000000000000000000000000A6E7"

    model.place_bet(market_id, human, Direction.BULL, MIN_BET_WEI, now=100)
    attestation = Attestation(agent_address=agent, direction=Direction.BEAR, amount=MIN_BET_WEI, market_id=market_id, nonce=21, expiry=2000)
    signature = sign_attestation(attestation, AUTHORIZED_SIGNER_KEY)
    model.place_agent_bet(attestation, signature, now=200)

    model.lock_market(market_id, ADMIN, external_price=100, now=1000)
    model.settle_market(market_id, ADMIN, external_price=110)  # BULL wins, so the agent (BEAR) loses

    inputs = {"market_id": market_id, "human": human, "human_direction": Direction.BULL, "agent": agent, "agent_direction": Direction.BEAR, "each_amount": MIN_BET_WEI, "lock_price": 100, "settle_price": 110}

    def action():
        m = model.markets[market_id]
        assert m.bull_total == MIN_BET_WEI and m.bear_total == MIN_BET_WEI, f"pool split wrong: bull={m.bull_total} bear={m.bear_total}"

        human_payout = model.claim_winnings(market_id, human)
        total_pool = 2 * MIN_BET_WEI
        fee = (total_pool * FEE_BPS) // BPS_DENOMINATOR
        expected_human_payout = ((total_pool - fee) * MIN_BET_WEI) // MIN_BET_WEI
        assert human_payout == expected_human_payout, f"human payout mismatch: model={human_payout} manual={expected_human_payout}"

        try:
            model.claim_winnings(market_id, agent)
            raise AssertionError("agent's losing BEAR bet was allowed to claim (UNEXPECTED)")
        except ModelError as e:
            agent_claim_reason = str(e)
        return {"human_payout": human_payout, "manually_recomputed_payout": expected_human_payout, "agent_claim_rejected_reason": agent_claim_reason}

    run_case("TC17_mixed_human_agent_opposite_direction", "shared_pool", "A human bets BULL and an agent bets BEAR on the same market; when BULL wins, the human claims correctly from the shared pool and the agent's losing claim is rejected.", inputs, action)


def tc18_agent_duplicate_bet_different_attestation():
    model = new_model()
    market_id = new_market(model)
    agent = "0x0000000000000000000000000000000000A6E8"

    first = Attestation(agent_address=agent, direction=Direction.BULL, amount=MIN_BET_WEI, market_id=market_id, nonce=100, expiry=2000)
    first_sig = sign_attestation(first, AUTHORIZED_SIGNER_KEY)
    second = Attestation(agent_address=agent, direction=Direction.BEAR, amount=MIN_BET_WEI, market_id=market_id, nonce=101, expiry=2000)
    second_sig = sign_attestation(second, AUTHORIZED_SIGNER_KEY)

    inputs = {"market_id": market_id, "agent": agent, "first_nonce": 100, "second_nonce": 101, "note": "two distinct attestations for the same agent+market, not a replay of the same one"}

    def action():
        model.place_agent_bet(first, first_sig, now=500)  # first: succeeds
        try:
            model.place_agent_bet(second, second_sig, now=600)  # second: distinct attestation, must still be rejected
            raise AssertionError("second agent bet with a different attestation was NOT rejected (UNEXPECTED)")
        except ModelError as e:
            reason = str(e)
        assert reason == "address already bet on this market", f"wrong rejection reason (expected the duplicate-bet check, not the replay check): {reason}"
        return {"first_bet": "succeeded", "second_bet_rejected_reason": reason}

    run_case("TC18_agent_duplicate_bet_different_attestation", "duplicate_bet", "The same agent address betting twice on the same market via two DIFFERENT attestations is rejected by the duplicate-bet check, not the attestation-replay check.", inputs, action)


def tc19_tie_full_claim_flow():
    model = new_model()
    market_id = new_market(model)
    bull_bettor = "0x0000000000000000000000000000000000B0C3"
    bear_bettor = "0x0000000000000000000000000000000000BEA5"

    model.place_bet(market_id, bull_bettor, Direction.BULL, MIN_BET_WEI, now=100)
    model.place_bet(market_id, bear_bettor, Direction.BEAR, MIN_BET_WEI, now=100)
    model.lock_market(market_id, ADMIN, external_price=100, now=1000)
    model.settle_market(market_id, ADMIN, external_price=100)  # tie: settle_price == lock_price -> BULL wins

    inputs = {"market_id": market_id, "bull_bettor": bull_bettor, "bear_bettor": bear_bettor, "each_amount": MIN_BET_WEI, "lock_price": 100, "settle_price": 100}

    def action():
        assert model.winning_direction(market_id) == Direction.BULL

        bull_payout = model.claim_winnings(market_id, bull_bettor)
        total_pool = 2 * MIN_BET_WEI
        fee = (total_pool * FEE_BPS) // BPS_DENOMINATOR
        expected_bull_payout = ((total_pool - fee) * MIN_BET_WEI) // MIN_BET_WEI
        assert bull_payout == expected_bull_payout, f"payout mismatch: model={bull_payout} manual={expected_bull_payout}"

        try:
            model.claim_winnings(market_id, bear_bettor)
            raise AssertionError("BEAR bettor was allowed to claim in a tie settled as BULL (UNEXPECTED)")
        except ModelError as e:
            bear_claim_reason = str(e)
        return {"bull_payout": bull_payout, "manually_recomputed_payout": expected_bull_payout, "bear_claim_rejected_reason": bear_claim_reason}

    run_case("TC19_tie_full_claim_flow", "tie_settlement", "A tie (settle_price == lock_price) settles as a BULL win end-to-end: the BULL bettor successfully claims and the BEAR bettor's claim is rejected.", inputs, action)


def main():
    tc01_normal_bet()
    tc02_normal_claim()
    tc03_agent_bet_replay()
    tc04_attestation_expired()
    tc05_signer_mismatch()
    tc06_amount_below_minimum()
    tc07_amount_above_agent_cap()
    tc08_duplicate_bet()
    tc09_tie_settlement()
    tc10_fee_accumulation()
    tc11_withdraw_success()
    tc12_withdraw_zero_fails()
    tc13_state_order_enforced()
    tc14_multi_bettor_payout_consistency()
    tc15_agent_bet_full_flow()
    tc16_mixed_human_agent_same_direction()
    tc17_mixed_human_agent_opposite_direction()
    tc18_agent_duplicate_bet_different_attestation()
    tc19_tie_full_claim_flow()

    out_path = os.path.join(os.path.dirname(__file__), "trace.json")
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"Wrote {len(results)} test-case traces to {out_path}\n")
    all_ok = True
    for r in results:
        status = r["outcome"]["status"]
        print(f"[{status.upper():9}] {r['name']}: {r['description']}")
        if status == "reverted":
            print(f"            reason: {r['outcome']['reason']}")
        else:
            print(f"            result: {r['outcome']['result']}")
    return all_ok


if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
