import { useState } from 'react'
import { parseEther, formatEther } from 'viem'
import { writeToContract, CHAINS } from '../../App'
import type { ChainKey } from '../../App'

interface SimpleEscrowProps {
    walletAddress: string
    chainConfig: typeof CHAINS[ChainKey]
    customChain: any
}

export default function SimpleEscrow({ walletAddress, chainConfig, customChain }: SimpleEscrowProps) {
    const [gameId, setGameId] = useState('')
    const [stakeAmount, setStakeAmount] = useState('0.01')
    const [opponentAddress, setOpponentAddress] = useState('')
    const [whitelistAddresses, setWhitelistAddresses] = useState('')
    const [loading, setLoading] = useState(false)
    const [createdGameId, setCreatedGameId] = useState<bigint | null>(null)
    const [gameLogs, setGameLogs] = useState<string[]>([])

    const addLog = (msg: string) => {
        const timestamp = new Date().toLocaleTimeString()
        setGameLogs(prev => [...prev, `[${timestamp}] ${msg}`])
    }

    // Create game
    const createGame = async () => {
        if (!walletAddress) {
            alert('Connect wallet first')
            return
        }
        setLoading(true)
        try {
            const whitelist = whitelistAddresses
                .split(',')
                .map(a => a.trim())
                .filter(a => a)

            addLog(`Creating game with stake ${stakeAmount} ${chainConfig.nativeCurrency.symbol}...`)

            const txHash = await writeToContract(
                chainConfig,
                customChain,
                'createGame',
                [walletAddress, parseEther(stakeAmount), 100n, whitelist],
                parseEther(stakeAmount)
            )

            addLog(`✅ Transaction sent: ${txHash.slice(0, 10)}...`)
            // In real app, would get game ID from event or contract call
            setCreatedGameId(1n) // placeholder
            addLog('Game created! Other player can now join.')
        } catch (error) {
            addLog(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        } finally {
            setLoading(false)
        }
    }

    // Join game
    const joinGame = async () => {
        if (!walletAddress || !gameId) {
            alert('Connect wallet and enter game ID')
            return
        }
        setLoading(true)
        try {
            const gid = BigInt(gameId)
            const stake = parseEther(stakeAmount)

            addLog(`Joining game ${gid} with stake ${stakeAmount}...`)

            const txHash = await writeToContract(
                chainConfig,
                customChain,
                'joinGame',
                [gid],
                stake
            )

            addLog(`✅ Joined! Tx: ${txHash.slice(0, 10)}...`)
        } catch (error) {
            addLog(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        } finally {
            setLoading(false)
        }
    }

    // Set game ready
    const handleSetReady = async () => {
        if (!gameId) {
            alert('Enter game ID')
            return
        }
        setLoading(true)
        try {
            const gid = BigInt(gameId)
            addLog(`Marking game ${gid} as ready...`)

            const txHash = await writeToContract(
                chainConfig,
                customChain,
                'setGameReady',
                [gid]
            )

            addLog(`✅ Game ready! Tx: ${txHash.slice(0, 10)}...`)
        } catch (error) {
            addLog(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        } finally {
            setLoading(false)
        }
    }

    // Add loser
    const handleAddLoser = async () => {
        if (!gameId || !opponentAddress) {
            alert('Enter game ID and opponent address')
            return
        }
        setLoading(true)
        try {
            const gid = BigInt(gameId)
            addLog(`Adding loser: ${opponentAddress.slice(0, 6)}...`)

            const txHash = await writeToContract(
                chainConfig,
                customChain,
                'addLoser',
                [gid, opponentAddress]
            )

            addLog(`✅ Loser added! Tx: ${txHash.slice(0, 10)}...`)
        } catch (error) {
            addLog(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        } finally {
            setLoading(false)
        }
    }

    // End game
    const handleEndGame = async () => {
        if (!gameId) {
            alert('Enter game ID')
            return
        }
        setLoading(true)
        try {
            const gid = BigInt(gameId)
            addLog(`Ending game ${gid} with 2% fee...`)

            const txHash = await writeToContract(
                chainConfig,
                customChain,
                'endGame',
                [gid, 2n]
            )

            addLog(`✅ Game ended! Tx: ${txHash.slice(0, 10)}...`)
            addLog(`Winner receives: ${Number(stakeAmount) * 2 * 0.98} (minus 2% fee)`)
        } catch (error) {
            addLog(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        } finally {
            setLoading(false)
        }
    }

    // Clear logs
    const clearLogs = () => {
        setGameLogs([])
    }

    const inputStyle = {
        padding: '0.5rem',
        background: '#222',
        border: '1px solid #333',
        color: '#fff',
        borderRadius: '0.25rem',
        fontFamily: 'monospace',
        fontSize: '0.875rem',
    } as const

    const buttonStyle = {
        padding: '0.5rem 1rem',
        background: '#3b82f6',
        border: 'none',
        color: '#fff',
        borderRadius: '0.25rem',
        cursor: 'pointer',
        fontSize: '0.875rem',
        opacity: loading ? 0.5 : 1,
        cursor: loading ? 'not-allowed' : 'pointer',
    } as const

    return (
        <div style={{ padding: '2rem', borderRadius: '0.5rem', background: '#111', color: '#fff' }}>
            <h2>📋 Simple Escrow Demo</h2>
            <p style={{ color: '#999', fontSize: '0.875rem', marginBottom: '1rem' }}>
                Manual game lifecycle: create, join, ready, add loser, end. Learn the flow.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Left: Control Panel */}
                <div>
                    <h3>Control Panel</h3>

                    {/* Section: Create Game */}
                    <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#1a1a1a', borderRadius: '0.5rem' }}>
                        <h4 style={{ marginTop: 0 }}>Step 1: Create Game</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                            <label>
                                Stake Amount ({chainConfig.nativeCurrency.symbol}):
                                <input
                                    type="number"
                                    step="0.01"
                                    value={stakeAmount}
                                    onChange={(e) => setStakeAmount(e.target.value)}
                                    style={{ ...inputStyle, marginTop: '0.25rem', width: '100%' }}
                                />
                            </label>
                            <label>
                                Whitelist (comma-separated addresses, optional):
                                <textarea
                                    value={whitelistAddresses}
                                    onChange={(e) => setWhitelistAddresses(e.target.value)}
                                    placeholder="0x..., 0x..."
                                    style={{ ...inputStyle, marginTop: '0.25rem', width: '100%', minHeight: '60px' }}
                                />
                            </label>
                            <button onClick={createGame} disabled={loading} style={buttonStyle}>
                                {loading ? 'Creating...' : 'Create Game'}
                            </button>
                        </div>
                    </div>

                    {/* Section: Join Game */}
                    <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#1a1a1a', borderRadius: '0.5rem' }}>
                        <h4 style={{ marginTop: 0 }}>Step 2: Join Game</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                            <label>
                                Game ID:
                                <input
                                    type="number"
                                    value={gameId}
                                    onChange={(e) => setGameId(e.target.value)}
                                    placeholder="e.g., 1"
                                    style={{ ...inputStyle, marginTop: '0.25rem', width: '100%' }}
                                />
                            </label>
                            <button onClick={joinGame} disabled={loading} style={buttonStyle}>
                                {loading ? 'Joining...' : 'Join Game'}
                            </button>
                        </div>
                    </div>

                    {/* Section: Manage Game */}
                    <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#1a1a1a', borderRadius: '0.5rem' }}>
                        <h4 style={{ marginTop: 0 }}>Step 3-5: Manage Game</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                            <button
                                onClick={handleSetReady}
                                disabled={loading}
                                style={{ ...buttonStyle, background: '#f59e0b' }}
                            >
                                3️⃣ Mark Ready
                            </button>

                            <label>
                                Opponent Address (to mark as loser):
                                <input
                                    type="text"
                                    value={opponentAddress}
                                    onChange={(e) => setOpponentAddress(e.target.value)}
                                    placeholder="0x..."
                                    style={{ ...inputStyle, marginTop: '0.25rem', width: '100%' }}
                                />
                            </label>

                            <button
                                onClick={handleAddLoser}
                                disabled={loading}
                                style={{ ...buttonStyle, background: '#ef4444' }}
                            >
                                4️⃣ Add Loser
                            </button>

                            <button
                                onClick={handleEndGame}
                                disabled={loading}
                                style={{ ...buttonStyle, background: '#10b981' }}
                            >
                                5️⃣ End Game (Distribute Prize)
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: Logs */}
                <div>
                    <h3>Game Logs</h3>
                    <div
                        style={{
                            background: '#0a0a0a',
                            border: '1px solid #333',
                            borderRadius: '0.5rem',
                            padding: '1rem',
                            maxHeight: '500px',
                            overflowY: 'auto',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            color: '#0f0',
                        }}
                    >
                        {gameLogs.length === 0 ? (
                            <div style={{ color: '#666' }}>Logs will appear here...</div>
                        ) : (
                            gameLogs.map((log, i) => (
                                <div key={i} style={{ marginBottom: '0.25rem' }}>
                                    {log}
                                </div>
                            ))
                        )}
                    </div>
                    <button
                        onClick={clearLogs}
                        style={{
                            marginTop: '0.5rem',
                            padding: '0.25rem 0.5rem',
                            background: '#333',
                            border: 'none',
                            color: '#fff',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                        }}
                    >
                        Clear Logs
                    </button>
                </div>
            </div>

            {/* Instructions */}
            <div style={{ marginTop: '2rem', padding: '1rem', background: '#1a1a1a', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#999' }}>
                <strong>How to use:</strong>
                <ol style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                    <li>Player 1: Create a game with your stake</li>
                    <li>Player 2: Join that game with the same stake</li>
                    <li>Player 1 (governor): Mark the game as ready</li>
                    <li>Player 1 (governor): Add the loser (player 2's address)</li>
                    <li>Player 1 (governor): End the game and distribute the prize</li>
                    <li>Player 2 receives their stake × 2 minus the 2% governor fee</li>
                </ol>
            </div>
        </div>
    )
}
