const ethers = require("ethers");
const dotenv = require("dotenv");
const Governor = require("./governor");
dotenv.config();


const coinGovernor = new Governor(process.env.governorPrivateKey, 
    process.env.matchmakingContractAddress, 
    async (gameId, wallet, contract, onGameHandled, onGameResolved) => {
        let game = await contract.getGame(gameId);
        let players = game[4];

        // check conditions to start the game
        if (players.length >= 2) return;
        onGameHandled();
        
        if (!players.includes(wallet.address)) {
            console.log("Joining game as governor...");
            const joinTx = await contract.joinGame(gameId, { value: game[1] });
            await joinTx.wait();
            console.log("Governor joined the game");
        }
        
        game = await contract.getGame(gameId);
        players = game[4];
        
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


coinGovernor.pollForNewGames().catch(console.error);