// server/coinFlipGovernor.js
import Governor from "../index.js";

dotenv.config();

const coinGovernor = new Governor(
  process.env.governorPrivateKey,
  process.env.matchmakingContractAddress,
  2,
  async (gameId, wallet, contract, onGameHandled, onGameResolved) => {
    let game = await contract.getGame(gameId);
    let players = game.players;

    // Check conditions to start the game
    if (players.length >= 2) return;
    onGameHandled();

    if (!players.includes(wallet.address)) {
      console.log("Joining game as governor...");
      const joinTx = await contract.joinGame(gameId, { value: game.stakeAmount });
      await joinTx.wait();
      console.log("Governor joined the game");
    }

    game = await contract.getGame(gameId);
    players = game.players;

    console.log("Setting game ready...");
    const readyTx = await contract.setGameReady(gameId);
    await readyTx.wait();
    console.log("Game is ready");

    const result = Math.random() < 0.5;
    console.log("Flipping coin...", result);
    const loser = result ? players[0] : players[1];
    console.log(`Loser is: ${loser}`);

    onGameResolved(loser);
  }
);

coinGovernor.pollForNewGames().catch(console.error);