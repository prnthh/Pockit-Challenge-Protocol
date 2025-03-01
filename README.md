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
  matchMakingContractAddress: '0xYourContractAddress',
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

