// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/******************************************************************************
 * Diamond Facet Architecture for GameEscrow
 * 
 * Structure:
 *   Diamond (proxy) → Facets (logic modules)
 *   - GameEscrowFacet: Game creation, joining, lifecycle
 *   - GameQueryFacet: Read-only game queries
 *   - GovernanceFacet: Governor/owner management
 *   - DiamondCutFacet: Add/replace/remove facets
 *
 * Benefits:
 *   - Unlimited contract size (no 24KB limit per facet)
 *   - Modular: Add/remove features independently
 *   - Composable: Use facets in multiple diamonds
 *   - Gas efficient: Shared state via shared storage
 ******************************************************************************/

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title LibGameEscrow
/// @notice Shared storage library for all facets
library LibGameEscrow {
    bytes32 constant STORAGE_POSITION = keccak256("game.escrow.storage");

    struct Game {
        address governor;
        bool isReady;
        bool isEnded;
        uint256 stakeAmount;
        uint256 maxPlayers;
        uint256 activePlayers;
        address[] players;
        address[] losers;
        address[] whitelist;
        address[] forfeited;
        mapping(address => bool) isLoser;
        mapping(address => bool) isWhitelisted;
        mapping(address => bool) hasForfeit;
        mapping(address => bool) isPlayer;
    }

    struct GameInfo {
        address governor;
        uint256 stakeAmount;
        uint256 maxPlayers;
        uint256 activePlayers;
        bool isReady;
        bool isEnded;
        address[] players;
        address[] losers;
        address[] whitelist;
        address[] forfeited;
    }

    struct Storage {
        mapping(uint256 => Game) games;
        uint256 nextGameId;
        uint256 houseFeePercentage;
        address owner;
    }

    function diamondStorage() internal pure returns (Storage storage ds) {
        bytes32 position = STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }

    event GameCreated(uint256 indexed gameId, address creator, uint256 stakeAmount);
    event PlayerJoined(uint256 indexed gameId, address player);
    event PlayerForfeited(uint256 indexed gameId, address player);
    event GameReady(uint256 indexed gameId);
    event LoserAdded(uint256 indexed gameId, address loser);
    event GameEnded(uint256 indexed gameId);
}

