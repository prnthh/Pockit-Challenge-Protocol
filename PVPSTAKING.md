# PvPStaking Diamond - Full-Featured Escrow

## Overview

A **complete escrow system** with all GameEscrow features, now as a modular Diamond (EIP-2535) architecture:

- **N-player matches** (2, 3, 4, ...)
- **Governor-controlled** (create, ready, mark losers, resolve)
- **Whitelist support** (restrict who joins)
- **Forfeit mechanism** (withdraw before start)
- **Dynamic fees** (set at resolution time)
- **Multi-winner splits** (prize pool divided equally)
- **Facet composable** (attach game logic as new facets)

**Key difference from GameEscrow**: Same logic, but now extensible via facets + governors can add game-specific features.

## Architecture

```
Diamond Proxy
  ├─ PvPStakingFacet (create, join, ready, addLoser, endMatch, withdraw, queries)
  ├─ DiamondManagerFacet (add/remove facets)
  ├─ GovernanceFacet (owner, fee management)
  └─ (Optional: Custom game facets)
```

## Match Lifecycle

```
Governor creates match (1 ETH stake, 4 max players, whitelist optional)
  ↓
Players join one-by-one (each pays 1 ETH)
  ↓
Governor calls setMatchReady()
  ↓
Governor marks losers: addLoser(player1), addLoser(player2)
  ↓
Governor ends match with fee %:
  endMatch(matchId, 10%) 
  ↓
Winners split remaining pot equally
```

## API

### Core Match Functions

#### Create Match (Governor Initiates)
```solidity
uint256 matchId = diamond.createMatch{value: 1 ether}(
    address governor,       // Game controller
    uint256 stakeAmount,    // 1 ether
    uint256 maxPlayers,     // 0 = unlimited, 4 = max 4
    address[] whitelist     // [] = public, or list of allowed
);
```

#### Join Match
```solidity
diamond.joinMatch{value: 1 ether}(matchId);
// Player posts stake, enters pool
```

#### Governor Starts Match
```solidity
diamond.setMatchReady(matchId);
// No more joiners allowed
```

#### Governor Marks Losers
```solidity
diamond.addLoser(matchId, player1);
diamond.addLoser(matchId, player2);
// Non-losers are winners
```

#### Forfeit Before Start
```solidity
diamond.forfeitMatch(matchId);
// Player gets stake back if match not ready
```

#### Resolve Match
```solidity
diamond.endMatch(matchId, 10); // 10% fee
// Distributes pot to winners, fee to governor
```

#### Query Functions
```solidity
// Get full match info
MatchInfo memory m = diamond.getMatch(matchId);

// List not-started matches
uint256[] memory ids = diamond.getNotStartedMatches(0, 100);

// List ongoing matches
uint256[] memory ids = diamond.getOngoingMatches(0, 100);

// Governor's matches
uint256[] memory ids = diamond.getGovernorMatches(
    governor,
    true,   // include ended
    true,   // include ongoing
    true,   // include not started
    0,      // offset
    100     // limit
);

// House fee
uint256 fee = diamond.getHouseFeePercentage();
```

## Usage Examples

### Example 1: 1v1 Game (2 Players)

```solidity
// Governor creates 1v1 match
uint256 matchId = diamond.createMatch{value: 1 ether}(
    governor,
    1 ether,
    2,          // Exactly 2 players
    new address[](0)
);

// Player 2 joins
diamond.joinMatch{value: 1 ether}(matchId);

// Governor starts
diamond.setMatchReady(matchId);

// (Game happens, player1 wins)

// Governor marks player2 as loser
diamond.addLoser(matchId, player2);

// Resolve: Player1 gets 1.8 ETH (2 - 10% fee)
diamond.endMatch(matchId, 10);
```

### Example 2: 4-Player Tournament

```solidity
// Governor creates tournament
uint256 matchId = diamond.createMatch{value: 2 ether}(
    governor,
    2 ether,
    4,          // Max 4 players
    new address[](0)
);

// 3 more players join (total 4, each 2 ETH = 8 ETH pot)
diamond.joinMatch{value: 2 ether}(matchId); // Player 2
diamond.joinMatch{value: 2 ether}(matchId); // Player 3
diamond.joinMatch{value: 2 ether}(matchId); // Player 4

// Governor starts
diamond.setMatchReady(matchId);

// Tournament happens, players 1 & 3 win
diamond.addLoser(matchId, player2);
diamond.addLoser(matchId, player4);

// Resolve: 8 ETH pot - 20% fee (1.6 ETH) = 6.4 ETH to winners
// Each winner gets 3.2 ETH
diamond.endMatch(matchId, 20); // 20% fee
```

### Example 3: Whitelisted VIP Match

```solidity
address[] memory whitelist = new address[](2);
whitelist[0] = vip1;
whitelist[1] = vip2;

uint256 matchId = diamond.createMatch{value: 5 ether}(
    governor,
    5 ether,
    3,
    whitelist   // Only VIP + creator can join
);

// Only whitelisted can join
require(diamond.joinMatch{value: 5 ether}(matchId)); // vip1 joins
require(diamond.joinMatch{value: 5 ether}(matchId)); // vip2 joins
// Others rejected
```

## Facet System

### Add Custom Game Facet

