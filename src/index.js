// src/index.js
import { ethers } from "ethers";
import defaultABI from "../contracts/abi.js";

class Governor {
    constructor({
        privateKey,
        matchMakingContractAddress,
        fee,
        providerUrl = "https://eth.llamarpc.com",
        contractABI = defaultABI,
        // Event handlers - one per contract event
        onGameCreated,
        onPlayerJoined,
        onPlayerForfeited,
        onGameReady,
        onLoserAdded,
        onGameEnded,
        // Game loop handler - called automatically when GameReady fires for your games
        gameLoop,
    }) {
        if (!privateKey) {
            throw new Error("Private key is required to create a wallet");
        }

        this.provider = new ethers.JsonRpcProvider(providerUrl);
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this.contractAddress = matchMakingContractAddress;
        this.fee = fee;

        this.contractABI = contractABI;
        this.contract = null;
        this.lastProcessedBlock = null;
        this.runningGames = new Set(); // Track games currently being processed in this instance

        // Event handlers
        this.onGameCreated = onGameCreated;
        this.onPlayerJoined = onPlayerJoined;
        this.onPlayerForfeited = onPlayerForfeited;
        this.onGameReady = onGameReady;
        this.onLoserAdded = onLoserAdded;
        this.onGameEnded = onGameEnded;
        this.gameLoop = gameLoop;
    }

    getContract() {
        if (!this.contract) {
            if (!this.contractAddress) {
                throw new Error("MatchMaking contract address is not defined");
            }
            this.contract = new ethers.Contract(
                this.contractAddress,
                this.contractABI,
                this.wallet
            );
        }
        return this.contract;
    }

    async getBalance() {
        return await this.provider.getBalance(this.wallet.address);
    }

