# Pockit Challenge Protocol

N-player escrow with a declared governor. Players see the governor before joining, stake ETH, and the governor resolves the game. Winners get paid out automatically. **Free games** (stake = 0) are also supported for cases where no money is at play.

## How It Works

1. Someone creates a game, picking a **governor** and a **stake amount** (can be `0` for free games)
2. Players see the governor address and join by matching the stake
3. Governor calls `startGame` to lock the lobby
4. Governor calls `resolveGame(losers[])` — contract pays out winners and governor automatically

## Install

```bash
npm install @pockit/challenge-protocol
```

## Usage

### SDK

```javascript
import { EscrowClient } from '@pockit/challenge-protocol';

const escrow = new EscrowClient({
  privateKey: process.env.PRIVATE_KEY,
  contractAddress: '0x...',
});

// Write ops (have retry logic)
await escrow.createGame(stakeAmount, maxPlayers, whitelist);
await escrow.joinGame(gameId, stakeAmount);
await escrow.startGame(gameId);
await escrow.resolveGame(gameId, [loserAddress], governorFeePercent);

// Query games
const openGames     = await escrow.getGames({ state: 'open' });
const myGames       = await escrow.getGames({ governor: myAddress });
const myStarted     = await escrow.getGames({ governor: myAddress, state: 'started' });
const pastGames     = await escrow.getGames({ governor: myAddress, state: 'resolved', limit: 20n });

// Watch for changes (polls every 10s, fires callback only when results change)
const stop = escrow.watchGames({ state: 'open', interval: 5000 }, (games) => {
  console.log('Open games updated:', games);
});
stop(); // cancel polling

// Free game (no stake)
await escrow.createGame(0n, 4); // 0 stake, up to 4 players

// Owner ops
await escrow.setHouseFee(5);   // 5%
await escrow.withdraw();

// Raw contract access for anything else
const contract = escrow.contract;
```

### Governor (Event-Driven)

For automated governors that need to react to on-chain events:

```javascript
const governor = escrow.asGovernor({
  fee: 2, // 2% governor fee (Number, 0–100)

  // gameId is always a BigInt; game.state is a Number (0 = Open, 1 = Started, 2 = Resolved)
  onPlayerJoined: async (gameId, game, { player }) => {
    if (game.players.length === 2 && game.state === 0) {
      await governor.startGame(gameId);
    }
  },

  gameLoop: async (gameId, game, resolve) => {
    const loser = game.players[Math.random() < 0.5 ? 0 : 1];
    await resolve([loser]); // atomic: marks losers + pays out winners
  },
});

governor.start(); // polls for events, recovers unresolved games on startup
```

### Direct Contract (ethers/viem)

```javascript
await contract.createGame(governorAddress, stakeAmount, maxPlayers, whitelist, { value: stakeAmount });
await contract.joinGame(gameId, { value: stakeAmount });
```

## Contract

### Lifecycle

| State | Value | Description |
|-------|-------|-------------|
| **Open** | 0 | Lobby open. Players join/forfeit. |
| **Started** | 1 | Lobby locked. Game in progress. |
| **Resolved** | 2 | Losers marked. Winners and governor paid out. |

### Functions

| Function | Who | What |
|----------|-----|------|
| `createGame(governor, stake, maxPlayers, whitelist)` | Anyone | Creates game, caller joins as first player. Stake can be `0` for free games. |
| `joinGame(gameId)` | Anyone | Match stake to join |
| `forfeitGame(gameId)` | Player | Pre-start only, immediate refund (no-op transfer for free games) |
| `startGame(gameId)` | Governor | Locks lobby |
| `resolveGame(gameId, losers[], govFee%)` | Governor | Atomic resolution + auto-payout |
| `getGame(gameId)` | Anyone | Full game state (normalized by SDK, see types below) |
| `getGames(governor, inclResolved, inclOngoing, inclOpen, offset, limit)` | Anyone | Filtered game list (pass `address(0)` for all governors) |
| `setHouseFee(percentage)` | Owner | Set house fee (default 0) |
| `withdraw()` | Owner | Withdraw accumulated house fees |

### SDK Types

The SDK normalizes raw contract return values into plain JS objects:

| Field | Type | Notes |
|-------|------|-------|
| `gameId` | `BigInt` | Passed to all callbacks |
| `game.state` | `Number` | `0` = Open, `1` = Started, `2` = Resolved |
| `game.stakeAmount` | `BigInt` | Wei — `0n` for free games |
| `game.maxPlayers` | `Number` | `0` = unlimited |
| `game.activePlayers` | `Number` | |
| `game.governor` | `string` | Address |
| `game.players` | `string[]` | |
| `fee` (Governor) | `Number` | Governor fee percentage, 0–100 |

### Events

```
GameCreated(gameId, creator, stakeAmount)
PlayerJoined(gameId, player)
PlayerForfeited(gameId, player)
GameStarted(gameId)
GameResolved(gameId, winners[], losers[])
```

### Prize Distribution

1. House fee → accumulated (owner withdraws separately)
2. Governor fee → sent to governor on resolve
3. Remainder → split equally among winners (sent on resolve)
4. No winners → governor gets remainder
5. Free games (stake = 0) → all fees and payouts are `0`, no ETH transfers occur

## Deployed Contracts

| Network | Address |
|---------|---------|
| ETH Mainnet | [`0xcbeb8fbbc2ca9afb908381f24ec4cea493b9482c`](https://etherscan.io/address/0xcbeb8fbbc2ca9afb908381f24ec4cea493b9482c) |
| Sepolia | [`0xA84Ba779A4Caeb2f5Cee0aE83e9f8D28298F1977`](https://sepolia.etherscan.io/address/0xA84Ba779A4Caeb2f5Cee0aE83e9f8D28298F1977) |

## License

MIT
