# Sample Games

Numbered game contracts demonstrating GameEscrow composition patterns.

## Games

### 01_RockPaperScissors.sol
Classic RPS with commit-reveal. Winner takes pot, draw splits evenly.

**Mechanics:**
- Commit hashed move: `keccak256(abi.encodePacked(move, salt))`
- Both players reveal
- Resolve: Rock beats Scissors, Paper beats Rock, Scissors beats Paper

### 02_CoinFlip.sol
50/50 coin flip with strategic twist. XOR of reveals determines outcome.

**Mechanics:**
- Commit choice (heads/tails)
- Reveal both
- If both pick same → split pot (penalty for coordination)
- If different → XOR result determines winner

### 03_HighLow.sol
Predict if random number exceeds threshold.

**Mechanics:**
- Predictor sets threshold (0-100) and predicts high/low
- Challenger joins
- Block hash randomness generates result
- Winner determined by prediction accuracy

**Note:** Block hash randomness is simple but not production-grade. Use VRF for real games.

### 04_LastStanding.sol
N-player elimination game. Governor marks losers until one remains.

**Mechanics:**
- 3+ players join with equal stakes
- Governor eliminates players each round
- Last player standing wins entire pot

**Use case:** Tournament brackets, battle royale formats

### 05_Auction.sol
Sealed-bid Vickrey auction (second-price).

**Mechanics:**
- Bidders commit hashed bids
- All reveal
- Highest bidder wins, pays second-highest price
- Losers get entry fee refunded (or split remaining pot)

**Economic property:** Incentivizes truthful bidding

---

## Patterns Demonstrated

1. **Commit-Reveal** (01, 02, 05): Prevents frontrunning
2. **Block-based randomness** (03): Simple but weak RNG
3. **Progressive resolution** (04): Multi-round elimination
4. **Game theory** (05): Vickrey auction mechanism
5. **Variable payouts** (all): Winners/losers determined by game logic

## Adding New Games

1. Create `contracts/sampleGames/0X_GameName.sol`
2. Import `GameEscrowV2.sol`
3. Implement:
   - Match creation via `escrow.createMatch()`
   - Game-specific logic
   - Resolution via `escrow.resolveMatch()`
4. Emit events for indexing/UI
5. Test with Foundry

## Security Notes

- All games use GameEscrow for fund custody
- Commit-reveal prevents frontrunning
- House fee automatically deducted
- Pull-based withdrawals (gas griefing resistant)
- Approved game contracts only (whitelisted by owner)
