// src/index.js
import { ethers } from "ethers";
import defaultABI from "../contracts/abi.js";

class EscrowClient {
    constructor({
        privateKey,
        contractAddress,
        providerUrl = "https://eth.llamarpc.com",
        contractABI = defaultABI,
    }) {
        if (!privateKey) throw new Error("Private key is required");
        this.provider = new ethers.JsonRpcProvider(providerUrl);
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this.contractAddress = contractAddress;
        this.contractABI = contractABI;
        this.contract = null;
    }

    getContract() {
        if (!this.contract) {
            if (!this.contractAddress) throw new Error("Contract address is not defined");
            this.contract = new ethers.Contract(this.contractAddress, this.contractABI, this.wallet);
        }
        return this.contract;
    }

    async retryTx(txFunction, maxRetries = 3, delayMs = 2000) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const tx = await txFunction();
                return await tx.wait();
            } catch (error) {
                // Don't retry deterministic failures
                if (error.code === 'CALL_EXCEPTION' || error.code === 'INVALID_ARGUMENT') throw error;
                if (attempt === maxRetries - 1) throw error;
                console.error(`Tx attempt ${attempt + 1}/${maxRetries} failed:`, error.message);
                await new Promise((r) => setTimeout(r, delayMs));
            }
        }
    }

    // ── Write ops ──

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

    async startGame(gameId) {
        const contract = this.getContract();
        return await this.retryTx(() => contract.startGame(gameId));
    }

    async resolveGame(gameId, losers, governorFee) {
        const contract = this.getContract();
        return await this.retryTx(() => contract.resolveGame(gameId, losers, governorFee));
    }

    // ── Read ops ──

    async getGame(gameId) {
        return await this.getContract().getGame(gameId);
    }

    async getBalance() {
        return await this.provider.getBalance(this.wallet.address);
    }

    // ── Declarative governor helper ──

    asGovernor({ fee = 0, gameLoop, onGameCreated, onPlayerJoined, onPlayerForfeited, onGameStarted, onGameResolved } = {}) {
        return new Governor({
            escrow: this,
            fee,
            gameLoop,
            onGameCreated,
            onPlayerJoined,
            onPlayerForfeited,
            onGameStarted,
            onGameResolved,
        });
    }

    // ── Helpers ──

    formatEther(value) { return ethers.formatEther(value); }
    parseEther(value) { return ethers.parseEther(value); }
}

class Governor {
    constructor({ escrow, fee = 0, gameLoop, onGameCreated, onPlayerJoined, onPlayerForfeited, onGameStarted, onGameResolved }) {
        this.escrow = escrow;
        this.fee = fee;
        this.gameLoop = gameLoop;
        this.runningGames = new Set();

        this.onGameCreated = onGameCreated;
        this.onPlayerJoined = onPlayerJoined;
        this.onPlayerForfeited = onPlayerForfeited;
        this.onGameStarted = onGameStarted;
        this.onGameResolved = onGameResolved;

        this.lastProcessedBlock = null;
    }

    // Governor actions (only these need to live on Governor)
    async startGame(gameId) { return this.escrow.startGame(gameId); }
    async resolveGame(gameId, losers, governorFee = this.fee) {
        return this.escrow.resolveGame(gameId, losers, governorFee);
    }

    // ── Event processing ──

    async scanForEvents(fromBlock, toBlock) {
        return await this.escrow.provider.getLogs({
            address: this.escrow.contractAddress,
            fromBlock,
            toBlock,
        });
    }

