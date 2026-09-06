"""
Independent Python reference model for the StockPredictionMarketV2 business logic.

Built ONLY from a natural-language description of the intended behavior (Phase 2
of the StockPredictionMarketV2 verification workflow), without reading or
referencing any Solidity implementation. The attestation hashing/signature
scheme used here for "agent bets" is this model's own design choice, made
because the business-logic description deliberately omits any encoding detail.
Reconciling this scheme against whatever the actual contract uses is explicitly
out of scope for this phase.
"""

from dataclasses import dataclass
from enum import IntEnum
from typing import Dict, Optional, Tuple

from eth_account import Account
from eth_account.messages import encode_defunct
from eth_utils import keccak

MIN_BET_WEI = 1_000_000_000_000_000  # 0.001 ETH, in wei
FEE_BPS = 200  # 2%, expressed in basis points
BPS_DENOMINATOR = 10_000


class Direction(IntEnum):
    BULL = 0
    BEAR = 1


class MarketState(IntEnum):
    OPEN = 0
    LOCKED = 1
    SETTLED = 2


class ModelError(Exception):
    """A rejected operation -- this model's equivalent of a revert."""


@dataclass
class Market:
    market_id: int
    symbol: str
    price_source: str
    open_time: int
    close_time: int
    state: MarketState = MarketState.OPEN
    lock_price: Optional[int] = None
    settle_price: Optional[int] = None
    bull_total: int = 0
    bear_total: int = 0


@dataclass
class Bet:
    market_id: int
    bettor: str
    amount: int
    direction: Direction
    claimed: bool = False


@dataclass
class Attestation:
    """A signed request to place a bet on behalf of `agent_address`."""

    agent_address: str
    direction: Direction
    amount: int
    market_id: int
    nonce: int
    expiry: int

    def _encode(self) -> bytes:
        # Self-designed packing for this model only -- not an attempt to match
        # any particular on-chain ABI encoding.
        addr_hex = self.agent_address.lower().replace("0x", "").rjust(40, "0")
        return (
            bytes.fromhex(addr_hex)
            + int(self.direction).to_bytes(1, "big")
            + int(self.amount).to_bytes(32, "big")
            + int(self.market_id).to_bytes(32, "big")
            + int(self.nonce).to_bytes(32, "big")
            + int(self.expiry).to_bytes(32, "big")
        )

    def digest(self) -> bytes:
        return keccak(self._encode())


def sign_attestation(attestation: Attestation, private_key: str) -> bytes:
    message = encode_defunct(primitive=attestation.digest())
    signed = Account.sign_message(message, private_key=private_key)
    return signed.signature


def _recover_signer(attestation: Attestation, signature: bytes) -> str:
    message = encode_defunct(primitive=attestation.digest())
    return Account.recover_message(message, signature=signature)


