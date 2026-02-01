# PCP Demo Games

Sample implementations of games using the Pockit Challenge Protocol.

## Games

### 1. **CoinFlip** (`CoinFlip.tsx`)
Simplest possible game. Players join, protocol flips a coin, winner takes all.

**Features:**
- Auto-join when game created
- Instant resolution (no judgment needed)
- Good for learning the basic flow

### 2. **RockPaperScissors** (`RockPaperScissors.tsx`)
Classic RPS with on-chain commitment scheme.

**Features:**
- Secret reveal mechanic
- Deterministic winner calculation
- Two-phase resolution (commit → reveal)

### 3. **DrawAndJudge** (`DrawAndJudge.tsx`)
Drawing contest with AI judgment (PockitDraw simplified).

**Features:**
- Timed drawing phase (30s)
- AI judging via OpenAI API
- Visual comparison

### 4. **SimpleEscrow** (`SimpleEscrow.tsx`)
Minimal escrow setup: create game, add players, resolve manually.

**Features:**
- Manual winner selection UI
- Whitelist support
- Perfect for understanding contract lifecycle

## Usage

Each demo is a standalone React component. Import and use:

```tsx
import CoinFlip from './demos/CoinFlip'
import RockPaperScissors from './demos/RockPaperScissors'
import DrawAndJudge from './demos/DrawAndJudge'
import SimpleEscrow from './demos/SimpleEscrow'

// In your app:
<CoinFlip chainConfig={CHAIN_CONFIG} customChain={customChain} />
```

## Game Lifecycle Pattern

All demos follow the same PCP flow:

1. **Game Creation** → Governor creates game, receives gameId
2. **Player Join** → Players deposit stake, join via gameId
3. **Game Ready** → Governor marks game ready (both sides locked in)
4. **Resolution Logic** → Demo-specific judgment (AI, RNG, UI selection)
5. **Resolve** → addLoser() calls, endGame() finalizes, winners paid

## Governor Integration

Each demo can spawn a Governor instance to auto-handle games:

```tsx
// Coin flip governor
const gov = new Governor({
  privateKey: process.env.GOVERNOR_KEY,
  matchMakingContractAddress: chainConfig.contractAddress,
  gameLoop: async (gameId, game, onGameResolved) => {
    const loser = game.players[Math.random() < 0.5 ? 0 : 1];
    await onGameResolved([loser]);
  },
});
gov.start();
```

## Server-Side Examples

For production Governor instances, see `/Pockit-Challenge-Protocol/server/`:
- `coinFlipGovernor.js` — Coin flip server (auto-joins, auto-resolves)
- `twoPlayerCoinflipGovernor.js` — Advanced recovery + race condition handling

## Keys

- **Stake amounts**: Use testnet tokens (free from faucet)
- **Whitelist**: Leave empty for open games; provide addresses for restricted tournaments
- **Governor fee**: Typically 2-10% of winning pot
