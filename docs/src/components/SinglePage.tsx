import { useState, useEffect, useRef } from 'react'
import { parseEther, formatEther, createPublicClient, http, getAddress } from 'viem'
import { CHAINS, writeToContract, contractABI } from '../App'
import type { ChainKey, Game, GameInfo } from '../App'

const PAGE_SIZE = 50n

// Game Header Component
function GameHeader({ gameId, governor, stake, currencySymbol }: {
    gameId: bigint
    governor: string
    stake: bigint
    currencySymbol: string
}) {
    return (
        <div className="mb-2">
            <div className="font-heading text-lg text-ink">Game #{gameId.toString()}</div>
            <small className="text-muted text-xs">Governor: {governor.slice(0, 6)}...{governor.slice(-4)}</small>
            <div className="text-sm font-bold text-orange mt-0.5">Stake: {formatEther(stake)} {currencySymbol}</div>
        </div>
    )
}

// Player Row with toggle-loser selection
function PlayerRow({
    player,
    game,
    walletAddress,
    isSelectedLoser,
    onToggleLoser
}: {
    player: string;
    game: Game;
    walletAddress: string;
    isSelectedLoser?: boolean;
    onToggleLoser?: (player: string) => void
}) {
    const playerInList = (list: string[]) => list.some(p => p.toLowerCase() === player.toLowerCase())
    const isLoser = playerInList(game.losers)
    const hasForfeited = playerInList(game.forfeited)
    const isWinner = game.state === 2 && !isLoser && !hasForfeited
    const statusClass = isWinner ? 'text-lime font-bold' : isLoser ? 'text-red font-bold' : hasForfeited ? 'text-muted line-through' : ''
    const statusText = isWinner ? ' (Winner)' : isLoser ? ' (Loser)' : hasForfeited ? ' (Forfeited)' : ''

    return (
        <div className="flex items-center justify-between py-1.5 px-2 rounded-lg odd:bg-cream/50">
            <span className={`text-sm ${statusClass}`}>
                {player.slice(0, 6)}...{player.slice(-4)}{statusText}
            </span>
            {game.state === 1 && !isLoser && !hasForfeited && onToggleLoser && (
                <button
                    onClick={() => onToggleLoser(player)}
                    disabled={!walletAddress}
                    className={`px-3 py-1 text-xs font-bold rounded-full border-2 border-ink cursor-pointer transition-all ${isSelectedLoser
                            ? 'bg-red text-white border-red'
                            : 'bg-card text-ink hover:bg-pink hover:text-white'
                        }`}
                >
                    {isSelectedLoser ? '✗ Unmark' : 'Mark Loser'}
                </button>
            )}
        </div>
    )
}

