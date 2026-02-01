# GameEscrow Diamond Architecture (EIP-2535)

## Overview

The GameEscrow protocol now uses the Diamond multi-facet proxy pattern, allowing:

- **Modular logic**: Separate concerns into independent facets
- **Unlimited size**: No 24KB contract limit per facet
- **Hot upgrades**: Add/remove/replace facets without losing state
- **Composable**: Reuse facets across different diamonds
- **Gas efficient**: All facets share centralized storage

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Diamond Proxy (EIP-2535)                                  │
│  - Call router (selector → facet address)                 │
│  - Shared storage (LibGameEscrow.diamondStorage())         │
│  - Owner-controlled facet management                       │
└────────────────────────────────────────────────────────────┘
       ↓                    ↓                    ↓
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  GameEscrow  │  │  GameQuery   │  │  Governance  │
│   Facet      │  │   Facet      │  │   Facet      │
│              │  │              │  │              │
│ - createGame │  │ - getGame    │  │ - setFee     │
│ - joinGame   │  │ - queryGames │  │ - transfer   │
│ - endGame    │  │ - nextGameId │  │   Ownership  │
└──────────────┘  └──────────────┘  └──────────────┘
```

## Facets

### GameEscrowFacet (Mutating)
- `createGame()` - Create a new game
- `joinGame()` - Join existing game
- `setGameReady()` - Governor starts game
- `addLoser()` - Mark player as loser
- `forfeitGame()` - Forfeit before game starts
- `endGame()` - Resolve game, distribute payouts
- `withdraw()` - Owner withdraw funds

### GameQueryFacet (Read-Only)
- `getGame(gameId)` - Get full game info
- `getNotStartedGames(offset, limit)` - Query unstarted games
- `getOngoingGames(offset, limit)` - Query active games
- `getGovernorGames(governor, ...)` - Query governor's games
- `nextGameId()` - Current game counter
- `houseFeePercentage()` - Current fee %

### GovernanceFacet (Admin)
- `setHouseFeePercentage(fee)` - Update house fee
- `getOwner()` - Get current owner
- `transferOwnership(newOwner)` - Transfer ownership
- `initializeOwner(owner)` - One-time init
- `initializeHouseFee(fee)` - One-time init

### DiamondCutFacet (System)
- `diamondCut(cuts, init, data)` - Add/remove/replace facets
- `facetAddress(selector)` - Get facet for function
- `facetAddresses()` - List all facet addresses
- `facetFunctionSelectors(facet)` - List facet's functions
- `owner()` - Get diamond owner
- `transferOwnership(newOwner)` - Transfer ownership

## Deployment

### Local (Anvil)

```bash
forge script contracts/DeployDiamond.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

### Testnet (Sepolia)

```bash
forge script contracts/DeployDiamond.s.sol --rpc-url https://rpc.sepolia.org --broadcast --verify
```

Output:
```
Diamond deployed at: 0x...
GameEscrowFacet deployed at: 0x...
GameQueryFacet deployed at: 0x...
GovernanceFacet deployed at: 0x...
DiamondCutFacet deployed at: 0x...
DiamondInit deployed at: 0x...
```

## Usage Examples

### Create & Play a Game

```solidity
// Create game (1 ETH stake, gov is 0x1234)
uint256 gameId = IGameEscrow(diamond).createGame{value: 1 ether}(
    0x1234,  // governor
    1 ether, // stakeAmount
    2,       // maxPlayers
    new address[](0) // no whitelist
);

// Join with second player
IGameEscrow(diamond).joinGame{value: 1 ether}(gameId);

// Governor starts
IGameEscrow(diamond).setGameReady(gameId);

// Governor marks loser
IGameEscrow(diamond).addLoser(gameId, loserAddress);

// Resolve: winner gets 1.8 ETH (2 ETH - 10% fee)
IGameEscrow(diamond).endGame(gameId, 10); // 10% fee
```

### Query Games

