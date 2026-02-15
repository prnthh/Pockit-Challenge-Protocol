import './App.css'
import { useState, useEffect } from 'react'
import { createPublicClient, createWalletClient, http, formatEther, custom } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import contractABI from './challengeAbi'
import SinglePage from './components/SinglePage'

// Chain configurations
export const CHAINS = {
    mainnet: {
        chain: mainnet,
        contractAddress: '0xb8f26231ab263ed6c85f2a602a383d597936164b',
        faucetUrl: undefined,
    },
    sepolia: {
        chain: sepolia,
        contractAddress: '0xdD8D06f2FFf260536ea4B8bcd34E06B03d5Af2D8',
        faucetUrl: 'https://sepoliafaucet.com/',
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
const createWallet = async (chain: typeof mainnet | typeof sepolia) => {
    if (!window.ethereum) throw new Error('No wallet found')
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    return createWalletClient({
        account: accounts[0] as `0x${string}`,
        chain: chain,
        transport: custom(window.ethereum),
    })
}

const switchNetwork = async (chain: typeof mainnet | typeof sepolia) => {
    if (!window.ethereum) return
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${chain.id.toString(16)}` }],
        })
    } catch (switchError: any) {
        if (switchError.code === 4902) {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: `0x${chain.id.toString(16)}`,
                    chainName: chain.name,
                    nativeCurrency: chain.nativeCurrency,
                    rpcUrls: chain.rpcUrls.default.http,
                    blockExplorerUrls: chain.blockExplorers?.default ? [chain.blockExplorers.default.url] : [],
                }],
            })
        } else {
            throw switchError
        }
    }
}

const ensureCorrectChain = async (chain: typeof mainnet | typeof sepolia) => {
    if (!window.ethereum) throw new Error('No wallet found')
    const chainId = await window.ethereum.request({ method: 'eth_chainId' })
    const expectedChainId = `0x${chain.id.toString(16)}`
    if (chainId !== expectedChainId) await switchNetwork(chain)
}

export const writeToContract = async (
    chainConfig: typeof CHAINS[ChainKey],
    functionName: string,
    args: readonly unknown[],
    value?: bigint
) => {
    const chain = chainConfig.chain
    await ensureCorrectChain(chain)
    const wallet = await createWallet(chain)
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
    const [selectedChain, setSelectedChain] = useState<ChainKey>('sepolia')
    const [walletAddress, setWalletAddress] = useState<string>('')
    const [balance, setBalance] = useState<string>('')

    // Get current chain configuration
    const CHAIN_CONFIG = CHAINS[selectedChain]
    const viemChain = CHAIN_CONFIG.chain

    // Create client using viem chain
    const client = createPublicClient({
        chain: viemChain,
        transport: http(),
    })

    const updateBalance = async (address: string) => {
        const bal = await client.getBalance({ address: address as `0x${string}` })
        setBalance(`${formatEther(bal)} ${viemChain.nativeCurrency.symbol}`)
    }

    const connectWallet = async () => {
        if (window.ethereum) {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
                const address = accounts[0]
                const chainId = await window.ethereum.request({ method: 'eth_chainId' })
                const expectedChainId = `0x${viemChain.id.toString(16)}`
                if (chainId !== expectedChainId) await switchNetwork(viemChain)
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

    // Update balance when client changes (which happens when chain changes)
    useEffect(() => {
        const updateBalanceOnChainChange = async () => {
            if (walletAddress) {
                const bal = await client.getBalance({
                    address: walletAddress as `0x${string}`,
                })
                setBalance(`${formatEther(bal)} ${viemChain.nativeCurrency.symbol}`)
            } else {
                setBalance(`0 ${viemChain.nativeCurrency.symbol}`)
            }
        }
        updateBalanceOnChainChange()
    }, [client, walletAddress, viemChain.nativeCurrency.symbol])

    // Switch wallet network when chain changes
    useEffect(() => {
        if (walletAddress) {
            switchNetwork(viemChain)
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
                        <option value="mainnet">Ethereum Mainnet</option>
                        <option value="sepolia">Sepolia Testnet</option>
                    </select>
                </div>

                <div className="wallet-info">
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <a href="https://github.com/prnthh/Pockit-Challenge-Protocol/" target="_blank" rel="noopener noreferrer">
                            GitHub
                        </a>

                        {CHAIN_CONFIG.faucetUrl && (
                            <a href={CHAIN_CONFIG.faucetUrl} target="_blank" rel="noopener noreferrer">
                                Get {viemChain.nativeCurrency.symbol}
                            </a>
                        )}

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

            <SinglePage
                walletAddress={walletAddress}
                chainConfig={CHAIN_CONFIG}
            />
        </div>
    )
}

export default App