class PredictionMarketModel:
    def __init__(self, admin: str, authorized_signer_address: str, agent_bet_cap_wei: int):
        self.admin = admin
        self.authorized_signer_address = authorized_signer_address
        self.agent_bet_cap_wei = agent_bet_cap_wei
        self.markets: Dict[int, Market] = {}
        self.bets: Dict[Tuple[int, str], Bet] = {}
        self.used_attestations: set = set()
        self.accumulated_fees: int = 0
        self._next_market_id = 0

    # ---- Market lifecycle ----

    def create_market(self, symbol: str, price_source: str, open_time: int, close_time: int) -> int:
        market_id = self._next_market_id
        self._next_market_id += 1
        self.markets[market_id] = Market(
            market_id=market_id,
            symbol=symbol,
            price_source=price_source,
            open_time=open_time,
            close_time=close_time,
        )
        return market_id

    def lock_market(self, market_id: int, caller: str, external_price: int, now: int) -> None:
        self._require_admin(caller)
        m = self._get_market(market_id)
        if m.state != MarketState.OPEN:
            raise ModelError("market must be OPEN to lock")
        if now < m.close_time:
            raise ModelError("cannot lock before close time")
        m.lock_price = external_price
        m.state = MarketState.LOCKED

    def settle_market(self, market_id: int, caller: str, external_price: int) -> None:
        self._require_admin(caller)
        m = self._get_market(market_id)
        if m.state != MarketState.LOCKED:
            raise ModelError("market must be LOCKED to settle")
        m.settle_price = external_price
        m.state = MarketState.SETTLED

    def winning_direction(self, market_id: int) -> Direction:
        m = self._get_market(market_id)
        if m.state != MarketState.SETTLED:
            raise ModelError("market not settled")
        return Direction.BULL if m.settle_price >= m.lock_price else Direction.BEAR

    # ---- Betting ----

    def place_bet(self, market_id: int, bettor: str, direction: Direction, amount: int, now: int) -> None:
        m = self._get_market(market_id)
        self._check_open_for_betting(m, now)
        if amount < MIN_BET_WEI:
            raise ModelError("bet below minimum threshold")
        key = (market_id, bettor)
        if key in self.bets:
            raise ModelError("address already bet on this market")
        self.bets[key] = Bet(market_id, bettor, amount, direction)
        self._add_to_pool(m, direction, amount)

    def place_agent_bet(self, attestation: Attestation, signature: bytes, now: int) -> None:
        if now >= attestation.expiry:
            raise ModelError("attestation expired")
        if attestation.amount > self.agent_bet_cap_wei:
            raise ModelError("amount exceeds agent bet cap")
        if attestation.amount < MIN_BET_WEI:
            raise ModelError("bet below minimum threshold")

        digest = attestation.digest()
        if digest in self.used_attestations:
            raise ModelError("attestation already used")

        signer = _recover_signer(attestation, signature)
        if signer.lower() != self.authorized_signer_address.lower():
            raise ModelError("attestation not signed by authorized signer")

        m = self._get_market(attestation.market_id)
        self._check_open_for_betting(m, now)

        key = (attestation.market_id, attestation.agent_address)
        if key in self.bets:
            raise ModelError("address already bet on this market")

        self.used_attestations.add(digest)
        self.bets[key] = Bet(
            attestation.market_id, attestation.agent_address, attestation.amount, attestation.direction
        )
        self._add_to_pool(m, attestation.direction, attestation.amount)

    # ---- Claiming ----

    def claim_winnings(self, market_id: int, bettor: str) -> int:
        m = self._get_market(market_id)
        if m.state != MarketState.SETTLED:
            raise ModelError("market not settled")
        key = (market_id, bettor)
        bet = self.bets.get(key)
        if bet is None:
            raise ModelError("nothing to claim")
        if bet.claimed:
            raise ModelError("already claimed")

        winner = self.winning_direction(market_id)
        if bet.direction != winner:
            raise ModelError("losing bet cannot claim")

        total_pool = m.bull_total + m.bear_total
        fee = (total_pool * FEE_BPS) // BPS_DENOMINATOR
        winner_total = m.bull_total if winner == Direction.BULL else m.bear_total
        payout = ((total_pool - fee) * bet.amount) // winner_total
        fee_share = (fee * bet.amount) // winner_total

        bet.claimed = True
        self.accumulated_fees += fee_share
        return payout

    def withdraw_fees(self, caller: str) -> int:
        self._require_admin(caller)
        if self.accumulated_fees == 0:
            raise ModelError("no fees to withdraw")
        amount = self.accumulated_fees
        self.accumulated_fees = 0
        return amount

    # ---- internals ----

    def _get_market(self, market_id: int) -> Market:
        m = self.markets.get(market_id)
        if m is None:
            raise ModelError("market does not exist")
        return m

    def _require_admin(self, caller: str) -> None:
        if caller != self.admin:
            raise ModelError("caller is not admin")

    def _check_open_for_betting(self, m: Market, now: int) -> None:
        if m.state != MarketState.OPEN:
            raise ModelError("market not open")
        if now >= m.close_time:
            raise ModelError("betting window closed")

    def _add_to_pool(self, m: Market, direction: Direction, amount: int) -> None:
        if direction == Direction.BULL:
            m.bull_total += amount
        else:
            m.bear_total += amount
