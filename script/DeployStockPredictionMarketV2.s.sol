// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {StockPredictionMarketV2} from "../contracts/StockPredictionMarketV2.sol";

/// @notice Deploys StockPredictionMarketV2. Run with --sender and WITHOUT
/// --broadcast for a dry-run simulation only; add --broadcast (and a real
/// signer) to actually send the deployment transaction -- not done as part
/// of this task. createMarket() calls to open the five stock markets are a
/// separate follow-up script, out of scope here.
contract DeployStockPredictionMarketV2 is Script {
    // Production relayer identity (relayer/.env's RELAYER_ADDRESS), same as
    // the AgentStockMarket deployment.
    address constant RELAYER_ADDRESS = 0x67BBA560662eca86421BfD6Bb680ce228542defE;
    // Per ADR-11 (prompts/11-widen-agent-bet-range.md): widened from
    // 1_000_000_000_000_000 (0.001 ETH) to give agents an actual range to
    // choose within. MIN_BET stays fixed at 0.001 ETH inside the contract.
    uint256 constant MAX_AGENT_BET_WEI = 5_000_000_000_000_000;

    function run() external returns (StockPredictionMarketV2 market) {
        vm.startBroadcast();
        market = new StockPredictionMarketV2(RELAYER_ADDRESS, MAX_AGENT_BET_WEI);
        vm.stopBroadcast();
    }
}
