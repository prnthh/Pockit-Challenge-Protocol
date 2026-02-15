// server/coinFlipGovernor.js
import Governor from "@pockit/challenge-protocol";
import dotenv from "dotenv";

dotenv.config();

const coinGovernor = new Governor({
  privateKey: process.env.governorPrivateKey,
  matchMakingContractAddress: process.env.matchmakingContractAddress,
  fee: 2,
  providerUrl: process.env.PROVIDER_URL || "https://eth.llamarpc.com",

  // Event handler: When a player creates a game, governor auto-joins as opponent
  onGameCreated: async (gameId, game, { creator, stakeAmount }) => {
    console.log(`[Game ${gameId}] Created by ${creator} with stake ${coinGovernor.formatEther(stakeAmount)}`);

    // Don't join our own games
    if (creator.toLowerCase() === coinGovernor.wallet.address.toLowerCase()) {
      return;
    }

    console.log(`[Game ${gameId}] Auto-joining as opponent...`);
    await coinGovernor.joinGame(gameId, stakeAmount);
  },

  // Event handler: Start game when we have 2 players (creator + governor)
  onPlayerJoined: async (gameId, game, { player }) => {
    console.log(`[Game ${gameId}] Player ${player.slice(0, 6)}... joined (${game.players.length} total players)`);

    // Start when we have 2 players
    if (game.players.length === 2 && !game.isReady) {
      console.log(`[Game ${gameId}] Starting coin flip`);
      await coinGovernor.setGameReady(gameId);
    }
  },

  // Game loop: Runs the coin flip and resolves
  gameLoop: async (gameId, game, onGameResolved) => {
    const activePlayers = game.players.filter(
      p => !game.forfeited.some(f => f.toLowerCase() === p.toLowerCase())
    );

    console.log(`[Game ${gameId}] Running coin flip with ${activePlayers.length} players...`);

    // Coin flip: 50/50 chance
    const loserIndex = Math.random() < 0.5 ? 0 : 1;
    const loser = activePlayers[loserIndex];
    const winner = activePlayers[1 - loserIndex];

    console.log(`[Game ${gameId}] Result - Winner: ${winner.slice(0, 6)}..., Loser: ${loser.slice(0, 6)}...`);

    // Resolve the game (calls addLoser + endGame)
    await onGameResolved([loser]);
  },
});

// Start monitoring for events - automatically recovers unresolved games on startup
coinGovernor.start();
