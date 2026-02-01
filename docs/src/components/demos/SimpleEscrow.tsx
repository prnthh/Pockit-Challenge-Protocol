import { useState } from 'react'
import type { defineChain } from 'viem'
import { CHAINS } from '../../App'
import type { ChainKey } from '../../App'

interface SimpleEscrowProps {
    walletAddress: string
    chainConfig: typeof CHAINS[ChainKey]
    customChain: any
}

export default function SimpleEscrow({ walletAddress, chainConfig, customChain }: SimpleEscrowProps) {
    const [gameId, setGameId] = useState('')
    const [loading, setLoading] = useState(false)
    const [gameLogs, setGameLogs] = useState<string[]>([])

    const addLog = (msg: string) => {
        const timestamp = new Date().toLocaleTimeString()
        setGameLogs(prev => [...prev, `[${timestamp}] ${msg}`])
    }

    const createGame = async () => {
        setLoading(true)
        addLog('Creating game...')
        setTimeout(() => {
            addLog('✅ Game created!')
            setLoading(false)
        }, 1000)
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
    } as const

    const buttonStyle = {
        padding: '0.5rem 1rem',
        background: '#3b82f6',
        border: 'none',
        color: '#fff',
        borderRadius: '0.25rem',
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: '0.875rem',
        opacity: loading ? 0.5 : 1,
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

                    <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#1a1a1a', borderRadius: '0.5rem' }}>
                        <h4 style={{ marginTop: 0 }}>Step 1: Create Game</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                            <button onClick={createGame} disabled={loading} style={buttonStyle}>
                                {loading ? 'Creating...' : 'Create Game'}
                            </button>
                        </div>
                    </div>

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
                            <button onClick={() => addLog('Joined game ' + (gameId || '?'))} disabled={loading} style={buttonStyle}>
                                Join Game
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
                            maxHeight: '300px',
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
        </div>
    )
}
