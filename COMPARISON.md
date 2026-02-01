# GameEscrow vs PvPStaking - Key Differences

## Summary

| Aspect | GameEscrow (contract.sol) | PvPStaking Diamond |
|--------|---------------------------|-------------------|
| **Structure** | Single monolithic contract | Modular facet system |
| **Players** | N-player (2+) per game | 1v1 only |
| **Game Flow** | Multi-phase (create→join→ready→losers→end) | Minimal (create→join→resolve) |
| **Governor** | Required, controls game | Not built-in (owner only) |
| **Whitelist** | Yes | No |
| **Forfeit** | Before game starts | Not in core (can add) |
| **Prize Logic** | Custom fee % per game, split winners | Fixed 2x stake to winner |
| **Extensibility** | Fixed functions | Add facets dynamically |
| **Code Size** | ~360 lines | ~260 lines core + facets |
| **Use Case** | Tournament platforms, multi-winner games | Game-specific PvP, fast iteration |

---

## GameEscrow (contract.sol)

**Design**: Centralized escrow for tournament-style games.

### Flow

```
Governor creates game (1 ETH stake, 4 max players)
  ↓
Players join one-by-one (all pay 1 ETH)
  ↓
Governor calls setGameReady()
  ↓
Governor marks losers: addLoser(player1), addLoser(player2)
  ↓
Governor ends game with fee %:
  endGame(gameId, 10%) 
  ↓
Winners split remaining pot
```

### Features

- **Multi-player**: 2+ per game (configurable max)
- **Whitelist**: Governor can restrict who joins
- **Forfeit**: Players can withdraw before game starts
- **Dynamic fees**: Governor sets fee % at end time
- **Winner split**: Multiple winners get equal share of prize pool
- **Stateful**: Game phases (not ready → ready → ended)

### Example Game

```solidity
// 4-player tournament, 1 ETH stakes
uint256 gameId = escrow.createGame(
    governor,      // Governor controls everything
    1 ether,       // Stake
    4,             // Max 4 players
    []             // No whitelist
);

// Players join
escrow.joinGame(gameId); // Player 1
escrow.joinGame(gameId); // Player 2
escrow.joinGame(gameId); // Player 3
escrow.joinGame(gameId); // Player 4

// Governor starts
escrow.setGameReady(gameId);

// (Game happens off-chain or verified on-chain)

// Governor marks losers
escrow.addLoser(gameId, player1);
escrow.addLoser(gameId, player2);

// Resolve: Players 3&4 are winners
// 4 ETH total - 10% fee (0.4 ETH) = 3.6 ETH split
// Each winner gets 1.8 ETH (1 ETH stake + 0.8 profit)
escrow.endGame(gameId, 10); // 10% fee
```

---

## PvPStaking Diamond

**Design**: Minimal 1v1 escrow as a composable facet layer.

### Flow

```
Player 1 creates match (1 ETH)
  ↓
Player 2 joins match (1 ETH)
  ↓
(Game contract enforces rules, calls resolveMatch)
  ↓
Owner calls resolveMatch(winner)
  ↓
Winner gets 2 ETH, contract empty
```

### Features

- **1v1 only**: Exactly 2 players per match
- **Minimal core**: Just stake holding + resolution
- **Facet composable**: Any game attaches as facet
- **Fixed payouts**: Winner always gets 2x stake
- **No phases**: Create → join → resolve
- **Extensible**: Add game-specific logic as facets

### Example: Rock-Paper-Scissors Facet

```solidity
contract RockPaperScissorsFacet {
    using LibPvPStaking for LibPvPStaking.StorageData;

    function commit(uint256 matchId, bytes32 commitHash) external {
        // Player 1 commits hashed move
    }

    function reveal(uint256 matchId, uint8 move, bytes32 salt) external {
        // Player 2 reveals, contract determines winner
        address winner = determineWinner(move1, move2);
        
        // Resolve stake via shared PvP layer
        PvPStakingFacet(address(this)).resolveMatch(
            matchId, 
            winner
        );
    }
}

// Deploy and attach
diamond.addFacet(rpsFacetAddress, [
    RockPaperScissorsFacet.commit.selector,
    RockPaperScissorsFacet.reveal.selector
]);
```

---

## Key Differences Explained

### 1. **Centralization vs Modularity**

**GameEscrow**: One contract, all logic inside.
```solidity
// Everything in GameEscrow
- createGame()
- joinGame()
- setGameReady()
- addLoser()
- endGame()
```

