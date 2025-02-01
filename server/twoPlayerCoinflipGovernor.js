const ethers = require("ethers");
const dotenv = require("dotenv");
const Governor = require("./governor");
dotenv.config();

const twoPlayerCoinGovernor = new Governor(
    process.env.governorPrivateKey,
    process.env.matchmakingContractAddress,
    async (gameId, wallet, contract, onGameHandled, onGameResolved) => {
        let game = await contract.getGame(gameId);
        let players = game[4];

        // Wait until there are exactly two players in the game
        if (players.length < 2) {
            console.log("Waiting for another player to join...");
            return;
        }

        onGameHandled();

        console.log("Setting game ready...");
        const readyTx = await contract.setGameReady(gameId);
        await readyTx.wait();
        console.log("Game is ready");

        console.log("Flipping coin...", players);
        const loser = Math.random() < 0.5 ? players[0] : players[1];
        console.log(`Loser is: ${loser}`);

        onGameResolved(loser);
    }
);

twoPlayerCoinGovernor.pollForNewGames().catch(console.error);