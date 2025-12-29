import { useState, useEffect } from 'react'
import { createPublicClient, createWalletClient, http, defineChain, parseEther, formatEther, custom } from 'viem'
import './App.css'

const contractABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "governor",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "stakeAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "maxPlayers",
        "type": "uint256"
      },
      {
        "internalType": "address[]",
        "name": "whitelist",
        "type": "address[]"
      }
    ],
    "name": "createGame",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      }
    ],
    "name": "joinGame",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      }
    ],
    "name": "forfeitGame",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "name": 'getNotStartedGames',
    "inputs": [
      { "internalType": 'uint256', "name": 'offset', "type": 'uint256' },
      { "internalType": 'uint256', "name": 'limit', "type": 'uint256' },
    ],
    "outputs": [{ "internalType": 'uint256[]', "name": '', "type": 'uint256[]' }],
    "stateMutability": 'view',
    "type": 'function',
  },
  {
    "name": 'getGovernorGames',
    "inputs": [
      { "internalType": 'address', "name": 'governor', "type": 'address' },
      { "internalType": 'bool', "name": 'includeEnded', "type": 'bool' },
      { "internalType": 'bool', "name": 'includeOngoing', "type": 'bool' },
      { "internalType": 'bool', "name": 'includeNotStarted', "type": 'bool' },
      { "internalType": 'uint256', "name": 'offset', "type": 'uint256' },
      { "internalType": 'uint256', "name": 'limit', "type": 'uint256' },
    ],
    "outputs": [{ "internalType": 'uint256[]', "name": '', "type": 'uint256[]' }],
    "stateMutability": 'view',
    "type": 'function',
  },

  {
    "inputs": [],
    "name": "getOngoingGames",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      }
    ],
    "name": "getGame",
    "outputs": [
      {
        "components": [
          { "internalType": "address", "name": "governor", "type": "address" },
          { "internalType": "uint256", "name": "stakeAmount", "type": "uint256" },
          { "internalType": "uint256", "name": "maxPlayers", "type": "uint256" },
          { "internalType": "uint256", "name": "activePlayers", "type": "uint256" },
          { "internalType": "bool", "name": "isReady", "type": "bool" },
          { "internalType": "bool", "name": "isEnded", "type": "bool" },
          { "internalType": "address[]", "name": "players", "type": "address[]" },
          { "internalType": "address[]", "name": "losers", "type": "address[]" },
          { "internalType": "address[]", "name": "whitelist", "type": "address[]" },
          { "internalType": "address[]", "name": "forfeited", "type": "address[]" }
        ],
        "internalType": "struct GameEscrow.GameInfo",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      }
    ],
    "name": "setGameReady",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "loser",
        "type": "address"
      }
    ],
    "name": "addLoser",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "governorFeePercentage",
        "type": "uint256"
      }
    ],
    "name": "endGame",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const

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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
      <span style={{ color: isLoser ? '#f87171' : (hasForfeited ? '#9ca3af' : 'inherit') }}>
        {player.slice(0, 6)}...{player.slice(-4)}
        {isLoser && ' (Loser)'}
        {hasForfeited && ' (Forfeited)'}
      </span>
      {game.isReady && canAddAsLoser && onAddLoser && (
        <button
          onClick={() => onAddLoser(game.id, player)}
          disabled={!walletAddress}
          style={{
            padding: '0.2rem 0.5rem',
            fontSize: '0.7rem',
            borderRadius: '4px',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#f87171',
            cursor: 'pointer',
          }}
        >
          Add as Loser
        </button>
      )}
    </div>
  )
}

