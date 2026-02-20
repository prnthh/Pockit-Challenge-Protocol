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
        this.contract = new ethers.Contract(contractAddress, contractABI, this.wallet);
    }

    async _tx(fn, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try { return await (await fn()).wait(); }
            catch (e) {
                if (e.code === 'CALL_EXCEPTION' || e.code === 'INVALID_ARGUMENT' || i === retries - 1) throw e;
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }

    // ── Write ──
    createGame(stakeAmount, maxPlayers = 0, whitelist = []) {
        return this._tx(() => this.contract.createGame(this.wallet.address, stakeAmount, maxPlayers, whitelist, { value: stakeAmount }));
    }
    joinGame(gameId, stakeAmount)          { return this._tx(() => this.contract.joinGame(gameId, { value: stakeAmount })); }
    startGame(gameId)                      { return this._tx(() => this.contract.startGame(gameId)); }
    resolveGame(gameId, losers, fee = 0)   { return this._tx(() => this.contract.resolveGame(gameId, losers, fee)); }
    setHouseFee(pct)                       { return this._tx(() => this.contract.setHouseFee(pct)); }
    withdraw()                             { return this._tx(() => this.contract.withdraw()); }

    // ── Read ──
    getGame(gameId) { return this.contract.getGame(gameId); }
    getBalance()    { return this.provider.getBalance(this.wallet.address); }

    async getGames({ governor = ethers.ZeroAddress, state = 'all', offset = 0n, limit = 50n } = {}) {
        const inc = s => state === 'all' || state === s;
        const ids = await this.contract.getGames(governor, inc('resolved'), inc('started'), inc('open'), offset, limit);
        return Promise.all(ids.map(async id => ({ id, ...await this.contract.getGame(id) })));
    }

    watchGames({ interval = 10000, ...query } = {}, callback) {
        let last = null, stopped = false;
        const poll = async () => {
            const games = await this.getGames(query).catch(() => null);
            if (games) {
                const json = JSON.stringify(games, (_, v) => typeof v === 'bigint' ? v.toString() : v);
                if (json !== last) { last = json; callback(games); }
            }
            if (!stopped) setTimeout(poll, interval);
        };
        poll();
        return () => { stopped = true; };
    }

    asGovernor(opts) { return new Governor(this, opts); }
}

class Governor {
    constructor(escrow, { fee = 0, gameLoop, onGameCreated, onPlayerJoined, onPlayerForfeited, onGameStarted, onGameResolved } = {}) {
        this.escrow = escrow;
        this.fee = fee;
        this.gameLoop = gameLoop;
        this.handlers = { GameCreated: onGameCreated, PlayerJoined: onPlayerJoined, PlayerForfeited: onPlayerForfeited, GameStarted: onGameStarted, GameResolved: onGameResolved };
        this.running = new Set();
        this.lastBlock = null;
    }

    startGame(gameId)                    { return this.escrow.startGame(gameId); }
    resolveGame(gameId, losers)          { return this.escrow.resolveGame(gameId, losers, this.fee); }
    getMyGames(opts)                     { return this.escrow.getGames({ governor: this.escrow.wallet.address, ...opts }); }

    async _processEvents(logs) {
        for (const log of logs) {
            try {
                const parsed = this.escrow.contract.interface.parseLog(log);
                if (!parsed) continue;
                const { name, args } = parsed;
                const gameId = args.gameId;
                const game = gameId !== undefined ? await this.escrow.contract.getGame(gameId) : undefined;

                await this.handlers[name]?.(gameId, game, args);

                if (name === 'GameStarted' && this.gameLoop && game.governor.toLowerCase() === this.escrow.wallet.address.toLowerCase()) {
                    if (game.state !== 2n && !this.running.has(`${gameId}`)) this._runLoop(gameId, game);
                }
            } catch (e) { console.error('[Governor] event error:', e); }
        }
    }

    _runLoop(gameId, game) {
        this.running.add(`${gameId}`);
        this.gameLoop(gameId, game, losers => this.resolveGame(gameId, losers))
            .catch(e => console.error(`[Governor] game ${gameId} error:`, e))
            .finally(() => this.running.delete(`${gameId}`));
    }

    async start(interval = 10000) {
        console.log(`[Governor] ${this.escrow.wallet.address}`);
        this.lastBlock = await this.escrow.provider.getBlockNumber();

        // Recover any started-but-unresolved games
        if (this.gameLoop) {
            const games = await this.getMyGames({ state: 'started' });
            games.filter(g => !this.running.has(`${g.id}`)).forEach(g => this._runLoop(g.id, g));
        }

        while (true) {
            try {
                const block = await this.escrow.provider.getBlockNumber();
                if (block > this.lastBlock) {
                    const logs = await this.escrow.provider.getLogs({ address: this.escrow.contract.target, fromBlock: this.lastBlock + 1n, toBlock: block });
                    if (logs.length) await this._processEvents(logs);
                    this.lastBlock = block;
                }
                console.log(`[Governor] block ${block}, balance ${ethers.formatEther(await this.escrow.getBalance())}`);
            } catch (e) { console.error('[Governor] loop error:', e); }
            await new Promise(r => setTimeout(r, interval));
        }
    }
}

export { EscrowClient, Governor };
export default EscrowClient;
