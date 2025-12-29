import { useState, useEffect, useRef } from 'react'
import { createPublicClient, createWalletClient, http, defineChain, parseEther, formatEther, custom } from 'viem'
import contractABI from './challengeAbi'
import './App.css'

// Chain configurations
const CHAINS = {
  sanko: {
    id: 1992,
    chainId: '0x7c8', // 1992 in hex
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
    chainId: '0xaa36a7', // 11155111 in hex
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
    contractAddress: '0xd0cE8C6c7Ec2DB144d53ca8A4eb3Ce612F0BEA87', // Update with actual Sepolia contract
  },
} as const

type ChainKey = keyof typeof CHAINS

interface GameInfo {
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

interface Game extends GameInfo {
  id: bigint
}

interface Game {
  id: bigint
  governor: string
  stakeAmount: bigint
  maxPlayers: bigint
  isReady: boolean
  isEnded: boolean
  players: string[]
  losers: string[]
  whitelist: string[]
  forfeited: string[]
}

const PAGE_SIZE = 50n

// Shared wallet utilities
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

const writeToContract = async (
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

// Game Header Component
function GameHeader({ gameId, governor, stake, currencySymbol }: {
  gameId: bigint
  governor: string
  stake: bigint
  currencySymbol: string
}) {
  return (
    <div className="game-header">
      <div className="game-id">Game #{gameId.toString()}</div>
      <small>Governor: {governor.slice(0, 6)}...{governor.slice(-4)}</small>
      <div className="game-stake">Stake: {formatEther(stake)} {currencySymbol}</div>
    </div>
  )
}

// Player Row with Add Loser Button
function PlayerRow({
  player,
  game,
  walletAddress,
  onAddLoser
}: {
  player: string;
  game: Game;
  walletAddress: string;
  onAddLoser?: (gameId: bigint, loser: string) => void
}) {
  const isLoser = game.losers.some(l => l.toLowerCase() === player.toLowerCase())
  const hasForfeited = game.forfeited.some(f => f.toLowerCase() === player.toLowerCase())
  const canAddAsLoser = !isLoser && !hasForfeited

  return (
    <div className="player-row">
      <span className={isLoser ? 'loser' : (hasForfeited ? 'forfeited' : '')}>
        {player.slice(0, 6)}...{player.slice(-4)}
        {isLoser && ' (Loser)'}
        {hasForfeited && ' (Forfeited)'}
      </span>
      {game.isReady && canAddAsLoser && onAddLoser && (
        <button onClick={() => onAddLoser(game.id, player)} disabled={!walletAddress}>
          Add as Loser
        </button>
      )}
    </div>
  )
}

// Create Game Tile Component
function CreateGameTile({
  walletAddress,
  currencySymbol,
  chainConfig,
  customChain,
}: {
  walletAddress: string
  currencySymbol: string
  chainConfig: typeof CHAINS[ChainKey]
  customChain: ReturnType<typeof defineChain>
}) {
  const COINFLIP_GOVERNOR = '0xdBec3DC802a817EEE74a7077f734654384857E9d'

  const [governorPreset, setGovernorPreset] = useState<'player' | 'coinflip' | 'custom'>('coinflip')
  const [customGovernorAddress, setCustomGovernorAddress] = useState<string>('0xdBec3DC802a817EEE74a7077f734654384857E9d')
  const [amount, setAmount] = useState<string>('')
  const [maxPlayers, setMaxPlayers] = useState<string>('')
  const [whitelistInput, setWhitelistInput] = useState<string>('')

  const getGovernorAddress = (): string => {
    if (governorPreset === 'player') {
      return walletAddress || ''
    } else if (governorPreset === 'coinflip') {
      return COINFLIP_GOVERNOR
    } else {
      return customGovernorAddress
    }
  }

  const selectedGovernor = getGovernorAddress()

  const createGame = async () => {
    if (!amount || isNaN(Number(amount)) || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount.')
      return
    }
    try {
      const whitelist = whitelistInput.split(',').map(addr => addr.trim()).filter(addr => addr.length > 0).map(addr => addr as `0x${string}`)
      const maxPlayersValue = maxPlayers && !isNaN(Number(maxPlayers)) && parseFloat(maxPlayers) > 0 ? BigInt(Math.floor(parseFloat(maxPlayers))) : 0n
      await writeToContract(chainConfig, customChain, 'createGame', [selectedGovernor as `0x${string}`, parseEther(amount), maxPlayersValue, whitelist], parseEther(amount))
    } catch (error) {
      console.error('Error creating game:', error)
      alert('Failed to create game: ' + (error as Error).message)
    }
  }
  return (
    <div className="tile">
      <h2>Create a Game</h2>

      <div className="form-group">
        <label htmlFor="governor-preset">Governor Preset:</label>
        <select
          id="governor-preset"
          value={governorPreset}
          onChange={(e) => setGovernorPreset(e.target.value as 'player' | 'coinflip' | 'custom')}
          disabled={!walletAddress}
        >
          <option value="coinflip">Coinflip Governor</option>
          <option value="player">Player (Me)</option>
          <option value="custom">Custom Address</option>
        </select>
      </div>

      {governorPreset === 'custom' && (
        <div className="form-group">
          <label htmlFor="custom-governor-input">Custom Governor Address:</label>
          <input
            type="text"
            id="custom-governor-input"
            placeholder="0x..."
            value={customGovernorAddress}
            onChange={(e) => setCustomGovernorAddress(e.target.value)}
            disabled={!walletAddress}
          />
        </div>
      )}

      <div className="form-group">
        <small>Selected Governor: {selectedGovernor ? `${selectedGovernor.slice(0, 6)}...${selectedGovernor.slice(-4)}` : 'None'}</small>
      </div>

      <div className="form-group">
        <label htmlFor="amount-input">Amount ({currencySymbol}):</label>
        <input
          type="text"
          id="amount-input"
          placeholder="Enter amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={!walletAddress}
        />
      </div>

      <div className="form-group">
        <label htmlFor="max-players-input">Max Players (Optional):</label>
        <input
          type="text"
          id="max-players-input"
          placeholder="Leave empty for unlimited"
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(e.target.value)}
          disabled={!walletAddress}
        />
        <small>Maximum number of players. Leave empty for unlimited.</small>
      </div>

      <div className="form-group">
        <label htmlFor="whitelist-input">Whitelist (Optional):</label>
        <input
          type="text"
          id="whitelist-input"
          placeholder="0xAddress1, 0xAddress2, ... (leave empty for public)"
          value={whitelistInput}
          onChange={(e) => setWhitelistInput(e.target.value)}
          disabled={!walletAddress}
        />
        <small>Comma-separated addresses for private games. Leave empty for public games.</small>
      </div>

      <button className="primary-button" onClick={createGame} disabled={!walletAddress}>
        Create Game
      </button>
    </div>
  )
}

// Join Game Tile Component
function JoinGameTile({
  openGames,
  walletAddress,
  currencySymbol,
  chainConfig,
  customChain,
}: {
  openGames: Game[]
  walletAddress: string
  currencySymbol: string
  chainConfig: typeof CHAINS[ChainKey]
  customChain: ReturnType<typeof defineChain>
}) {
  const joinGame = async (gameId: bigint, stakeAmount: bigint) => {
    try {
      await writeToContract(chainConfig, customChain, 'joinGame', [gameId], stakeAmount)
    } catch (error) {
      console.error('Error joining game:', error)
      alert('Failed to join game: ' + (error as Error).message)
    }
  }

  const forfeitGame = async (gameId: bigint) => {
    try {
      await writeToContract(chainConfig, customChain, 'forfeitGame', [gameId])
    } catch (error) {
      console.error('Error forfeiting game:', error)
      alert('Failed to forfeit game: ' + (error as Error).message)
    }
  }
  return (
    <div className="tile">
      <h2>Join a Game</h2>

      <div className="games-list">
        {openGames.length > 0 ? (
          openGames.map((game) => {
            const isPlayerInGame = walletAddress && game.players?.some(p => p.toLowerCase() === walletAddress.toLowerCase())
            const hasForfeited = walletAddress && game.forfeited?.some(p => p.toLowerCase() === walletAddress.toLowerCase())
            const isWhitelisted = (game.whitelist?.length === 0 || !game.whitelist) || (walletAddress && game.whitelist?.some(p => p.toLowerCase() === walletAddress.toLowerCase()))
            const isFull = game.maxPlayers > 0n && game.players?.length >= Number(game.maxPlayers)

            return (
              <div key={game.id.toString()} className="game-card">
                <GameHeader
                  gameId={game.id}
                  governor={game.governor}
                  stake={game.stakeAmount}
                  currencySymbol={currencySymbol}
                />

                <small>
                  Players: {game.players?.length || 0}
                  {game.maxPlayers > 0n && ` / ${game.maxPlayers.toString()}`}
                  {(game.forfeited?.length || 0) > 0 && ` (${game.forfeited.length} forfeited)`}
                </small>
                {(game.whitelist?.length || 0) > 0 && <small>🔒 Private ({game.whitelist.length} whitelisted)</small>}
                {isFull && <small>🚫 Game Full</small>}

                {!isPlayerInGame ? (
                  <button
                    onClick={() => joinGame(game.id, game.stakeAmount)}
                    disabled={!walletAddress || !isWhitelisted || isFull}
                    title={isFull ? 'Game is full' : (!isWhitelisted ? 'You are not whitelisted for this game' : '')}
                  >
                    {isFull ? '🚫 Full' : (isWhitelisted ? 'Join' : '🔒 Not Whitelisted')}
                  </button>
                ) : (
                  <button onClick={() => forfeitGame(game.id)} disabled={!walletAddress || !!hasForfeited}>
                    {hasForfeited ? 'Forfeited' : 'Forfeit'}
                  </button>
                )}
              </div>
            )
          })
        ) : (
          <p className="no-games">No open games available.</p>
        )}
      </div>
    </div>
  )
}

// Govern Games Tile Component
function GovernGamesTile({
  ongoingGames,
  walletAddress,
  pollOngoingGames,
  currencySymbol,
  chainConfig,
  customChain,
}: {
  ongoingGames: Game[]
  walletAddress: string
  pollOngoingGames: () => void
  currencySymbol: string
  chainConfig: typeof CHAINS[ChainKey]
  customChain: ReturnType<typeof defineChain>
}) {
  // Calculate pool split for a game
  const calculatePoolSplit = (game: Game) => {
    const totalPool = game.stakeAmount * BigInt(game.players.length)
    const governorFee = (totalPool * 5n) / 100n
    const winners = game.players.filter(p => !game.losers.some(l => l.toLowerCase() === p.toLowerCase()) && !game.forfeited.some(f => f.toLowerCase() === p.toLowerCase()))
    const winnersCount = BigInt(winners.length)
    const perWinnerAmount = winnersCount > 0n ? (totalPool - governorFee) / winnersCount : 0n

    return {
      totalPool,
      governorFee,
      winnersCount,
      perWinnerAmount
    }
  }

  const readyUpGame = async (gameId: bigint) => {
    try {
      await writeToContract(chainConfig, customChain, 'setGameReady', [gameId])
    } catch (error) {
      console.error('Error readying up game:', error)
      alert('Failed to ready up game: ' + (error as Error).message)
    }
  }

  const addLoser = async (gameId: bigint, loser: string) => {
    try {
      await writeToContract(chainConfig, customChain, 'addLoser', [gameId, loser as `0x${string}`])
    } catch (error) {
      console.error('Error adding loser:', error)
      alert('Failed to add loser: ' + (error as Error).message)
    }
  }

  const endGame = async (gameId: bigint) => {
    try {
      await writeToContract(chainConfig, customChain, 'endGame', [gameId, 5n])
    } catch (error) {
      console.error('Error ending game:', error)
      alert('Failed to end game: ' + (error as Error).message)
    }
  }

  return (
    <div className="tile">
      <h2>Govern Games</h2>

      <div className="govern-section">
        <div className="section-header">
          <p className="section-title">Manage games where you are the governor (5% fee).</p>
          <button onClick={pollOngoingGames}>Refresh</button>
        </div>

        <div className="games-list">
          {ongoingGames.length > 0 ? (
            ongoingGames.map((game) => {
              const poolSplit = calculatePoolSplit(game)

              return (
                <div key={game.id.toString()} className="game-card">
                  <GameHeader
                    gameId={game.id}
                    governor={game.governor}
                    stake={game.stakeAmount}
                    currencySymbol={currencySymbol}
                  />

                  <small>Ready: {game.isReady ? '✓' : '✗'}</small>

                  <div>
                    <small><strong>Players: {game.players.length}</strong></small>
                    {game.players.length > 0 ? (
                      game.players.map((p, i) => (
                        <PlayerRow key={i} player={p} game={game} walletAddress={walletAddress} onAddLoser={addLoser} />
                      ))
                    ) : (
                      <small>Waiting for players...</small>
                    )}
                  </div>

                  {game.losers.length > 0 && (
                    <small className="loser"><strong>Current Losers: {game.losers.length}</strong></small>
                  )}

                  {game.isReady && (
                    <div className="info-box">
                      <strong>Pool Split:</strong>
                      <div>Total: {formatEther(poolSplit.totalPool)} {currencySymbol}</div>
                      <div>Fee (5%): {formatEther(poolSplit.governorFee)} {currencySymbol}</div>
                      <div>Winners: {poolSplit.winnersCount.toString()}</div>
                      <div><strong>Each: {formatEther(poolSplit.perWinnerAmount)} {currencySymbol}</strong></div>
                    </div>
                  )}

                  {game.players.length >= 1 ? (
                    <>
                      {!game.isReady && (
                        <button onClick={() => readyUpGame(game.id)} disabled={!walletAddress} style={{ width: '100%' }}>
                          Ready {game.players.length === 1 && '(1P)'}
                        </button>
                      )}
                      {game.isReady && (
                        <button onClick={() => endGame(game.id)} disabled={!walletAddress} style={{ width: '100%' }}>
                          Resolve Game
                        </button>
                      )}
                    </>
                  ) : (
                    <small>Waiting for players</small>
                  )}
                </div>
              )
            })
          ) : (
            <p className="no-games">No games to govern.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// Past Games Tile Component
function PastGamesTile({
  pastGames,
  pollPastGames,
  currencySymbol,
}: {
  pastGames: Game[]
  pollPastGames: () => void
  currencySymbol: string
}) {
  return (
    <div className="tile">
      <h2>Past Games History</h2>

      <div className="govern-section">
        <div className="section-header">
          <p className="section-title">View completed games where you were the governor.</p>
          <button onClick={pollPastGames}>Refresh</button>
        </div>

        <div className="games-list">
          {pastGames.length > 0 ? (
            pastGames.map((game) => {
              const winners = game.players.filter(p => !game.losers.includes(p))
              return (
                <div key={game.id.toString()} className="game-card completed-game">
                  <GameHeader
                    gameId={game.id}
                    governor={game.governor}
                    stake={game.stakeAmount}
                    currencySymbol={currencySymbol}
                  />

                  <small>Players: {game.players.length}</small>

                  <div>
                    <small><strong>Winners ({winners.length}):</strong></small>
                    {winners.length > 0 ? winners.map((p, i) => (
                      <small key={i}>{p.slice(0, 6)}...{p.slice(-4)}</small>
                    )) : <small>No winners</small>}
                  </div>

                  <div>
                    <small className="loser"><strong>Losers ({game.losers.length}):</strong></small>
                    {game.losers.length > 0 ? game.losers.map((p, i) => (
                      <small key={i}>{p.slice(0, 6)}...{p.slice(-4)}</small>
                    )) : <small>No losers</small>}
                  </div>

                  <small>Status: Completed ✓</small>
                </div>
              )
            })
          ) : (
            <p className="no-games">No past games found.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function App() {
  const [selectedChain, setSelectedChain] = useState<ChainKey>('sanko')
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [balance, setBalance] = useState<string>('')
  const [openGames, setOpenGames] = useState<Game[]>([])
  const [ongoingGames, setOngoingGames] = useState<Game[]>([])
  const [pastGames, setPastGames] = useState<Game[]>([])
  const lastProcessedBlockRef = useRef<bigint | null>(null)

  // Get current chain configuration
  const CHAIN_CONFIG = CHAINS[selectedChain]

  // Create chain and client based on selected chain
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
        await pollOpenGames()
        await pollOngoingGames()
        await pollPastGames()
      } catch (error) {
        console.error('User denied account access', error)
      }
    } else {
      alert('Please install MetaMask or another Ethereum wallet.')
    }
  }

  const fetchGames = async (functionName: string, args: readonly unknown[]): Promise<Game[]> => {
    try {
      const ids = await client.readContract({
        address: CHAIN_CONFIG.contractAddress as `0x${string}`,
        abi: contractABI,
        functionName: functionName as any,
        args: args as any,
      })
      const games: Game[] = []
      for (const gameId of ids) {
        const gameInfo = await client.readContract({
          address: CHAIN_CONFIG.contractAddress as `0x${string}`,
          abi: contractABI,
          functionName: 'getGame',
          args: [gameId],
        }) as GameInfo
        games.push({ id: gameId, ...gameInfo })
      }
      return games
    } catch (err) {
      console.error(`Error fetching games (${functionName}):`, err)
      return []
    }
  }

  const pollOpenGames = async () => {
    const games = await fetchGames('getNotStartedGames', [0n, PAGE_SIZE])
    setOpenGames(games)
  }

  const pollOngoingGames = async () => {
    if (!walletAddress) return
    const games = await fetchGames('getGovernorGames', [walletAddress as `0x${string}`, false, true, true, 0n, PAGE_SIZE])
    setOngoingGames(games)
  }

  const pollPastGames = async () => {
    if (!walletAddress) return
    const games = await fetchGames('getGovernorGames', [walletAddress as `0x${string}`, true, false, false, 0n, PAGE_SIZE])
    setPastGames(games)
  }


  useEffect(() => {
    const checkWallet = async () => {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        if (accounts.length > 0) {
          setWalletAddress(accounts[0])
          await updateBalance(accounts[0])
          await pollOpenGames()
          await pollOngoingGames()
          await pollPastGames()
        }
      }
    }
    checkWallet()
  }, [])

  // Listen for contract events to auto-refresh
  useEffect(() => {
    if (!client) return

    // Watch for new blocks and check for events
    const unwatch = client.watchBlocks({
      onBlock: async (block) => {
        const blockNumber = block.number

        // Skip if we've already processed this block
        if (lastProcessedBlockRef.current && blockNumber <= lastProcessedBlockRef.current) {
          return
        }

        // Get events from the last processed block to current
        const fromBlock = lastProcessedBlockRef.current ? lastProcessedBlockRef.current + 1n : blockNumber

        try {
          const logs = await client.getContractEvents({
            address: CHAIN_CONFIG.contractAddress as `0x${string}`,
            abi: contractABI,
            fromBlock,
            toBlock: blockNumber,
          })

          // If there are new events, refresh the games
          if (logs.length > 0) {
            console.log(`Contract events detected in blocks ${fromBlock}-${blockNumber}:`, logs)
            await pollOpenGames()
            if (walletAddress) {
              await pollOngoingGames()
              await pollPastGames()
            }
          }
        } catch (err) {
          console.error('Error fetching contract events:', err)
        }

        lastProcessedBlockRef.current = blockNumber
      }
    })

    return () => {
      unwatch()
    }
  }, [client, walletAddress, CHAIN_CONFIG.contractAddress])

  useEffect(() => {
    if (walletAddress) {
      pollOngoingGames()
      pollPastGames()
    }
  }, [walletAddress])

  // Update balance when client changes (which happens when chain changes)
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

  // Reload data and switch wallet when chain changes
  useEffect(() => {
    if (walletAddress) {
      switchNetwork(CHAIN_CONFIG).then(() => {
        pollOpenGames()
        pollOngoingGames()
        pollPastGames()
      })
    }
  }, [selectedChain])

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Match Making Service</h1>

        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000 }}>
          <select
            value={selectedChain}
            onChange={(e) => setSelectedChain(e.target.value as ChainKey)}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              borderRadius: '0',
              border: '1px solid #646cff',
              backgroundColor: '#1a1a1a',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            <option value="sanko">Sanko Testnet</option>
            <option value="sepolia">Sepolia Testnet</option>
          </select>
        </div>

        <div className="wallet-info">
          <button className="connect-button" onClick={connectWallet}>
            {walletAddress ? 'Wallet Connected' : 'Connect Wallet'}
          </button>

          {walletAddress && (
            <p className="wallet-address">Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</p>
          )}

          <div
            className="balance"
            onClick={() => walletAddress && updateBalance(walletAddress)}
            style={{ cursor: walletAddress ? 'pointer' : 'default' }}
          >
            {balance}
          </div>

          <a href={CHAIN_CONFIG.faucetUrl} target="_blank" rel="noopener noreferrer">
            Get {CHAIN_CONFIG.nativeCurrency.symbol}
          </a>
        </div>
      </header>

      <div className="tiles-container">
        <CreateGameTile
          walletAddress={walletAddress}
          currencySymbol={CHAIN_CONFIG.nativeCurrency.symbol}
          chainConfig={CHAIN_CONFIG}
          customChain={customChain}
        />

        <JoinGameTile
          openGames={openGames}
          walletAddress={walletAddress}
          currencySymbol={CHAIN_CONFIG.nativeCurrency.symbol}
          chainConfig={CHAIN_CONFIG}
          customChain={customChain}
        />

        <GovernGamesTile
          ongoingGames={ongoingGames}
          walletAddress={walletAddress}
          pollOngoingGames={pollOngoingGames}
          currencySymbol={CHAIN_CONFIG.nativeCurrency.symbol}
          chainConfig={CHAIN_CONFIG}
          customChain={customChain}
        />

        <PastGamesTile
          pastGames={pastGames}
          pollPastGames={pollPastGames}
          currencySymbol={CHAIN_CONFIG.nativeCurrency.symbol}
        />
      </div>

      {/* Open in Remix button */}
      <a
        href="https://remix.ethereum.org/#url=https://raw.githubusercontent.com/prnthh/Pockit-Challenge-Protocol/main/contracts/contract.sol"
        target="_blank"
        rel="noopener noreferrer"
        className="remix-button"
      >
        Open in Remix
      </a>
    </div>
  )
}

export default App