**PvPStaking**: Diamond proxy with pluggable facets.
```solidity
// Core staking in PvPStakingFacet
- createMatch()
- joinMatch()
- resolveMatch()

// Game logic in custom facets
- RockPaperScissorsFacet.commit()
- ChessFacet.move()
- DiceRollFacet.roll()
```

### 2. **Player Count**

**GameEscrow**: N-player (2, 3, 4, ... up to maxPlayers).
```solidity
escrow.createGame(governor, 1 ether, 4, []);
// Supports 2-4 players
```

**PvPStaking**: 1v1 only (exactly 2 players).
```solidity
pvp.createMatch(1 ether);
pvp.joinMatch(matchId);
// Player 1 & Player 2 only
```

### 3. **Game Control**

**GameEscrow**: Governor has absolute power.
- Decides when game starts (setGameReady)
- Decides who loses (addLoser)
- Decides fee at end time (endGame)
- Can whitelist players

**PvPStaking**: Owner is minimal (just resolves).
- No game control
- Owner calls resolveMatch(winner) after game logic decides
- Game facet determines winner, not owner

### 4. **Prize Distribution**

**GameEscrow**: Dynamic, split among winners.
```solidity
// Example: 4 players, 1 ETH each = 4 ETH pot
// 10% fee = 0.4 ETH house, 3.6 ETH to winners
// If 2 winners: each gets 1.8 ETH

endGame(gameId, 10); // 10% fee
// Winners determined by who's NOT in losers[] array
```

**PvPStaking**: Fixed double-or-nothing.
```solidity
// Example: 2 players, 1 ETH each = 2 ETH pot
// No fees built-in
// Winner gets exactly 2 ETH

resolveMatch(matchId, winner);
// Winner gets (stake * 2) always
```

### 5. **Extensibility**

**GameEscrow**: Locked in place.
- To add new features: fork contract or deploy new version
- No way to add features without redeploying
- All games use same logic

**PvPStaking**: Attach new facets any time.
```solidity
// Add Rock-Paper-Scissors
diamond.addFacet(rpsAddress, selectors);

// Add Chess
diamond.addFacet(chessAddress, selectors);

// Add Dice
diamond.addFacet(diceAddress, selectors);

// All use same PvPStakingFacet layer
```

### 6. **Code Organization**

**GameEscrow**:
```
contracts/contract.sol (360 lines)
├─ createGame()
├─ joinGame()
├─ setGameReady()
├─ addLoser()
├─ endGame()
├─ forfeitGame()
├─ withdraw()
└─ queries
```

**PvPStaking**:
```
contracts/PvPStaking.sol (260 lines)
├─ LibPvPStaking (storage)
├─ PvPStakingFacet (core: create/join/resolve)
├─ LibDiamond (router)
├─ Diamond (proxy)
└─ DiamondManagerFacet (add/remove)

contracts/facets/RockPaperScissors.sol (custom)
contracts/facets/Chess.sol (custom)
contracts/facets/Dice.sol (custom)
```

---

## When to Use Each

### Use GameEscrow When:

- ✅ Multi-player tournaments (3+ players)
- ✅ Governor-controlled games
- ✅ Need whitelisting
- ✅ Variable player counts per game
- ✅ Complex prize splits (multiple winners)
- ✅ Forfeit before game starts is needed
- ✅ One contract, one game type

**Example**: Poker tournament, 4 players, 10 ETH buy-in, governor runs the table.

### Use PvPStaking When:

- ✅ 1v1 competitive games
- ✅ Minimal escrow layer (games control logic)
- ✅ Fast iteration (add facets without redeploying)
- ✅ Multiple game types on same diamond
- ✅ Owner just resolves, game determines winner
- ✅ Fixed double-or-nothing stakes
- ✅ Modular, composable architecture

**Example**: Rock-paper-scissors, chess, dice roll—all on one diamond, each as a facet.

---

## Migration Path (If Needed)

If you start with GameEscrow but want PvP modularity:

1. **Create PvPStakingFacet** for 1v1 matches
2. **Wrap GameEscrow logic** in a facet (optional)
3. **Deploy Diamond** with both facets
4. **Route new 1v1 games** to PvPStaking
5. **Route tournaments** to GameEscrow facet (if wrapped)

Or: **Replace entirely** if only doing 1v1.

---

## Summary

- **GameEscrow**: Monolithic, tournament-oriented, governor-driven
- **PvPStaking**: Modular, 1v1-focused, game-driven

**Pick GameEscrow** if you're building a centralized game platform with multiple players and governors.

**Pick PvPStaking** if you're building composable games where each game is a facet and players control outcomes via game logic.

**Use both** if you need both use cases.
