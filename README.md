# Pockit Challenge Protocol

A decentralized matchmaking and escrow system for blockchain-based competitive games. The protocol handles stake deposits, game governance, winner determination, and automatic prize distribution.

## Table of Contents

- [Overview](#overview)
- [Contract Features](#contract-features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Contract Details](#contract-details)
- [Deployed Contracts](#deployed-contracts)
- [API Reference](#api-reference)

## Overview

The GameEscrow contract provides a complete solution for managing competitive games with monetary stakes:

- **Escrow Management**: Securely holds player stakes during games
- **Flexible Governance**: Games can be governed by automated systems or human arbiters
- **Winner Determination**: Governors mark losers, and the contract automatically distributes prizes to winners
- **Fee System**: Supports both house fees and governor fees
- **Access Control**: Optional player whitelisting for private games
- **Forfeit Mechanism**: Players can forfeit before games start, with automatic refunds if all players forfeit

## Contract Features

### Core Functionality

1. **Game Creation**
   - Create games with custom stake amounts
   - Assign a governor (can be a smart contract or EOA)
   - Optional whitelist for private games
   - Creator automatically joins as first player

2. **Player Management**
   - Players join by matching the stake amount
   - Whitelist validation (if enabled)
   - Duplicate join prevention
   - Forfeit option before game starts

3. **Game Lifecycle**
   - **Not Started**: Waiting for players, forfeits allowed
   - **Ready**: Governor has started the game, no new players or forfeits
   - **Ongoing**: Game is being played/resolved
   - **Ended**: Winners paid out, game complete

4. **Prize Distribution**
   - House fee (set at contract deployment)
   - Governor fee (set when ending game)
   - Remaining prize split equally among winners
   - If no winners, governor receives all remaining funds

5. **Query Functions**
   - Get all not-started games
   - Get all ongoing games
   - Get games by governor (filtered by status)
   - Get full game details

## Installation

```bash
npm install @pockit/challenge-protocol
```

## Quick Start

### For Game Developers (Using the Governor Library)

```javascript
const Governor = require('@pockit/challenge-protocol');

const gov = new Governor({
  privateKey: 'your-governor-private-key',
  matchMakingContractAddress: '0xDefE687Cb741fFd583f70E9d5C5000da0c9710dF', // Sanko testnet
  fee: 5, // 5% governor fee
  gameHandler: async (gameId, wallet, contract, onGameHandled, onGameResolved) => {
    // Fetch game details
    const game = await contract.getGame(gameId);
    const players = game.players;

    // Wait for minimum players
    if (players.length < 2) {
      return;
    }

    // Mark game as ready to start
    await onGameHandled();

    // Your game logic here (e.g., run a coin flip, rock-paper-scissors, etc.)
    console.log(`Running game ${gameId} with ${players.length} players...`);

    // Simulate game - determine losers
    await new Promise(resolve => setTimeout(resolve, 10000));
    const loserIndex = Math.floor(Math.random() * players.length);
    const losers = [players[loserIndex]];

    console.log(`Game ${gameId} complete. Winners: ${players.filter((_, i) => i !== loserIndex).join(', ')}`);

    // Resolve game and distribute prizes
    await onGameResolved(losers);
  },
  providerUrl: 'https://sanko-arb-sepolia.rpc.caldera.xyz/http' // Sanko testnet
});

// Start polling for new games where you're the governor
gov.pollForNewGames();
```

### For Players (Direct Contract Interaction)

```javascript
const { ethers } = require('ethers');

const contractAddress = '0xDefE687Cb741fFd583f70E9d5C5000da0c9710dF';
const provider = new ethers.providers.JsonRpcProvider('https://sanko-arb-sepolia.rpc.caldera.xyz/http');
const wallet = new ethers.Wallet('your-private-key', provider);

// Create a game
const stakeAmount = ethers.utils.parseEther('0.1'); // 0.1 DMT
const governorAddress = '0xYourGovernorAddress'; // Or use an automated governor
const maxPlayers = 0; // 0 for unlimited, or set a specific number
const whitelist = []; // Empty array = public game, or add addresses for private game

const tx = await contract.createGame(governorAddress, stakeAmount, maxPlayers, whitelist, {
  value: stakeAmount
});
await tx.wait();

// Join an existing game
const gameId = 0; // Game ID to join
const gameInfo = await contract.getGame(gameId);
const joinTx = await contract.joinGame(gameId, {
  value: gameInfo.stakeAmount
});
await joinTx.wait();

// Forfeit a game (before it starts)
const forfeitTx = await contract.forfeitGame(gameId);
await forfeitTx.wait();
```

## Contract Details

### Game Struct

```solidity
struct Game {
    address governor;           // Who controls the game
    uint256 stakeAmount;       // Entry fee per player
    uint256 maxPlayers;        // Maximum players (0 = unlimited)
    bool isReady;              // Has game started?
    bool isEnded;              // Has game finished?
    address[] players;         // All players
    address[] losers;          // Players marked as losers
    address[] whitelist;       // Allowed players (empty = public)
    address[] forfeited;       // Players who forfeited
}
```

### Key Functions

#### `createGame(address governor, uint256 stakeAmount, uint256 maxPlayers, address[] whitelist)`
Creates a new game. Caller becomes the first player.

**Parameters:**
- `governor`: Address that will control game start/end
- `stakeAmount`: Entry fee in wei (must match msg.value)
- `maxPlayers`: Maximum number of players allowed (0 for unlimited)
- `whitelist`: Array of allowed players (empty for public games)

**Returns:** `uint256` - The new game ID

---

#### `joinGame(uint256 gameId)`
Join an existing game by matching the stake.

**Requirements:**
- Game not ended
- Game not started (not ready)
- Correct stake amount sent
- Not already joined
- On whitelist (if game is private)
- Game not full (if maxPlayers is set)

---

#### `forfeitGame(uint256 gameId)`
Forfeit before game starts. If all players forfeit, everyone is refunded.

**Requirements:**
- Game not started (not ready)
- Game not ended
- Caller is a player
- Haven't already forfeited

---

#### `setGameReady(uint256 gameId)`
Governor marks game as started. No more joins or forfeits allowed.

**Requirements:**
- Caller is governor
- Game not ended
- Game not already ready

---

#### `addLoser(uint256 gameId, address loser)`
Governor marks a player as a loser.

**Requirements:**
- Caller is governor
- Game is ready
- Game not ended
- Address is a player
- Not already marked as loser

---

#### `endGame(uint256 gameId, uint256 governorFeePercentage)`
Governor ends game and distributes prizes.

**Parameters:**
- `governorFeePercentage`: Fee for governor (0-100)

**Prize Distribution:**
1. House fee deducted (set at deployment)
2. Governor fee deducted
3. Remaining split equally among winners (players not marked as losers and who didn't forfeit)
4. If no winners, governor receives remaining funds

**Note:** Forfeited players are excluded from prize distribution even if they weren't marked as losers.

**Requirements:**
- Caller is governor
- Game is ready
- Game not ended
- Total fees ≤ 100%

---

#### `getGame(uint256 gameId)`
Returns complete game information.

**Returns:** `GameInfo` struct with all game details

---

#### `getGovernorGames(address governor, bool includeEnded, bool includeOngoing, bool includeNotStarted)`
Efficiently query games by governor.

**Parameters:**
- `governor`: Governor address to filter by
- `includeEnded`: Include completed games
- `includeOngoing`: Include ready but not ended games
- `includeNotStarted`: Include games waiting to start

**Returns:** `uint256[]` - Array of game IDs

---

#### `getNotStartedGames()`
Returns all games waiting to start (not ready, not ended).

**Returns:** `uint256[]` - Array of game IDs

---

#### `getOngoingGames()`
Returns all games in progress (ready but not ended).

**Returns:** `uint256[]` - Array of game IDs

---

### Events

```solidity
event GameCreated(uint256 indexed gameId, address creator, uint256 stakeAmount);
event PlayerJoined(uint256 indexed gameId, address player);
event GameReady(uint256 indexed gameId);
event LoserAdded(uint256 indexed gameId, address loser);
event PlayerForfeited(uint256 indexed gameId, address player);
event GameEnded(uint256 indexed gameId);
```

## Deployed Contracts

These contracts are live and can be used by anyone. The house fee is 2% for all deployed contracts.

| Network | Address | Block Explorer |
|---------|---------|----------------|
| Sanko Mainnet | `0xb8f26231ab263ed6c85f2a602a383d597936164b` | [View](https://explorer.sanko.xyz/address/0xb8f26231ab263ed6c85f2a602a383d597936164b) |
| Sanko Testnet | `0xDefE687Cb741fFd583f70E9d5C5000da0c9710dF` | [View](https://sanko-arb-sepolia.hub.caldera.xyz/address/0xDefE687Cb741fFd583f70E9d5C5000da0c9710dF) |
| Ethereum Mainnet | `0xd0cE8C6c7Ec2DB144d53ca8A4eb3Ce612F0BEA87` | [View](https://etherscan.io/address/0xd0cE8C6c7Ec2DB144d53ca8A4eb3Ce612F0BEA87) |

**Note:** Games using the global matchmaking contracts are featured on the [global leaderboard](https://pockit.gg).

## API Reference

### `Governor(options)`

Creates a new Governor instance for automated game management.

#### Options

- **`privateKey`** *(string, required)*: Ethereum private key for signing transactions
- **`matchMakingContractAddress`** *(string, required)*: Deployed contract address
- **`fee`** *(number, required)*: Governor fee percentage (0-100)
- **`gameHandler`** *(async function, required)*: Callback invoked for each game
  - **Parameters:**
    - `gameId` *(BigNumber)*: The game ID
    - `wallet` *(Wallet)*: Ethers wallet instance
    - `contract` *(Contract)*: Contract instance
    - `onGameHandled` *(async function)*: Call to mark game as ready
    - `onGameResolved` *(async function)*: Call with array of loser addresses
- **`providerUrl`** *(string, optional)*: RPC endpoint (default: `https://mainnet.sanko.xyz`)
- **`contractABI`** *(array, optional)*: Custom ABI (default: bundled ABI)

#### Methods

- **`pollForNewGames()`**: Start polling for games where you're the governor
- **`stop()`**: Stop polling

## Use Cases

### 1. Simple Coinflip Game
```javascript
gameHandler: async (gameId, wallet, contract, onGameHandled, onGameResolved) => {
  const game = await contract.getGame(gameId);
  if (game.players.length !== 2) return;

  await onGameHandled();

  // Random coinflip
  const loser = game.players[Math.random() < 0.5 ? 0 : 1];
  await onGameResolved([loser]);
}
```

### 2. Tournament (Last Person Standing)
```javascript
gameHandler: async (gameId, wallet, contract, onGameHandled, onGameResolved) => {
  const game = await contract.getGame(gameId);
  if (game.players.length < 8) return; // Wait for 8 players

  await onGameHandled();

  // Mark all but one player as losers
  const winnerIndex = Math.floor(Math.random() * game.players.length);
  const losers = game.players.filter((_, i) => i !== winnerIndex);

  await onGameResolved(losers);
}
```

### 3. Private Game with Whitelist and Max Players
```javascript
// Create a private game only certain players can join, with a max of 5 players
const whitelist = [
  '0xPlayer1Address',
  '0xPlayer2Address',
  '0xPlayer3Address'
];
const maxPlayers = 5; // Limit to 5 players

await contract.createGame(governorAddress, stakeAmount, maxPlayers, whitelist, {
  value: stakeAmount
});
```

## Gas Optimizations

The contract implements several gas optimization techniques:

1. **Storage Slot Packing**: Boolean flags (`isReady`, `isEnded`) are packed with the `governor` address in a single storage slot
2. **O(1) Lookups**: Uses mappings (`isPlayer`, `isLoser`, `isWhitelisted`, `hasForfeit`) for constant-time player checks
3. **Calldata Usage**: Whitelist parameter uses `calldata` instead of `memory` to save gas
4. **Unchecked Arithmetic**: Loop counters use `unchecked` blocks where overflow is impossible
5. **Cached Array Lengths**: Array lengths are cached in local variables during loops

## Security Considerations

1. **ReentrancyGuard**: All state-changing functions are protected against reentrancy attacks
2. **Governor Control**: Only the designated governor can start/end games and mark losers
3. **Fee Validation**: Total fees (house + governor) cannot exceed 100%
4. **Whitelist Enforcement**: Private games only allow whitelisted players
5. **Forfeit Safety**: Automatic refunds when all players forfeit prevent locked funds
6. **CEI Pattern**: Functions follow Checks-Effects-Interactions pattern to prevent reentrancy
7. **Forfeit Handling**: Forfeited players are properly excluded from prize distribution

## License

MIT

## Contributing

Contributions are welcome! Please submit pull requests or open issues on GitHub.

## Support

For questions or support, please visit [pockit.gg](https://pockit.gg) or open an issue on GitHub.