/// @title GameEscrowFacet
/// @notice Game lifecycle management (create, join, forfeit, end)
contract GameEscrowFacet is ReentrancyGuard {
    using LibGameEscrow for LibGameEscrow.Storage;

    modifier onlyGovernor(uint256 gameId) {
        require(LibGameEscrow.diamondStorage().games[gameId].governor == msg.sender, "Not governor");
        _;
    }

    modifier onlyOwner() {
        require(LibGameEscrow.diamondStorage().owner == msg.sender, "Not owner");
        _;
    }

    function createGame(
        address governor,
        uint256 stakeAmount,
        uint256 maxPlayers,
        address[] calldata whitelist
    ) external payable returns (uint256) {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        
        require(stakeAmount > 0, "Stake must be positive");
        require(msg.value == stakeAmount, "Incorrect stake");
        require(governor != address(0), "Invalid governor");

        uint256 gameId = ds.nextGameId++;
        LibGameEscrow.Game storage game = ds.games[gameId];

        game.governor = governor;
        game.stakeAmount = stakeAmount;
        game.maxPlayers = maxPlayers;
        game.activePlayers = 1;

        game.players.push(msg.sender);
        game.isPlayer[msg.sender] = true;

        if (whitelist.length > 0) {
            for (uint256 i = 0; i < whitelist.length; i++) {
                game.whitelist.push(whitelist[i]);
                game.isWhitelisted[whitelist[i]] = true;
            }
        }
        game.whitelist.push(msg.sender);
        game.isWhitelisted[msg.sender] = true;

        emit LibGameEscrow.GameCreated(gameId, msg.sender, stakeAmount);
        return gameId;
    }

    function joinGame(uint256 gameId) external payable nonReentrant {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        LibGameEscrow.Game storage game = ds.games[gameId];

        require(msg.value == game.stakeAmount, "Incorrect stake");
        require(!game.isReady, "Game already started");
        require(!game.isEnded, "Game ended");
        require(!game.isPlayer[msg.sender], "Already joined");

        if (game.whitelist.length > 0) {
            require(game.isWhitelisted[msg.sender], "Not whitelisted");
        }

        if (game.maxPlayers > 0) {
            require(game.activePlayers < game.maxPlayers, "Game full");
        }

        game.players.push(msg.sender);
        game.isPlayer[msg.sender] = true;
        game.activePlayers++;

        emit LibGameEscrow.PlayerJoined(gameId, msg.sender);
    }

    function setGameReady(uint256 gameId) external onlyGovernor(gameId) {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        LibGameEscrow.Game storage game = ds.games[gameId];
        
        require(!game.isReady, "Game not ready");
        require(game.activePlayers > 0, "No players");

        game.isReady = true;
        emit LibGameEscrow.GameReady(gameId);
    }

    function addLoser(uint256 gameId, address loser) external onlyGovernor(gameId) {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        LibGameEscrow.Game storage game = ds.games[gameId];
        
        require(game.isReady, "Game not ready");
        require(!game.isEnded, "Game ended");
        require(game.isPlayer[loser], "Not a player");
        require(!game.isLoser[loser], "Already loser");
        require(!game.hasForfeit[loser], "Player forfeited");

        game.losers.push(loser);
        game.isLoser[loser] = true;

        emit LibGameEscrow.LoserAdded(gameId, loser);
    }

    function forfeitGame(uint256 gameId) external nonReentrant {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        LibGameEscrow.Game storage game = ds.games[gameId];
        
        require(!game.isReady, "Game already started");
        require(!game.isEnded, "Game ended");
        require(game.isPlayer[msg.sender], "Not a player");
        require(!game.hasForfeit[msg.sender], "Already forfeited");

        game.forfeited.push(msg.sender);
        game.hasForfeit[msg.sender] = true;
        game.activePlayers--;

        (bool success, ) = msg.sender.call{value: game.stakeAmount}("");
        require(success, "Refund failed");

        emit LibGameEscrow.PlayerForfeited(gameId, msg.sender);

        if (game.activePlayers == 0) {
            game.isEnded = true;
        }
    }

    function endGame(uint256 gameId, uint256 governorFeePercentage) external onlyGovernor(gameId) nonReentrant {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        LibGameEscrow.Game storage game = ds.games[gameId];
        
        require(game.isReady, "Game not ready");
        require(!game.isEnded, "Game already ended");
        require(governorFeePercentage <= 100, "Fee overflow");

        game.isEnded = true;

        uint256 totalStake = game.stakeAmount * game.activePlayers;
        uint256 governorFee = (totalStake * governorFeePercentage) / 100;
        uint256 prizePool = totalStake - governorFee;

        if (governorFee > 0) {
            (bool success, ) = game.governor.call{value: governorFee}("");
            require(success, "Governor transfer failed");
        }

        uint256 winnerCount = 0;
        for (uint256 i = 0; i < game.players.length; i++) {
            if (!game.isLoser[game.players[i]] && !game.hasForfeit[game.players[i]]) {
                winnerCount++;
            }
        }

        if (winnerCount == 0) {
            uint256 remainder = prizePool;
            for (uint256 i = 0; i < game.forfeited.length; i++) {
                if (!game.hasForfeit[game.forfeited[i]]) {
                    uint256 share = remainder / (game.activePlayers - i);
                    (bool success, ) = game.forfeited[i].call{value: share}("");
                    require(success, "Payout failed");
                    remainder -= share;
                }
            }
        } else {
            uint256 prizePerWinner = prizePool / winnerCount;
            uint256 remainder = prizePool % winnerCount;

            for (uint256 i = 0; i < game.players.length; i++) {
                if (!game.isLoser[game.players[i]] && !game.hasForfeit[game.players[i]]) {
                    uint256 prize = prizePerWinner;
                    if (remainder > 0) {
                        prize += 1;
                        remainder--;
                    }
                    (bool success, ) = game.players[i].call{value: prize}("");
                    require(success, "Payout failed");
                }
            }
        }

        emit LibGameEscrow.GameEnded(gameId);
    }

    function withdraw() external {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        require(msg.sender == ds.owner, "Not owner");
        
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds");

        (bool success, ) = ds.owner.call{value: balance}("");
        require(success, "Withdraw failed");
    }
}

