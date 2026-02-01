import './App.css'
import { useState } from 'react'
import { useWallet, useGameEscrow } from './hooks'
import DemoContainer from './components/DemoContainer'

// Chain configurations
export const CHAINS = {
    localhost: {
        id: 31337,
        chainId: '0x7a69',
        name: 'Localhost (Anvil)',
        network: 'localhost',
        nativeCurrency: {
            decimals: 18,
            name: 'ETH',
            symbol: 'ETH',
        },
        rpcUrl: 'http://127.0.0.1:8545',
        blockExplorer: 'http://127.0.0.1:8545/',
        faucetUrl: 'http://127.0.0.1:8545/',
        contractAddress: import.meta.env.VITE_LOCAL_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
    },
    sanko: {
        id: 1992,
        chainId: '0x7c8',
        name: 'Sanko Testnet',
        network: 'custom',
        nativeCurrency: {
            decimals: 18,
            name: 'DMT',
            symbol: 'DMT',
        },
        rpcUrl: 'https://sanko-arb-sepolia.rpc.caldera.xyz/http',
        blockExplorer: 'https://sanko-arb-sepolia.hub.caldera.xyz/',
        faucetUrl: 'https://sanko-arb-sepolia.hub.caldera.xyz/',
        contractAddress: '0xdD8D06f2FFf260536ea4B8bcd34E06B03d5Af2D8',
    },
    sepolia: {
        id: 11155111,
        chainId: '0xaa36a7',
        name: 'Sepolia Testnet',
        network: 'sepolia',
        nativeCurrency: {
            decimals: 18,
            name: 'Sepolia ETH',
            symbol: 'SEP',
        },
        rpcUrl: 'https://rpc.sepolia.org',
        blockExplorer: 'https://sepolia.etherscan.io/',
        faucetUrl: 'https://sepoliafaucet.com/',
        contractAddress: '0xd0cE8C6c7Ec2DB144d53ca8A4eb3Ce612F0BEA87',
    },
} as const

export type ChainKey = keyof typeof CHAINS

export interface GameInfo {
    governor: string
    stakeAmount: bigint
    maxPlayers: bigint
    activePlayers: bigint
    isReady: boolean
    isEnded: boolean
    players: string[]
    losers: string[]
    whitelist: string[]
    forfeited: string[]
}

export interface Game extends GameInfo {
    id: bigint
}

function App() {
    const [selectedChain, setSelectedChain] = useState<ChainKey>(
        import.meta.env.VITE_LOCAL_CONTRACT_ADDRESS ? 'localhost' : 'sepolia'
    )
    const CHAIN_CONFIG = CHAINS[selectedChain]
    
    const { address, balance, connectWallet, updateBalance } = useWallet({ chainConfig: CHAIN_CONFIG })
    const { error: gameError, clearError } = useGameEscrow({ 
        chainConfig: CHAIN_CONFIG, 
        walletAddress: address 
    })

    return (
        <div className="app-container">
            <header className="app-header">
                <h1>Pockit Challenge Protocol</h1>

                <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 50 }}>
                    <select
                        value={selectedChain}
                        onChange={(e) => setSelectedChain(e.target.value as ChainKey)}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', border: '1px solid #3b82f6', background: '#1a1a1a', color: 'white', cursor: 'pointer' }}
                    >
                        {import.meta.env.VITE_LOCAL_CONTRACT_ADDRESS && <option value="localhost">Localhost (Anvil)</option>}
                        <option value="sanko">Sanko Testnet</option>
                        <option value="sepolia">Sepolia Testnet</option>
                    </select>
                </div>

                <div className="wallet-info">
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <a href="https://github.com/prnthh/Pockit-Challenge-Protocol/" target="_blank" rel="noopener noreferrer">
                            GitHub
                        </a>

                        <a href={CHAIN_CONFIG.faucetUrl} target="_blank" rel="noopener noreferrer">
                            Get {CHAIN_CONFIG.nativeCurrency.symbol}
                        </a>

                        <a
                            href="https://remix.ethereum.org/#url=https://raw.githubusercontent.com/prnthh/Pockit-Challenge-Protocol/main/contracts/contract.sol"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Open in Remix
                        </a>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button className="connect-button" onClick={connectWallet}>
                            {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connect Wallet'}
                        </button>

                        <div
                            className="balance"
                            onClick={updateBalance}
                            style={{ cursor: address ? 'pointer' : 'default' }}
                        >
                            {balance} {CHAIN_CONFIG.nativeCurrency.symbol}
                        </div>
                    </div>
                </div>
            </header>

            {gameError && (
                <div style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    background: '#dc2626',
                    color: 'white',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    maxWidth: '300px',
                    fontSize: '0.875rem',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem' }}>
                        <span>{gameError}</span>
                        <button onClick={clearError} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.25rem' }}>×</button>
                    </div>
                </div>
            )}

            <DemoContainer
                walletAddress={address}
                chainConfig={CHAIN_CONFIG}
            />
        </div>
    )
}

export default App
