import { useState } from 'react'
import type { defineChain } from 'viem'
import { CHAINS } from '../../App'
import type { ChainKey } from '../../App'

interface CoinFlipProps {
    walletAddress: string
    chainConfig: typeof CHAINS[ChainKey]
    customChain: any
}

export default function CoinFlip({ walletAddress, chainConfig, customChain }: CoinFlipProps) {
    const [stakeAmount, setStakeAmount] = useState('0.01')
    const [loading, setLoading] = useState(false)

    const createGame = async () => {
        if (!walletAddress) {
            alert('Connect wallet first')
            return
        }
        setLoading(true)
        setTimeout(() => setLoading(false), 1000)
    }

    return (
        <div style={{ padding: '2rem', borderRadius: '0.5rem', background: '#111', color: '#fff', marginBottom: '2rem' }}>
            <h2>🪙 CoinFlip Demo</h2>
            <p style={{ color: '#999', fontSize: '0.875rem', marginBottom: '1rem' }}>
                Simplest game: players join, we flip a coin, winner takes all.
            </p>

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
