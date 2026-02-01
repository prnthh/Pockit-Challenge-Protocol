import { useState } from 'react'
import { useGameEscrow } from '../../hooks'
import type { CHAINS, ChainKey } from '../../App'

interface CoinFlipProps {
    walletAddress: string | null
    chainConfig: typeof CHAINS[ChainKey]
}

export default function CoinFlip({ walletAddress, chainConfig }: CoinFlipProps) {
    const [stakeAmount, setStakeAmount] = useState('0.01')
    const [governorAddress, setGovernorAddress] = useState('')
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    const { loading, error, createGame, clearError } = useGameEscrow({
        chainConfig,
        walletAddress,
    })

    const handleCreateGame = async () => {
        if (!walletAddress) {
            alert('Connect wallet first')
            return
        }

        if (!governorAddress) {
            alert('Please enter a governor address')
            return
        }

        clearError()
        const hash = await createGame(stakeAmount, governorAddress)
        
        if (hash) {
            setSuccessMessage(`Game created! Tx: ${hash.slice(0, 10)}...`)
            setStakeAmount('0.01')
            setGovernorAddress('')
            setTimeout(() => setSuccessMessage(null), 5000)
        }
    }

    return (
        <div style={{ padding: '2rem', borderRadius: '0.5rem', background: '#111', color: '#fff', marginBottom: '2rem' }}>
            <h2>🪙 CoinFlip Demo</h2>
            <p style={{ color: '#999', fontSize: '0.875rem', marginBottom: '1rem' }}>
                Simplest game: players join, we flip a coin, winner takes all.
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

            {successMessage && (
                <div style={{
                    background: '#16a34a',
                    color: 'white',
                    padding: '0.75rem',
                    borderRadius: '0.25rem',
                    marginBottom: '1rem',
                    fontSize: '0.875rem',
                }}>
                    {successMessage}
                </div>
            )}

            <div style={{ marginBottom: '2rem', padding: '1rem', background: '#1a1a1a', borderRadius: '0.5rem' }}>
                <h3 style={{ marginTop: 0 }}>Create Game</h3>
                
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#999' }}>
                        Stake Amount ({chainConfig.nativeCurrency.symbol})
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                        placeholder="0.01"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: '#222',
                            border: '1px solid #333',
                            color: '#fff',
                            borderRadius: '0.25rem',
                            boxSizing: 'border-box',
                        }}
                    />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#999' }}>
                        Governor Address
                    </label>
                    <input
                        type="text"
                        value={governorAddress}
                        onChange={(e) => setGovernorAddress(e.target.value)}
                        placeholder="0x..."
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '0.5rem',
                            background: '#222',
                            border: '1px solid #333',
                            color: '#fff',
                            borderRadius: '0.25rem',
                            boxSizing: 'border-box',
                            fontFamily: 'monospace',
                            fontSize: '0.875rem',
                        }}
                    />
                </div>

                <button
                    onClick={handleCreateGame}
                    disabled={loading || !walletAddress}
                    style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: loading || !walletAddress ? '#4b5563' : '#3b82f6',
                        border: 'none',
                        color: '#fff',
                        borderRadius: '0.25rem',
                        cursor: loading || !walletAddress ? 'not-allowed' : 'pointer',
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        transition: 'background 0.2s',
                    }}
                >
                    {loading ? 'Creating...' : 'Create Game'}
                </button>
            </div>

            <div style={{ marginTop: '2rem', padding: '1rem', background: '#1a1a1a', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#999' }}>
                <strong>How it works:</strong>
                <ol style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                    <li>Create a game with your stake amount and a governor address</li>
                    <li>Another player joins with the same stake</li>
                    <li>Governor starts the game</li>
                    <li>Governor flips a coin to determine winner</li>
                    <li>Winner receives both stakes minus governor fee</li>
                </ol>
            </div>
        </div>
    )
}
