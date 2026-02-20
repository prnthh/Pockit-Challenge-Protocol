import { useState, useCallback } from 'react'
import { parseEther } from 'viem'
import { CHAINS, writeToContract } from '../App'
import type { ChainKey } from '../App'

type FlipResult = 'heads' | 'tails' | null
type GamePhase = 'idle' | 'staking' | 'flipping' | 'result'

interface RoundState {
    result: FlipResult
    playerCall: FlipResult
    won: boolean
}

function CoinFlipGame({
    walletAddress,
    chainConfig,
}: {
    walletAddress: string
    chainConfig: typeof CHAINS[ChainKey]
}) {
    const currencySymbol = chainConfig.chain.nativeCurrency.symbol
    const [amount, setAmount] = useState<string>('0.001')
    const [phase, setPhase] = useState<GamePhase>('idle')
    const [rounds, setRounds] = useState<RoundState[]>([])
    const [isFlipping, setIsFlipping] = useState(false)
    const [finalResult, setFinalResult] = useState<'won' | 'lost' | null>(null)
    const [statusMsg, setStatusMsg] = useState('')
    const [gameId, setGameId] = useState<bigint | null>(null)

    const flipCoin = (): FlipResult => Math.random() < 0.5 ? 'heads' : 'tails'

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

    const resetGame = () => {
        setPhase('idle')
        setRounds([])
        setIsFlipping(false)
        setFinalResult(null)
        setStatusMsg('')
        setGameId(null)
    }

    const startCoinFlipGame = useCallback(async (call: FlipResult) => {
        if (!walletAddress || !call) return
        if (!amount || isNaN(Number(amount)) || parseFloat(amount) <= 0) {
            alert('Enter a valid stake amount')
            return
        }

        setPhase('staking')
        setStatusMsg('Creating game on-chain...')

        try {
            // Create a 1-player game with self as governor
            const stakeWei = parseEther(amount)
            await writeToContract(
                chainConfig,
                'createGame',
                [walletAddress as `0x${string}`, stakeWei, 1n, [walletAddress as `0x${string}`]],
                stakeWei
            )
            setStatusMsg('Waiting for confirmation...')
            await sleep(2000)

            // We need the game ID — read nextGameId and subtract 1
            const { createPublicClient, http } = await import('viem')
            const { contractABI } = await import('../App')
            const client = createPublicClient({ chain: chainConfig.chain, transport: http() })
            const nextId = await client.readContract({
                address: chainConfig.contractAddress as `0x${string}`,
                abi: contractABI,
                functionName: 'nextGameId' as any,
            }) as bigint
            const createdGameId = nextId - 1n
            setGameId(createdGameId)

            // Start the game
            setStatusMsg('Starting game...')
            await writeToContract(chainConfig, 'startGame', [createdGameId])
            await sleep(1500)

            // Now play the coin flip rounds
            setPhase('flipping')
            setStatusMsg('')

            let playerWins = 0
            let playerLosses = 0
            const allRounds: RoundState[] = []

            for (let r = 0; r < 3; r++) {
                if (playerWins >= 2 || playerLosses >= 2) break

                setIsFlipping(true)
                await sleep(1800) // coin flip animation duration

                const result = flipCoin()
                const won = result === call
                if (won) playerWins++
                else playerLosses++

                const round: RoundState = { result, playerCall: call, won }
                allRounds.push(round)
                setRounds([...allRounds])
                setIsFlipping(false)
                await sleep(1200) // pause to show result
            }

            // Determine final outcome
            const playerWon = playerWins >= 2
            setFinalResult(playerWon ? 'won' : 'lost')
            setPhase('result')

            // Resolve the game on-chain
            setStatusMsg('Settling on-chain...')
            const losers: `0x${string}`[] = playerWon ? [] : [walletAddress as `0x${string}`]
            await writeToContract(chainConfig, 'resolveGame', [createdGameId, losers, 0n])
            setStatusMsg(playerWon ? '🎉 Winnings sent!' : '💸 Better luck next time!')

        } catch (error: any) {
            console.error('Coin flip game error:', error)
            setStatusMsg('Error: ' + (error?.shortMessage || error?.message || 'Transaction failed'))
            setPhase('result')
            setFinalResult('lost')
        }
    }, [walletAddress, amount, chainConfig])

    const playerWins = rounds.filter(r => r.won).length
    const playerLosses = rounds.filter(r => !r.won).length

    return (
        <div className="flex justify-center py-4">
            <div className="w-full max-w-md bg-white border-3 border-[#5aace0] rounded-2xl p-6 shadow-[0_4px_12px_rgba(90,172,224,0.3)] text-center">
                <h2 className="font-heading text-3xl mb-1 text-[#1a5276]">🪙 Coin Flip</h2>
                <p className="text-sm text-muted mb-5">Best 2 out of 3 — pick your side!</p>

                {/* Stake Input */}
                {phase === 'idle' && (
                    <div className="animate-fade-in">
                        <label className="block text-sm font-bold mb-2">Stake ({currencySymbol})</label>
                        <div className="flex flex-wrap gap-2 justify-center mb-4">
                            {['0.001', '0.01', '0.05', '0.1'].map(v => (
                                <button
                                    key={v}
                                    onClick={() => setAmount(v)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-full border-2 border-[#5aace0] cursor-pointer transition-all ${amount === v
                                            ? 'bg-gradient-to-b from-[#a8e063] to-[#7cb342] text-white border-[#558b2f] shadow-[0_2px_0_#33691e]'
                                            : 'bg-white text-ink hover:bg-[#d4f1ff]'
                                        }`}
                                >
                                    {v}
                                </button>
                            ))}
                            <input
                                type="text"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                placeholder="Custom"
                                className="w-20 px-2 py-1.5 text-xs text-center border-2 border-[#5aace0] rounded-full bg-[#eaf6fc] font-bold focus:outline-none focus:ring-2 focus:ring-[#4fc3f7]"
                            />
                        </div>

                        <p className="text-sm font-bold mb-3">Pick your side to start:</p>
                        <div className="flex gap-3 justify-center mb-3">
                            <button
                                onClick={() => startCoinFlipGame('heads')}
                                disabled={!walletAddress}
                                className="flex flex-col items-center gap-1 px-6 py-4 bg-gradient-to-b from-[#ffee58] to-[#f5c842] border-3 border-[#f9a825] rounded-2xl shadow-[0_4px_0_#f57f17] hover:shadow-[0_2px_0_#f57f17] hover:translate-y-[2px] active:shadow-none active:translate-y-[4px] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="text-3xl">🌕</span>
                                <span className="font-bold text-sm">Heads</span>
                            </button>
                            <button
                                onClick={() => startCoinFlipGame('tails')}
                                disabled={!walletAddress}
                                className="flex flex-col items-center gap-1 px-6 py-4 bg-gradient-to-b from-[#90caf9] to-[#5aace0] border-3 border-[#2196f3] rounded-2xl shadow-[0_4px_0_#1565c0] hover:shadow-[0_2px_0_#1565c0] hover:translate-y-[2px] active:shadow-none active:translate-y-[4px] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="text-3xl">🌑</span>
                                <span className="font-bold text-sm">Tails</span>
                            </button>
                        </div>
                        {!walletAddress && (
                            <small className="text-[#1a5276] text-xs">Connect your wallet to play</small>
                        )}
                    </div>
                )}

                {/* Staking / TX Phase */}
                {phase === 'staking' && (
                    <div className="animate-fade-in py-8">
                        <div className="text-5xl animate-spin-coin inline-block mb-4">🪙</div>
                        <p className="font-bold text-sm mb-1">{statusMsg}</p>
                        <small className="text-muted text-xs">Confirm the transactions in your wallet</small>
                    </div>
                )}

                {/* Flipping Phase */}
                {(phase === 'flipping' || phase === 'result') && (
                    <div className="animate-fade-in">
                        {/* Score */}
                        <div className="flex items-center justify-center gap-6 mb-5">
                            <div className={`text-center ${playerWins > playerLosses ? 'scale-110' : 'opacity-70'} transition-all`}>
                                <span className="block text-xs font-bold text-muted uppercase">You</span>
                                <span className="block text-3xl font-heading">{playerWins}</span>
                            </div>
                            <span className="text-lg font-bold text-muted">vs</span>
                            <div className={`text-center ${playerLosses > playerWins ? 'scale-110' : 'opacity-70'} transition-all`}>
                                <span className="block text-xs font-bold text-muted uppercase">Fate</span>
                                <span className="block text-3xl font-heading">{playerLosses}</span>
                            </div>
                        </div>

                        {/* The Coin */}
                        <div className="min-h-[120px] flex items-center justify-center mb-4">
                            {isFlipping ? (
                                <div className="text-6xl animate-coin-toss">🪙</div>
                            ) : rounds.length > 0 ? (
                                <div className="animate-pop-in flex flex-col items-center gap-1">
                                    <span className="text-5xl">
                                        {rounds[rounds.length - 1]?.result === 'heads' ? '🌕' : '🌑'}
                                    </span>
                                    <span className="text-sm font-bold uppercase tracking-wider">
                                        {rounds[rounds.length - 1]?.result}
                                    </span>
                                    <span className={`text-lg font-heading mt-1 animate-bounce-in ${rounds[rounds.length - 1]?.won ? 'text-lime' : 'text-red'
                                        }`}>
                                        {rounds[rounds.length - 1]?.won ? '✓ WIN' : '✗ LOSS'}
                                    </span>
                                </div>
                            ) : null}
                        </div>

                        {/* Round indicators */}
                        <div className="flex justify-center gap-3 mb-5">
                            {[0, 1, 2].map(i => (
                                <div
                                    key={i}
                                    className={`w-10 h-10 rounded-full border-3 border-[#5aace0] flex items-center justify-center font-bold text-sm transition-all ${rounds[i]
                                            ? rounds[i].won
                                                ? 'bg-[#8bc34a] text-white shadow-[0_2px_0_#558b2f]'
                                                : 'bg-red text-white shadow-[0_2px_0_#b71c1c]'
                                            : i === rounds.length && isFlipping
                                                ? 'bg-[#ffee58] animate-pulse-dot'
                                                : 'bg-[#eaf6fc] text-muted'
                                        }`}
                                >
                                    {rounds[i] ? (rounds[i].won ? '✓' : '✗') : (i + 1)}
                                </div>
                            ))}
                        </div>

                        {/* Final Result */}
                        {finalResult && (
                            <div className={`animate-pop-in border-3 border-[#5aace0] rounded-2xl p-5 mt-2 ${finalResult === 'won' ? 'bg-[#e8f5e9]' : 'bg-[#ffebee]'
                                }`}>
                                <div className="text-5xl mb-2">
                                    {finalResult === 'won' ? '🎉' : '😔'}
                                </div>
                                <div className="font-heading text-2xl mb-1">
                                    {finalResult === 'won' ? 'You Won!' : 'You Lost!'}
                                </div>
                                <div className={`text-sm font-bold ${finalResult === 'won' ? 'text-lime' : 'text-red'}`}>
                                    {finalResult === 'won'
                                        ? `+${amount} ${currencySymbol} (minus fees)`
                                        : `-${amount} ${currencySymbol}`
                                    }
                                </div>
                                {statusMsg && <small className="block text-xs text-muted mt-2">{statusMsg}</small>}
                                {gameId !== null && (
                                    <small className="block text-xs text-muted">Game #{gameId.toString()}</small>
                                )}
                                <button
                                    onClick={resetGame}
                                    className="mt-4 px-6 py-2.5 bg-gradient-to-b from-[#a8e063] to-[#7cb342] text-white font-bold rounded-full border-3 border-[#558b2f] shadow-[0_3px_0_#33691e] hover:shadow-[0_1px_0_#33691e] hover:translate-y-[2px] active:shadow-none transition-all cursor-pointer text-sm"
                                >
                                    Play Again
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default CoinFlipGame