/// @title GameQueryFacet
/// @notice Read-only game queries
contract GameQueryFacet {
    using LibGameEscrow for LibGameEscrow.Storage;

    function getGame(uint256 gameId) external view returns (LibGameEscrow.GameInfo memory) {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        LibGameEscrow.Game storage game = ds.games[gameId];
        
        return LibGameEscrow.GameInfo({
            governor: game.governor,
            stakeAmount: game.stakeAmount,
            maxPlayers: game.maxPlayers,
            activePlayers: game.activePlayers,
            isReady: game.isReady,
            isEnded: game.isEnded,
            players: game.players,
            losers: game.losers,
            whitelist: game.whitelist,
            forfeited: game.forfeited
        });
    }

    function getNotStartedGames(uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        uint256[] memory temp = new uint256[](limit);
        uint256 count = 0;

        for (uint256 i = offset; i < ds.nextGameId && count < limit; i++) {
            if (!ds.games[i].isReady && !ds.games[i].isEnded) {
                temp[count] = i;
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = temp[i];
        }
        return result;
    }

    function getOngoingGames(uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        uint256[] memory temp = new uint256[](limit);
        uint256 count = 0;

        for (uint256 i = offset; i < ds.nextGameId && count < limit; i++) {
            if (ds.games[i].isReady && !ds.games[i].isEnded) {
                temp[count] = i;
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = temp[i];
        }
        return result;
    }

    function getGovernorGames(
        address governor,
        bool includeEnded,
        bool includeOngoing,
        bool includeNotStarted,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        uint256[] memory temp = new uint256[](limit);
        uint256 count = 0;

        for (uint256 i = offset; i < ds.nextGameId && count < limit; i++) {
            if (ds.games[i].governor == governor) {
                bool matches = false;
                if (includeEnded && ds.games[i].isEnded) matches = true;
                if (includeOngoing && ds.games[i].isReady && !ds.games[i].isEnded) matches = true;
                if (includeNotStarted && !ds.games[i].isReady && !ds.games[i].isEnded) matches = true;

                if (matches) {
                    temp[count] = i;
                    count++;
                }
            }
        }

        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = temp[i];
        }
        return result;
    }

    function nextGameId() external view returns (uint256) {
        return LibGameEscrow.diamondStorage().nextGameId;
    }

    function houseFeePercentage() external view returns (uint256) {
        return LibGameEscrow.diamondStorage().houseFeePercentage;
    }
}

/// @title GovernanceFacet
/// @notice Owner/governance management
contract GovernanceFacet {
    using LibGameEscrow for LibGameEscrow.Storage;

    function setHouseFeePercentage(uint256 newFeePercentage) external {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        require(msg.sender == ds.owner, "Not owner");
        require(newFeePercentage <= 100, "Fee too high");
        
        ds.houseFeePercentage = newFeePercentage;
    }

    function getOwner() external view returns (address) {
        return LibGameEscrow.diamondStorage().owner;
    }

    function transferOwnership(address newOwner) external {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        require(msg.sender == ds.owner, "Not owner");
        require(newOwner != address(0), "Invalid owner");
        
        ds.owner = newOwner;
    }

    function initializeOwner(address owner) external {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        require(ds.owner == address(0), "Already initialized");
        require(owner != address(0), "Invalid owner");
        
        ds.owner = owner;
    }

    function initializeHouseFee(uint256 feePercentage) external {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        require(ds.owner != address(0), "Initialize owner first");
        require(feePercentage <= 100, "Fee too high");
        
        ds.houseFeePercentage = feePercentage;
    }
}
