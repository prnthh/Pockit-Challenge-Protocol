import { useState, useCallback, useEffect } from 'react'
import { createPublicClient, createWalletClient, defineChain, parseEther, http, custom } from 'viem'
import type { PublicClient, WalletClient } from 'viem'
import contractABI from '../challengeAbi'
import type { CHAINS, ChainKey, Game } from '../App'

interface UseGameEscrowProps {
    chainConfig: typeof CHAINS[ChainKey]
    walletAddress: string | null
}

interface UseGameEscrowReturn {
    // State
    loading: boolean
    error: string | null
    publicClient: PublicClient | null
    walletClient: WalletClient | null
    
    // Game queries
    getGame: (gameId: bigint) => Promise<Game | null>
    getNotStartedGames: () => Promise<bigint[]>
    getOngoingGames: () => Promise<bigint[]>
    getGovernorGames: () => Promise<bigint[]>
    
    // Game actions
    createGame: (stakeAmount: string, governorAddress: string, maxPlayers?: number, whitelist?: string[]) => Promise<string | null>
    joinGame: (gameId: bigint, stakeAmount: string) => Promise<string | null>
    forfeitGame: (gameId: bigint) => Promise<string | null>
    setGameReady: (gameId: bigint) => Promise<string | null>
    addLoser: (gameId: bigint, loserAddress: string) => Promise<string | null>
    endGame: (gameId: bigint, governorFeePercentage: number) => Promise<string | null>
    
    // Utils
    switchChain: () => Promise<void>
    clearError: () => void
}

