// src/index.js
import { ethers } from "ethers";
import defaultABI from "../contracts/abi.js";

class Governor {
    constructor({
        privateKey,
        matchMakingContractAddress,
        fee,
        gameHandler,
        providerUrl = "https://mainnet.sanko.xyz",
        contractABI = defaultABI,
    }) {
        if (!privateKey) {
            throw new Error("Private key is required to create a wallet");
        }
        
        this.provider = new ethers.JsonRpcProvider(providerUrl);
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this.matchMakingContractAddress = matchMakingContractAddress;
        this.fee = fee;
        this.gameHandler = gameHandler;
        this.contractABI = contractABI;
        this.activeGames = new Map();
        this.balance = 0;
    }
    
    async retryTx(txFunction, maxRetries = 5, delayMs = 2000) {
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                const tx = await txFunction();
                await tx.wait();
                return;
            } catch (error) {
                console.error(`Transaction failed, attempt ${attempt + 1}:`, error);
                attempt++;
                if (attempt >= maxRetries) {
                    throw new Error(`Failed after ${maxRetries} attempts`);
                }
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }
    
    async resolveGame(gameId, losers, contract) {
        try {
            for (const loser of losers) {
                await this.retryTx(() => contract.addLoser(gameId, loser));
            }
            await this.retryTx(() => contract.endGame(gameId, this.fee));
            console.log(`[PCP] Game ${gameId} has been finalized.`);
        } catch (error) {
            console.error(`Error resolving game ${gameId}:`, error);
            throw error;
        }
    }
    
    async readyUpGame(gameId, contract) {
        try {
            await this.retryTx(() => contract.setGameReady(gameId));
            console.log(`[PCP] Game ${gameId} is now being handled.`);
        } catch (error) {
            console.error(`Error marking game ${gameId} as handled:`, error);
            throw error;
        }
    }
    
    async pollForNewGames(pollingIntervalMs = 5000) {
        console.log(`[PCP] Governor Address: ${this.wallet.address}`);
        
        while (true) {
            try {
                const nowBalance = await this.provider.getBalance(this.wallet.address);
                if (nowBalance !== this.balance) {
                    this.balance = nowBalance;
                    console.log(`[PCP] Balance: ${ethers.formatEther(this.balance)}`);
                }
                
                if (!this.matchMakingContractAddress) {
                    throw new Error("MatchMaking contract address is not defined");
                }
                
                const contract = new ethers.Contract(
                    this.matchMakingContractAddress,
                    this.contractABI,
                    this.wallet
                );
                
                const gameIds = await contract.getNotStartedGames(0, 100);
                
                for (const gameId of gameIds) {
                    const game = await contract.getGame(gameId);
                    if (!game || game.isEnded) continue;
                    
                    if (
                        game.governor.toLowerCase() !== this.wallet.address.toLowerCase()
                    ) {
                        console.log(`[PCP] Skipping game ${gameId} (not the assigned governor).`);
                        continue;
                    }
                    
                    if (this.activeGames.has(gameId)) continue;
                    
                    const handlePromise = this.gameHandler(
                        gameId,
                        this.wallet,
                        contract,
                        () => this.readyUpGame(gameId, contract),
                        (losers) => this.resolveGame(gameId, losers, contract)
                    )
                    .catch((error) => {
                        console.error(`Error handling game ${gameId}:`, error);
                    })
                    .finally(() => {
                        this.activeGames.delete(gameId);
                    });
                    
                    this.activeGames.set(gameId, handlePromise);
                }
            } catch (error) {
                console.error("Error polling games:", error);
            }
            
            await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
        }
    }
}

export default Governor;