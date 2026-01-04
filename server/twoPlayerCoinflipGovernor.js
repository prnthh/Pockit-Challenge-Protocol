// server/twoPlayerCoinflipGovernor.js
import Governor from '@pockit/challenge-protocol';
import dotenv from 'dotenv';

dotenv.config();

const twoPlayerCoinGovernor = new Governor({
  privateKey: process.env.governorPrivateKey,
  matchMakingContractAddress: process.env.matchmakingContractAddress,
  fee: 2,

  // Event handler: Called when a player joins
  onPlayerJoined: async (gameId, game, { player }) => {
    const activePlayers = game.players.filter(
      p => !game.forfeited.some(f => f.toLowerCase() === p.toLowerCase())
    );

    console.log(`[Game ${gameId}] Player ${player.slice(0, 6)}... joined (${activePlayers.length} active players)`);

    // Auto-start game when we have exactly 2 players
    if (activePlayers.length === 2 && !game.isReady) {
      console.log(`[Game ${gameId}] Starting 2-player coin flip`);
      await twoPlayerCoinGovernor.setGameReady(gameId);
    }
  },

  // Game loop: Automatically called when GameReady fires for your games
  gameLoop: async (gameId, game, onGameResolved) => {
    const activePlayers = game.players.filter(
      p => !game.forfeited.some(f => f.toLowerCase() === p.toLowerCase())
    );

    console.log(`[Game ${gameId}] Running 2-player coin flip...`);

    // Simple coin flip: random winner between the 2 players
    const loserIndex = Math.random() < 0.5 ? 0 : 1;
    const loser = activePlayers[loserIndex];
    const winner = activePlayers[1 - loserIndex];

    console.log(`[Game ${gameId}] Result - Winner: ${winner.slice(0, 6)}..., Loser: ${loser.slice(0, 6)}...`);

    // Resolve the game (calls addLoser + endGame)
    await onGameResolved([loser]);
  },

  providerUrl: process.env.PROVIDER_URL || 'https://mainnet.sanko.xyz',
});

// Start monitoring for events - automatically recovers unresolved games on startup
twoPlayerCoinGovernor.start();