    async retryTx(txFunction, maxRetries = 5, delayMs = 2000) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const tx = await txFunction();
                const receipt = await tx.wait();
                return receipt;
            } catch (error) {
                console.error(`Transaction failed, attempt ${attempt + 1}:`, error);
                if (attempt === maxRetries - 1) {
                    throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
                }
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }

    // Core write operations
    async createGame(stakeAmount, maxPlayers = 100, whitelist = []) {
        const contract = this.getContract();
        return await this.retryTx(() =>
            contract.createGame(this.wallet.address, stakeAmount, maxPlayers, whitelist, { value: stakeAmount })
        );
    }

    async joinGame(gameId, stakeAmount) {
        const contract = this.getContract();
        return await this.retryTx(() => contract.joinGame(gameId, { value: stakeAmount }));
    }

    async setGameReady(gameId) {
        const contract = this.getContract();
        return await this.retryTx(() => contract.setGameReady(gameId));
    }

    async addLoser(gameId, loser) {
        const contract = this.getContract();
        return await this.retryTx(() => contract.addLoser(gameId, loser));
    }

    async endGame(gameId, governorFee = this.fee) {
        const contract = this.getContract();
        return await this.retryTx(() => contract.endGame(gameId, governorFee));
    }

    // Core read operations
    async getGame(gameId) {
        const contract = this.getContract();
        return await contract.getGame(gameId);
    }

    async getNotStartedGames(offset = 0n, limit = 100n) {
        const contract = this.getContract();
        return await contract.getNotStartedGames(offset, limit);
    }

    async getGovernorGames(includeEnded = false, includeOngoing = true, includeNotStarted = true, offset = 0n, limit = 100n) {
        const contract = this.getContract();
        return await contract.getGovernorGames(
            this.wallet.address,
            includeEnded,
            includeOngoing,
            includeNotStarted,
            offset,
            limit
        );
    }

    async getNextGameId() {
        const contract = this.getContract();
        return await contract.nextGameId();
    }

    async getCurrentBlock() {
        return await this.provider.getBlockNumber();
    }

    async scanForEvents(fromBlock, toBlock) {
        const logs = await this.provider.getLogs({
            address: this.contractAddress,
            fromBlock,
            toBlock,
        });
        return logs;
    }

    async processEvents(logs) {
        const contract = this.getContract();

        for (const log of logs) {
            try {
                const parsed = contract.interface.parseLog(log);
                if (!parsed) continue;

                const { name, args } = parsed;

                // Fetch game data for events that need it
                let gameId, game;
                if (args.gameId !== undefined) {
                    gameId = args.gameId;
                    game = await this.getGame(gameId);
                }

                // Call appropriate handler based on event type
                switch (name) {
                    case 'GameCreated':
                        if (this.onGameCreated) {
                            await this.onGameCreated(gameId, game, {
                                creator: args.creator,
                                stakeAmount: args.stakeAmount,
                            });
                        }
                        break;

                    case 'PlayerJoined':
                        if (this.onPlayerJoined) {
                            await this.onPlayerJoined(gameId, game, {
                                player: args.player,
                            });
                        }
                        break;

                    case 'PlayerForfeited':
                        if (this.onPlayerForfeited) {
                            await this.onPlayerForfeited(gameId, game, {
                                player: args.player,
                            });
                        }
                        break;

                    case 'GameReady':
                        // Call notification handler (sync/lightweight)
                        if (this.onGameReady) {
                            await this.onGameReady(gameId, game);
                        }

                        // Auto-invoke gameLoop for games where we're the governor
                        if (this.gameLoop && game.governor.toLowerCase() === this.wallet.address.toLowerCase()) {
                            // Skip if game is already ended (handles restart scenarios)
                            if (game.isEnded) {
                                console.log(`[Governor] Game ${gameId} is already ended, skipping game loop`);
                                break;
                            }

                            // // Skip if game has losers (game resolution is in progress or complete)
                            // if (game.losers && game.losers.length > 0) {
                            //     console.log(`[Governor] Game ${gameId} already has losers, skipping game loop`);
                            //     break;
                            // }

                            // Check if game is currently being processed in this instance (prevent race conditions)
                            if (this.runningGames.has(gameId.toString())) {
                                console.log(`[Governor] Game ${gameId} is already being processed in this instance, skipping`);
                                break;
                            }

                            // Mark as running in this instance
                            this.runningGames.add(gameId.toString());

                            // Run game loop in background (non-blocking)
                            this._runGameLoop(gameId, game).catch(error => {
                                console.error(`[Governor] Game ${gameId} loop error:`, error);
                            }).finally(() => {
                                // Clean up after game completes or errors
                                this.runningGames.delete(gameId.toString());
                            });
                        }
                        break;

                    case 'LoserAdded':
                        if (this.onLoserAdded) {
                            await this.onLoserAdded(gameId, game, {
                                loser: args.loser,
                            });
                        }
                        break;

                    case 'GameEnded':
                        if (this.onGameEnded) {
                            await this.onGameEnded(gameId, game);
                        }
                        break;
                }
            } catch (error) {
                console.error(`[Governor] Error processing event:`, error);
            }
        }
    }

    // Internal method to run the game loop callback
    async _runGameLoop(gameId, game) {
        console.log(`[Governor] Starting game loop for game ${gameId}`);

        try {
            // Call the user's game loop with a helper to resolve the game
            await this.gameLoop(gameId, game, async (losers) => {
                // This is the callback the user calls when ready to resolve
                await this.resolveGame(gameId, losers);
            });
        } catch (error) {
            console.error(`[Governor] Error in game loop for game ${gameId}:`, error);
            throw error;
        }
    }

    // Scan for games that need their loop restarted (on server startup)
    async recoverUnresolvedGames() {
        if (!this.gameLoop) {
            return; // No game loop configured, skip recovery
        }

        console.log(`[Governor] Scanning for unresolved games...`);

        try {
            // Get all ongoing games where we're the governor
            const gameIds = await this.getGovernorGames(
                false,  // includeEnded
                true,   // includeOngoing
                false,  // includeNotStarted
                0n,
                100n
            );

            console.log(`[Governor] Found ${gameIds.length} ongoing games`);

            for (const gameId of gameIds) {
                const game = await this.getGame(gameId);

                // Only recover games that are ready but not resolved
                if (game.isReady && !game.isEnded && (!game.losers || game.losers.length === 0)) {
                    console.log(`[Governor] Recovering game ${gameId} - restarting game loop`);

                    // Check if already running
                    if (this.runningGames.has(gameId.toString())) {
                        console.log(`[Governor] Game ${gameId} is already running, skipping`);
                        continue;
                    }

                    // Mark as running
                    this.runningGames.add(gameId.toString());

                    // Restart the game loop
                    this._runGameLoop(gameId, game).catch(error => {
                        console.error(`[Governor] Game ${gameId} recovery error:`, error);
                    }).finally(() => {
                        this.runningGames.delete(gameId.toString());
                    });
                }
            }
        } catch (error) {
            console.error('[Governor] Error during game recovery:', error);
        }
    }

    async start(pollingIntervalMs = 10000) {
        console.log(`[Governor] Address: ${this.wallet.address}`);
        console.log(`[Governor] Monitoring events every ${pollingIntervalMs}ms`);

        // Initialize with current block
        const currentBlock = await this.getCurrentBlock();
        this.lastProcessedBlock = currentBlock;
        console.log(`[Governor] Starting from block ${currentBlock}`);

        // Recover any unresolved games from contract state (handles crash scenarios)
        await this.recoverUnresolvedGames();

        // Start monitoring loop
        while (true) {
            try {
                const currentBlock = await this.getCurrentBlock();

                if (this.lastProcessedBlock < currentBlock) {
                    const logs = await this.scanForEvents(this.lastProcessedBlock + 1n, currentBlock);

                    if (logs.length > 0) {
                        console.log(`[Governor] 📡 Found ${logs.length} events in blocks ${this.lastProcessedBlock + 1n}-${currentBlock}`);
                        await this.processEvents(logs);
                    }

                    this.lastProcessedBlock = currentBlock;
                }

                // Log balance periodically
                const balance = await this.getBalance();
                console.log(`[Governor] Block: ${currentBlock}, Balance: ${this.formatEther(balance)}`);
            } catch (error) {
                console.error('[Governor] Error in monitoring loop:', error);
            }

            await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
        }
    }

    // Helper to resolve game with losers
    async resolveGame(gameId, losers) {
        for (const loser of losers) {
            await this.addLoser(gameId, loser);
        }
        await this.endGame(gameId);
        console.log(`[Governor] Game ${gameId} has been finalized`);
    }

    // Helper: Format ethers values for display
    formatEther(value) {
        return ethers.formatEther(value);
    }

    parseEther(value) {
        return ethers.parseEther(value);
    }
}

export default Governor;
