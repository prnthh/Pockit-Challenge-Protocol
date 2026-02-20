import { useState, useEffect } from 'react'
import { createPublicClient, createWalletClient, http, formatEther, custom } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import contractABI from './challengeAbi'
import SinglePage from './components/SinglePage'
import CoinFlipGame from './components/CoinFlipGame'

// Chain configurations
export const CHAINS = {
    mainnet: {
        chain: mainnet,
        contractAddress: '0xcbeb8fbbc2ca9afb908381f24ec4cea493b9482c',
        faucetUrl: undefined,
    },
    sepolia: {
        chain: sepolia,
        contractAddress: '0xA84Ba779A4Caeb2f5Cee0aE83e9f8D28298F1977',
        faucetUrl: 'https://sepoliafaucet.com/',
    },
} as const

export type ChainKey = keyof typeof CHAINS

export interface GameInfo {
    governor: string
    stakeAmount: bigint
    maxPlayers: bigint
    activePlayers: bigint
    state: number  // 0 = Open, 1 = Started, 2 = Resolved
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
        value: value as bigint,
        gas: 500_000n,
        chain: null,
    } as any)
}

function App() {
    const [selectedChain, setSelectedChain] = useState<ChainKey>('sepolia')
    const [walletAddress, setWalletAddress] = useState<string>('')
    const [balance, setBalance] = useState<string>('')
    const [activePage, setActivePage] = useState<'dashboard' | 'coinflip'>('dashboard')

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
        <div className="max-w-5xl mx-auto px-4 py-6">
            <header className="text-center mb-6">
                <h1 className="font-heading text-4xl md:text-5xl text-ink tracking-tight leading-tight">
                    Pockit Challenge Protocol
                </h1>

                <div className="fixed top-4 right-4 z-50">
                    <select
                        value={selectedChain}
                        onChange={(e) => setSelectedChain(e.target.value as ChainKey)}
                        className="px-3 py-1.5 text-xs font-bold font-body border-3 border-ink bg-card text-ink rounded-full cursor-pointer hover:bg-yellow transition-colors"
                    >
                        <option value="mainnet">Ethereum Mainnet</option>
                        <option value="sepolia">Sepolia Testnet</option>
                    </select>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-4 mt-3">
                    <div className="flex gap-3">
                        <a href="https://github.com/prnthh/Pockit-Challenge-Protocol/" target="_blank" rel="noopener noreferrer"
                            className="font-bold text-pink hover:text-pink-dark hover:underline decoration-wavy">
                            GitHub
                        </a>
                        {CHAIN_CONFIG.faucetUrl && (
                            <a href={CHAIN_CONFIG.faucetUrl} target="_blank" rel="noopener noreferrer"
                                className="font-bold text-pink hover:text-pink-dark hover:underline decoration-wavy">
                                Get {viemChain.nativeCurrency.symbol}
                            </a>
                        )}
                        <a href="https://remix.ethereum.org/#url=https://raw.githubusercontent.com/prnthh/Pockit-Challenge-Protocol/main/contracts/contract.sol"
                            target="_blank" rel="noopener noreferrer"
                            className="font-bold text-pink hover:text-pink-dark hover:underline decoration-wavy">
                            Open in Remix
                        </a>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={connectWallet}
                            className="px-4 py-2 bg-pink text-white font-bold rounded-full border-3 border-ink shadow-[3px_3px_0_var(--color-ink)] hover:shadow-[1px_1px_0_var(--color-ink)] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all cursor-pointer text-sm"
                        >
                            {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Connect Wallet'}
                        </button>
                        <div
                            onClick={() => walletAddress && updateBalance(walletAddress)}
                            className={`px-3 py-1.5 bg-card border-3 border-ink rounded-full text-sm font-bold shadow-[2px_2px_0_var(--color-ink)] ${walletAddress ? 'cursor-pointer hover:bg-yellow transition-colors' : ''}`}
                        >
                            {balance}
                        </div>
                    </div>
                </div>
            </header>

            <nav className="flex justify-center gap-2 mb-6">
                <button
                    onClick={() => setActivePage('dashboard')}
                    className={`px-5 py-2.5 font-bold rounded-full border-3 border-ink text-sm transition-all cursor-pointer ${activePage === 'dashboard'
                            ? 'bg-orange text-ink shadow-[3px_3px_0_var(--color-ink)]'
                            : 'bg-card text-ink shadow-[2px_2px_0_var(--color-ink)] hover:bg-yellow hover:shadow-[3px_3px_0_var(--color-ink)]'
                        }`}
                >
                    📋 Dashboard
                </button>
                <button
                    onClick={() => setActivePage('coinflip')}
                    className={`px-5 py-2.5 font-bold rounded-full border-3 border-ink text-sm transition-all cursor-pointer ${activePage === 'coinflip'
                            ? 'bg-cyan text-ink shadow-[3px_3px_0_var(--color-ink)]'
                            : 'bg-card text-ink shadow-[2px_2px_0_var(--color-ink)] hover:bg-yellow hover:shadow-[3px_3px_0_var(--color-ink)]'
                        }`}
                >
                    🪙 Coin Flip
                </button>
            </nav>

            {activePage === 'dashboard' ? (
                <SinglePage walletAddress={walletAddress} chainConfig={CHAIN_CONFIG} />
            ) : (
                <CoinFlipGame walletAddress={walletAddress} chainConfig={CHAIN_CONFIG} />
            )}
        </div>
    )
}

export default App
