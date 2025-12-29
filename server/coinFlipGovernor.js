// server/coinFlipGovernor.js
import Governor from "@pockit/challenge-protocol";
import dotenv from "dotenv";

dotenv.config();

const coinGovernor = new Governor({
  privateKey: process.env.governorPrivateKey,
  matchMakingContractAddress: process.env.matchmakingContractAddress,
  fee: 2,
  gameHandler: async (gameId, _wallet, contract, onGameHandled, onGameResolved) => {
    // Get current game state
    const game = await contract.getGame(gameId);
    const players = game.players;

    // Wait until we have at least 2 players
    if (players.length < 2) {
      console.log(`[Game ${gameId}] Waiting for more players (${players.length}/2)`);
      return;
    }

    console.log(`[Game ${gameId}] Starting with ${players.length} players`);

    // Mark game as ready
    await onGameHandled();

    // Simple coin flip: random winner
    const loserIndex = Math.random() < 0.5 ? 0 : 1;
    const loser = players[loserIndex];
    const winner = players[1 - loserIndex];

    console.log(`[Game ${gameId}] Coin flip result - Winner: ${winner.slice(0, 6)}..., Loser: ${loser.slice(0, 6)}...`);

    // Resolve the game with the loser
    // Note: Contract automatically handles forfeited players
    await onGameResolved([loser]);
  },
  providerUrl: process.env.PROVIDER_URL || "https://mainnet.sanko.xyz",
});

// Start polling for new games (default: latest 100 games)
coinGovernor.pollForNewGames().catch(console.error);
