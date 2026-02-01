# PCP Demos Integration Guide

## Quick Start

Import demos into your app:

```tsx
// src/components/demos/index.ts
export { default as CoinFlip } from './CoinFlip'
export { default as SimpleEscrow } from './SimpleEscrow'
export { default as RockPaperScissors } from './RockPaperScissors'
export { default as DrawAndJudge } from './DrawAndJudge'
```

Add to your main app view:

```tsx
import { CoinFlip, SimpleEscrow } from './components/demos'

export default function App() {
  return (
    <div>
      <CoinFlip 
        walletAddress={walletAddress}
        chainConfig={CHAIN_CONFIG}
        customChain={customChain}
      />
      <SimpleEscrow 
        walletAddress={walletAddress}
        chainConfig={CHAIN_CONFIG}
        customChain={customChain}
      />
    </div>
  )
}
```

## Demo Breakdown

### CoinFlip
**Purpose:** Learn the basic game lifecycle in 3 minutes.

**What it does:**
- Create a game → other player joins → governor flips coin → winner gets pot
- Everything automated; no manual steps
- Perfect for understanding event flow

**Key concepts:**
- `createGame()` with stake
- `joinGame()` with matching stake
- `setGameReady()` locks in players
- `addLoser()` + `endGame()` resolves with prize split

**Time to grok:** ~5 minutes

---

### SimpleEscrow
**Purpose:** Understand the manual control flow. Each step is explicit.

**What it does:**
- Create game → join → mark ready → manually select loser → distribute prize
- Log output shows every contract call
- Great for debugging

**Key concepts:**
- See exactly what each function does
- Understand state transitions (not ready → ready → ended)
- Learn how governor fee is calculated
- See addresses and amounts in real-time

**Time to grok:** ~15 minutes

---

### RockPaperScissors (coming)
**Purpose:** Learn commit-reveal pattern for off-chain secrets.

**What it does:**
- Players commit hash of (move + salt) → both reveal → determine winner
- Prevents front-running; real competitive game

**Key concepts:**
- Hashing secrets on-chain
- Two-phase resolution
- Tie handling

---

### DrawAndJudge (coming)
**Purpose:** Integrate AI judgment. PockitDraw simplified.

**What it does:**
- Timed drawing phase → upload images → AI judges → winner determined
- Full game loop with external API call

**Key concepts:**
- Storing drawing data (base64)
- AI integration with OpenAI
- Time-gated phases

---

## Testing Locally

1. **Set up testnet:**
   - Use Sanko testnet (free, fast)
   - Get faucet tokens from chain config link

2. **Create two wallet addresses:**
   - Use MetaMask / test wallet
   - Get tokens for both

3. **Test CoinFlip first:**
   - Create game as wallet 1
   - Switch to wallet 2, join game
   - Switch back, start → flip coin

4. **Move to SimpleEscrow:**
   - Follow step-by-step flow
   - Watch logs for transaction hashes
   - Verify on chain explorer

---

## Governor Automation (Server-Side)

For production, run a Governor instance:

```js
// server/myGameGovernor.js
import Governor from "@pockit/challenge-protocol";

const gov = new Governor({
  privateKey: process.env.GOVERNOR_KEY,
  matchMakingContractAddress: chainConfig.contractAddress,
  
  // Game-specific logic
  gameLoop: async (gameId, game, onGameResolved) => {
    console.log(`Game ${gameId} ready! Running game logic...`);
    
    // Your game simulation here
    const winner = determineWinner(game);
    const loser = game.players.find(p => p !== winner);
    
    // Resolve on-chain
    await onGameResolved([loser]);
  },
});

gov.start(); // Polls for new games, auto-runs gameLoop
```

See `/server/coinFlipGovernor.js` for a full example.

---

## Contract State Queries

To fetch active games and details:

```tsx
import { createPublicClient, http } from 'viem'
import contractABI from './challengeAbi'

const client = createPublicClient({
  chain: customChain,
  transport: http(),
})

// Get a specific game
const game = await client.readContract({
  address: chainConfig.contractAddress,
  abi: contractABI,
  functionName: 'getGame',
  args: [1n],
})

// Get not-started games (paginated)
const games = await client.readContract({
  address: chainConfig.contractAddress,
  abi: contractABI,
  functionName: 'getNotStartedGames',
  args: [0n, 100n], // offset, limit
})
```

---

## Common Patterns

### Creating a game with whitelist
```tsx
const whitelist = ['0xabc...', '0xdef...']
await writeToContract(
  chainConfig,
  customChain,
  'createGame',
  [myAddress, stakeAmount, maxPlayers, whitelist],
  stakeAmount
)
```

### Handling errors gracefully
```tsx
try {
  const tx = await writeToContract(...)
  addLog(`✅ Success: ${tx}`)
} catch (error) {
  if (error.message.includes('Game already started')) {
    addLog('❌ Game already started!')
  } else if (error.message.includes('Insufficient funds')) {
    addLog('❌ Not enough balance to join')
  } else {
    addLog(`❌ Error: ${error.message}`)
  }
}
```

### Waiting for confirmation
```tsx
// After writeToContract, wait 2 seconds for block confirmation
await new Promise(r => setTimeout(r, 2000))

// Then query the contract to get updated state
const updatedGame = await client.readContract(...)
```

---

## Next Steps

1. **Test locally:** Use CoinFlip + SimpleEscrow on testnet
2. **Build your game:** Copy SimpleEscrow pattern, add your logic
3. **Add Governor:** Deploy server instance that auto-resolves games
4. **Scale:** Monitor production Governor, handle crashes gracefully

See `/server/` for production examples.
