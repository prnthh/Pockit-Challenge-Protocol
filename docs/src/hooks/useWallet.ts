import { useState, useCallback, useEffect } from 'react'
import { createPublicClient, http, defineChain, formatEther } from 'viem'
import type { CHAINS, ChainKey } from '../App'

interface UseWalletProps {
    chainConfig: typeof CHAINS[ChainKey]
}

interface UseWalletReturn {
    address: string | null
    balance: string
    loading: boolean
    error: string | null
    connectWallet: () => Promise<void>
    switchChain: () => Promise<void>
    updateBalance: () => Promise<void>
}

export const useWallet = ({ chainConfig }: UseWalletProps): UseWalletReturn => {
    const [address, setAddress] = useState<string | null>(null)
    const [balance, setBalance] = useState('0')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

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

    const updateBalance = useCallback(async () => {
        if (!address) return

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

            const client = createPublicClient({
                chain: customChain,
                transport: http(),
            })

            const bal = await client.getBalance({ address: address as `0x${string}` })
            setBalance(`${formatEther(bal)}`)
        } catch (err) {
            setError(`Failed to update balance: ${err instanceof Error ? err.message : String(err)}`)
        }
    }, [address, chainConfig])

    const connectWallet = useCallback(async () => {
        setLoading(true)
        try {
            if (!window.ethereum) throw new Error('Please install MetaMask or another Ethereum wallet.')

            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
            const addr = accounts[0]
            setAddress(addr)
            await switchChain()
            // Update balance after connecting
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

            const client = createPublicClient({
                chain: customChain,
                transport: http(),
            })

            const bal = await client.getBalance({ address: addr as `0x${string}` })
            setBalance(`${formatEther(bal)}`)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setLoading(false)
        }
    }, [chainConfig, switchChain])

    // Check for existing wallet connection on mount
    useEffect(() => {
        const checkWallet = async () => {
            if (window.ethereum) {
                try {
                    const accounts = await window.ethereum.request({ method: 'eth_accounts' })
                    if (accounts.length > 0) {
                        setAddress(accounts[0])
                        // Update balance
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

                        const client = createPublicClient({
                            chain: customChain,
                            transport: http(),
                        })

                        const bal = await client.getBalance({ address: accounts[0] as `0x${string}` })
                        setBalance(`${formatEther(bal)}`)
                    }
                } catch (err) {
                    console.error('Failed to check wallet:', err)
                }
            }
        }

        checkWallet()
    }, [chainConfig])

    // Update balance when chain changes
    useEffect(() => {
        updateBalance()
    }, [updateBalance])

    return {
        address,
        balance,
        loading,
        error,
        connectWallet,
        switchChain,
        updateBalance,
    }
}