    async processEvents(logs) {
        const contract = this.escrow.getContract();

        for (const log of logs) {
            try {
                const parsed = contract.interface.parseLog(log);
                if (!parsed) continue;

                const { name, args } = parsed;
                let gameId, game;
                if (args.gameId !== undefined) {
                    gameId = args.gameId;
                    game = await contract.getGame(gameId);
                }

                switch (name) {
                    case 'GameCreated':
                        if (this.onGameCreated) {
                            await this.onGameCreated(gameId, game, { creator: args.creator, stakeAmount: args.stakeAmount });
                        }
                        break;

                    case 'PlayerJoined':
                        if (this.onPlayerJoined) {
                            await this.onPlayerJoined(gameId, game, { player: args.player });
                        }
                        break;

                    case 'PlayerForfeited':
                        if (this.onPlayerForfeited) {
                            await this.onPlayerForfeited(gameId, game, { player: args.player });
                        }
                        break;

                    case 'GameStarted':
                        if (this.onGameStarted) {
                            await this.onGameStarted(gameId, game);
                        }

                        // Auto-invoke gameLoop when we're the governor
                        if (this.gameLoop && game.governor.toLowerCase() === this.escrow.wallet.address.toLowerCase()) {
                            if (game.state === 2n) {
                                console.log(`[Governor] Game ${gameId} already resolved, skipping`);
                                break;
                            }
                            if (this.runningGames.has(gameId.toString())) {
                                console.log(`[Governor] Game ${gameId} already running, skipping`);
                                break;
                            }

                            this.runningGames.add(gameId.toString());
                            this._runGameLoop(gameId, game).catch(error => {
                                console.error(`[Governor] Game ${gameId} loop error:`, error);
                            }).finally(() => {
                                this.runningGames.delete(gameId.toString());
                            });
                        }
                        break;

                    case 'GameResolved':
                        if (this.onGameResolved) {
                            await this.onGameResolved(gameId, game, {
                                winners: args.winners,
                                losers: args.losers,
                            });
                        }
                        break;
                }
            } catch (error) {
                console.error(`[Governor] Error processing event:`, error);
            }
        }
    }

    async _runGameLoop(gameId, game) {
        console.log(`[Governor] Starting game loop for game ${gameId}`);
        try {
            // gameLoop receives (gameId, game, resolve)
            // resolve(losers) is the atomic resolution call
            await this.gameLoop(gameId, game, async (losers) => {
                await this.resolveGame(gameId, losers);
                console.log(`[Governor] Game ${gameId} resolved`);
            });
        } catch (error) {
            console.error(`[Governor] Error in game loop for game ${gameId}:`, error);
            throw error;
        }
    }

    // Recover games that are started but not resolved (crash recovery)
    async recoverUnresolvedGames() {
        if (!this.gameLoop) return;
        console.log(`[Governor] Scanning for unresolved games...`);

        try {
            const contract = this.escrow.getContract();
            const gameIds = await contract.getGames(this.escrow.wallet.address, false, true, false, 0n, 100n);
            console.log(`[Governor] Found ${gameIds.length} ongoing games`);

            for (const gameId of gameIds) {
                const game = await contract.getGame(gameId);
                if (game.state === 1n) {
                    if (this.runningGames.has(gameId.toString())) continue;
                    console.log(`[Governor] Recovering game ${gameId}`);
                    this.runningGames.add(gameId.toString());
                    this._runGameLoop(gameId, game).catch(error => {
                        console.error(`[Governor] Game ${gameId} recovery error:`, error);
                    }).finally(() => {
                        this.runningGames.delete(gameId.toString());
                    });
                }
            }
        } catch (error) {
            console.error('[Governor] Error during recovery:', error);
        }
    }

    async start(pollingIntervalMs = 10000) {
        console.log(`[Governor] Address: ${this.escrow.wallet.address}`);
        console.log(`[Governor] Monitoring events every ${pollingIntervalMs}ms`);

        const currentBlock = await this.escrow.provider.getBlockNumber();
        this.lastProcessedBlock = currentBlock;
        console.log(`[Governor] Starting from block ${currentBlock}`);

        await this.recoverUnresolvedGames();

        while (true) {
            try {
                const currentBlock = await this.escrow.provider.getBlockNumber();

                if (this.lastProcessedBlock < currentBlock) {
                    const logs = await this.scanForEvents(this.lastProcessedBlock + 1n, currentBlock);
                    if (logs.length > 0) {
                        console.log(`[Governor] 📡 Found ${logs.length} events in blocks ${this.lastProcessedBlock + 1n}-${currentBlock}`);
                        await this.processEvents(logs);
                    }
                    this.lastProcessedBlock = currentBlock;
                }

                const balance = await this.escrow.getBalance();
                console.log(`[Governor] Block: ${currentBlock}, Balance: ${ethers.formatEther(balance)}`);
            } catch (error) {
                console.error('[Governor] Error in monitoring loop:', error);
            }

            await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
        }
    }
}

export { EscrowClient, Governor };
export default EscrowClient;