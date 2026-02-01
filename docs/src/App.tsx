import './App.css'
import { useState, useEffect } from 'react'
import { createPublicClient, createWalletClient, http, defineChain, formatEther, custom } from 'viem'
import contractABI from './challengeAbi'
import DemoContainer from './components/DemoContainer'

// Chain configurations
export const CHAINS = {
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

export { contractABI }

// Wallet utilities
const createWallet = async (customChain: ReturnType<typeof defineChain>) => {
    if (!window.ethereum) throw new Error('No wallet found')
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    return createWalletClient({
        account: accounts[0] as `0x${string}`,
        chain: customChain,
        transport: custom(window.ethereum),
    })
}

const switchNetwork = async (chainConfig: typeof CHAINS[ChainKey]) => {
    if (!window.ethereum) return
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainConfig.chainId }],
        })
    } catch (switchError: any) {
        if (switchError.code === 4902) {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: chainConfig.chainId,
                    chainName: chainConfig.name,
                    nativeCurrency: chainConfig.nativeCurrency,
                    rpcUrls: [chainConfig.rpcUrl],
                    blockExplorerUrls: [chainConfig.blockExplorer],
                }],
            })
        } else {
            throw switchError
        }
    }
}

const ensureCorrectChain = async (chainConfig: typeof CHAINS[ChainKey]) => {
    if (!window.ethereum) throw new Error('No wallet found')
    const chainId = await window.ethereum.request({ method: 'eth_chainId' })
    if (chainId !== chainConfig.chainId) await switchNetwork(chainConfig)
}

export const writeToContract = async (
    chainConfig: typeof CHAINS[ChainKey],
    customChain: ReturnType<typeof defineChain>,
    functionName: string,
    args: readonly unknown[],
    value?: bigint
) => {
    await ensureCorrectChain(chainConfig)
    const wallet = await createWallet(customChain)
    return wallet.writeContract({
        address: chainConfig.contractAddress as `0x${string}`,
        abi: contractABI,
        functionName: functionName as any,
        args: args as any,
        value,
        chain: null,
    })
}

function App() {
    const [selectedChain, setSelectedChain] = useState<ChainKey>('sanko')
    const [walletAddress, setWalletAddress] = useState<string>('')
    const [balance, setBalance] = useState<string>('')

    const CHAIN_CONFIG = CHAINS[selectedChain]

    const customChain = defineChain({
        id: CHAIN_CONFIG.id,
        name: CHAIN_CONFIG.name,
        network: CHAIN_CONFIG.network,
        nativeCurrency: CHAIN_CONFIG.nativeCurrency,
        rpcUrls: {
            default: {
                http: [CHAIN_CONFIG.rpcUrl],
            },
        },
    })

    const client = createPublicClient({
        chain: customChain,
        transport: http(),
    })

    const updateBalance = async (address: string) => {
        const bal = await client.getBalance({ address: address as `0x${string}` })
        setBalance(`${formatEther(bal)} ${CHAIN_CONFIG.nativeCurrency.symbol}`)
    }

    const connectWallet = async () => {
        if (window.ethereum) {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
                const address = accounts[0]
                const chainId = await window.ethereum.request({ method: 'eth_chainId' })
                if (chainId !== CHAIN_CONFIG.chainId) await switchNetwork(CHAIN_CONFIG)
                setWalletAddress(address)
                await updateBalance(address)
            } catch (error) {
                console.error('User denied account access', error)
            }
        } else {
            alert('Please install MetaMask or another Ethereum wallet.')
        }
    }

    useEffect(() => {
        const checkWallet = async () => {
            if (window.ethereum) {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' })
                if (accounts.length > 0) {
                    setWalletAddress(accounts[0])
                    await updateBalance(accounts[0])
                }
            }
        }
        checkWallet()
    }, [])

    useEffect(() => {
        const updateBalanceOnChainChange = async () => {
            if (walletAddress) {
                const bal = await client.getBalance({
                    address: walletAddress as `0x${string}`,
                })
                setBalance(`${formatEther(bal)} ${CHAIN_CONFIG.nativeCurrency.symbol}`)
            } else {
                setBalance(`0 ${CHAIN_CONFIG.nativeCurrency.symbol}`)
            }
        }
        updateBalanceOnChainChange()
    }, [client, walletAddress, CHAIN_CONFIG.nativeCurrency.symbol])

    useEffect(() => {
        if (walletAddress) {
            switchNetwork(CHAIN_CONFIG)
        }
    }, [selectedChain])

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
                            {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Connect Wallet'}
                        </button>

                        <div
                            className="balance"
                            onClick={() => walletAddress && updateBalance(walletAddress)}
                            style={{ cursor: walletAddress ? 'pointer' : 'default' }}
                        >
                            {balance}
                        </div>
                    </div>
                </div>
            </header>

            <DemoContainer
                walletAddress={walletAddress}
                chainConfig={CHAIN_CONFIG}
                customChain={customChain}
            />
        </div>
    )
}

export default App