```solidity
// 1. Create game facet
contract RockPaperScissorsFacet {
    using LibPvPStaking for LibPvPStaking.StorageData;

    function commit(uint256 matchId, bytes32 commitHash) external {
        LibPvPStaking.Match storage m = 
            LibPvPStaking.getStorage().matches[matchId];
        // RPS commit logic
    }

    function reveal(uint256 matchId, uint8 move, bytes32 salt) external {
        // RPS reveal logic
        // Determine winner
        // Can call endMatch after winner determined
    }
}

// 2. Deploy facet
RockPaperScissorsFacet rps = new RockPaperScissorsFacet();

// 3. Add to diamond
bytes4[] memory selectors = new bytes4[](2);
selectors[0] = RockPaperScissorsFacet.commit.selector;
selectors[1] = RockPaperScissorsFacet.reveal.selector;

diamond.addFacet(address(rps), selectors);

// 4. Use game
diamond.commit(matchId, commitHash);
diamond.reveal(matchId, move, salt);
```

## Deployment

### Local (Anvil)

```bash
anvil --port 8545

# In another terminal
forge script contracts/DeployPvPStaking.s.sol \
  --rpc-url http://127.0.0.1:8545 --broadcast
```

### Testnet

```bash
forge script contracts/DeployPvPStaking.s.sol \
  --rpc-url https://rpc.sepolia.org --broadcast --verify
```

Output:
```
Diamond deployed at: 0x...
PvPStakingFacet deployed at: 0x...
DiamondManagerFacet deployed at: 0x...
GovernanceFacet deployed at: 0x...
```

## Data Structures

### Match

```solidity
struct Match {
    address governor;           // Match controller
    bool isReady;              // Game started
    bool isEnded;              // Resolved + distributed
    
    uint256 stakeAmount;       // Per player
    uint256 maxPlayers;        // 0 = unlimited
    uint256 activePlayers;     // Current count
    
    address[] players;         // All joined
    address[] losers;          // Marked by governor
    address[] whitelist;       // Allowed if set
    address[] forfeited;       // Withdrew before start
    
    mapping(address => bool) isLoser;
    mapping(address => bool) isWhitelisted;
    mapping(address => bool) hasForfeit;
    mapping(address => bool) isPlayer;
}
```

### MatchInfo (Read-Only)

```solidity
struct MatchInfo {
    address governor;
    uint256 stakeAmount;
    uint256 maxPlayers;
    uint256 activePlayers;
    bool isReady;
    bool isEnded;
    address[] players;
    address[] losers;
    address[] whitelist;
    address[] forfeited;
}
```

## Storage

All facets access shared storage:

```solidity
LibPvPStaking.StorageData {
    mapping(uint256 => Match) matches;
    uint256 nextMatchId;
    address owner;
    uint256 houseFeePercentage;
}
```

**Deterministic position** ensures no collisions across facets.

## Prize Distribution

### Formula

```
totalStake = stakeAmount × activePlayers
governorFee = (totalStake × feePercentage) / 100
prizePool = totalStake - governorFee

winnerCount = players who are NOT losers AND NOT forfeited

If winnerCount > 0:
  prizePerWinner = prizePool / winnerCount
  Each winner gets prizePerWinner (+ 1 wei for remainder)

If winnerCount == 0:
  Split prizePool among non-forfeited players
```

### Example (4 Players, 1 ETH each)

```
Total stake: 4 ETH
Governor fee (10%): 0.4 ETH
Prize pool: 3.6 ETH

Case 1: 2 winners (players 1, 3)
  Each winner: 3.6 / 2 = 1.8 ETH

Case 2: 1 winner (player 1)
  Winner: 3.6 ETH

Case 3: 0 winners (all marked losers)
  Non-forfeited players split 3.6 ETH equally
```

## Governance

### Owner Functions

```solidity
// Set house fee (0-100%)
diamond.setHouseFeePercentage(15);

// Transfer ownership
diamond.transferOwnership(newOwner);

// Get current owner
address owner = diamond.getOwner();

// Initialize (one-time)
diamond.initializeOwner(owner);
diamond.initializeHouseFee(10);

// Withdraw unclaimed funds
diamond.withdraw();
```

## Facet Management

### Add Facet

```solidity
bytes4[] memory selectors = new bytes4[](2);
selectors[0] = MyFacet.func1.selector;
selectors[1] = MyFacet.func2.selector;

diamond.addFacet(address(myFacet), selectors);
```

### Remove Facet

```solidity
bytes4[] memory selectors = new bytes4[](2);
selectors[0] = MyFacet.func1.selector;
selectors[1] = MyFacet.func2.selector;

diamond.removeFacet(selectors);
```

### Query Facet

```solidity
address facet = diamond.facetAddress(bytes4(keccak256("func1()")));
```

## Safety Guarantees

- ✅ No storage collisions (shared LibPvPStaking storage via deterministic hash position)
- ✅ Governor controls game flow (only they can ready, mark losers, resolve)
- ✅ Players can verify stakes held (on-chain, transparent)
- ✅ Winners always paid (all stake + fees collected before payout)
- ✅ Facets don't interfere (independent function spaces)

## Limitations

| Feature | Limitation | Note |
|---------|-----------|------|
| Max players | No hard limit | Set `maxPlayers` on creation |
| Forfeit | Only before start | Post-start requires governor intervention |
| Fee | Set per match | Can be 0% (pure pool split) or up to 100% |
| Dispute | No built-in | Add custom facet if needed |
| Auto-resolution | Not supported | Governor always calls endMatch |

## Testing

```bash
# Run all tests
forge test

# Specific test
forge test --match test_createGame

# Gas report
forge test --gas-report
```

## References

- [EIP-2535: Diamonds](https://eips.ethereum.org/EIPS/eip-2535)
- [GameEscrow (contract.sol)](./contracts/contract.sol) - Original design
- [PVPSTAKING.md](./PVPSTAKING.md) - Previous minimal version
