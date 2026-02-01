import { useState, useEffect } from 'react'
import { parseEther, formatEther } from 'viem'
import { writeToContract, CHAINS, GameInfo } from '../../App'
import type { ChainKey } from '../../App'

interface CoinFlipProps {
    walletAddress: string
    chainConfig: typeof CHAINS[ChainKey]
    customChain: any
}

export default function CoinFlip({ walletAddress, chainConfig, customChain }: CoinFlipProps) {
    const [games, setGames] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [stakeAmount, setStakeAmount] = useState('0.01')
    const [selectedGameId, setSelectedGameId] = useState<bigint | null>(null)
    const [gameDetails, setGameDetails] = useState<GameInfo | null>(null)

    // Create a new coin flip game
    const createGame = async () => {
        if (!walletAddress) {
            alert('Connect wallet first')
            return
        }
        setLoading(true)
        try {
            const txHash = await writeToContract(
                chainConfig,
                customChain,
                'createGame',
                [walletAddress, parseEther(stakeAmount), 2n, []],
                parseEther(stakeAmount)
            )
            console.log('Game created:', txHash)
            setStakeAmount('0.01')
            // Refresh games list
            await new Promise(r => setTimeout(r, 2000))
            await fetchGames()
        } catch (error) {
            console.error('Error creating game:', error)
            alert('Failed to create game')
        } finally {
            setLoading(false)
        }
    }

    // Join an existing game
    const joinGame = async (gameId: bigint) => {
        if (!walletAddress) {
            alert('Connect wallet first')
            return
        }
        setLoading(true)
        try {
            // Get game info to find stake amount
            const game = games.find(g => g.id === gameId)
            if (!game) {
                alert('Game not found')
                return
            }

            const txHash = await writeToContract(
                chainConfig,
                customChain,
                'joinGame',
                [gameId],
                game.stakeAmount
            )
            console.log('Joined game:', txHash)
            await new Promise(r => setTimeout(r, 2000))
            await fetchGames()
        } catch (error) {
            console.error('Error joining game:', error)
            alert('Failed to join game')
        } finally {
            setLoading(false)
        }
    }

    // Governor: Mark game as ready
    const setGameReady = async (gameId: bigint) => {
        if (!walletAddress) {
            alert('Connect wallet first')
            return
        }
        setLoading(true)
        try {
            const txHash = await writeToContract(
                chainConfig,
                customChain,
                'setGameReady',
                [gameId]
            )
            console.log('Game ready:', txHash)
            await new Promise(r => setTimeout(r, 2000))
            await fetchGames()
        } catch (error) {
            console.error('Error setting game ready:', error)
            alert('Failed to set game ready')
        } finally {
            setLoading(false)
        }
    }

    // Governor: Add loser
    const addLoser = async (gameId: bigint, loser: string) => {
        setLoading(true)
        try {
            const txHash = await writeToContract(
                chainConfig,
                customChain,
                'addLoser',
                [gameId, loser]
            )
            console.log('Loser added:', txHash)
            await new Promise(r => setTimeout(r, 2000))
            await fetchGames()
        } catch (error) {
            console.error('Error adding loser:', error)
            alert('Failed to add loser')
        } finally {
            setLoading(false)
        }
    }

    // Governor: End game
    const endGame = async (gameId: bigint) => {
        setLoading(true)
        try {
            const txHash = await writeToContract(
                chainConfig,
                customChain,
                'endGame',
                [gameId, 2n] // 2% governor fee
            )
            console.log('Game ended:', txHash)
            await new Promise(r => setTimeout(r, 2000))
            await fetchGames()
        } catch (error) {
            console.error('Error ending game:', error)
            alert('Failed to end game')
        } finally {
            setLoading(false)
        }
    }

    // Simulate coin flip result
    const simulateCoinFlip = async (gameId: bigint) => {
        const game = games.find(g => g.id === gameId)
        if (!game || game.players.length < 2) {
            alert('Need 2 players to flip')
            return
        }

        // Random loser (50/50)
        const loserIndex = Math.random() < 0.5 ? 0 : 1
        const loser = game.players[loserIndex]
        const winner = game.players[1 - loserIndex]

        console.log(`🪙 Coin Flip Result: ${winner.slice(0, 6)} wins, ${loser.slice(0, 6)} loses`)

        // Add loser and end game
        await addLoser(gameId, loser)
        await endGame(gameId)
    }

    // Fetch games
    const fetchGames = async () => {
        try {
            // This would normally call contract view function
            // For now, just log
            console.log('Fetching games...')
        } catch (error) {
            console.error('Error fetching games:', error)
        }
    }

    useEffect(() => {
        fetchGames()
    }, [])

    return (
        <div style={{ padding: '2rem', borderRadius: '0.5rem', background: '#111', color: '#fff', marginBottom: '2rem' }}>
            <h2>🪙 CoinFlip Demo</h2>
            <p style={{ color: '#999', fontSize: '0.875rem', marginBottom: '1rem' }}>
                Simplest game: players join, we flip a coin, winner takes all.
            </p>

            {/* Create Game */}
            <div style={{ marginBottom: '2rem', padding: '1rem', background: '#1a1a1a', borderRadius: '0.5rem' }}>
                <h3>Create Game</h3>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                        type="number"
                        step="0.01"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                        placeholder="Stake amount (DMT)"
                        style={{
                            padding: '0.5rem',
                            background: '#222',
                            border: '1px solid #333',
                            color: '#fff',
                            borderRadius: '0.25rem',
                        }}
                    />
                    <button
                        onClick={createGame}
                        disabled={loading}
                        style={{
                            padding: '0.5rem 1rem',
                            background: '#3b82f6',
                            border: 'none',
                            color: '#fff',
                            borderRadius: '0.25rem',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.5 : 1,
                        }}
                    >
                        {loading ? 'Creating...' : 'Create Game'}
                    </button>
                </div>
            </div>

            {/* Games List */}
            <div>
                <h3>Active Games</h3>
                <p style={{ color: '#999', fontSize: '0.875rem' }}>Games will appear here after creation and on-chain confirmation.</p>
                {games.length === 0 ? (
                    <p style={{ color: '#666' }}>No games yet. Create one above!</p>
                ) : (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {games.map((game) => (
                            <div
                                key={game.id.toString()}
                                style={{
                                    padding: '1rem',
                                    background: '#1a1a1a',
                                    borderRadius: '0.5rem',
                                    border: '1px solid #333',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <strong>Game #{game.id.toString()}</strong>
                                    <span style={{ color: '#999', fontSize: '0.875rem' }}>
                                        {game.isReady ? '✅ Ready' : game.isEnded ? '🏁 Ended' : '⏳ Waiting'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.875rem', color: '#999', marginBottom: '0.5rem' }}>
                                    <div>Stake: {formatEther(game.stakeAmount)} {chainConfig.nativeCurrency.symbol}</div>
                                    <div>Players: {game.players.length}/2</div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {!game.isEnded && game.players.length < 2 && (
                                        <button
                                            onClick={() => joinGame(game.id)}
                                            disabled={loading}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                background: '#10b981',
                                                border: 'none',
                                                color: '#fff',
                                                borderRadius: '0.25rem',
                                                cursor: loading ? 'not-allowed' : 'pointer',
                                                fontSize: '0.875rem',
                                            }}
                                        >
                                            Join Game
                                        </button>
                                    )}

                                    {game.players.length === 2 && !game.isReady && walletAddress === game.governor && (
                                        <button
                                            onClick={() => setGameReady(game.id)}
                                            disabled={loading}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                background: '#f59e0b',
                                                border: 'none',
                                                color: '#fff',
                                                borderRadius: '0.25rem',
                                                cursor: loading ? 'not-allowed' : 'pointer',
                                                fontSize: '0.875rem',
                                            }}
                                        >
                                            Start Game
                                        </button>
                                    )}

                                    {game.isReady && !game.isEnded && walletAddress === game.governor && (
                                        <button
                                            onClick={() => simulateCoinFlip(game.id)}
                                            disabled={loading}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                background: '#8b5cf6',
                                                border: 'none',
                                                color: '#fff',
                                                borderRadius: '0.25rem',
                                                cursor: loading ? 'not-allowed' : 'pointer',
                                                fontSize: '0.875rem',
                                            }}
                                        >
                                            🪙 Flip Coin
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ marginTop: '2rem', padding: '1rem', background: '#1a1a1a', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#999' }}>
                <strong>How it works:</strong>
                <ol style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                    <li>Create a game with your stake amount</li>
                    <li>Another player joins with the same stake</li>
                    <li>Governor marks the game ready</li>
                    <li>Governor flips a coin to determine winner</li>
                    <li>Winner receives both stakes minus governor fee</li>
                </ol>
            </div>
        </div>
    )
}
