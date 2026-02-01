# PvP Staking Diamond - Minimal, Composable 1v1 Escrow

## Overview

A minimal Diamond (EIP-2535) optimized for **1v1 PvP games with staking**. Any game contract can add PvP mechanics by:

1. Deploying a game-specific facet
2. Calling `addFacet()` to attach it to the diamond
3. Using `LibPvPStaking.storage()` to access shared stake data

**Key design**: No game logic. Just escrow.

## Architecture

```
Diamond (Proxy)
  ├─ PvPStakingFacet (core: create/join/resolve matches)
  └─ DiamondManagerFacet (add/remove facets)
  
  (Optional: Add game-specific facets)
  ├─ MyGameFacet (rock-paper-scissors logic)
  ├─ ChessGameFacet (chess AI + move validation)
  └─ ... (any game that needs staking)
```

All facets share `LibPvPStaking.storage()` for stake data.

## Core Concepts

### Match Lifecycle

```
Player1 calls createMatch(1 ETH)
  ↓ Contract holds 1 ETH
  
Player2 calls joinMatch()
  ↓ Contract holds 2 ETH total
  
(Game happens off-chain or on-chain)
  ↓
Owner calls resolveMatch(winner)
  ↓ Winner gets 2 ETH, contract empty
```

### Storage

```solidity
LibPvPStaking.Storage (shared by all facets):
  - matches: mapping(matchId → Match data)
  - nextMatchId: uint256
  - owner: address

Match:
  - player1: address
  - player2: address
  - stakeAmount: uint256
  - winner: address (address(0) = unresolved)
  - resolved: bool
```

## API

### PvPStakingFacet

```solidity
// Create 1v1 match (player1 posts stake)
uint256 matchId = diamond.createMatch{value: 1 ether}(1 ether);

// Join match (player2 posts stake)
diamond.joinMatch(matchId);

// Resolve match (owner/oracle determines winner)
diamond.resolveMatch(matchId, winnerAddress);

// Query match
(player1, player2, stakeAmount, winner, resolved) = diamond.getMatch(matchId);

// Withdraw unclaimed funds (owner only)
diamond.withdraw();
```

### DiamondManagerFacet

```solidity
// Add game-specific facet
bytes4[] memory selectors = [MyGame.play.selector, MyGame.claim.selector];
diamond.addFacet(myGameFacetAddress, selectors);

// Remove facet
bytes4[] memory selectors = [MyGame.play.selector];
diamond.removeFacet(selectors);

// Get facet address for function
address facet = diamond.facetAddress(bytes4 selector);

// Transfer ownership
diamond.transferOwnership(newOwner);

// Get owner
address owner = diamond.owner();
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
```

## Using with Games

### Example 1: Rock-Paper-Scissors

```solidity
// contracts/facets/RockPaperScissorsFacet.sol

import "../PvPStaking.sol";

contract RockPaperScissorsFacet {
    using LibPvPStaking for LibPvPStaking.Storage;

    enum Move { None, Rock, Paper, Scissors }

    struct GameState {
        bytes32 player1CommitHash;
        Move player1Move;
        Move player2Move;
    }

    mapping(uint256 => GameState) gameStates;

    // Commit phase (player1 commits hashed move)
    function commit(uint256 matchId, bytes32 commitHash) external {
        LibPvPStaking.Match storage match = LibPvPStaking.storage().matches[matchId];
        require(msg.sender == match.player1);
        gameStates[matchId].player1CommitHash = commitHash;
    }

    // Reveal phase (player2 moves, player1 reveals)
    function reveal(uint256 matchId, Move player1Move, bytes32 salt) external {
        LibPvPStaking.Match storage match = LibPvPStaking.storage().matches[matchId];
        require(msg.sender == match.player2);

        GameState storage state = gameStates[matchId];
        
        // Verify commit
        require(
            keccak256(abi.encode(player1Move, salt)) == state.player1CommitHash,
            "Invalid reveal"
        );

        // Determine winner
        Move player2Move = Move.Rock; // Simplified
        address winner = determineWinner(player1Move, player2Move);

        // Resolve via PvP facet
        // (Note: Need to expose resolveMatch or call separately)
    }

    function determineWinner(Move m1, Move m2) internal pure returns (address winner) {
        // RPS logic here
    }
}

// Deploy:
// RockPaperScissorsFacet rps = new RockPaperScissorsFacet();
// bytes4[] selectors = [RPS.commit.selector, RPS.reveal.selector];
// diamond.addFacet(address(rps), selectors);
```

