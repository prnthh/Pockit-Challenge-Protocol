import { useState, useEffect, useRef } from 'react'
import { parseEther, formatEther, createPublicClient, http } from 'viem'
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
        <div className="game-header">
            <div className="game-id">Game #{gameId.toString()}</div>
            <small>Governor: {governor.slice(0, 6)}...{governor.slice(-4)}</small>
            <div className="game-stake">Stake: {formatEther(stake)} {currencySymbol}</div>
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
    const status = isWinner ? 'winner' : isLoser ? 'loser' : hasForfeited ? 'forfeited' : ''
    const statusText = isWinner ? ' (Winner)' : isLoser ? ' (Loser)' : hasForfeited ? ' (Forfeited)' : ''

    return (
        <div className="player-row">
            <span className={status}>
                {player.slice(0, 6)}...{player.slice(-4)}{statusText}
            </span>
            {game.state === 1 && !isLoser && !hasForfeited && onToggleLoser && (
                <button
                    onClick={() => onToggleLoser(player)}
                    disabled={!walletAddress}
                    style={{ background: isSelectedLoser ? '#ef5350' : undefined, color: isSelectedLoser ? 'white' : undefined, borderColor: isSelectedLoser ? '#e53935' : undefined }}
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
        <div className="tile">
            <h2>Create a Game</h2>

            <div className="form-group">
                <label htmlFor="governor-input">Governor Address:</label>
                <input
                    type="text"
                    id="governor-input"
                    placeholder="0x..."
                    value={governorAddress}
                    onChange={(e) => setGovernorAddress(e.target.value)}
                    disabled={!walletAddress}
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                        onClick={() => handlePrefillSelect('player')}
                        disabled={!walletAddress}
                        style={{ flex: 1 }}
                    >
                        My Address
                    </button>
                    <button
                        onClick={() => handlePrefillSelect('coinflip')}
                        disabled={!walletAddress}
                        style={{ flex: 1 }}
                    >
                        Coinflip Governor
                    </button>
                </div>
            </div>

            <div className="form-group">
                <label htmlFor="amount-input">Amount ({currencySymbol}):</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                        type="text"
                        id="amount-input"
                        placeholder="Enter amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={!walletAddress}
                    />
                    <button
                        onClick={() => setAmount((prev) => {
                            const current = parseFloat(prev) || 0;
                            return (current + 0.1).toFixed(1);
                        })}
                        disabled={!walletAddress}
                    >
                        +0.1
                    </button>
                    <button
                        onClick={() => setAmount((prev) => {
                            const current = parseFloat(prev) || 0;
                            return (current + 1).toString();
                        })}
                        disabled={!walletAddress}
                    >
                        +1
                    </button>
                </div>
            </div>

            <div className="form-group">
                <label htmlFor="max-players-input">Max Players (Optional):</label>
                <input
                    type="text"
                    id="max-players-input"
                    placeholder="Leave empty for unlimited"
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(e.target.value)}
                    disabled={!walletAddress}
                />
                <small>Maximum number of players. Leave empty for unlimited.</small>
            </div>

            <div className="form-group">
                <label htmlFor="whitelist-input">Whitelist (Optional):</label>
                <input
                    type="text"
                    id="whitelist-input"
                    placeholder="0xAddress1, 0xAddress2, ... (leave empty for public)"
                    value={whitelistInput}
                    onChange={(e) => setWhitelistInput(e.target.value)}
                    disabled={!walletAddress}
                />
                <small>Comma-separated addresses for private games. Leave empty for public games.</small>
            </div>

            <button className="primary-button" onClick={createGame} disabled={!walletAddress}>
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
        <div className="tile">
            <h2>Join a Game</h2>

            <div className="games-list">
                {openGames.length > 0 ? (
                    openGames.map((game) => {
                        const addressInList = (list: string[] | undefined) =>
                            walletAddress && list?.some(p => p.toLowerCase() === walletAddress.toLowerCase())

                        const isPlayerInGame = addressInList(game.players)
                        const hasForfeited = addressInList(game.forfeited)
                        const isWhitelisted = !game.whitelist?.length || addressInList(game.whitelist)
                        const isFull = game.maxPlayers > 0n && game.players?.length >= Number(game.maxPlayers)

                        return (
                            <div key={game.id.toString()} className="game-card">
                                <GameHeader
                                    gameId={game.id}
                                    governor={game.governor}
                                    stake={game.stakeAmount}
                                    currencySymbol={currencySymbol}
                                />

                                <small>
                                    Players: {game.players?.length || 0}
                                    {game.maxPlayers > 0n && ` / ${game.maxPlayers.toString()}`}
                                    {(game.forfeited?.length || 0) > 0 && ` (${game.forfeited.length} forfeited)`}
                                </small>
                                {(game.whitelist?.length || 0) > 0 && <small>🔒 Private ({game.whitelist.length} whitelisted)</small>}
                                {isFull && <small>🚫 Game Full</small>}

                                {!isPlayerInGame ? (
                                    <button
                                        onClick={() => joinGame(game.id, game.stakeAmount)}
                                        disabled={!walletAddress || !isWhitelisted || isFull}
                                        title={isFull ? 'Game is full' : (!isWhitelisted ? 'You are not whitelisted for this game' : '')}
                                    >
                                        {isFull ? '🚫 Full' : (isWhitelisted ? 'Join' : '🔒 Not Whitelisted')}
                                    </button>
                                ) : (
                                    <button onClick={() => forfeitGame(game.id)} disabled={!walletAddress || !!hasForfeited}>
                                        {hasForfeited ? 'Forfeited' : 'Forfeit'}
                                    </button>
                                )}
                            </div>
                        )
                    })
                ) : (
                    <p className="no-games">No open games available.</p>
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
        <div className="tile">
            <h2>Govern Games</h2>

            <p className="section-title">Manage games where you are the governor (5% fee).</p>

            <div className="games-list">
                {ongoingGames.length > 0 ? (
                    ongoingGames.map((game) => {
                        const key = game.id.toString()
                        const loserSet = selectedLosers[key] || new Set<string>()
                        const poolSplit = calculatePoolSplit(game, loserSet)

                        return (
                            <div key={key} className="game-card">
                                <GameHeader
                                    gameId={game.id}
                                    governor={game.governor}
                                    stake={game.stakeAmount}
                                    currencySymbol={currencySymbol}
                                />

                                <small>
                                    {game.state === 2 ? 'Resolved ✓' : game.state === 1 ? 'In Progress ⏳' : 'Lobby Open'}
                                </small>

                                <div>
                                    <small><strong>Players: {game.players.length}</strong></small>
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
                                        <small>Waiting for players...</small>
                                    )}
                                </div>

                                {game.state === 1 && (
                                    <div className="info-box">
                                        <strong>Pool Split Preview:</strong>
                                        <div>Total: {formatEther(poolSplit.totalPool)} {currencySymbol}</div>
                                        <div>Fee (5%): {formatEther(poolSplit.governorFee)} {currencySymbol}</div>
                                        <div>Winners: {poolSplit.winnersCount.toString()}</div>
                                        <div><strong>Each: {formatEther(poolSplit.perWinnerAmount)} {currencySymbol}</strong></div>
                                        <div><small>Selected losers: {loserSet.size}</small></div>
                                    </div>
                                )}

                                {game.players.length >= 1 && (
                                    <>
                                        {game.state === 0 && (
                                            <button onClick={() => doStartGame(game.id)} disabled={!walletAddress}>
                                                Start Game {game.players.length === 1 && '(1P)'}
                                            </button>
                                        )}
                                        {game.state === 1 && (
                                            <button onClick={() => doResolveGame(game.id)} disabled={!walletAddress || loserSet.size === 0}>
                                                Resolve Game ({loserSet.size} losers)
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        )
                    })
                ) : (
                    <p className="no-games">No games to govern.</p>
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
        <div className="tile">
            <h2>Past Games History</h2>

            <p className="section-title">View completed games where you were the governor.</p>

            <div className="games-list">
                {pastGames.length > 0 ? (
                    pastGames.map((game) => {
                        const inList = (addr: string, list: string[]) =>
                            list.some(p => p.toLowerCase() === addr.toLowerCase())
                        const winners = game.players.filter(p => !inList(p, game.losers) && !inList(p, game.forfeited))
                        return (
                            <div key={game.id.toString()} className="game-card">
                                <GameHeader
                                    gameId={game.id}
                                    governor={game.governor}
                                    stake={game.stakeAmount}
                                    currencySymbol={currencySymbol}
                                />

                                <small>Players: {game.players.length}</small>

                                <div>
                                    <small><strong>Winners ({winners.length}):</strong></small>
                                    {winners.length > 0 ? winners.map((p, i) => (
                                        <small key={i}>{p.slice(0, 6)}...{p.slice(-4)}</small>
                                    )) : <small>No winners</small>}
                                </div>

                                <div>
                                    <small className="loser"><strong>Losers ({game.losers.length}):</strong></small>
                                    {game.losers.length > 0 ? game.losers.map((p, i) => (
                                        <small key={i}>{p.slice(0, 6)}...{p.slice(-4)}</small>
                                    )) : <small>No losers</small>}
                                </div>

                                <small>Status: Resolved ✓</small>
                            </div>
                        )
                    })
                ) : (
                    <p className="no-games">No past games found.</p>
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

            const [openGamesData, ongoingGamesData, pastGamesData] = await Promise.all([
                fetchGames('getGames', ['0x0000000000000000000000000000000000000000', false, false, true, startGame, PAGE_SIZE]),
                walletAddress ? fetchGames('getGames', [walletAddress as `0x${string}`, false, true, true, 0n, PAGE_SIZE]) : Promise.resolve([]),
                walletAddress ? fetchGames('getGames', [walletAddress as `0x${string}`, true, false, false, 0n, PAGE_SIZE]) : Promise.resolve([])
            ])

            setOpenGames(openGamesData)
            setOngoingGames(ongoingGamesData)
            setPastGames(pastGamesData)
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
        <div className="tiles-container">
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
