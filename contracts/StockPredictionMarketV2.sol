// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPriceFeed {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (
        uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound
    );
}

contract StockPredictionMarketV2 {
    enum Direction { BULL, BEAR }
    enum MarketState { OPEN, LOCKED, SETTLED }

    struct Market {
        address stockToken;
        address priceFeed;
        string symbol;
        uint256 roundId;
        uint256 openTime;
        uint256 closeTime;
        int256 openPrice;
        int256 closePrice;
        uint256 bullPool;
        uint256 bearPool;
        MarketState state;
    }

    struct Bet {
        uint256 amount;
        Direction direction;
        bool claimed;
    }

    struct Attestation {
        address agentAddress;
        uint256 humanId;
        uint256 marketId;
        uint8 direction;
        uint256 amount;
        uint256 robinhoodNonce;
        uint256 issuedAt;
        uint256 expiresAt;
    }

    address public owner;
    address public immutable relayerAddress;
    uint256 public immutable maxAgentBetWei;
    uint256 public constant MIN_BET = 0.001 ether;
    uint256 public constant FEE_BPS = 200;
    uint256 public marketCount;
    uint256 public accumulatedFees;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Bet)) public bets;
    mapping(bytes32 => bool) public usedAttestations;

    event MarketCreated(uint256 indexed marketId, string symbol, address stockToken);
    event BetPlaced(uint256 indexed marketId, address indexed bettor, Direction direction, uint256 amount, bool isAgentBet);
    event MarketLocked(uint256 indexed marketId, int256 openPrice);
    event MarketSettled(uint256 indexed marketId, int256 closePrice, Direction winner);
    event WinningsClaimed(uint256 indexed marketId, address indexed bettor, uint256 amount);
    event FeesWithdrawn(address indexed to, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _relayerAddress, uint256 _maxAgentBetWei) {
        require(_relayerAddress != address(0), "Invalid relayer address");
        owner = msg.sender;
        relayerAddress = _relayerAddress;
        maxAgentBetWei = _maxAgentBetWei;
    }

    function createMarket(address stockToken, address priceFeed, string calldata symbol, uint256 duration)
        external onlyOwner returns (uint256 marketId)
    {
        marketId = marketCount++;
        markets[marketId] = Market({
            stockToken: stockToken,
            priceFeed: priceFeed,
            symbol: symbol,
            roundId: marketId,
            openTime: block.timestamp,
            closeTime: block.timestamp + duration,
            openPrice: 0,
            closePrice: 0,
            bullPool: 0,
            bearPool: 0,
            state: MarketState.OPEN
        });
        emit MarketCreated(marketId, symbol, stockToken);
    }

    function lockMarket(uint256 marketId) external onlyOwner {
        Market storage m = markets[marketId];
        require(m.state == MarketState.OPEN, "Not open");
        require(block.timestamp >= m.closeTime, "Too early");
        (, int256 price,,,) = IPriceFeed(m.priceFeed).latestRoundData();
        m.openPrice = price;
        m.state = MarketState.LOCKED;
        emit MarketLocked(marketId, price);
    }

    function settleMarket(uint256 marketId) external onlyOwner {
        Market storage m = markets[marketId];
        require(m.state == MarketState.LOCKED, "Not locked");
        (, int256 price,,,) = IPriceFeed(m.priceFeed).latestRoundData();
        m.closePrice = price;
        m.state = MarketState.SETTLED;
        Direction winner = price >= m.openPrice ? Direction.BULL : Direction.BEAR;
        emit MarketSettled(marketId, price, winner);
    }

    function placeBet(uint256 marketId, Direction direction) external payable {
        Market storage m = markets[marketId];
        require(m.state == MarketState.OPEN, "Not open");
        require(block.timestamp < m.closeTime, "Market closed");
        require(msg.value >= MIN_BET, "Below minimum bet");
        require(bets[marketId][msg.sender].amount == 0, "Already bet on this market");

        bets[marketId][msg.sender] = Bet(msg.value, direction, false);
        if (direction == Direction.BULL) m.bullPool += msg.value;
        else m.bearPool += msg.value;

        emit BetPlaced(marketId, msg.sender, direction, msg.value, false);
    }

    function placeAgentBet(Attestation calldata a, uint8 v, bytes32 r, bytes32 s) external payable {
        require(block.timestamp <= a.expiresAt, "attestation expired");
        require(a.amount <= maxAgentBetWei, "exceeds agent max bet size");
        require(msg.value == a.amount, "value mismatch");
        require(msg.value >= MIN_BET, "Below minimum bet");

        bytes32 hash = keccak256(abi.encodePacked(
            a.agentAddress, a.humanId, a.marketId, a.direction,
            a.amount, a.robinhoodNonce, a.issuedAt, a.expiresAt
        ));
        require(!usedAttestations[hash], "attestation already used");

        address signer = ecrecover(hash, v, r, s);
        require(signer == relayerAddress, "invalid attestation signature");

        Market storage m = markets[a.marketId];
        require(m.state == MarketState.OPEN, "Not open");
        require(block.timestamp < m.closeTime, "Market closed");
        require(bets[a.marketId][a.agentAddress].amount == 0, "Already bet on this market");

        usedAttestations[hash] = true;
        Direction direction = a.direction == 0 ? Direction.BULL : Direction.BEAR;
        bets[a.marketId][a.agentAddress] = Bet(a.amount, direction, false);
        if (direction == Direction.BULL) m.bullPool += a.amount;
        else m.bearPool += a.amount;

        emit BetPlaced(a.marketId, a.agentAddress, direction, a.amount, true);
    }

    function claimWinnings(uint256 marketId) external {
        Market storage m = markets[marketId];
        require(m.state == MarketState.SETTLED, "Not settled");
        Bet storage b = bets[marketId][msg.sender];
        require(b.amount > 0 && !b.claimed, "Nothing to claim");

        Direction winner = m.closePrice >= m.openPrice ? Direction.BULL : Direction.BEAR;
        require(b.direction == winner, "Lost");

        uint256 totalPool = m.bullPool + m.bearPool;
        uint256 fee = (totalPool * FEE_BPS) / 10000;
        uint256 winnerPool = winner == Direction.BULL ? m.bullPool : m.bearPool;
        uint256 payout = ((totalPool - fee) * b.amount) / winnerPool;

        b.claimed = true;
        accumulatedFees += (fee * b.amount) / winnerPool;
        payable(msg.sender).transfer(payout);
        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    function withdrawFees() external onlyOwner {
        uint256 amount = accumulatedFees;
        require(amount > 0, "No fees to withdraw");
        accumulatedFees = 0;
        payable(owner).transfer(amount);
        emit FeesWithdrawn(owner, amount);
    }
}
