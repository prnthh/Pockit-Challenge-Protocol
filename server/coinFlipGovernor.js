// server/coinFlipGovernor.js
import { EscrowClient } from "@pockit/challenge-protocol";
import dotenv from "dotenv";

dotenv.config();

const escrow = new EscrowClient({
  privateKey: process.env.governorPrivateKey,
  contractAddress: process.env.matchmakingContractAddress,
  providerUrl: process.env.PROVIDER_URL || "https://eth.llamarpc.com",
});

const governor = escrow.asGovernor({
  fee: 2,

  // Event handler: When a player creates a game, governor auto-joins as opponent
  onGameCreated: async (gameId, game, { creator, stakeAmount }) => {
    console.log(`[Game ${gameId}] Created by ${creator} with stake ${escrow.formatEther(stakeAmount)}`);

    // Don't join our own games
    if (creator.toLowerCase() === escrow.wallet.address.toLowerCase()) {
      return;
    }

    console.log(`[Game ${gameId}] Auto-joining as opponent...`);
    await escrow.joinGame(gameId, stakeAmount);
  },

  // Event handler: Start game when we have 2 players
  onPlayerJoined: async (gameId, game, { player }) => {
    console.log(`[Game ${gameId}] Player ${player.slice(0, 6)}... joined (${game.players.length} total players)`);

    if (game.players.length === 2 && game.state === 0n) {
      console.log(`[Game ${gameId}] Starting coin flip`);
      await governor.startGame(gameId);
    }
  },

  // Game loop: Runs the coin flip and resolves atomically
  gameLoop: async (gameId, game, resolve) => {
    const activePlayers = game.players.filter(
      p => !game.forfeited.some(f => f.toLowerCase() === p.toLowerCase())
    );

    console.log(`[Game ${gameId}] Running coin flip with ${activePlayers.length} players...`);

    // Coin flip: 50/50 chance
    const loserIndex = Math.random() < 0.5 ? 0 : 1;
    const loser = activePlayers[loserIndex];
    const winner = activePlayers[1 - loserIndex];

    console.log(`[Game ${gameId}] Result - Winner: ${winner.slice(0, 6)}..., Loser: ${loser.slice(0, 6)}...`);

    // Atomic resolve: single tx marks losers + computes claimable balances
    await resolve([loser]);
  },
});

// Start monitoring for events — automatically recovers unresolved games on startup
governor.start();
