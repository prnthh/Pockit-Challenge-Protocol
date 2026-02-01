import { useState } from 'react'
import type { defineChain } from 'viem'
import { CHAINS } from '../App'
import type { ChainKey } from '../App'
import SinglePage from './SinglePage'
import { CoinFlip, SimpleEscrow } from './demos'

type DemoTab = 'main' | 'coinflip' | 'escrow'

function DemoNav({ activeTab, setActiveTab }: { activeTab: DemoTab; setActiveTab: (tab: DemoTab) => void }) {
    const tabs: { id: DemoTab; label: string; description: string }[] = [
        { id: 'main', label: 'Main Dashboard', description: 'Create & manage games' },
        { id: 'coinflip', label: '🪙 CoinFlip', description: 'Learn the basics' },
        { id: 'escrow', label: '📋 Simple Escrow', description: 'Step-by-step control' },
    ]

    return (
        <div style={{
            display: 'flex',
            gap: '1rem',
            padding: '1rem 2rem',
            background: 'linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)',
            borderBottom: '1px solid #333',
            overflowX: 'auto',
            position: 'sticky',
            top: 0,
            zIndex: 10,
        }}>
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                        padding: '0.75rem 1.5rem',
                        background: activeTab === tab.id ? '#3b82f6' : '#222',
                        border: activeTab === tab.id ? '2px solid #60a5fa' : '1px solid #333',
                        color: '#fff',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: activeTab === tab.id ? '600' : '400',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap',
                    }}
                    title={tab.description}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    )
}

function DemoContainer({
    walletAddress,
    chainConfig,
    customChain,
}: {
    walletAddress: string
    chainConfig: typeof CHAINS[ChainKey]
    customChain: ReturnType<typeof defineChain>
}) {
    const [activeTab, setActiveTab] = useState<DemoTab>('main')

    return (
        <>
            <DemoNav activeTab={activeTab} setActiveTab={setActiveTab} />

            <div style={{ padding: '2rem' }}>
                {activeTab === 'main' && (
                    <SinglePage
                        walletAddress={walletAddress}
                        chainConfig={chainConfig}
                        customChain={customChain}
                    />
                )}

                {activeTab === 'coinflip' && (
                    <CoinFlip
                        walletAddress={walletAddress}
                        chainConfig={chainConfig}
                        customChain={customChain}
                    />
                )}

                {activeTab === 'escrow' && (
                    <SimpleEscrow
                        walletAddress={walletAddress}
                        chainConfig={chainConfig}
                        customChain={customChain}
                    />
                )}
            </div>
        </>
    )
}

export default DemoContainer