// Create Game Tile Component
function CreateGameTile({
    walletAddress,
    currencySymbol,
    chainConfig,
}: {
    walletAddress: string
    currencySymbol: string
    chainConfig: typeof CHAINS[ChainKey]
}) {
    const COINFLIP_GOVERNOR = '0xdBec3DC802a817EEE74a7077f734654384857E9d'

    const [governorAddress, setGovernorAddress] = useState<string>(walletAddress || '')
    const [amount, setAmount] = useState<string>('')
    const [maxPlayers, setMaxPlayers] = useState<string>('')
    const [whitelistInput, setWhitelistInput] = useState<string>('')

    useEffect(() => {
        if (walletAddress && !governorAddress) {
            setGovernorAddress(walletAddress)
        }
    }, [walletAddress])

    const handlePrefillSelect = (value: string) => {
        if (value === 'player') {
            setGovernorAddress(walletAddress || '')
        } else if (value === 'coinflip') {
            setGovernorAddress(COINFLIP_GOVERNOR)
        }
    }

    const createGame = async () => {
        if (!amount || isNaN(Number(amount)) || parseFloat(amount) <= 0) {
            alert('Please enter a valid amount.')
            return
        }
        try {
            const whitelist = whitelistInput.split(',').map(addr => addr.trim()).filter(addr => addr.length > 0).map(addr => addr as `0x${string}`)
            const maxPlayersValue = maxPlayers && !isNaN(Number(maxPlayers)) && parseFloat(maxPlayers) > 0 ? BigInt(Math.floor(parseFloat(maxPlayers))) : 0n
            await writeToContract(chainConfig, 'createGame', [governorAddress as `0x${string}`, parseEther(amount), maxPlayersValue, whitelist], parseEther(amount))
        } catch (error) {
            console.error('Error creating game:', error)
            alert('Failed to create game: ' + (error as Error).message)
        }
    }

    return (
        <div className="bg-card border-3 border-ink rounded-2xl p-5 shadow-[4px_4px_0_var(--color-ink)] animate-fade-in">
            <h2 className="font-heading text-xl mb-4">Create a Game</h2>

            <div className="mb-4">
                <label htmlFor="governor-input" className="block text-sm font-bold mb-1">Governor Address:</label>
                <input
                    type="text"
                    id="governor-input"
                    placeholder="0x..."
                    value={governorAddress}
                    onChange={(e) => setGovernorAddress(e.target.value)}
                    disabled={!walletAddress}
                    className="w-full px-3 py-2 border-2 border-ink rounded-xl text-sm font-body bg-cream focus:outline-none focus:ring-2 focus:ring-pink disabled:opacity-50"
                />
                <div className="flex gap-2 mt-2">
                    <button
                        onClick={() => handlePrefillSelect('player')}
                        disabled={!walletAddress}
                        className="flex-1 px-3 py-1.5 text-xs font-bold bg-card border-2 border-ink rounded-full shadow-[2px_2px_0_var(--color-ink)] hover:bg-yellow hover:shadow-[1px_1px_0_var(--color-ink)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer disabled:opacity-50"
                    >
                        My Address
                    </button>
                    <button
                        onClick={() => handlePrefillSelect('coinflip')}
                        disabled={!walletAddress}
                        className="flex-1 px-3 py-1.5 text-xs font-bold bg-card border-2 border-ink rounded-full shadow-[2px_2px_0_var(--color-ink)] hover:bg-yellow hover:shadow-[1px_1px_0_var(--color-ink)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer disabled:opacity-50"
                    >
                        Coinflip Governor
                    </button>
                </div>
            </div>

            <div className="mb-4">
                <label htmlFor="amount-input" className="block text-sm font-bold mb-1">Amount ({currencySymbol}):</label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        id="amount-input"
                        placeholder="Enter amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={!walletAddress}
                        className="flex-1 px-3 py-2 border-2 border-ink rounded-xl text-sm font-body bg-cream focus:outline-none focus:ring-2 focus:ring-pink disabled:opacity-50"
                    />
                    <button
                        onClick={() => setAmount((prev) => { const c = parseFloat(prev) || 0; return (c + 0.1).toFixed(1) })}
                        disabled={!walletAddress}
                        className="px-3 py-1.5 text-xs font-bold bg-card border-2 border-ink rounded-full shadow-[2px_2px_0_var(--color-ink)] hover:bg-lime transition-all cursor-pointer disabled:opacity-50"
                    >
                        +0.1
                    </button>
                    <button
                        onClick={() => setAmount((prev) => { const c = parseFloat(prev) || 0; return (c + 1).toString() })}
                        disabled={!walletAddress}
                        className="px-3 py-1.5 text-xs font-bold bg-card border-2 border-ink rounded-full shadow-[2px_2px_0_var(--color-ink)] hover:bg-lime transition-all cursor-pointer disabled:opacity-50"
                    >
                        +1
                    </button>
                </div>
            </div>

            <div className="mb-4">
                <label htmlFor="whitelist-input" className="block text-sm font-bold mb-1">Whitelist (Optional):</label>
                <div className="flex gap-2 items-center">
                    <input
                        type="text"
                        id="whitelist-input"
                        placeholder="0xAddr1, 0xAddr2, ... (empty = public)"
                        value={whitelistInput}
                        onChange={(e) => setWhitelistInput(e.target.value)}
                        disabled={!walletAddress}
                        className="flex-1 px-3 py-2 border-2 border-ink rounded-xl text-sm font-body bg-cream focus:outline-none focus:ring-2 focus:ring-pink disabled:opacity-50"
                    />
                    <div className="flex items-center shrink-0">
                        <button
                            onClick={() => setMaxPlayers((prev) => { const c = parseInt(prev) || 0; return c > 0 ? (c - 1).toString() : '0' })}
                            disabled={!walletAddress}
                            className="px-2 py-2 text-sm font-bold bg-card border-2 border-ink rounded-l-lg cursor-pointer hover:bg-yellow transition-colors disabled:opacity-50"
                        >−</button>
                        <input
                            type="text"
                            id="max-players-input"
                            placeholder="∞"
                            value={maxPlayers}
                            onChange={(e) => setMaxPlayers(e.target.value.replace(/[^0-9]/g, ''))}
                            disabled={!walletAddress}
                            title="Max Players (0 or empty = unlimited)"
                            className="w-9 text-center py-2 text-sm border-y-2 border-ink bg-cream font-bold disabled:opacity-50 focus:outline-none"
                        />
                        <button
                            onClick={() => setMaxPlayers((prev) => { const c = parseInt(prev) || 0; return (c + 1).toString() })}
                            disabled={!walletAddress}
                            className="px-2 py-2 text-sm font-bold bg-card border-2 border-ink rounded-r-lg cursor-pointer hover:bg-yellow transition-colors disabled:opacity-50"
                        >+</button>
                    </div>
                </div>
                <small className="text-muted text-xs mt-1 block">Comma-separated addresses for private games. Max players: {maxPlayers || '∞'}</small>
            </div>

            <button onClick={createGame} disabled={!walletAddress}
                className="w-full py-2.5 bg-pink text-white font-bold rounded-full border-3 border-ink shadow-[4px_4px_0_var(--color-ink)] hover:shadow-[2px_2px_0_var(--color-ink)] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Create Game
            </button>
        </div>
    )
}

