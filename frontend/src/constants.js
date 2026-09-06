export const MARKET_ADDRESS = '0x59DF30E22bdaC70764a5DbF8bBa51BC5a595759C' // StockPredictionMarketV2

export const STOCKS = [
  {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    token: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d',
    priceFeed: '0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f',
    icon: 'electric_car',
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com',
    token: '0x12f190a9F9d7D37a250758b26824B97CE941bF54',
    priceFeed: '0xcAC5B9d2817325E78090E3Ce4b9C299C819cF953',
    icon: 'shopping_cart',
  },
  {
    symbol: 'PLTR',
    name: 'Palantir Technologies',
    token: '0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A',
    priceFeed: '0xBdC53E50b1167cE1199bFaD54A034f7ab1741051',
    icon: 'data_exploration',
  },
  {
    symbol: 'AMD',
    name: 'Advanced Micro Devices',
    token: '0x86923f96303D656E4aa86D9d42D1e57ad2023fdC',
    priceFeed: '0x15636CE4C0EdE55335f84E6386f8F49C897c077d',
    icon: 'memory',
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    token: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC',
    priceFeed: '0x914c40a644493b47336de847b0404E729e06C68d',
    icon: 'memory_alt',
  },
]

// Copied verbatim from out/StockPredictionMarketV2.sol/StockPredictionMarketV2.json's "abi"
// field (forge build output) -- not hand-transcribed. Deliberately NOT reformatted to this
// file's usual style (unquoted keys, single quotes): reformatting by hand is exactly the kind
// of manual transcription step that put the old hand-written ABI's bets() tuple in the wrong
// order in the first place. bets()'s outputs are [amount, direction, claimed] here -- the
// OPPOSITE order from the deprecated StockPredictionMarket's [direction, amount, claimed].
// BetPlaced/WinningsClaimed's indexed address argument is also renamed here (bettor, not user).
export const MARKET_ABI = [
  {
    "type": "constructor",
    "inputs": [
      { "name": "_relayerAddress", "type": "address", "internalType": "address" },
      { "name": "_maxAgentBetWei", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "FEE_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_BET",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "accumulatedFees",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bets",
    "inputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" },
      { "name": "", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      { "name": "amount", "type": "uint256", "internalType": "uint256" },
      { "name": "direction", "type": "uint8", "internalType": "enum StockPredictionMarketV2.Direction" },
      { "name": "claimed", "type": "bool", "internalType": "bool" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claimWinnings",
    "inputs": [{ "name": "marketId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createMarket",
    "inputs": [
      { "name": "stockToken", "type": "address", "internalType": "address" },
      { "name": "priceFeed", "type": "address", "internalType": "address" },
      { "name": "symbol", "type": "string", "internalType": "string" },
      { "name": "duration", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "marketId", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "lockMarket",
    "inputs": [{ "name": "marketId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "marketCount",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "markets",
    "inputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "outputs": [
      { "name": "stockToken", "type": "address", "internalType": "address" },
      { "name": "priceFeed", "type": "address", "internalType": "address" },
      { "name": "symbol", "type": "string", "internalType": "string" },
      { "name": "roundId", "type": "uint256", "internalType": "uint256" },
      { "name": "openTime", "type": "uint256", "internalType": "uint256" },
      { "name": "closeTime", "type": "uint256", "internalType": "uint256" },
      { "name": "openPrice", "type": "int256", "internalType": "int256" },
      { "name": "closePrice", "type": "int256", "internalType": "int256" },
      { "name": "bullPool", "type": "uint256", "internalType": "uint256" },
      { "name": "bearPool", "type": "uint256", "internalType": "uint256" },
      { "name": "state", "type": "uint8", "internalType": "enum StockPredictionMarketV2.MarketState" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxAgentBetWei",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "placeAgentBet",
    "inputs": [
      {
        "name": "a",
        "type": "tuple",
        "internalType": "struct StockPredictionMarketV2.Attestation",
        "components": [
          { "name": "agentAddress", "type": "address", "internalType": "address" },
          { "name": "humanId", "type": "uint256", "internalType": "uint256" },
          { "name": "marketId", "type": "uint256", "internalType": "uint256" },
          { "name": "direction", "type": "uint8", "internalType": "uint8" },
          { "name": "amount", "type": "uint256", "internalType": "uint256" },
          { "name": "robinhoodNonce", "type": "uint256", "internalType": "uint256" },
          { "name": "issuedAt", "type": "uint256", "internalType": "uint256" },
          { "name": "expiresAt", "type": "uint256", "internalType": "uint256" }
        ]
      },
      { "name": "v", "type": "uint8", "internalType": "uint8" },
      { "name": "r", "type": "bytes32", "internalType": "bytes32" },
      { "name": "s", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "placeBet",
    "inputs": [
      { "name": "marketId", "type": "uint256", "internalType": "uint256" },
      { "name": "direction", "type": "uint8", "internalType": "enum StockPredictionMarketV2.Direction" }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "relayerAddress",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "settleMarket",
    "inputs": [{ "name": "marketId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "usedAttestations",
    "inputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "withdrawFees",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "BetPlaced",
    "inputs": [
      { "name": "marketId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "bettor", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "direction", "type": "uint8", "indexed": false, "internalType": "enum StockPredictionMarketV2.Direction" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "isAgentBet", "type": "bool", "indexed": false, "internalType": "bool" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FeesWithdrawn",
    "inputs": [
      { "name": "to", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MarketCreated",
    "inputs": [
      { "name": "marketId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "symbol", "type": "string", "indexed": false, "internalType": "string" },
      { "name": "stockToken", "type": "address", "indexed": false, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MarketLocked",
    "inputs": [
      { "name": "marketId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "openPrice", "type": "int256", "indexed": false, "internalType": "int256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MarketSettled",
    "inputs": [
      { "name": "marketId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "closePrice", "type": "int256", "indexed": false, "internalType": "int256" },
      { "name": "winner", "type": "uint8", "indexed": false, "internalType": "enum StockPredictionMarketV2.Direction" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WinningsClaimed",
    "inputs": [
      { "name": "marketId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "bettor", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  }
]

export const PRICE_FEED_ABI = [
  {
    name: 'latestRoundData',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId',         type: 'uint80'  },
      { name: 'answer',          type: 'int256'  },
      { name: 'startedAt',       type: 'uint256' },
      { name: 'updatedAt',       type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80'  },
    ],
  },
]

// MarketState enum
export const STATE = { OPEN: 0, LOCKED: 1, SETTLED: 2 }
// Direction enum
export const DIR = { BULL: 0, BEAR: 1 }
// FEE_BPS constant (matches contract)
export const FEE_BPS = 200n