### Example 2: Chess

```solidity
// contracts/facets/ChessFacet.sol

import "../PvPStaking.sol";

contract ChessFacet {
    using LibPvPStaking for LibPvPStaking.Storage;

    mapping(uint256 => bytes) boardStates;
    mapping(uint256 => address) currentPlayer;

    function makeMove(uint256 matchId, bytes calldata move) external {
        LibPvPStaking.Match storage match = LibPvPStaking.storage().matches[matchId];
        require(msg.sender == currentPlayer[matchId]);
        
        // Validate move against boardStates[matchId]
        // Update board
        // Check for checkmate
        // If game over: winner determined
    }
}
```

## Adding Facets (Step by Step)

1. **Create facet contract**:
   ```solidity
   contract MyGameFacet {
       using LibPvPStaking for LibPvPStaking.Storage;
       
       function play(uint256 matchId) external {
           LibPvPStaking.Match storage match = LibPvPStaking.storage().matches[matchId];
           // Your game logic
       }
   }
   ```

2. **Deploy facet**:
   ```bash
   forge create contracts/facets/MyGameFacet.sol
   ```

3. **Add to diamond** (owner only):
   ```solidity
   bytes4[] memory selectors = new bytes4[](1);
   selectors[0] = MyGameFacet.play.selector;
   
   IManageable(diamond).addFacet(facetAddress, selectors);
   ```

4. **Call game functions directly on diamond**:
   ```solidity
   // Diamond delegates to MyGameFacet
   diamond.play(matchId);
   ```

## Storage Safety

All facets access the same storage:

```solidity
LibPvPStaking.Storage storage s = LibPvPStaking.storage();
```

**Key guarantee**: Storage position is deterministic (keccak256 hash). No collisions.

**Safe to add facets**:
- ✅ New functions
- ✅ New facet storage (in facet, not LibPvPStaking)
- ✅ Read existing matches

**NOT safe**:
- ❌ Modify LibPvPStaking.Storage layout
- ❌ Delete existing structs

## Gas Efficiency

- **createMatch**: ~50k gas (store match + event)
- **joinMatch**: ~40k gas (update match)
- **resolveMatch**: ~20k gas (mark resolved) + **2 ETH transfer** (~2k)
- **getMatch**: 0 gas (view)

Total for 1v1 game: ~110k gas + transfers.

## Testing

```bash
# Run existing tests (GameEscrow)
forge test

# (No tests yet for PvP; add to test/PvPStaking.t.sol)
```

## Limitations & Trade-offs

| Feature | Limitation | Workaround |
|---------|-----------|-----------|
| Game logic | None (add facets) | Create custom facet |
| Oracle resolution | Owner-only resolve | Multi-sig or oracle service |
| Stake amounts | Per-match fixed | Design game for fixed stakes |
| Refunds | No forfeit after join | Resolve with player1 as "winner" |
| Dispute resolution | Not built in | Implement in game facet + governance |

## Extending

### Add Withdraw After Join (Forfeit)

```solidity
// In custom facet
function forfeit(uint256 matchId) external {
    LibPvPStaking.Match storage match = LibPvPStaking.storage().matches[matchId];
    require(msg.sender == match.player1 || msg.sender == match.player2);
    require(!match.resolved);
    
    // Return stake if not full
    if (match.player2 == address(0)) {
        // Only player1
        (bool success,) = msg.sender.call{value: match.stakeAmount}("");
        require(success);
    }
}
```

### Add Fee/House Cut

```solidity
// Modify PvPStakingFacet.resolveMatch()
uint256 houseFee = (match.stakeAmount * 2) / 100; // 1%
uint256 prize = (match.stakeAmount * 2) - houseFee;

(bool success,) = winner.call{value: prize}("");
require(success);

// House collects via withdraw()
```

## References

- [EIP-2535: Diamonds](https://eips.ethereum.org/EIPS/eip-2535)
- [Diamond GitHub](https://github.com/mudgen/diamond)
- Source: `/contracts/PvPStaking.sol`