export const useGameEscrow = ({ chainConfig, walletAddress }: UseGameEscrowProps): UseGameEscrowReturn => {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [publicClient, setPublicClient] = useState<PublicClient | null>(null)
    const [walletClient, setWalletClient] = useState<WalletClient | null>(null)

    // Initialize clients on mount and when chain changes
    useEffect(() => {
        const initClients = async () => {
            try {
                const customChain = defineChain({
                    id: chainConfig.id,
                    name: chainConfig.name,
                    network: chainConfig.network as any,
                    nativeCurrency: chainConfig.nativeCurrency,
                    rpcUrls: {
                        default: {
                            http: [chainConfig.rpcUrl],
                        },
                    },
                })

                const pub = createPublicClient({
                    chain: customChain,
                    transport: http(),
                })
                setPublicClient(pub)

                if (walletAddress && window.ethereum) {
                    const wal = createWalletClient({
                        account: walletAddress as `0x${string}`,
                        chain: customChain,
                        transport: custom(window.ethereum),
                    })
                    setWalletClient(wal)
                }
            } catch (err) {
                setError(`Failed to initialize clients: ${err instanceof Error ? err.message : String(err)}`)
            }
        }

        initClients()
    }, [chainConfig, walletAddress])

    const switchChain = useCallback(async () => {
        if (!window.ethereum) throw new Error('No wallet found')

        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: chainConfig.chainId }],
            })
        } catch (switchError: any) {
            if (switchError.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [
                        {
                            chainId: chainConfig.chainId,
                            chainName: chainConfig.name,
                            nativeCurrency: chainConfig.nativeCurrency,
                            rpcUrls: [chainConfig.rpcUrl],
                            blockExplorerUrls: [chainConfig.blockExplorer],
                        },
                    ],
                })
            } else {
                throw switchError
            }
        }
    }, [chainConfig])

    const ensureChain = useCallback(async () => {
        if (!window.ethereum) throw new Error('No wallet found')
        const chainId = await window.ethereum.request({ method: 'eth_chainId' })
        if (chainId !== chainConfig.chainId) await switchChain()
    }, [chainConfig, switchChain])

    const getGame = useCallback(
        async (gameId: bigint): Promise<Game | null> => {
            if (!publicClient) throw new Error('Public client not initialized')

            try {
                const result = (await publicClient.readContract({
                    address: chainConfig.contractAddress as `0x${string}`,
                    abi: contractABI,
                    functionName: 'getGame',
                    args: [gameId],
                })) as any

                if (!result) return null

                return {
                    id: gameId,
                    governor: result.governor,
                    stakeAmount: result.stakeAmount,
                    maxPlayers: result.maxPlayers,
                    activePlayers: result.activePlayers,
                    isReady: result.isReady,
                    isEnded: result.isEnded,
                    players: result.players,
                    losers: result.losers,
                    whitelist: result.whitelist,
                    forfeited: result.forfeited,
                } as Game
            } catch (err) {
                const msg = `Failed to get game: ${err instanceof Error ? err.message : String(err)}`
                setError(msg)
                return null
            }
        },
        [publicClient, chainConfig.contractAddress]
    )

    const getNotStartedGames = useCallback(async (): Promise<bigint[]> => {
        if (!publicClient) throw new Error('Public client not initialized')

        try {
            const result = (await publicClient.readContract({
                address: chainConfig.contractAddress as `0x${string}`,
                abi: contractABI,
                functionName: 'getNotStartedGames',
                args: [BigInt(0), BigInt(100)],
            } as any)) as bigint[]

            return result
        } catch (err) {
            const msg = `Failed to get not-started games: ${err instanceof Error ? err.message : String(err)}`
            setError(msg)
            return []
        }
    }, [publicClient, chainConfig.contractAddress])

    const getOngoingGames = useCallback(async (): Promise<bigint[]> => {
        if (!publicClient) throw new Error('Public client not initialized')

        try {
            const result = (await publicClient.readContract({
                address: chainConfig.contractAddress as `0x${string}`,
                abi: contractABI,
                functionName: 'getOngoingGames',
                args: [BigInt(0), BigInt(100)],
            } as any)) as bigint[]

            return result
        } catch (err) {
            const msg = `Failed to get ongoing games: ${err instanceof Error ? err.message : String(err)}`
            setError(msg)
            return []
        }
    }, [publicClient, chainConfig.contractAddress])

    const getGovernorGames = useCallback(async (): Promise<bigint[]> => {
        if (!publicClient) throw new Error('Public client not initialized')

        try {
            const result = (await publicClient.readContract({
                address: chainConfig.contractAddress as `0x${string}`,
                abi: contractABI,
                functionName: 'getGovernorGames',
                args: [BigInt(0), BigInt(100)],
            } as any)) as bigint[]

            return result
        } catch (err) {
            const msg = `Failed to get governor games: ${err instanceof Error ? err.message : String(err)}`
            setError(msg)
            return []
        }
    }, [publicClient, chainConfig.contractAddress])

    const createGame = useCallback(
        async (stakeAmount: string, governorAddress: string, maxPlayers?: number, whitelist?: string[]): Promise<string | null> => {
            if (!walletClient) throw new Error('Wallet client not initialized')

            setLoading(true)
            try {
                await ensureChain()

                const tx = await walletClient.writeContract({
                    address: chainConfig.contractAddress as `0x${string}`,
                    abi: contractABI,
                    functionName: 'createGame',
                    args: [governorAddress as `0x${string}`, maxPlayers || 0, whitelist || []],
                    value: parseEther(stakeAmount),
                } as any)

                return tx
            } catch (err) {
                const msg = `Failed to create game: ${err instanceof Error ? err.message : String(err)}`
                setError(msg)
                return null
            } finally {
                setLoading(false)
            }
        },
        [walletClient, chainConfig, ensureChain]
    )

    const joinGame = useCallback(
        async (gameId: bigint, stakeAmount: string): Promise<string | null> => {
            if (!walletClient) throw new Error('Wallet client not initialized')

            setLoading(true)
            try {
                await ensureChain()

                const tx = await walletClient.writeContract({
                    address: chainConfig.contractAddress as `0x${string}`,
                    abi: contractABI,
                    functionName: 'joinGame',
                    args: [gameId],
                    value: parseEther(stakeAmount),
                } as any)

                return tx
            } catch (err) {
                const msg = `Failed to join game: ${err instanceof Error ? err.message : String(err)}`
                setError(msg)
                return null
            } finally {
                setLoading(false)
            }
        },
        [walletClient, chainConfig, ensureChain]
    )

    const forfeitGame = useCallback(
        async (gameId: bigint): Promise<string | null> => {
            if (!walletClient) throw new Error('Wallet client not initialized')

            setLoading(true)
            try {
                await ensureChain()

                const tx = await walletClient.writeContract({
                    address: chainConfig.contractAddress as `0x${string}`,
                    abi: contractABI,
                    functionName: 'forfeitGame',
                    args: [gameId],
                } as any)

                return tx
            } catch (err) {
                const msg = `Failed to forfeit game: ${err instanceof Error ? err.message : String(err)}`
                setError(msg)
                return null
            } finally {
                setLoading(false)
            }
        },
        [walletClient, chainConfig, ensureChain]
    )

    const setGameReady = useCallback(
        async (gameId: bigint): Promise<string | null> => {
            if (!walletClient) throw new Error('Wallet client not initialized')

            setLoading(true)
            try {
                await ensureChain()

                const tx = await walletClient.writeContract({
                    address: chainConfig.contractAddress as `0x${string}`,
                    abi: contractABI,
                    functionName: 'setGameReady',
                    args: [gameId],
                } as any)

                return tx
            } catch (err) {
                const msg = `Failed to set game ready: ${err instanceof Error ? err.message : String(err)}`
                setError(msg)
                return null
            } finally {
                setLoading(false)
            }
        },
        [walletClient, chainConfig, ensureChain]
    )

    const addLoser = useCallback(
        async (gameId: bigint, loserAddress: string): Promise<string | null> => {
            if (!walletClient) throw new Error('Wallet client not initialized')

            setLoading(true)
            try {
                await ensureChain()

                const tx = await walletClient.writeContract({
                    address: chainConfig.contractAddress as `0x${string}`,
                    abi: contractABI,
                    functionName: 'addLoser',
                    args: [gameId, loserAddress as `0x${string}`],
                } as any)

                return tx
            } catch (err) {
                const msg = `Failed to add loser: ${err instanceof Error ? err.message : String(err)}`
                setError(msg)
                return null
            } finally {
                setLoading(false)
            }
        },
        [walletClient, chainConfig, ensureChain]
    )

    const endGame = useCallback(
        async (gameId: bigint, governorFeePercentage: number): Promise<string | null> => {
            if (!walletClient) throw new Error('Wallet client not initialized')

            setLoading(true)
            try {
                await ensureChain()

                const tx = await walletClient.writeContract({
                    address: chainConfig.contractAddress as `0x${string}`,
                    abi: contractABI,
                    functionName: 'endGame',
                    args: [gameId, BigInt(governorFeePercentage)],
                } as any)

                return tx
            } catch (err) {
                const msg = `Failed to end game: ${err instanceof Error ? err.message : String(err)}`
                setError(msg)
                return null
            } finally {
                setLoading(false)
            }
        },
        [walletClient, chainConfig, ensureChain]
    )

    const clearError = useCallback(() => setError(null), [])

    return {
        loading,
        error,
        publicClient,
        walletClient,
        getGame,
        getNotStartedGames,
        getOngoingGames,
        getGovernorGames,
        createGame,
        joinGame,
        forfeitGame,
        setGameReady,
        addLoser,
        endGame,
        switchChain,
        clearError,
    }
}
