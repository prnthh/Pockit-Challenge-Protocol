# GameEscrow Upgradeable Contract

## Overview

The GameEscrow contract is now upgradeable using the UUPS (Universal Upgradeable Proxy Pattern) from OpenZeppelin. This allows for fixing bugs and adding features without losing game state.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  ERC1967Proxy (Transparent Storage + Upgradeable)      │
│  - Manages implementation address                       │
│  - Stores all state (games, nextGameId, etc)          │
│  - Delegates calls to current implementation           │
└─────────────────────────────────────────────────────────┘
                         ↓ delegates to
┌─────────────────────────────────────────────────────────┐
│  GameEscrowV1 (Implementation)                          │
│  - Contains all game logic                             │
│  - Can be replaced without affecting proxy storage     │
└─────────────────────────────────────────────────────────┘
```

## Deployment

### 1. Deploy to Anvil (Local Testing)

```bash
# Start Anvil
anvil --port 8545

# Deploy (in another terminal)
forge script contracts/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

### 2. Deploy to Testnet

```bash
# Sepolia
forge script contracts/Deploy.s.sol --rpc-url https://rpc.sepolia.org --broadcast --verify

# Sanko
forge script contracts/Deploy.s.sol --rpc-url https://sanko-arb-sepolia.rpc.caldera.xyz/http --broadcast --verify
```

## Upgrading

### Step 1: Deploy New Implementation

```solidity
// contracts/GameEscrowV2.sol
contract GameEscrowV2 is GameEscrowV1 {
    // New features here
    function newFeature() external pure returns (string memory) {
        return "Feature added!";
    }
}
```

### Step 2: Call `upgradeTo` on Proxy

```bash
# Get proxy address from deployment
PROXY_ADDRESS="0x..."

# Upgrade (owner only)
cast send $PROXY_ADDRESS "upgradeTo(address)" $NEW_IMPLEMENTATION_ADDRESS --private-key $PRIVATE_KEY --rpc-url $RPC_URL
```

### Step 3: Verify

All existing game state persists. New features available immediately.

## Safe Upgrade Patterns

### ✅ DO

- Add new state variables at the end of the struct
- Add new external functions
- Modify function implementations (fixing bugs)
- Add new events

### ❌ DON'T

- Reorder existing state variables (corrupts storage)
- Delete state variables
- Change types of existing variables
- Change function signatures (breaks external calls)
- Move variable positions in structs

## Example: Adding a New Feature

```solidity
// GameEscrowV2.sol - Safe upgrade

contract GameEscrowV2 is GameEscrowV1 {
    // NEW: Track game metadata
    mapping(uint256 => string) public gameTitles;
    
    // NEW: Create game with title
    function createGameWithTitle(
        address governor,
        uint256 stakeAmount,
        uint256 maxPlayers,
        address[] calldata whitelist,
        string calldata title
    ) external payable returns (uint256) {
        uint256 gameId = createGame(governor, stakeAmount, maxPlayers, whitelist);
        gameTitles[gameId] = title;
        return gameId;
    }
}
```

Storage layout preserved. All existing games still work.

## Proxy Info

- **Pattern**: ERC1967 (OpenZeppelin standard)
- **Owner**: Proxy owner (set on initialization)
- **Admin Slot**: `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3155b9c9f8f3e`
- **Implementation Slot**: `0xb101a4d9a8cf6c3e8c95c9b0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0`

## Rollback

If an upgrade fails:

```bash
cast send $PROXY_ADDRESS "upgradeTo(address)" $OLD_IMPLEMENTATION_ADDRESS \
  --private-key $PRIVATE_KEY --rpc-url $RPC_URL
```

All data preserved. Back to old behavior instantly.

## Testing Upgrades

```solidity
// test/Upgrade.t.sol

import {GameEscrowV1} from "../contracts/GameEscrowV1.sol";
import {GameEscrowV2} from "../contracts/GameEscrowV2.sol";

function testUpgradePreservesState() public {
    // Create game on V1
    vm.prank(player1);
    uint256 gameId = escrow.createGame{value: STAKE}(governor, STAKE, 2, new address[](0));
    
    // Upgrade to V2
    GameEscrowV2 v2 = new GameEscrowV2();
    vm.prank(owner);
    GameEscrowV1(address(proxy)).upgradeTo(address(v2));
    
    // Cast to V2 interface
    GameEscrowV2 escrowV2 = GameEscrowV2(address(proxy));
    
    // Old state still there
    GameEscrowV1.GameInfo memory game = escrowV2.getGame(gameId);
    assertEq(game.stakeAmount, STAKE);
    
    // New features available
    escrowV2.createGameWithTitle(governor, STAKE, 2, new address[](0), "Game Title");
}
```

## Proxy Verification

```bash
# Get implementation address
cast call $PROXY_ADDRESS "_getImplementation()" --rpc-url $RPC_URL

# Get admin (if using TransparentProxy pattern)
cast call $PROXY_ADDRESS "admin()" --rpc-url $RPC_URL
```

## Notes

- First call to proxy is slower (initialization)
- Subsequent calls have minimal overhead
- State persists perfectly across upgrades
- Only owner can upgrade (check initialization)
