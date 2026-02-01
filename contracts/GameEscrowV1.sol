// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @title GameEscrow V1
/// @notice Upgradeable game escrow contract with UUPS proxy pattern
contract GameEscrowV1 is Initializable, UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuard {
    // ============================================================
    // State Variables
    // ============================================================

    uint256 public houseFeePercentage;
    uint256 public nextGameId;
    mapping(uint256 => Game) public games;

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

    // ============================================================
    // Events
    // ============================================================

    event GameCreated(uint256 indexed gameId, address creator, uint256 stakeAmount);
    event PlayerJoined(uint256 indexed gameId, address player);
    event PlayerForfeited(uint256 indexed gameId, address player);
    event GameReady(uint256 indexed gameId);
    event LoserAdded(uint256 indexed gameId, address loser);
    event GameEnded(uint256 indexed gameId);

    // ============================================================
    // Initialization (replaces constructor for upgradeable contracts)
    // ============================================================

    /// @notice Initialize the contract (called once via proxy)
    /// @param _houseFeePercentage Initial house fee percentage
    function initialize(uint256 _houseFeePercentage) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        houseFeePercentage = _houseFeePercentage;
        nextGameId = 0;
    }

    // ============================================================
    // Access Control
    // ============================================================

    modifier onlyGovernor(uint256 gameId) {
        require(games[gameId].governor == msg.sender, "Not governor");
        _;
    }

    // ============================================================
    // Game Creation
    // ============================================================

    function createGame(
        address governor,
        uint256 stakeAmount,
        uint256 maxPlayers,
        address[] calldata whitelist
    ) external payable returns (uint256) {
        require(stakeAmount > 0, "Stake must be positive");
        require(msg.value == stakeAmount, "Incorrect stake");
        require(governor != address(0), "Invalid governor");

        uint256 gameId = nextGameId++;
        Game storage game = games[gameId];

        game.governor = governor;
        game.stakeAmount = stakeAmount;
        game.maxPlayers = maxPlayers;
        game.activePlayers = 1;

        game.players.push(msg.sender);
        game.isPlayer[msg.sender] = true;

        // Add whitelist
        if (whitelist.length > 0) {
            for (uint256 i = 0; i < whitelist.length; i++) {
                game.whitelist.push(whitelist[i]);
                game.isWhitelisted[whitelist[i]] = true;
            }
        }
        game.whitelist.push(msg.sender);
        game.isWhitelisted[msg.sender] = true;

        emit GameCreated(gameId, msg.sender, stakeAmount);
        return gameId;
    }

    // ============================================================
    // Game Joining
    // ============================================================

    function joinGame(uint256 gameId) external payable nonReentrant {
        Game storage game = games[gameId];

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

        emit PlayerJoined(gameId, msg.sender);

        // Auto-refund if payment fails
        if (game.activePlayers == game.maxPlayers && game.maxPlayers > 0) {
            (bool success, ) = msg.sender.call{value: 0}("");
            require(success, "Refund failed");
        }
    }

    // ============================================================
    // Game Management
    // ============================================================

    function setGameReady(uint256 gameId) external onlyGovernor(gameId) {
        Game storage game = games[gameId];
        require(!game.isReady, "Game not ready");
        require(game.activePlayers > 0, "No players");

        game.isReady = true;
        emit GameReady(gameId);
    }

    function addLoser(uint256 gameId, address loser) external onlyGovernor(gameId) {
        Game storage game = games[gameId];
        require(game.isReady, "Game not ready");
        require(!game.isEnded, "Game ended");
        require(game.isPlayer[loser], "Not a player");
        require(!game.isLoser[loser], "Already loser");
        require(!game.hasForfeit[loser], "Player forfeited");

        game.losers.push(loser);
        game.isLoser[loser] = true;

        emit LoserAdded(gameId, loser);
    }

    function forfeitGame(uint256 gameId) external nonReentrant {
        Game storage game = games[gameId];
        require(!game.isReady, "Game already started");
        require(!game.isEnded, "Game ended");
        require(game.isPlayer[msg.sender], "Not a player");
        require(!game.hasForfeit[msg.sender], "Already forfeited");

        game.forfeited.push(msg.sender);
        game.hasForfeit[msg.sender] = true;
        game.activePlayers--;

        (bool success, ) = msg.sender.call{value: game.stakeAmount}("");
        require(success, "Refund failed");

        emit PlayerForfeited(gameId, msg.sender);

        if (game.activePlayers == 0) {
            game.isEnded = true;
        }
    }

    function endGame(uint256 gameId, uint256 governorFeePercentage) external onlyGovernor(gameId) nonReentrant {
        Game storage game = games[gameId];
        require(game.isReady, "Game not ready");
        require(!game.isEnded, "Game already ended");
        require(governorFeePercentage <= 100, "Fee overflow");

        game.isEnded = true;

        uint256 totalStake = game.stakeAmount * game.activePlayers;
        uint256 governorFee = (totalStake * governorFeePercentage) / 100;
        uint256 prizePool = totalStake - governorFee;

        // Send governor fee
        if (governorFee > 0) {
            (bool success, ) = game.governor.call{value: governorFee}("");
            require(success, "Governor transfer failed");
        }

        // Determine winners (non-losers and non-forfeited)
        uint256 winnerCount = 0;
        for (uint256 i = 0; i < game.players.length; i++) {
            if (!game.isLoser[game.players[i]] && !game.hasForfeit[game.players[i]]) {
                winnerCount++;
            }
        }

        if (winnerCount == 0) {
            // If all lost, distribute equally to non-forfeited players
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
            // Distribute prize pool equally among winners
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

        emit GameEnded(gameId);
    }

    // ============================================================
    // Queries
    // ============================================================

    function getGame(uint256 gameId) external view returns (GameInfo memory) {
        Game storage game = games[gameId];
        return GameInfo({
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
        uint256[] memory temp = new uint256[](limit);
        uint256 count = 0;

        for (uint256 i = offset; i < nextGameId && count < limit; i++) {
            if (!games[i].isReady && !games[i].isEnded) {
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
        uint256[] memory temp = new uint256[](limit);
        uint256 count = 0;

        for (uint256 i = offset; i < nextGameId && count < limit; i++) {
            if (games[i].isReady && !games[i].isEnded) {
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
        uint256[] memory temp = new uint256[](limit);
        uint256 count = 0;

        for (uint256 i = offset; i < nextGameId && count < limit; i++) {
            if (games[i].governor == governor) {
                bool matches = false;
                if (includeEnded && games[i].isEnded) matches = true;
                if (includeOngoing && games[i].isReady && !games[i].isEnded) matches = true;
                if (includeNotStarted && !games[i].isReady && !games[i].isEnded) matches = true;

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

    // ============================================================
    // Withdrawal
    // ============================================================

    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds");

        (bool success, ) = owner().call{value: balance}("");
        require(success, "Withdraw failed");
    }

    // ============================================================
    // Upgrade Authorization
    // ============================================================

    /// @notice Authorize an upgrade (called by owner before proxy upgrade)
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
