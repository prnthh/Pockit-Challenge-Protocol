# Pockit Challenge Protocol

A library for managing blockchain-based game governance using ethers.js, with a bundled matchmaking contract ABI.

## Installation

```bash
npm install @pockit/challenge-protocol
```

## Usage

```javascript
// index.js

const Governor = require('@pockit/challenge-protocol');

const gov = new Governor({
  privateKey: 'governor-private-key',
  matchMakingContractAddress: '0xb8f26231ab263ed6c85f2a602a383d597936164b', // sanko mainnet
  fee: 2,
gameHandler: async (gameId, wallet, contract, onGameHandled, onGameResolved) => {
    // Fetch game details from the contract
    const game = await contract.getGame(gameId);
    const players = game.players;

    // Condition: Wait until at least 2 players are in the game
    if (players.length < 2) {
      return;
    }

    // Mark the game as ready to start
    await onGameHandled();

    // Add your game logic here
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const loserIndex = Math.floor(Math.random() * 2); // 0 or 1
    const loser = players[loserIndex];
    const winner = players[1 - loserIndex]; // Opposite of loser
    console.log(`Game ${gameId}: Winner is ${winner}, Loser is ${loser}`);

    // End the game by marking the losers
    await onGameResolved([loser]);
  },
  contractABI: customABI, // Optional
  providerUrl: 'https://mainnet.sanko.xyz' // Optional
});

// Start polling for games
gov.pollForNewGames();
```

## Existing Contract Deployments

These deployed contracts can be used by anyone (for a 2% fee). Ownership of games is determined by the governor parameter used while calling createGame on a client.
```
0xb8f26231ab263ed6c85f2a602a383d597936164b // sanko mainnet
0xDefE687Cb741fFd583f70E9d5C5000da0c9710dF // sanko testnet
0xd0cE8C6c7Ec2DB144d53ca8A4eb3Ce612F0BEA87 // eth mainnet
```
Games using the global matchmaking contract are featured on the global leaderboard.

## API

### `Governor(options)`

Creates a new instance of the Governor class with the specified options.

#### Options

- **`privateKey`** *(string, required)*: Ethereum private key used to sign transactions.
- **`matchMakingContractAddress`** *(string)*: Address of the matchmaking contract on the blockchain.
- **`fee`** *(number)*: Fee charged for ending games.
- **`gameHandler`** *(function)*: Callback function to handle game logic. Receives `(gameId, wallet, contract, onGameHandled, onGameResolved)` as arguments.
- **`providerUrl`** *(string, optional)*: Custom RPC provider URL. Defaults to `https://mainnet.sanko.xyz`.
- **`contractABI`** *(array, optional)*: Custom contract ABI. Defaults to the bundled ABI included in the package.

