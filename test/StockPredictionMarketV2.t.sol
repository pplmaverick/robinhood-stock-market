// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {StockPredictionMarketV2, IPriceFeed} from "../contracts/StockPredictionMarketV2.sol";
import {MockPriceFeed} from "../contracts/MockPriceFeed.sol";

/// @notice Foundry-side behavioral tests for StockPredictionMarketV2 (Phase 4).
/// This is white-box testing -- the contract source was read directly, unlike
/// Phase 2's Python reference model. Every expected payout/fee figure here is
/// derived independently inside each test, in Solidity, from the deployed
/// contract's own MIN_BET/FEE_BPS/maxAgentBetWei values and that scenario's own
/// bet amounts -- none of it is copied from verification/reference_model/trace.json.
/// The 15 test functions below cover the same ground as Phase 2's 19 Python
/// cases; Phase 5 (not run here) is responsible for actually comparing the two.
contract StockPredictionMarketV2Test is Test {
    // TEST-ONLY ephemeral keys, not the production relayer identity.
    uint256 constant RELAYER_PK = 0xA11CE;
    uint256 constant WRONG_SIGNER_PK = 0xBEEF;
    uint256 constant MAX_AGENT_BET_WEI = 1_000_000_000_000_000; // 0.001 ETH cap for this deployment

    string constant ROBINHOOD_MAINNET_RPC = "https://rpc.mainnet.chain.robinhood.com";
    address constant TSLA_PRICE_FEED_WRAPPER = 0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f;

    StockPredictionMarketV2 market;
    address relayerAddr;

    // So this test contract (which deploys the market and is therefore its
    // `owner`) can receive ETH back from withdrawFees()/claimWinnings() calls
    // it makes directly against itself.
    receive() external payable {}

    function setUp() public {
        relayerAddr = vm.addr(RELAYER_PK);
        market = new StockPredictionMarketV2(relayerAddr, MAX_AGENT_BET_WEI);
    }

    // -------------------------------------------------------------------
    // helpers
    // -------------------------------------------------------------------

    function _hash(StockPredictionMarketV2.Attestation memory a) internal pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                a.agentAddress, a.humanId, a.marketId, a.direction, a.amount, a.robinhoodNonce, a.issuedAt, a.expiresAt
            )
        );
    }

    function _sign(uint256 pk, bytes32 h) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        (v, r, s) = vm.sign(pk, h);
    }

    function _mkAttestation(
        address agent,
        uint256 marketId,
        uint8 direction,
        uint256 amount,
        uint256 nonce,
        uint256 issuedAt,
        uint256 expiresAt
    ) internal pure returns (StockPredictionMarketV2.Attestation memory) {
        return StockPredictionMarketV2.Attestation({
            agentAddress: agent,
            humanId: 1,
            marketId: marketId,
            direction: direction,
            amount: amount,
            robinhoodNonce: nonce,
            issuedAt: issuedAt,
            expiresAt: expiresAt
        });
    }

    function _newMarket(uint256 duration, int256 initialPrice)
        internal
        returns (uint256 marketId, MockPriceFeed feed)
    {
        feed = new MockPriceFeed(initialPrice, 8);
        marketId = market.createMarket(address(0xCAFE), address(feed), "TSLA", duration);
    }

    function _placeBet(address bettor, uint256 marketId, StockPredictionMarketV2.Direction dir, uint256 amount)
        internal
    {
        vm.deal(bettor, amount);
        vm.prank(bettor);
        market.placeBet{value: amount}(marketId, dir);
    }

    function _claim(address who, uint256 marketId) internal {
        vm.prank(who);
        market.claimWinnings(marketId);
    }

    /// @dev fee = totalPool * FEE_BPS / 10000, read from the deployed contract's
    /// own FEE_BPS constant -- matches claimWinnings()'s own formula, computed
    /// independently here rather than hardcoded.
    function _fee(uint256 totalPool) internal view returns (uint256) {
        return (totalPool * market.FEE_BPS()) / 10_000;
    }

    /// @dev payout = (totalPool - fee) * betAmount / winnerPool -- same
    /// proportional-share formula claimWinnings() uses, computed independently
    /// per scenario from that scenario's own bet amounts.
    function _payoutFor(uint256 totalPool, uint256 fee, uint256 betAmount, uint256 winnerPool)
        internal
        pure
        returns (uint256)
    {
        return ((totalPool - fee) * betAmount) / winnerPool;
    }

    // -------------------------------------------------------------------
    // Fork test -- read-only, against the real, already-deployed
    // ChainlinkPriceFeed wrapper for TSLA on Robinhood Chain mainnet.
    // No state-changing call is made.
    // -------------------------------------------------------------------

    function test_fork_tslaPriceFeedReadsLiveData() public {
        vm.createSelectFork(ROBINHOOD_MAINNET_RPC);

        IPriceFeed feed = IPriceFeed(TSLA_PRICE_FEED_WRAPPER);
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();

        console2.log("TSLA wrapper answer:", uint256(answer));
        console2.log("TSLA wrapper updatedAt:", updatedAt);
        console2.log("fork block.timestamp:", block.timestamp);

        assertGt(answer, 0, "answer should be positive");
        assertGt(updatedAt, 0, "updatedAt should not be zero");
        assertLe(updatedAt, block.timestamp, "updatedAt should not be in the future");
    }

    // -------------------------------------------------------------------
    // 01: normal human bet + claim, with 2% fee deducted
    // -------------------------------------------------------------------

    function test_01_humanBetAndClaim_withFee() public {
        uint256 minBet = market.MIN_BET();
        (uint256 marketId, MockPriceFeed feed) = _newMarket(1 days, 100);

        address bullBettor = makeAddr("bullBettor01");
        address bearBettor = makeAddr("bearBettor01");

        _placeBet(bullBettor, marketId, StockPredictionMarketV2.Direction.BULL, minBet);
        _placeBet(bearBettor, marketId, StockPredictionMarketV2.Direction.BEAR, minBet);

        vm.warp(block.timestamp + 1 days + 1);
        market.lockMarket(marketId); // openPrice = 100
        feed.setPrice(110);
        market.settleMarket(marketId); // closePrice = 110 >= 100 -> BULL wins

        uint256 totalPool = 2 * minBet;
        uint256 fee = _fee(totalPool);
        uint256 expectedPayout = _payoutFor(totalPool, fee, minBet, minBet);

        uint256 balBefore = bullBettor.balance;
        _claim(bullBettor, marketId);
        assertEq(bullBettor.balance - balBefore, expectedPayout, "BULL payout mismatch");

        vm.prank(bearBettor);
        vm.expectRevert(bytes("Lost"));
        market.claimWinnings(marketId);
    }

    // -------------------------------------------------------------------
    // 02: agent bet (via signed attestation) + agent claim, with 2% fee
    // -------------------------------------------------------------------

    function test_02_agentBetAndClaim_withFee() public {
        uint256 minBet = market.MIN_BET();
        (uint256 marketId, MockPriceFeed feed) = _newMarket(1 days, 100);

        address agent = makeAddr("agent02");
        address bearBettor = makeAddr("bearBettor02");

        StockPredictionMarketV2.Attestation memory a =
            _mkAttestation(agent, marketId, 0, minBet, 1, block.timestamp, block.timestamp + 1 days);
        (uint8 v, bytes32 r, bytes32 s) = _sign(RELAYER_PK, _hash(a));
        market.placeAgentBet{value: minBet}(a, v, r, s);

        _placeBet(bearBettor, marketId, StockPredictionMarketV2.Direction.BEAR, minBet);

        vm.warp(block.timestamp + 1 days + 1);
        market.lockMarket(marketId);
        feed.setPrice(110);
        market.settleMarket(marketId);

        uint256 totalPool = 2 * minBet;
        uint256 fee = _fee(totalPool);
        uint256 expectedPayout = _payoutFor(totalPool, fee, minBet, minBet);

        uint256 balBefore = agent.balance;
        _claim(agent, marketId);
        assertEq(agent.balance - balBefore, expectedPayout, "agent payout mismatch");
    }

    // -------------------------------------------------------------------
    // 03: human + agent mixed, SAME direction -> shared pool aggregates both
    // -------------------------------------------------------------------

    function test_03_mixedHumanAgent_sameDirection_sharedPool() public {
        uint256 minBet = market.MIN_BET();
        (uint256 marketId, MockPriceFeed feed) = _newMarket(1 days, 100);

        address human = makeAddr("human03");
        address agent = makeAddr("agent03");
        address bearBettor = makeAddr("bearBettor03");

        _placeBet(human, marketId, StockPredictionMarketV2.Direction.BULL, minBet);

        StockPredictionMarketV2.Attestation memory a =
            _mkAttestation(agent, marketId, 0, minBet, 1, block.timestamp, block.timestamp + 1 days);
        (uint8 v, bytes32 r, bytes32 s) = _sign(RELAYER_PK, _hash(a));
        market.placeAgentBet{value: minBet}(a, v, r, s);

        _placeBet(bearBettor, marketId, StockPredictionMarketV2.Direction.BEAR, minBet);

        (,,,,,,,, uint256 bullPoolAfterBets, uint256 bearPoolAfterBets,) = market.markets(marketId);
        assertEq(bullPoolAfterBets, 2 * minBet, "shared bullPool did not aggregate human+agent bets");
        assertEq(bearPoolAfterBets, minBet, "bearPool mismatch");

        vm.warp(block.timestamp + 1 days + 1);
        market.lockMarket(marketId);
        feed.setPrice(110);
        market.settleMarket(marketId);

        uint256 totalPool = 3 * minBet;
        uint256 fee = _fee(totalPool);
        uint256 winnerPool = 2 * minBet;
        uint256 expectedEach = _payoutFor(totalPool, fee, minBet, winnerPool);

        uint256 humanBalBefore = human.balance;
        _claim(human, marketId);
        assertEq(human.balance - humanBalBefore, expectedEach, "human payout mismatch");

        uint256 agentBalBefore = agent.balance;
        _claim(agent, marketId);
        assertEq(agent.balance - agentBalBefore, expectedEach, "agent payout mismatch");
    }

    // -------------------------------------------------------------------
    // 04: human + agent mixed, OPPOSITE direction -> winner claims from the
    // shared pool correctly, loser's claim is rejected
    // -------------------------------------------------------------------

    function test_04_mixedHumanAgent_oppositeDirection() public {
        uint256 minBet = market.MIN_BET();
        (uint256 marketId, MockPriceFeed feed) = _newMarket(1 days, 100);

        address human = makeAddr("human04");
        address agent = makeAddr("agent04");

        _placeBet(human, marketId, StockPredictionMarketV2.Direction.BULL, minBet);

        StockPredictionMarketV2.Attestation memory a =
            _mkAttestation(agent, marketId, 1, minBet, 1, block.timestamp, block.timestamp + 1 days);
        (uint8 v, bytes32 r, bytes32 s) = _sign(RELAYER_PK, _hash(a));
        market.placeAgentBet{value: minBet}(a, v, r, s); // agent bets BEAR

        vm.warp(block.timestamp + 1 days + 1);
        market.lockMarket(marketId);
        feed.setPrice(110); // >= 100 -> BULL wins, agent's BEAR bet loses
        market.settleMarket(marketId);

        uint256 totalPool = 2 * minBet;
        uint256 fee = _fee(totalPool);
        uint256 expectedHumanPayout = _payoutFor(totalPool, fee, minBet, minBet);

        uint256 balBefore = human.balance;
        _claim(human, marketId);
        assertEq(human.balance - balBefore, expectedHumanPayout, "human payout mismatch");

        vm.prank(agent);
        vm.expectRevert(bytes("Lost"));
        market.claimWinnings(marketId);
    }

    // -------------------------------------------------------------------
    // 05: attestation replay -- identical attestation submitted twice
    // -------------------------------------------------------------------

    function test_05_attestationReplay_sameAttestationTwice() public {
        uint256 minBet = market.MIN_BET();
        (uint256 marketId,) = _newMarket(1 days, 100);
        address agent = makeAddr("agent05");

        StockPredictionMarketV2.Attestation memory a =
            _mkAttestation(agent, marketId, 0, minBet, 1, block.timestamp, block.timestamp + 1 days);
        (uint8 v, bytes32 r, bytes32 s) = _sign(RELAYER_PK, _hash(a));

        market.placeAgentBet{value: minBet}(a, v, r, s); // first: succeeds

        vm.expectRevert(bytes("attestation already used"));
        market.placeAgentBet{value: minBet}(a, v, r, s); // second: identical attestation replayed
    }

    // -------------------------------------------------------------------
    // 06: attestation expired
    // -------------------------------------------------------------------

    function test_06_attestationExpired() public {
        uint256 minBet = market.MIN_BET();
        (uint256 marketId,) = _newMarket(1 days, 100);
        address agent = makeAddr("agent06");

        uint256 expiresAt = block.timestamp + 100;
        StockPredictionMarketV2.Attestation memory a =
            _mkAttestation(agent, marketId, 0, minBet, 1, block.timestamp, expiresAt);
        (uint8 v, bytes32 r, bytes32 s) = _sign(RELAYER_PK, _hash(a));

        vm.warp(expiresAt + 1); // now > expiresAt

        vm.expectRevert(bytes("attestation expired"));
        market.placeAgentBet{value: minBet}(a, v, r, s);
    }

    // -------------------------------------------------------------------
    // 07: attestation signer mismatch (well-formed, signed by the wrong key)
    // -------------------------------------------------------------------

    function test_07_wrongSigner() public {
        uint256 minBet = market.MIN_BET();
        (uint256 marketId,) = _newMarket(1 days, 100);
        address agent = makeAddr("agent07");

        StockPredictionMarketV2.Attestation memory a =
            _mkAttestation(agent, marketId, 0, minBet, 1, block.timestamp, block.timestamp + 1 days);
        (uint8 v, bytes32 r, bytes32 s) = _sign(WRONG_SIGNER_PK, _hash(a));

        vm.expectRevert(bytes("invalid attestation signature"));
        market.placeAgentBet{value: minBet}(a, v, r, s);
    }

    // -------------------------------------------------------------------
    // 08: bet amount below MIN_BET
    // -------------------------------------------------------------------

    function test_08_amountBelowMinBet() public {
        uint256 minBet = market.MIN_BET();
        (uint256 marketId,) = _newMarket(1 days, 100);
        address bettor = makeAddr("bettor08");

        uint256 amount = minBet - 1;
        vm.deal(bettor, amount);
        vm.prank(bettor);
        vm.expectRevert(bytes("Below minimum bet"));
        market.placeBet{value: amount}(marketId, StockPredictionMarketV2.Direction.BULL);
    }

    // -------------------------------------------------------------------
    // 09: agent bet amount exceeds maxAgentBetWei
    // -------------------------------------------------------------------

    function test_09_agentAmountExceedsMaxAgentBetWei() public {
        uint256 cap = market.maxAgentBetWei();
        (uint256 marketId,) = _newMarket(1 days, 100);
        address agent = makeAddr("agent09");

        uint256 amount = cap + 1;
        StockPredictionMarketV2.Attestation memory a =
            _mkAttestation(agent, marketId, 0, amount, 1, block.timestamp, block.timestamp + 1 days);
        (uint8 v, bytes32 r, bytes32 s) = _sign(RELAYER_PK, _hash(a));

        vm.deal(address(this), amount);
        vm.expectRevert(bytes("exceeds agent max bet size"));
        market.placeAgentBet{value: amount}(a, v, r, s);
    }

    // -------------------------------------------------------------------
    // 10: duplicate bet, human path -- same address, same market, twice
    // -------------------------------------------------------------------

    function test_10_duplicateBet_humanPath() public {
        uint256 minBet = market.MIN_BET();
        (uint256 marketId,) = _newMarket(1 days, 100);
        address bettor = makeAddr("bettor10");

        _placeBet(bettor, marketId, StockPredictionMarketV2.Direction.BULL, minBet);

        vm.deal(bettor, minBet);
        vm.prank(bettor);
        vm.expectRevert(bytes("Already bet on this market"));
        market.placeBet{value: minBet}(marketId, StockPredictionMarketV2.Direction.BEAR);
    }

    // -------------------------------------------------------------------
    // 11: same agent + same market, two DIFFERENT attestations -- second must
    // be rejected by the duplicate-bet check, not the replay check
    // -------------------------------------------------------------------

    function test_11_agentDuplicateBet_differentAttestation() public {
        uint256 minBet = market.MIN_BET();
        (uint256 marketId,) = _newMarket(1 days, 100);
        address agent = makeAddr("agent11");

        StockPredictionMarketV2.Attestation memory a1 =
            _mkAttestation(agent, marketId, 0, minBet, 1, block.timestamp, block.timestamp + 1 days);
        (uint8 v1, bytes32 r1, bytes32 s1) = _sign(RELAYER_PK, _hash(a1));
        market.placeAgentBet{value: minBet}(a1, v1, r1, s1); // succeeds

        // Different robinhoodNonce and expiresAt -> a different attestation hash,
        // so this is NOT a replay of a1. Same agentAddress + marketId though.
        StockPredictionMarketV2.Attestation memory a2 =
            _mkAttestation(agent, marketId, 1, minBet, 2, block.timestamp, block.timestamp + 2 days);
        (uint8 v2, bytes32 r2, bytes32 s2) = _sign(RELAYER_PK, _hash(a2));

        assertTrue(_hash(a1) != _hash(a2), "test setup error: attestations must hash differently");

        vm.expectRevert(bytes("Already bet on this market"));
        market.placeAgentBet{value: minBet}(a2, v2, r2, s2);
    }

    // -------------------------------------------------------------------
    // 12: tie settlement (settle price == lock price) -> full claim flow
    // -------------------------------------------------------------------

    function test_12_tieSettlement_fullClaimFlow() public {
        uint256 minBet = market.MIN_BET();
        (uint256 marketId, MockPriceFeed feed) = _newMarket(1 days, 100);

        address bullBettor = makeAddr("bullBettor12");
        address bearBettor = makeAddr("bearBettor12");

        _placeBet(bullBettor, marketId, StockPredictionMarketV2.Direction.BULL, minBet);
        _placeBet(bearBettor, marketId, StockPredictionMarketV2.Direction.BEAR, minBet);

        vm.warp(block.timestamp + 1 days + 1);
        market.lockMarket(marketId); // openPrice = 100
        feed.setPrice(100); // settle price == lock price -> tie -> BULL wins
        market.settleMarket(marketId);

        uint256 totalPool = 2 * minBet;
        uint256 fee = _fee(totalPool);
        uint256 expectedPayout = _payoutFor(totalPool, fee, minBet, minBet);

        uint256 balBefore = bullBettor.balance;
        _claim(bullBettor, marketId);
        assertEq(bullBettor.balance - balBefore, expectedPayout, "tie BULL payout mismatch");

        vm.prank(bearBettor);
        vm.expectRevert(bytes("Lost"));
        market.claimWinnings(marketId);
    }

    // -------------------------------------------------------------------
    // 13: withdrawFees() success
    // -------------------------------------------------------------------

    function test_13_withdrawFees_success() public {
        uint256 minBet = market.MIN_BET();
        (uint256 marketId, MockPriceFeed feed) = _newMarket(1 days, 100);

        address bullBettor = makeAddr("bullBettor13");
        address bearBettor = makeAddr("bearBettor13");
        _placeBet(bullBettor, marketId, StockPredictionMarketV2.Direction.BULL, minBet);
        _placeBet(bearBettor, marketId, StockPredictionMarketV2.Direction.BEAR, minBet);

        vm.warp(block.timestamp + 1 days + 1);
        market.lockMarket(marketId);
        feed.setPrice(110);
        market.settleMarket(marketId);

        _claim(bullBettor, marketId);

        uint256 totalPool = 2 * minBet;
        uint256 expectedFee = _fee(totalPool);
        // Sole winner takes the whole winning side -> fee share == the full fee.
        uint256 expectedFeeShare = (expectedFee * minBet) / minBet;
        assertEq(market.accumulatedFees(), expectedFeeShare, "accumulatedFees mismatch before withdraw");

        uint256 ownerBalBefore = address(this).balance; // this test contract IS the owner
        market.withdrawFees();
        assertEq(address(this).balance - ownerBalBefore, expectedFeeShare, "withdrawn amount mismatch");
        assertEq(market.accumulatedFees(), 0, "accumulatedFees not reset to zero");
    }

    // -------------------------------------------------------------------
    // 14: withdrawFees() reverts when accumulatedFees is zero
    // -------------------------------------------------------------------

    function test_14_withdrawFees_zeroBalanceReverts() public {
        assertEq(market.accumulatedFees(), 0);
        vm.expectRevert(bytes("No fees to withdraw"));
        market.withdrawFees();
    }

    // -------------------------------------------------------------------
    // 15: state machine order cannot be skipped or repeated
    // -------------------------------------------------------------------

    function test_15_stateMachineOrderEnforced() public {
        (uint256 marketId, MockPriceFeed feed) = _newMarket(1 days, 100);

        vm.warp(block.timestamp + 1 days + 1);

        vm.expectRevert(bytes("Not locked"));
        market.settleMarket(marketId); // settle before lock

        market.lockMarket(marketId); // now LOCKED

        vm.expectRevert(bytes("Not open"));
        market.lockMarket(marketId); // lock again

        // Sanity: settle should now proceed normally from the correct state.
        feed.setPrice(105);
        market.settleMarket(marketId);
    }
}
