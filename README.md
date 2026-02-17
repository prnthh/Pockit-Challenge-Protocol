# Pockit Challenge Protocol

N-player escrow with a declared governor. Players see the governor before joining, stake ETH, and the governor resolves the game. Winners get paid out automatically.

## How It Works

1. Someone creates a game, picking a **governor** and a **stake amount**
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

// Read ops (use getContract() for anything else)
const game = await escrow.getGame(gameId);
const contract = escrow.getContract();
```

### Governor (Event-Driven)

For automated governors that need to react to on-chain events:

```javascript
const governor = escrow.asGovernor({
  fee: 2, // 2% governor fee

  onPlayerJoined: async (gameId, game, { player }) => {
    if (game.players.length === 2 && game.state === 0n) {
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
| `createGame(governor, stake, maxPlayers, whitelist)` | Anyone | Creates game, caller joins as first player |
| `joinGame(gameId)` | Anyone | Match stake to join |
| `forfeitGame(gameId)` | Player | Pre-start only, immediate refund |
| `startGame(gameId)` | Governor | Locks lobby |
| `resolveGame(gameId, losers[], govFee%)` | Governor | Atomic resolution + auto-payout |
| `getGame(gameId)` | Anyone | Full game state |

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

## Deployed Contracts

| Network | Address |
|---------|---------|
| ETH Mainnet | [`0xb8f26231ab263ed6c85f2a602a383d597936164b`](https://etherscan.io/address/0xb8f26231ab263ed6c85f2a602a383d597936164b) |
| Sepolia | [`0xdD8D06f2FFf260536ea4B8bcd34E06B03d5Af2D8`](https://sepolia.etherscan.io/address/0xdD8D06f2FFf260536ea4B8bcd34E06B03d5Af2D8) |

## License

MIT