// Create Game Tile Component
function CreateGameTile({
  walletAddress,
  governorPreset,
  setGovernorPreset,
  customGovernorAddress,
  setCustomGovernorAddress,
  selectedGovernor,
  amount,
  setAmount,
  maxPlayers,
  setMaxPlayers,
  whitelistInput,
  setWhitelistInput,
  createGame,
  currencySymbol,
}: {
  walletAddress: string
  governorPreset: 'player' | 'coinflip' | 'custom'
  setGovernorPreset: (preset: 'player' | 'coinflip' | 'custom') => void
  customGovernorAddress: string
  setCustomGovernorAddress: (address: string) => void
  selectedGovernor: string
  amount: string
  setAmount: (amount: string) => void
  maxPlayers: string
  setMaxPlayers: (maxPlayers: string) => void
  whitelistInput: string
  setWhitelistInput: (whitelist: string) => void
  createGame: () => void
  currencySymbol: string
}) {
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

      <div className="form-group" style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '-0.5rem' }}>
        Selected Governor: {selectedGovernor ? `${selectedGovernor.slice(0, 6)}...${selectedGovernor.slice(-4)}` : 'None'}
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
        <small style={{ opacity: 0.6, marginTop: '0.25rem' }}>
          Maximum number of players. Leave empty for unlimited.
        </small>
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
        <small style={{ opacity: 0.6, marginTop: '0.25rem' }}>
          Comma-separated addresses for private games. Leave empty for public games.
        </small>
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
  joinGame,
  forfeitGame,
  currencySymbol,
}: {
  openGames: Game[]
  walletAddress: string
  joinGame: (gameId: bigint, stakeAmount: bigint) => void
  forfeitGame: (gameId: bigint) => void
  currencySymbol: string
}) {
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
                <div className="game-info">
                  <div className="game-id">Game #{game.id.toString()}</div>
                  <div className="game-details">
                    <div>Governor: {game.governor.slice(0, 6)}...{game.governor.slice(-4)}</div>
                    <div className="game-stake">Stake: {formatEther(game.stakeAmount)} {currencySymbol}</div>
                    <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      Players: {game.players?.length || 0}
                      {game.maxPlayers > 0n && ` / ${game.maxPlayers.toString()}`}
                      {(game.forfeited?.length || 0) > 0 && ` (${game.forfeited.length} forfeited)`}
                    </div>
                    {(game.whitelist?.length || 0) > 0 && (
                      <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#fbbf24' }}>
                        🔒 Private ({game.whitelist.length} whitelisted)
                      </div>
                    )}
                    {isFull && (
                      <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#ef4444' }}>
                        🚫 Game Full
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {!isPlayerInGame ? (
                    <button
                      className="join-button"
                      onClick={() => joinGame(game.id, game.stakeAmount)}
                      disabled={!walletAddress || !isWhitelisted || isFull}
                      title={isFull ? 'Game is full' : (!isWhitelisted ? 'You are not whitelisted for this game' : '')}
                    >
                      {isFull ? '🚫 Full' : (isWhitelisted ? 'Join' : '🔒 Not Whitelisted')}
                    </button>
                  ) : (
                    <button
                      className="ready-button"
                      onClick={() => forfeitGame(game.id)}
                      disabled={!walletAddress || !!hasForfeited}
                      style={{
                        background: hasForfeited ? 'rgba(100, 100, 100, 0.3)' : 'rgba(239, 68, 68, 0.2)',
                        borderColor: hasForfeited ? 'rgba(150, 150, 150, 0.4)' : 'rgba(239, 68, 68, 0.4)'
                      }}
                    >
                      {hasForfeited ? 'Forfeited' : 'Forfeit'}
                    </button>
                  )}
                </div>
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
  readyUpGame,
  addLoser,
  endGame,
  pollOngoingGames,
  currencySymbol,
}: {
  ongoingGames: Game[]
  walletAddress: string
  readyUpGame: (gameId: bigint) => void
  addLoser: (gameId: bigint, loser: string) => void
  endGame: (gameId: bigint) => void
  pollOngoingGames: () => void
  currencySymbol: string
}) {
  return (
    <div className="tile">
      <h2>Govern Games</h2>

      <div className="govern-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <p style={{ margin: 0, opacity: 0.8 }}>Manage games where you are the governor (5% fee).</p>
          <button
            onClick={pollOngoingGames}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.9rem',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>

        <div className="games-list" style={{ marginTop: '1rem' }}>
          {ongoingGames.length > 0 ? (
            ongoingGames.map((game) => (
              <div key={game.id.toString()} className="game-card">
                <div className="game-info">
                  <div className="game-id">Game #{game.id.toString()}</div>
                  <div className="game-details">
                    <div>Governor: {game.governor.slice(0, 6)}...{game.governor.slice(-4)}</div>
                    <div className="game-stake">Stake: {formatEther(game.stakeAmount)} {currencySymbol}</div>
                    <div style={{ marginTop: '0.5rem', opacity: 0.7 }}>
                      Ready: {game.isReady ? '✓' : '✗'}
                    </div>

                    <div style={{ fontSize: '0.75rem', marginTop: '0.75rem' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Players: {game.players.length}</div>
                      {game.players.length > 0 ? (
                        game.players.map((p, i) => (
                          <PlayerRow key={i} player={p} game={game} walletAddress={walletAddress} onAddLoser={addLoser} />
                        ))
                      ) : (
                        <div style={{ opacity: 0.5 }}>Waiting for players...</div>
                      )}
                    </div>

                    {game.losers.length > 0 && (
                      <div style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                        <div style={{ fontWeight: 'bold', color: '#f87171' }}>
                          Current Losers: {game.losers.length}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {game.players.length >= 1 ? (
                    <>
                      {!game.isReady && (
                        <button
                          className="ready-button"
                          onClick={() => readyUpGame(game.id)}
                          disabled={!walletAddress}
                        >
                          Ready {game.players.length === 1 && '(1P)'}
                        </button>
                      )}
                      {game.isReady && (
                        <button
                          className="resolve-button"
                          onClick={() => endGame(game.id)}
                          disabled={!walletAddress}
                        >
                          Resolve Game
                        </button>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: '0.8rem', opacity: 0.6, textAlign: 'center' }}>
                      Waiting for players
                    </div>
                  )}
                </div>
              </div>
            ))
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <p style={{ margin: 0, opacity: 0.8 }}>View completed games where you were the governor.</p>
          <button
            onClick={pollPastGames}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.9rem',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>

        <div className="games-list" style={{ marginTop: '1rem' }}>
          {pastGames.length > 0 ? (
            pastGames.map((game) => {
              const winners = game.players.filter(p => !game.losers.includes(p))
              return (
                <div key={game.id.toString()} className="game-card" style={{ background: 'rgba(0, 200, 100, 0.1)' }}>
                  <div className="game-info">
                    <div className="game-id">Game #{game.id.toString()}</div>
                    <div className="game-details">
                      <div>Players: {game.players.length}</div>
                      <div className="game-stake">Stake: {formatEther(game.stakeAmount)} {currencySymbol}</div>

                      <div style={{ marginTop: '0.75rem' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: '#4ade80' }}>Winners ({winners.length}):</div>
                        {winners.length > 0 ? (
                          winners.map((p, i) => (
                            <div key={i} style={{ fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                              {p.slice(0, 6)}...{p.slice(-4)}
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: '0.75rem', marginLeft: '0.5rem', opacity: 0.5 }}>
                            No winners
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: '#f87171' }}>Losers ({game.losers.length}):</div>
                        {game.losers.length > 0 ? (
                          game.losers.map((p, i) => (
                            <div key={i} style={{ fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                              {p.slice(0, 6)}...{p.slice(-4)}
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: '0.75rem', marginLeft: '0.5rem', opacity: 0.5 }}>
                            No losers
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: '0.5rem', opacity: 0.7, fontSize: '0.75rem' }}>
                        Status: Completed ✓
                      </div>
                    </div>
                  </div>
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
  const [governorPreset, setGovernorPreset] = useState<'player' | 'coinflip' | 'custom'>('coinflip')
  const [customGovernorAddress, setCustomGovernorAddress] = useState<string>('0xdBec3DC802a817EEE74a7077f734654384857E9d')
  const [amount, setAmount] = useState<string>('')
  const [maxPlayers, setMaxPlayers] = useState<string>('')
  const [whitelistInput, setWhitelistInput] = useState<string>('')
  const [openGames, setOpenGames] = useState<Game[]>([])
  const [ongoingGames, setOngoingGames] = useState<Game[]>([])
  const [pastGames, setPastGames] = useState<Game[]>([])

  // Coinflip governor address (you can update this with actual deployed governor)
  const COINFLIP_GOVERNOR = '0xdBec3DC802a817EEE74a7077f734654384857E9d'

  // Get current chain configuration
  const CHAIN_CONFIG = CHAINS[selectedChain]

  // Compute the actual governor address based on preset
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
    const bal = await client.getBalance({
      address: address as `0x${string}`,
    })
    setBalance(`${formatEther(bal)} ${CHAIN_CONFIG.nativeCurrency.symbol}`)
  }

  const switchToChain = async () => {
    if (!window.ethereum) return

    try {
      // Try to switch to the network
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_CONFIG.chainId }],
      })
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: CHAIN_CONFIG.chainId,
                chainName: CHAIN_CONFIG.name,
                nativeCurrency: CHAIN_CONFIG.nativeCurrency,
                rpcUrls: [CHAIN_CONFIG.rpcUrl],
                blockExplorerUrls: [CHAIN_CONFIG.blockExplorer],
              },
            ],
          })
        } catch (addError) {
          console.error('Failed to add network:', addError)
          throw addError
        }
      } else {
        throw switchError
      }
    }
  }

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
        const address = accounts[0]

        // Check current chain
        const chainId = await window.ethereum.request({ method: 'eth_chainId' })
        if (chainId !== CHAIN_CONFIG.chainId) {
          await switchToChain()
        }

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

  const createGame = async () => {
    if (!window.ethereum) {
      alert('Please connect your wallet first.')
      return
    }

    if (!amount || isNaN(Number(amount)) || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount.')
      return
    }

    try {
      // Check and switch chain if needed
      const chainId = await window.ethereum.request({ method: 'eth_chainId' })
      if (chainId !== CHAIN_CONFIG.chainId) {
        await switchToChain()
      }

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const walletClient = createWalletClient({
        account: accounts[0] as `0x${string}`,
        chain: customChain,
        transport: custom(window.ethereum),
      })

      await updateBalance(accounts[0])

      // Parse whitelist input (comma-separated addresses)
      const whitelist: `0x${string}`[] = whitelistInput
        .split(',')
        .map(addr => addr.trim())
        .filter(addr => addr.length > 0)
        .map(addr => addr as `0x${string}`)

      // Parse maxPlayers (0 means unlimited)
      const maxPlayersValue = maxPlayers && !isNaN(Number(maxPlayers)) && parseFloat(maxPlayers) > 0
        ? BigInt(Math.floor(parseFloat(maxPlayers)))
        : 0n

      const hash = await walletClient.writeContract({
        address: CHAIN_CONFIG.contractAddress as `0x${string}`,
        abi: contractABI,
        functionName: 'createGame',
        args: [selectedGovernor as `0x${string}`, parseEther(amount), maxPlayersValue, whitelist],
        value: parseEther(amount),
      })

      console.log('Transaction hash:', hash)
      setTimeout(pollOpenGames, 2000)
    } catch (error) {
      console.error('Error creating game:', error)
      alert('Failed to create game: ' + (error as Error).message)
    }
  }

  const joinGame = async (gameId: bigint, stakeAmount: bigint) => {
    if (!window.ethereum) {
      alert('Please connect your wallet first.')
      return
    }

    try {
      // Check and switch chain if needed
      const chainId = await window.ethereum.request({ method: 'eth_chainId' })
      if (chainId !== CHAIN_CONFIG.chainId) {
        await switchToChain()
      }

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const walletClient = createWalletClient({
        account: accounts[0] as `0x${string}`,
        chain: customChain,
        transport: custom(window.ethereum),
      })

      const hash = await walletClient.writeContract({
        address: CHAIN_CONFIG.contractAddress as `0x${string}`,
        abi: contractABI,
        functionName: 'joinGame',
        args: [gameId],
        value: stakeAmount,
      })

      console.log('Transaction hash:', hash)
      setTimeout(pollOpenGames, 2000)
    } catch (error) {
      console.error('Error joining game:', error)
      alert('Failed to join game: ' + (error as Error).message)
    }
  }

  const forfeitGame = async (gameId: bigint) => {
    if (!window.ethereum) {
      alert('Please connect your wallet first.')
      return
    }

    try {
      // Check and switch chain if needed
      const chainId = await window.ethereum.request({ method: 'eth_chainId' })
      if (chainId !== CHAIN_CONFIG.chainId) {
        await switchToChain()
      }

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const walletClient = createWalletClient({
        account: accounts[0] as `0x${string}`,
        chain: customChain,
        transport: custom(window.ethereum),
      })

      const hash = await walletClient.writeContract({
        address: CHAIN_CONFIG.contractAddress as `0x${string}`,
        abi: contractABI,
        functionName: 'forfeitGame',
        args: [gameId],
      })

      console.log('Forfeit transaction hash:', hash)
      setTimeout(pollOpenGames, 2000)
    } catch (error) {
      console.error('Error forfeiting game:', error)
      alert('Failed to forfeit game: ' + (error as Error).message)
    }
  }

  const pollOpenGames = async () => {
    try {
      const ids = await client.readContract({
        address: CHAIN_CONFIG.contractAddress as `0x${string}`,
        abi: contractABI,
        functionName: 'getNotStartedGames',
        args: [0n, PAGE_SIZE],
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

      setOpenGames(games)
    } catch (err) {
      console.error('Error polling open games:', err)
    }
  }


  const pollOngoingGames = async () => {
    if (!walletAddress) return

    try {
      const ids = await client.readContract({
        address: CHAIN_CONFIG.contractAddress as `0x${string}`,
        abi: contractABI,
        functionName: 'getGovernorGames',
        args: [
          walletAddress as `0x${string}`,
          false, // includeEnded
          true,  // includeOngoing
          true,  // includeNotStarted
          0n,
          PAGE_SIZE,
        ],
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

      setOngoingGames(games)
    } catch (err) {
      console.error('Error polling ongoing games:', err)
    }
  }

  const pollPastGames = async () => {
    if (!walletAddress) return

    try {
      const ids = await client.readContract({
        address: CHAIN_CONFIG.contractAddress as `0x${string}`,
        abi: contractABI,
        functionName: 'getGovernorGames',
        args: [
          walletAddress as `0x${string}`,
          true,  // includeEnded
          false, // includeOngoing
          false, // includeNotStarted
          0n,
          PAGE_SIZE,
        ],
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

      setPastGames(games)
    } catch (err) {
      console.error('Error polling past games:', err)
    }
  }

  const readyUpGame = async (gameId: bigint) => {
    if (!window.ethereum) {
      alert('Please connect your wallet first.')
      return
    }

    try {
      // Check and switch chain if needed
      const chainId = await window.ethereum.request({ method: 'eth_chainId' })
      if (chainId !== CHAIN_CONFIG.chainId) {
        await switchToChain()
      }

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const walletClient = createWalletClient({
        account: accounts[0] as `0x${string}`,
        chain: customChain,
        transport: custom(window.ethereum),
      })

      const hash = await walletClient.writeContract({
        address: CHAIN_CONFIG.contractAddress as `0x${string}`,
        abi: contractABI,
        functionName: 'setGameReady',
        args: [gameId],
      })
      console.log('Ready up transaction hash:', hash)
      setTimeout(pollOngoingGames, 2000)
    } catch (error) {
      console.error('Error readying up game:', error)
      alert('Failed to ready up game: ' + (error as Error).message)
    }
  }

  const addLoser = async (gameId: bigint, loser: string) => {
    if (!window.ethereum) {
      alert('Please connect your wallet first.')
      return
    }

    try {
      // Check and switch chain if needed
      const chainId = await window.ethereum.request({ method: 'eth_chainId' })
      if (chainId !== CHAIN_CONFIG.chainId) {
        await switchToChain()
      }

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const walletClient = createWalletClient({
        account: accounts[0] as `0x${string}`,
        chain: customChain,
        transport: custom(window.ethereum),
      })

      const hash = await walletClient.writeContract({
        address: CHAIN_CONFIG.contractAddress as `0x${string}`,
        abi: contractABI,
        functionName: 'addLoser',
        args: [gameId, loser as `0x${string}`],
      })
      console.log('Add loser transaction hash:', hash)
      setTimeout(pollOngoingGames, 2000)
    } catch (error) {
      console.error('Error adding loser:', error)
      alert('Failed to add loser: ' + (error as Error).message)
    }
  }

  const endGame = async (gameId: bigint) => {
    if (!window.ethereum) {
      alert('Please connect your wallet first.')
      return
    }

    try {
      // Check and switch chain if needed
      const chainId = await window.ethereum.request({ method: 'eth_chainId' })
      if (chainId !== CHAIN_CONFIG.chainId) {
        await switchToChain()
      }

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const walletClient = createWalletClient({
        account: accounts[0] as `0x${string}`,
        chain: customChain,
        transport: custom(window.ethereum),
      })

      // End the game with 5% fee
      const hash = await walletClient.writeContract({
        address: CHAIN_CONFIG.contractAddress as `0x${string}`,
        abi: contractABI,
        functionName: 'endGame',
        args: [gameId, 5n],
      })
      console.log('End game transaction hash:', hash)

      setTimeout(() => {
        pollOngoingGames()
        pollPastGames()
      }, 2000)
    } catch (error) {
      console.error('Error ending game:', error)
      alert('Failed to end game: ' + (error as Error).message)
    }
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
    const handleChainChange = async () => {
      if (walletAddress) {
        await switchToChain()
        await pollOpenGames()
        await pollOngoingGames()
        await pollPastGames()
      }
    }
    handleChainChange()
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
              padding: '8px 12px',
              fontSize: '14px',
              borderRadius: '8px',
              border: '2px solid #646cff',
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
          governorPreset={governorPreset}
          setGovernorPreset={setGovernorPreset}
          customGovernorAddress={customGovernorAddress}
          setCustomGovernorAddress={setCustomGovernorAddress}
          selectedGovernor={selectedGovernor}
          amount={amount}
          setAmount={setAmount}
          maxPlayers={maxPlayers}
          setMaxPlayers={setMaxPlayers}
          whitelistInput={whitelistInput}
          setWhitelistInput={setWhitelistInput}
          createGame={createGame}
          currencySymbol={CHAIN_CONFIG.nativeCurrency.symbol}
        />

        <JoinGameTile
          openGames={openGames}
          walletAddress={walletAddress}
          joinGame={joinGame}
          forfeitGame={forfeitGame}
          currencySymbol={CHAIN_CONFIG.nativeCurrency.symbol}
        />

        <GovernGamesTile
          ongoingGames={ongoingGames}
          walletAddress={walletAddress}
          readyUpGame={readyUpGame}
          addLoser={addLoser}
          endGame={endGame}
          pollOngoingGames={pollOngoingGames}
          currencySymbol={CHAIN_CONFIG.nativeCurrency.symbol}
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
