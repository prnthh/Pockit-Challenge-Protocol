import { useState } from 'react'
import { useGameEscrow } from '../../hooks'
import type { CHAINS, ChainKey } from '../../App'

interface SimpleEscrowProps {
    walletAddress: string | null
    chainConfig: typeof CHAINS[ChainKey]
}

export default function SimpleEscrow({ walletAddress, chainConfig }: SimpleEscrowProps) {
    const [gameId, setGameId] = useState('')
    const [stakeAmount, setStakeAmount] = useState('0.01')
    const [governorAddress, setGovernorAddress] = useState('')
    const [loserAddress, setLoserAddress] = useState('')
    const [gameLogs, setGameLogs] = useState<string[]>([])

    const { loading, error, createGame, joinGame, addLoser, clearError } = useGameEscrow({
        chainConfig,
        walletAddress,
    })

    const addLog = (msg: string) => {
        const timestamp = new Date().toLocaleTimeString()
        setGameLogs(prev => [...prev, `[${timestamp}] ${msg}`])
    }

    const handleCreateGame = async () => {
        if (!walletAddress) {
            addLog('❌ Connect wallet first')
            return
        }

        if (!governorAddress) {
            addLog('❌ Enter governor address')
            return
        }

        clearError()
        addLog('Creating game...')
        const hash = await createGame(stakeAmount, governorAddress)
        
        if (hash) {
            addLog(`✅ Game created! Tx: ${hash.slice(0, 10)}...`)
        } else {
            addLog(`❌ Failed to create game`)
        }
    }

    const handleJoinGame = async () => {
        if (!walletAddress) {
            addLog('❌ Connect wallet first')
            return
        }

        if (!gameId) {
            addLog('❌ Enter a game ID')
            return
        }

        clearError()
        addLog(`Joining game ${gameId}...`)
        const hash = await joinGame(BigInt(gameId), stakeAmount)
        
        if (hash) {
            addLog(`✅ Joined game! Tx: ${hash.slice(0, 10)}...`)
        } else {
            addLog(`❌ Failed to join game`)
        }
    }

    const handleMarkLoser = async () => {
        if (!walletAddress) {
            addLog('❌ Connect wallet first')
            return
        }

        if (!gameId || !loserAddress) {
            addLog('❌ Enter game ID and loser address')
            return
        }

        clearError()
        addLog(`Marking loser for game ${gameId}...`)
        const hash = await addLoser(BigInt(gameId), loserAddress)
        
        if (hash) {
            addLog(`✅ Loser marked! Tx: ${hash.slice(0, 10)}...`)
        } else {
            addLog(`❌ Failed to mark loser`)
        }
    }

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
        width: '100%',
        boxSizing: 'border-box' as const,
    }

    const buttonStyle = (isDisabled: boolean) => ({
        padding: '0.5rem 1rem',
        background: isDisabled ? '#4b5563' : '#3b82f6',
        border: 'none',
        color: '#fff',
        borderRadius: '0.25rem',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        fontSize: '0.875rem',
        opacity: isDisabled ? 0.5 : 1,
        width: '100%',
    })

    return (
        <div style={{ padding: '2rem', borderRadius: '0.5rem', background: '#111', color: '#fff' }}>
            <h2>📋 Simple Escrow Demo</h2>
            <p style={{ color: '#999', fontSize: '0.875rem', marginBottom: '1rem' }}>
                Manual game lifecycle: create, join, mark loser, resolve. Learn the flow.
            </p>

            {error && (
                <div style={{
                    background: '#dc2626',
                    color: 'white',
                    padding: '0.75rem',
                    borderRadius: '0.25rem',
                    marginBottom: '1rem',
                    fontSize: '0.875rem',
                }}>
                    {error}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Left: Control Panel */}
                <div>
                    <h3 style={{ marginTop: 0 }}>Control Panel</h3>

                    <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#1a1a1a', borderRadius: '0.5rem' }}>
                        <h4 style={{ marginTop: 0, fontSize: '0.875rem' }}>Step 1: Create Game</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
                            <div>
                                <label style={{ color: '#999' }}>Stake Amount ({chainConfig.nativeCurrency.symbol})</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={stakeAmount}
                                    onChange={(e) => setStakeAmount(e.target.value)}
                                    placeholder="0.01"
                                    disabled={loading}
                                    style={{ ...inputStyle, marginTop: '0.25rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ color: '#999' }}>Governor Address</label>
                                <input
                                    type="text"
                                    value={governorAddress}
                                    onChange={(e) => setGovernorAddress(e.target.value)}
                                    placeholder="0x..."
                                    disabled={loading}
                                    style={{ ...inputStyle, marginTop: '0.25rem' }}
                                />
                            </div>
                            <button onClick={handleCreateGame} disabled={loading || !walletAddress} style={buttonStyle(loading || !walletAddress)}>
                                {loading ? 'Creating...' : 'Create Game'}
                            </button>
                        </div>
                    </div>

                    <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#1a1a1a', borderRadius: '0.5rem' }}>
                        <h4 style={{ marginTop: 0, fontSize: '0.875rem' }}>Step 2: Join Game</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
                            <div>
                                <label style={{ color: '#999' }}>Game ID</label>
                                <input
                                    type="number"
                                    value={gameId}
                                    onChange={(e) => setGameId(e.target.value)}
                                    placeholder="0"
                                    disabled={loading}
                                    style={{ ...inputStyle, marginTop: '0.25rem' }}
                                />
                            </div>
                            <button onClick={handleJoinGame} disabled={loading || !walletAddress} style={buttonStyle(loading || !walletAddress)}>
                                {loading ? 'Joining...' : 'Join Game'}
                            </button>
                        </div>
                    </div>

                    <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#1a1a1a', borderRadius: '0.5rem' }}>
                        <h4 style={{ marginTop: 0, fontSize: '0.875rem' }}>Step 3: Mark Loser</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
                            <div>
                                <label style={{ color: '#999' }}>Loser Address</label>
                                <input
                                    type="text"
                                    value={loserAddress}
                                    onChange={(e) => setLoserAddress(e.target.value)}
                                    placeholder="0x..."
                                    disabled={loading}
                                    style={{ ...inputStyle, marginTop: '0.25rem' }}
                                />
                            </div>
                            <button onClick={handleMarkLoser} disabled={loading || !walletAddress} style={buttonStyle(loading || !walletAddress)}>
                                {loading ? 'Marking...' : 'Mark Loser'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: Logs */}
                <div>
                    <h3 style={{ marginTop: 0 }}>Game Logs</h3>
                    <div style={{
                        background: '#0a0a0a',
                        border: '1px solid #222',
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        height: '400px',
                        overflowY: 'auto',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        marginBottom: '1rem',
                    }}>
                        {gameLogs.length === 0 ? (
                            <p style={{ color: '#666', margin: 0 }}>Waiting for actions...</p>
                        ) : (
                            gameLogs.map((log, i) => (
                                <div key={i} style={{ color: log.includes('❌') ? '#ef4444' : log.includes('✅') ? '#22c55e' : '#999', marginBottom: '0.25rem' }}>
                                    {log}
                                </div>
                            ))
                        )}
                    </div>
                    <button onClick={clearLogs} style={{
                        padding: '0.5rem 1rem',
                        background: '#374151',
                        border: 'none',
                        color: '#fff',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        width: '100%',
                    }}>
                        Clear Logs
                    </button>
                </div>
            </div>

            <div style={{ marginTop: '2rem', padding: '1rem', background: '#1a1a1a', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#999' }}>
                <strong>Flow:</strong>
                <ol style={{ marginLeft: '1.5rem', marginTop: '0.5rem', marginBottom: 0 }}>
                    <li>Create a game with your stake amount</li>
                    <li>Get the game ID from logs</li>
                    <li>Another player joins with the same stake</li>
                    <li>Mark the loser address (only governor can do this)</li>
                    <li>Winner receives both stakes minus governor fee</li>
                </ol>
            </div>
        </div>
    )
}
