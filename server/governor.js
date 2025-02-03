import {ethers} from "ethers";
import dotenv from "dotenv";
import contractABI from "../contracts/abi.js";
dotenv.config();

const provider = new ethers.JsonRpcProvider("https://sanko-arb-sepolia.rpc.caldera.xyz/http");

class Governor {
    constructor(privateKey, matchMakingContractAddress, gameHandler) {
        this.handledGames = new Set();
        this.matchMakingContractAddress = matchMakingContractAddress;
        this.wallet = new ethers.Wallet(privateKey, provider);
        this.gameHandler = gameHandler;
    }
    
    async pollForNewGames() {
        console.log(`Governor Address: ${this.wallet.address}`);

        
        while (true) {
            const balance = await provider.getBalance(this.wallet.address);
            console.log(`Balance: ${ethers.formatEther(balance).toString()}`);
            console.log("Polling for new games...");

            try {
                const contract = new ethers.Contract(this.matchMakingContractAddress, contractABI, this.wallet);
                
                const gameIds = await contract.getNotStartedGames();
                for (const gameId of gameIds) {
                    if (this.handledGames.has(gameId)) continue;
                    
                    const game = await contract.getGame(gameId);

                    if (!game || game.isEnded) return; // Skip if the game doesn't exist or is already completed
                    
                    const governor = game.governor; // Extract the assigned governor
                    if (governor.toLowerCase() !== this.wallet.address.toLowerCase()) {
                        console.log(`Skipping game ${gameId}, not the assigned governor.`);
                        continue;
                    }
                    

                    this.gameHandler && await this.gameHandler(gameId, this.wallet, contract, 
                        async () => {
                            this.handledGames.add(gameId);
                        },
                        async (loser) => {
                        console.log("Marking loser...");
                        const loserTx = await contract.addLoser(gameId, loser);
                        await loserTx.wait();
                        
                        console.log("Ending game...");
                        const endTx = await contract.endGame(gameId);
                        await endTx.wait();
                        console.log("Game ended");
                    });
                }
            } catch (error) {
                console.error("Error polling games:", error);
            }
            
            await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds
        }
    }
}

export default Governor;