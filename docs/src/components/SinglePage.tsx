import { CHAINS } from '../App'
import type { ChainKey } from '../App'
import CoinFlip from './demos/CoinFlip'
import SimpleEscrow from './demos/SimpleEscrow'
import { useState } from 'react'

type DemoTab = 'coinflip' | 'escrow'

function SinglePage({
    walletAddress,
    chainConfig,
}: {
    walletAddress: string | null
    chainConfig: typeof CHAINS[ChainKey]
}) {
    const [activeTab, setActiveTab] = useState<DemoTab>('coinflip')

    const tabStyle = (isActive: boolean) => ({
        padding: '0.75rem 1.5rem',
        background: isActive ? '#3b82f6' : '#222',
        border: 'none',
        color: '#fff',
        cursor: 'pointer',
        fontSize: '0.875rem',
        borderRadius: '0.25rem 0.25rem 0 0',
    })

    return (
        <div>
            <div style={{ display: 'flex', gap: 0, marginBottom: 0 }}>
                <button
                    onClick={() => setActiveTab('coinflip')}
                    style={tabStyle(activeTab === 'coinflip')}
                >
                    🪙 CoinFlip
                </button>
                <button
                    onClick={() => setActiveTab('escrow')}
                    style={tabStyle(activeTab === 'escrow')}
                >
                    📋 Simple Escrow
                </button>
            </div>

            <div style={{ background: '#111', padding: '2rem', borderRadius: '0 0.5rem 0.5rem 0.5rem' }}>
                {!walletAddress && (
                    <div style={{
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        color: '#999',
                        marginBottom: '2rem',
                        textAlign: 'center',
                    }}>
                        Connect your wallet to get started
                    </div>
                )}

                {activeTab === 'coinflip' && (
                    <CoinFlip walletAddress={walletAddress} chainConfig={chainConfig} />
                )}

                {activeTab === 'escrow' && (
                    <SimpleEscrow walletAddress={walletAddress} chainConfig={chainConfig} />
                )}
            </div>
        </div>
    )
}

export default SinglePage
