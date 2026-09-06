// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {StockPredictionMarketV2} from "../contracts/StockPredictionMarketV2.sol";

/// @notice Opens a single TSLA market on the already-deployed
/// StockPredictionMarketV2 as a controlled test of the full
/// createMarket -> agent bet -> settle -> claim flow, before opening the
/// remaining four symbols. Run with --sender and WITHOUT --broadcast for a
/// dry-run simulation only; add --broadcast (and a real signer) to actually
/// send the transaction -- not done as part of this task.
contract CreateMarketV2 is Script {
    StockPredictionMarketV2 constant MARKET =
        StockPredictionMarketV2(0x59DF30E22bdaC70764a5DbF8bBa51BC5a595759C);

    address constant TSLA_TOKEN = 0x322F0929c4625eD5bAd873c95208D54E1c003b2d;
    address constant TSLA_PRICE_FEED = 0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f;
    string constant TSLA_SYMBOL = "TSLA";
    uint256 constant DURATION = 86400; // 1 day

    function run() external returns (uint256 marketId) {
        vm.startBroadcast();
        marketId = MARKET.createMarket(TSLA_TOKEN, TSLA_PRICE_FEED, TSLA_SYMBOL, DURATION);
        vm.stopBroadcast();
    }
}