// Join Game Tile Component
function JoinGameTile({
    openGames,
    walletAddress,
    currencySymbol,
    chainConfig,
}: {
    openGames: Game[]
    walletAddress: string
    currencySymbol: string
    chainConfig: typeof CHAINS[ChainKey]
}) {
    const executeWrite = async (action: string, functionName: string, args: unknown[], value?: bigint) => {
        try {
            await writeToContract(chainConfig, functionName, args, value)
        } catch (error) {
            console.error(`Error ${action}:`, error)
            alert(`Failed to ${action}: ${(error as Error).message}`)
        }
    }

    const joinGame = (gameId: bigint, stakeAmount: bigint) =>
        executeWrite('join game', 'joinGame', [gameId], stakeAmount)

    const forfeitGame = (gameId: bigint) =>
        executeWrite('forfeit game', 'forfeitGame', [gameId])

    return (
        <div className="bg-card border-3 border-ink rounded-2xl p-5 shadow-[4px_4px_0_var(--color-ink)] animate-fade-in">
            <h2 className="font-heading text-xl mb-4">Join a Game</h2>

            <div className="space-y-3">
                {openGames.length > 0 ? (
                    openGames.map((game) => {
                        const addressInList = (list: string[] | undefined) =>
                            walletAddress && list?.some(p => p.toLowerCase() === walletAddress.toLowerCase())

                        const isPlayerInGame = addressInList(game.players)
                        const hasForfeited = addressInList(game.forfeited)
                        const isWhitelisted = !game.whitelist?.length || addressInList(game.whitelist)
                        const isFull = game.maxPlayers > 0n && game.players?.length >= Number(game.maxPlayers)

                        return (
                            <div key={game.id.toString()} className="bg-cream border-2 border-ink rounded-xl p-4 shadow-[2px_2px_0_var(--color-ink)]">
                                <GameHeader gameId={game.id} governor={game.governor} stake={game.stakeAmount} currencySymbol={currencySymbol} />

                                <small className="block text-xs text-muted">
                                    Players: {game.players?.length || 0}
                                    {game.maxPlayers > 0n && ` / ${game.maxPlayers.toString()}`}
                                    {(game.forfeited?.length || 0) > 0 && ` (${game.forfeited.length} forfeited)`}
                                </small>
                                {(game.whitelist?.length || 0) > 0 && <small className="block text-xs text-muted">🔒 Private ({game.whitelist.length} whitelisted)</small>}
                                {isFull && <small className="block text-xs text-red font-bold">🚫 Game Full</small>}

                                {!isPlayerInGame ? (
                                    <button
                                        onClick={() => joinGame(game.id, game.stakeAmount)}
                                        disabled={!walletAddress || !isWhitelisted || isFull}
                                        title={isFull ? 'Game is full' : (!isWhitelisted ? 'You are not whitelisted for this game' : '')}
                                        className="mt-2 w-full py-2 text-sm font-bold bg-lime border-2 border-ink rounded-full shadow-[2px_2px_0_var(--color-ink)] hover:shadow-[1px_1px_0_var(--color-ink)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isFull ? '🚫 Full' : (isWhitelisted ? 'Join' : '🔒 Not Whitelisted')}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => forfeitGame(game.id)}
                                        disabled={!walletAddress || !!hasForfeited}
                                        className="mt-2 w-full py-2 text-sm font-bold bg-red text-white border-2 border-ink rounded-full shadow-[2px_2px_0_var(--color-ink)] hover:shadow-[1px_1px_0_var(--color-ink)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer disabled:opacity-50"
                                    >
                                        {hasForfeited ? 'Forfeited' : 'Forfeit'}
                                    </button>
                                )}
                            </div>
                        )
                    })
                ) : (
                    <p className="text-center text-muted text-sm py-6">No open games available.</p>
                )}
            </div>
        </div>
    )
}

