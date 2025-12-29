// server/twoPlayerCoinflipGovernor.js (user-adapted)
import Governor from '@pockit/challenge-protocol';

const twoPlayerCoinGovernor = new Governor({
  privateKey: 'your-governor-private-key',
  matchMakingContractAddress: '0xYourContractAddress',
  fee: 2,
  gameHandler: async (gameId, _wallet, contract, onGameHandled, onGameResolved) => {
    // Get current game state
    const game = await contract.getGame(gameId);
    const players = game.players;

    // Wait until we have exactly 2 players
    if (players.length < 2) {
      console.log(`[Game ${gameId}] Waiting for 2 players (${players.length}/2)`);
      return;
    }

    console.log(`[Game ${gameId}] Starting 2-player coin flip`);

    // Mark game as ready/handled
    await onGameHandled();

    // Simple coin flip: random winner between the 2 players
    const loserIndex = Math.random() < 0.5 ? 0 : 1;
    const loser = players[loserIndex];
    const winner = players[1 - loserIndex];

    console.log(`[Game ${gameId}] Result - Winner: ${winner.slice(0, 6)}..., Loser: ${loser.slice(0, 6)}...`);

    // Resolve the game
    // Note: Contract automatically excludes forfeited players
    await onGameResolved([loser]);

    console.log(`[Game ${gameId}] Game resolved successfully`);
  },
  providerUrl: 'https://mainnet.sanko.xyz', // or your RPC URL
});

// Start polling for new games
twoPlayerCoinGovernor.pollForNewGames().catch(console.error);