```solidity
// Get game info
GameInfo memory game = IGameQuery(diamond).getGame(gameId);

// List not-started games (0-99)
uint256[] memory ids = IGameQuery(diamond).getNotStartedGames(0, 100);

// Governor's games
uint256[] memory govGames = IGameQuery(diamond).getGovernorGames(
    governor,
    true,   // include ended
    true,   // include ongoing
    true,   // include not started
    0,      // offset
    100     // limit
);
```

## Adding New Facets

### 1. Create Facet

```solidity
// contracts/facets/MyNewFacet.sol
import "../facets/GameEscrowFacets.sol"; // For LibGameEscrow access

contract MyNewFacet {
    using LibGameEscrow for LibGameEscrow.Storage;

    function myNewFunction() external {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        // Access shared state
        uint256 nextId = ds.nextGameId;
    }
}
```

### 2. Deploy New Facet

```bash
# Compile
forge build

# Deploy and cut via diamond
# (See DiamondCutFacet.diamondCut() for interface)
```

### 3. Execute Diamond Cut

```solidity
// Prepare the cut
LibDiamond.FacetCut[] memory cuts = new LibDiamond.FacetCut[](1);
cuts[0] = LibDiamond.FacetCut(
    address(newFacet),
    0, // 0=Add, 1=Replace, 2=Remove
    new bytes4[](1)
);
cuts[0].functionSelectors[0] = MyNewFacet.myNewFunction.selector;

// Execute (owner only)
IDiamondCut(diamond).diamondCut(cuts, address(0), "");
```

## Safe Upgrade Patterns

### ✅ DO

- Add new facets (action=0)
- Replace function implementations in existing facets (action=1)
- Remove unused facets (action=2)
- Add new storage variables to LibGameEscrow
- Maintain LibGameEscrow.Storage layout

### ❌ DON'T

- Reorder fields in LibGameEscrow.Storage
- Delete existing storage variables
- Change LibGameEscrow struct field types
- Break function selector compatibility

## Storage Management

All facets access shared storage via `LibGameEscrow.diamondStorage()`:

```solidity
library LibGameEscrow {
    bytes32 constant STORAGE_POSITION = keccak256("game.escrow.storage");

    struct Storage {
        mapping(uint256 => Game) games;
        uint256 nextGameId;
        uint256 houseFeePercentage;
        address owner;
    }

    function diamondStorage() internal pure returns (Storage storage ds) {
        bytes32 position = STORAGE_POSITION;
        assembly { ds.slot := position }
    }
}
```

This pattern ensures:
- All facets see identical state
- No storage collisions
- Upgrades preserve all data

## Function Selectors (4-byte signature)

When adding facets, provide function selectors:

```solidity
bytes4[] memory selectors = new bytes4[](1);
selectors[0] = MyFacet.myFunction.selector; // bytes4(keccak256("myFunction(address)"))
```

Use `cast` to get selectors:

```bash
cast sig "myFunction(address)"
# Output: 0x12345678
```

## Querying Facet Info

```bash
# Get facet for function selector
cast call $DIAMOND "facetAddress(bytes4)" 0x12345678 --rpc-url $RPC_URL

# List all facets
cast call $DIAMOND "facetAddresses()" --rpc-url $RPC_URL

# Get functions in facet
cast call $DIAMOND "facetFunctionSelectors(address)" $FACET_ADDRESS --rpc-url $RPC_URL
```

## Rollback

To remove or replace a problematic facet:

```solidity
// Replace with old version
LibDiamond.FacetCut[] memory cuts = new LibDiamond.FacetCut[](1);
cuts[0] = LibDiamond.FacetCut(
    address(oldFacet),
    1, // Replace
    selectors // functions to replace
);

IDiamondCut(diamond).diamondCut(cuts, address(0), "");
```

All game state preserved during rollback.

## References

- [EIP-2535: Diamonds](https://eips.ethereum.org/EIPS/eip-2535)
- [Diamond Standard GitHub](https://github.com/mudgen/diamond)
- [LibGameEscrow Storage Pattern](./facets/GameEscrowFacets.sol)
