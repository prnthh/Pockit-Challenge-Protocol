
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

export default contractABI;