// Govern Games Tile Component
function GovernGamesTile({
    ongoingGames,
    walletAddress,
    currencySymbol,
    chainConfig,
}: {
    ongoingGames: Game[]
    walletAddress: string
    currencySymbol: string
    chainConfig: typeof CHAINS[ChainKey]
}) {
    const [selectedLosers, setSelectedLosers] = useState<Record<string, Set<string>>>({})

    const toggleLoser = (gameId: bigint, player: string) => {
        const key = gameId.toString()
        setSelectedLosers(prev => {
            const current = new Set(prev[key] || [])
            if (current.has(player.toLowerCase())) {
                current.delete(player.toLowerCase())
            } else {
                current.add(player.toLowerCase())
            }
            return { ...prev, [key]: current }
        })
    }

    const calculatePoolSplit = (game: Game, loserSet: Set<string>) => {
        const totalPool = game.stakeAmount * BigInt(game.players.length)
        const governorFee = (totalPool * 5n) / 100n

        const isInList = (player: string, list: string[]) =>
            list.some(p => p.toLowerCase() === player.toLowerCase())

        const winnersCount = BigInt(
            game.players.filter(p =>
                !loserSet.has(p.toLowerCase()) && !isInList(p, game.forfeited)
            ).length
        )
        const perWinnerAmount = winnersCount > 0n ? (totalPool - governorFee) / winnersCount : 0n

        return { totalPool, governorFee, winnersCount, perWinnerAmount }
    }

    const executeWrite = async (action: string, functionName: string, args: unknown[], value?: bigint) => {
        try {
            await writeToContract(chainConfig, functionName, args, value)
        } catch (error) {
            console.error(`Error ${action}:`, error)
            alert(`Failed to ${action}: ${(error as Error).message}`)
        }
    }

    const doStartGame = (gameId: bigint) =>
        executeWrite('start game', 'startGame', [gameId])

    const doResolveGame = (gameId: bigint) => {
        const key = gameId.toString()
        const losers = Array.from(selectedLosers[key] || []) as `0x${string}`[]
        executeWrite('resolve game', 'resolveGame', [gameId, losers, 5n])
    }

    return (
        <div className="bg-card border-3 border-ink rounded-2xl p-5 shadow-[4px_4px_0_var(--color-ink)] animate-fade-in">
            <h2 className="font-heading text-xl mb-1">Govern Games</h2>
            <p className="text-sm text-muted mb-4">Manage games where you are the governor (5% fee).</p>

            <div className="space-y-3">
                {ongoingGames.length > 0 ? (
                    ongoingGames.map((game) => {
                        const key = game.id.toString()
                        const loserSet = selectedLosers[key] || new Set<string>()
                        const poolSplit = calculatePoolSplit(game, loserSet)

                        return (
                            <div key={key} className="bg-cream border-2 border-ink rounded-xl p-4 shadow-[2px_2px_0_var(--color-ink)]">
                                <GameHeader gameId={game.id} governor={game.governor} stake={game.stakeAmount} currencySymbol={currencySymbol} />

                                <small className="block text-xs font-bold mb-2">
                                    {game.state === 2 ? '✓ Resolved' : game.state === 1 ? '⏳ In Progress' : '🟢 Lobby Open'}
                                </small>

                                <div className="mb-2">
                                    <small className="font-bold text-xs">Players: {game.players.length}</small>
                                    {game.players.length > 0 ? (
                                        game.players.map((p, i) => (
                                            <PlayerRow
                                                key={i}
                                                player={p}
                                                game={game}
                                                walletAddress={walletAddress}
                                                isSelectedLoser={loserSet.has(p.toLowerCase())}
                                                onToggleLoser={(player) => toggleLoser(game.id, player)}
                                            />
                                        ))
                                    ) : (
                                        <small className="text-muted text-xs block">Waiting for players...</small>
                                    )}
                                </div>

                                {game.state === 1 && (
                                    <div className="bg-purple/15 border-2 border-purple rounded-xl p-3 text-xs space-y-0.5 mb-3">
                                        <strong className="text-sm">Pool Split Preview:</strong>
                                        <div>Total: {formatEther(poolSplit.totalPool)} {currencySymbol}</div>
                                        <div>Fee (5%): {formatEther(poolSplit.governorFee)} {currencySymbol}</div>
                                        <div>Winners: {poolSplit.winnersCount.toString()}</div>
                                        <div className="font-bold">Each: {formatEther(poolSplit.perWinnerAmount)} {currencySymbol}</div>
                                        <div className="text-muted">Selected losers: {loserSet.size}</div>
                                    </div>
                                )}

                                {game.players.length >= 1 && (
                                    <>
                                        {game.state === 0 && (
                                            <button onClick={() => doStartGame(game.id)} disabled={!walletAddress}
                                                className="w-full py-2 text-sm font-bold bg-cyan border-2 border-ink rounded-full shadow-[2px_2px_0_var(--color-ink)] hover:shadow-[1px_1px_0_var(--color-ink)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer disabled:opacity-50"
                                            >
                                                Start Game {game.players.length === 1 && '(1P)'}
                                            </button>
                                        )}
                                        {game.state === 1 && (
                                            <button onClick={() => doResolveGame(game.id)} disabled={!walletAddress || (game.players.length > 1 && loserSet.size === 0)}
                                                className="w-full py-2 text-sm font-bold bg-orange border-2 border-ink rounded-full shadow-[2px_2px_0_var(--color-ink)] hover:shadow-[1px_1px_0_var(--color-ink)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer disabled:opacity-50"
                                            >
                                                {game.players.length === 1 ? 'Resolve Game (1P Win)' : `Resolve Game (${loserSet.size} losers)`}
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        )
                    })
                ) : (
                    <p className="text-center text-muted text-sm py-6">No games to govern.</p>
                )}
            </div>
        </div>
    )
}

// Past Games Tile Component
function PastGamesTile({
    pastGames,
    currencySymbol,
}: {
    pastGames: Game[]
    currencySymbol: string
}) {
    return (
        <div className="bg-card border-3 border-ink rounded-2xl p-5 shadow-[4px_4px_0_var(--color-ink)] animate-fade-in">
            <h2 className="font-heading text-xl mb-1">Past Games History</h2>
            <p className="text-sm text-muted mb-4">View completed games where you were the governor.</p>

            <div className="space-y-3">
                {pastGames.length > 0 ? (
                    pastGames.map((game) => {
                        const inList = (addr: string, list: string[]) =>
                            list.some(p => p.toLowerCase() === addr.toLowerCase())
                        const winners = game.players.filter(p => !inList(p, game.losers) && !inList(p, game.forfeited))
                        return (
                            <div key={game.id.toString()} className="bg-cream border-2 border-ink rounded-xl p-4 shadow-[2px_2px_0_var(--color-ink)]">
                                <GameHeader gameId={game.id} governor={game.governor} stake={game.stakeAmount} currencySymbol={currencySymbol} />

                                <small className="block text-xs text-muted mb-2">Players: {game.players.length}</small>

                                <div className="mb-1">
                                    <small className="font-bold text-xs text-lime">Winners ({winners.length}):</small>
                                    {winners.length > 0 ? winners.map((p, i) => (
                                        <small key={i} className="block text-xs ml-2">{p.slice(0, 6)}...{p.slice(-4)}</small>
                                    )) : <small className="block text-xs text-muted ml-2">No winners</small>}
                                </div>

                                <div className="mb-1">
                                    <small className="font-bold text-xs text-red">Losers ({game.losers.length}):</small>
                                    {game.losers.length > 0 ? game.losers.map((p, i) => (
                                        <small key={i} className="block text-xs ml-2">{p.slice(0, 6)}...{p.slice(-4)}</small>
                                    )) : <small className="block text-xs text-muted ml-2">No losers</small>}
                                </div>

                                <small className="block text-xs font-bold text-lime">Status: Resolved ✓</small>
                            </div>
                        )
                    })
                ) : (
                    <p className="text-center text-muted text-sm py-6">No past games found.</p>
                )}
            </div>
        </div>
    )
}

// Main SinglePage component - wrapper for all tiles with game state management
function SinglePage({
    walletAddress,
    chainConfig,
}: {
    walletAddress: string
    chainConfig: typeof CHAINS[ChainKey]
}) {
    const [openGames, setOpenGames] = useState<Game[]>([])
    const [ongoingGames, setOngoingGames] = useState<Game[]>([])
    const [pastGames, setPastGames] = useState<Game[]>([])
    const lastProcessedBlockRef = useRef<bigint | null>(null)

    // Create public client for reading contract data
    const client = createPublicClient({
        chain: chainConfig.chain,
        transport: http(),
    })

    const readContract = async <T,>(functionName: string, args: readonly unknown[] = []): Promise<T> => {
        return await client.readContract({
            address: chainConfig.contractAddress as `0x${string}`,
            abi: contractABI,
            functionName: functionName as any,
            args: args as any,
        }) as T
    }

    const fetchGames = async (functionName: string, args: readonly unknown[]): Promise<Game[]> => {
        try {
            const ids = await readContract<readonly bigint[]>(functionName, args)
            const games = await Promise.all(
                ids.map(async (gameId) => {
                    const gameInfo = await readContract<GameInfo>('getGame', [gameId])
                    return { id: gameId, ...gameInfo }
                })
            )
            return games
        } catch (err) {
            console.error(`Error fetching games (${functionName}):`, err)
            return []
        }
    }

    const loadAllGames = async () => {
        try {
            const nextGameId = await readContract<bigint>('nextGameId')
            const startGame = nextGameId > PAGE_SIZE ? nextGameId - PAGE_SIZE : 0n
            const normalizedAddress = walletAddress ? getAddress(walletAddress) as `0x${string}` : null

            // Fetch all open games (no governor filter)
            const openGamesData = await fetchGames('getGames', ['0x0000000000000000000000000000000000000000', false, false, true, startGame, PAGE_SIZE])
            setOpenGames(openGamesData)

            if (normalizedAddress) {
                const [governorGamesData, pastGamesData] = await Promise.all([
                    fetchGames('getGames', [normalizedAddress, false, true, true, 0n, PAGE_SIZE]),
                    fetchGames('getGames', [normalizedAddress, true, false, false, 0n, PAGE_SIZE])
                ])
                setOngoingGames(governorGamesData)
                setPastGames(pastGamesData)
            } else {
                setOngoingGames([])
                setPastGames([])
            }
        } catch (err) {
            console.error('Error loading games:', err)
        }
    }

    // Initial data load on mount and when wallet/chain changes
    useEffect(() => {
        lastProcessedBlockRef.current = null
        loadAllGames()
    }, [walletAddress, chainConfig.contractAddress])

    // Event scanning with catch-up mechanism
    useEffect(() => {
        if (!client) return

        const performEventScan = async () => {
            try {
                const currentBlock = await client.getBlockNumber()
                const lastBlock = lastProcessedBlockRef.current

                if (lastBlock && lastBlock < currentBlock) {
                    const logs = await client.getLogs({
                        address: chainConfig.contractAddress as `0x${string}`,
                        fromBlock: lastBlock + 1n,
                        toBlock: currentBlock,
                    })

                    if (logs.length > 0) {
                        console.log(`📡 Found ${logs.length} events in blocks ${lastBlock + 1n}-${currentBlock}`)
                        await loadAllGames()
                    }
                } else if (!lastBlock) {
                    console.log(`🔎 Starting event monitoring from block ${currentBlock}`)
                }

                lastProcessedBlockRef.current = currentBlock
            } catch (err) {
                console.error('Error in event scan:', err)
            }
        }

        performEventScan()
        const intervalId = window.setInterval(performEventScan, 10000)

        return () => clearInterval(intervalId)
    }, [client, chainConfig.contractAddress])

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CreateGameTile
                walletAddress={walletAddress}
                currencySymbol={chainConfig.chain.nativeCurrency.symbol}
                chainConfig={chainConfig}
            />

            <JoinGameTile
                openGames={openGames}
                walletAddress={walletAddress}
                currencySymbol={chainConfig.chain.nativeCurrency.symbol}
                chainConfig={chainConfig}
            />

            <GovernGamesTile
                ongoingGames={ongoingGames}
                walletAddress={walletAddress}
                currencySymbol={chainConfig.chain.nativeCurrency.symbol}
                chainConfig={chainConfig}
            />

            <PastGamesTile
                pastGames={pastGames}
                currencySymbol={chainConfig.chain.nativeCurrency.symbol}
            />
        </div>
    )
}

export default SinglePage
