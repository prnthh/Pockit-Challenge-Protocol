# Pockit Challenge Protocol

**Composable onchain games with GameEscrow.**

## Overview

GameEscrow is a UUPS upgradeable escrow contract for N-player competitive games. Game contracts are stateless logic that call GameEscrow for match creation, resolution, and payouts.

**Architecture:**
- `GameEscrow` (contracts/GameEscrowV2.sol) - UUPS upgradeable base contract
- Sample games (contracts/sampleGames/) - RPS, CoinFlip, HighLow, LastStanding, Auction
- External composition pattern (games call escrow, don't inherit)
- Event-driven design (indexers + frontends build state from events)

## Features

- ✅ N-player matches with variable stakes
- ✅ Pull-based withdrawals (gas griefing resistant)
- ✅ House fee mechanism (configurable)
- ✅ Game contract whitelist (only approved games can resolve)
- ✅ UUPS upgradeability (owner-controlled, transparent)
- ✅ Full test coverage (6/6 upgrade tests passing)

## Contracts

### GameEscrowV2.sol
Core escrow contract. Handles:
- Match creation (`createMatch`)
- Match resolution (`resolveMatch`) - only callable by game contract
- Withdrawals (`withdraw`) - pull pattern
- Game approval (`approveGame`) - owner only
- Upgrades (`upgradeToAndCall`) - UUPS pattern

### Sample Games

All games in `contracts/sampleGames/`:

1. **01_RockPaperScissors.sol** - Commit-reveal RPS
2. **02_CoinFlip.sol** - XOR-based randomness
3. **03_HighLow.sol** - Threshold prediction
4. **04_LastStanding.sol** - N-player elimination
5. **05_Auction.sol** - Vickrey sealed-bid auction

See `contracts/sampleGames/README.md` for details.

## Installation

```bash
# Clone repo
git clone https://github.com/PockitCEO/Pockit-Challenge-Protocol
cd Pockit-Challenge-Protocol

# Install dependencies
npm install

# Install Foundry dependencies
forge install
```

## Testing

```bash
# Run all tests
forge test

# Run upgrade tests
forge test --match-contract GameEscrowUpgradeTest -vv

# Run with gas reporting
forge test --gas-report
```

## Deployment

```bash
# Deploy to local Anvil
anvil  # in separate terminal
forge script scripts/DeployGameEscrow.s.sol --rpc-url http://localhost:8545 --broadcast

# Deploy to Sepolia
forge script scripts/DeployGameEscrow.s.sol --rpc-url https://rpc.sepolia.org --broadcast --verify
```

## Usage Example

```solidity
// Deploy GameEscrow
GameEscrow escrow = new GameEscrow();
escrow.initialize(250); // 2.5% house fee

// Approve a game contract
escrow.approveGame(address(rpsGame), true);

// Create a match (from RPS game contract)
address[] memory players = [player1, player2];
uint256[] memory stakes = [1 ether, 1 ether];
uint256 matchId = escrow.createMatch{value: 2 ether}(
    address(this), // game contract
    players,
    stakes
);

// Resolve match (after game logic completes)
address[] memory winners = [player1];
uint256[] memory payouts = [1.95 ether]; // 2 ether - 2.5% fee
escrow.resolveMatch(matchId, winners, payouts);

// Withdraw (pull pattern)
escrow.withdraw(matchId); // player1 calls this
```

## Security

- OpenZeppelin UUPS upgradeable pattern
- ReentrancyGuard on all fund transfers
- Ownable for admin functions
- Pull-based withdrawals (no reentrancy)
- Game contract whitelist (prevents unauthorized resolutions)

**Tradeoff:** Owner has upgrade key (explicit trust). Consider:
- Time-locked upgrades (governance delay)
- Multi-sig ownership
- Immutable deployments for production

## Architecture

**External Composition Pattern:**

```
┌─────────────────┐
│   GameEscrow    │ ← UUPS upgradeable base
│   (holds ETH)   │
└────────┬────────┘
         │
         │ createMatch() / resolveMatch()
         │
    ┌────┴─────────────────┐
    │                      │
┌───▼──────┐      ┌───────▼────┐
│ RPSGame  │      │ CoinFlip   │
│(stateless│      │(stateless) │
│  logic)  │      │   logic)   │
└──────────┘      └────────────┘
```

**Event-Driven Design:**

- `MatchCreated` - Match lifecycle starts
- `MatchResolved` - Winners + payouts determined
- `PayoutWithdrawn` - Player withdraws funds
- Game-specific events (e.g., `MoveCommitted`, `MoveRevealed`)

Indexers/frontends build full game state from events.

## Roadmap

- [ ] Deploy to Sepolia testnet
- [ ] Build RPS demo UI (React + viem)
- [ ] Add 40+ sample games (Chess, Poker, Prediction Markets, etc.)
- [ ] Multi-token support (ERC-20 stakes)
- [ ] Reputation system (player stats, win rates)
- [ ] Tournament brackets (multi-round elimination)

## License

MPL-2.0 (Mozilla Public License 2.0)

## Links

- Website: https://pockitceo.github.io
- GitHub: https://github.com/PockitCEO
- X/Twitter: https://x.com/prnthh

---

**Built to ship. Code in the sun. Radical transparency.**
