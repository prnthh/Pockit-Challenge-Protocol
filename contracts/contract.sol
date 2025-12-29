// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract GameEscrow is ReentrancyGuard {
    modifier onlyGovernor(uint256 gameId) {
        require(games[gameId].governor == msg.sender, "Not governor");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // Optimized struct layout: group by type to minimize storage slots
    // address (20 bytes) + bool (1 byte) + bool (1 byte) = fits in one slot
    // uint256 values each take one slot
    struct Game {
        address governor;           // Slot 0 (20 bytes)
        bool isReady;              // Slot 0 (1 byte, packed with governor)
        bool isEnded;              // Slot 0 (1 byte, packed with governor)
        uint256 stakeAmount;       // Slot 1
        uint256 maxPlayers;        // Slot 2
        address[] players;         // Slot 3
        address[] losers;          // Slot 4
        address[] whitelist;       // Slot 5
        address[] forfeited;       // Slot 6
        mapping(address => bool) isLoser;       // Slot 7
        mapping(address => bool) isWhitelisted; // Slot 8
        mapping(address => bool) hasForfeit;    // Slot 9
        mapping(address => bool) isPlayer;      // Slot 10 - gas optimization for lookups
    }

    struct GameInfo {
        address governor;
        uint256 stakeAmount;
        uint256 maxPlayers;
        bool isReady;
        bool isEnded;
        address[] players;
        address[] losers;
        address[] whitelist;
        address[] forfeited;
    }

    mapping(uint256 => Game) public games;
    uint256 public nextGameId;
    address public owner;
    uint256 public immutable houseFeePercentage;

    constructor(uint256 _houseFeePercentage) {
        owner = msg.sender;
        houseFeePercentage = _houseFeePercentage;
    }

    event GameCreated(uint256 indexed gameId, address creator, uint256 stakeAmount);
    event PlayerJoined(uint256 indexed gameId, address player);
    event GameReady(uint256 indexed gameId);
    event LoserAdded(uint256 indexed gameId, address loser);
    event PlayerForfeited(uint256 indexed gameId, address player);
    event GameEnded(uint256 indexed gameId);

    function createGame(address governor, uint256 stakeAmount, uint256 maxPlayers, address[] calldata whitelist) external payable returns (uint256) {
        require(stakeAmount > 0, "Stake must be positive");
        require(msg.value == stakeAmount, "Incorrect stake amount");
        require(governor != address(0), "Invalid governor");

        uint256 gameId = nextGameId++;
        Game storage game = games[gameId];

        game.governor = governor;
        game.stakeAmount = stakeAmount;
        game.maxPlayers = maxPlayers; // 0 means unlimited
        game.players.push(msg.sender);
        game.isPlayer[msg.sender] = true; // Gas optimization

        // Set up whitelist if provided - use calldata to save gas
        uint256 whitelistLength = whitelist.length;
        if (whitelistLength > 0) {
            for (uint256 i; i < whitelistLength; ) {
                game.whitelist.push(whitelist[i]);
                game.isWhitelisted[whitelist[i]] = true;
                unchecked { ++i; } // Gas optimization - overflow impossible
            }
            // Ensure creator is whitelisted
            if (!game.isWhitelisted[msg.sender]) {
                game.whitelist.push(msg.sender);
                game.isWhitelisted[msg.sender] = true;
            }
        }

        emit GameCreated(gameId, msg.sender, stakeAmount);
        return gameId;
    }

    function joinGame(uint256 gameId) external payable nonReentrant {
        Game storage game = games[gameId];
        require(game.governor != address(0), "Game does not exist");
        require(!game.isReady, "Game already started");
        require(!game.isEnded, "Game ended");
        require(msg.value == game.stakeAmount, "Incorrect stake amount");
        require(!game.isPlayer[msg.sender], "Already joined"); // Gas-optimized check

        // Check max players if set (0 means unlimited)
        if (game.maxPlayers > 0) {
            require(game.players.length < game.maxPlayers, "Game is full");
        }

        // Check whitelist if it exists
        if (game.whitelist.length > 0) {
            require(game.isWhitelisted[msg.sender], "Not whitelisted");
        }

        game.players.push(msg.sender);
        game.isPlayer[msg.sender] = true; // Mark as player
        emit PlayerJoined(gameId, msg.sender);
    }

    function forfeitGame(uint256 gameId) external nonReentrant {
        Game storage game = games[gameId];
        require(!game.isReady, "Game already started");
        require(!game.isEnded, "Game ended");
        require(!game.hasForfeit[msg.sender], "Already forfeited");
        require(game.isPlayer[msg.sender], "Not a player in this game"); // Gas-optimized check

        // Mark player as forfeited
        game.hasForfeit[msg.sender] = true;
        game.forfeited.push(msg.sender);

        emit PlayerForfeited(gameId, msg.sender);

        // Check if all players have forfeited
        uint256 playersLength = game.players.length;
        if (game.forfeited.length == playersLength) {
            game.isEnded = true;

            // Refund all players - pull over push pattern would be safer but adds complexity
            // Using CEI pattern: checks done, effects set, interactions last
            for (uint256 i; i < playersLength; ) {
                (bool success, ) = game.players[i].call{value: game.stakeAmount}("");
                require(success, "Refund failed");
                unchecked { ++i; }
            }

            emit GameEnded(gameId);
        }
    }

    function setGameReady(uint256 gameId) external onlyGovernor(gameId) {
        Game storage game = games[gameId];
        require(!game.isEnded, "Game ended");
        require(!game.isReady, "Already ready");

        game.isReady = true;
        emit GameReady(gameId);
    }

    function addLoser(uint256 gameId, address loser) external onlyGovernor(gameId) {
        Game storage game = games[gameId];
        require(game.isReady, "Game not ready");
        require(!game.isEnded, "Game ended");
        require(!game.isLoser[loser], "Already marked as loser");
        require(game.isPlayer[loser], "Player not in game"); // Gas-optimized check

        game.losers.push(loser);
        game.isLoser[loser] = true;

        emit LoserAdded(gameId, loser);
    }

    function endGame(uint256 gameId, uint256 governorFeePercentage) external nonReentrant onlyGovernor(gameId) {
        Game storage game = games[gameId];
        require(game.isReady, "Game not ready");
        require(!game.isEnded, "Game already ended");
        require(houseFeePercentage + governorFeePercentage <= 100, "Total fee exceeds 100%");

        game.isEnded = true;

        uint256 playersLength = game.players.length;
        uint256 totalPrize = game.stakeAmount * playersLength;
        uint256 houseFee = (totalPrize * houseFeePercentage) / 100;
        uint256 governorFee = (totalPrize * governorFeePercentage) / 100;
        uint256 remainingPrize = totalPrize - houseFee - governorFee;

        // Transfer governor fee to governor (follows CEI pattern - checks, effects, interactions)
        if (governorFee > 0) {
            (bool successGov, ) = game.governor.call{value: governorFee}("");
            require(successGov, "Governor transfer failed");
        }

        // Count winners - exclude both losers and forfeited players
        uint256 winnerCount;
        for (uint256 i; i < playersLength; ) {
            address player = game.players[i];
            if (!game.isLoser[player] && !game.hasForfeit[player]) {
                unchecked { ++winnerCount; }
            }
            unchecked { ++i; }
        }

        if (winnerCount == 0) {
            // Send remaining prize to governor if no winners
            if (remainingPrize > 0) {
                (bool successRemaining, ) = game.governor.call{value: remainingPrize}("");
                require(successRemaining, "Governor remaining transfer failed");
            }
        } else {
            uint256 prizePerWinner = remainingPrize / winnerCount;
            for (uint256 i; i < playersLength; ) {
                address player = game.players[i];
                if (!game.isLoser[player] && !game.hasForfeit[player]) {
                    (bool success, ) = player.call{value: prizePerWinner}("");
                    require(success, "Transfer failed");
                }
                unchecked { ++i; }
            }
        }

        emit GameEnded(gameId);
    }

    function getGame(uint256 gameId) external view returns (GameInfo memory) {
        Game storage game = games[gameId];
        return GameInfo({
            governor: game.governor,
            stakeAmount: game.stakeAmount,
            maxPlayers: game.maxPlayers,
            isReady: game.isReady,
            isEnded: game.isEnded,
            players: game.players,
            losers: game.losers,
            whitelist: game.whitelist,
            forfeited: game.forfeited
        });
    }

    function getNotStartedGames() external view returns (uint256[] memory) {
        uint256[] memory notStartedGames = new uint256[](nextGameId);
        uint256 count = 0;

        for (uint256 i = 0; i < nextGameId; i++) {
            if (!games[i].isReady && !games[i].isEnded) {
                notStartedGames[count] = i;
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = notStartedGames[i];
        }

        return result;
    }

    function getOngoingGames() external view returns (uint256[] memory) {
        uint256[] memory ongoingGames = new uint256[](nextGameId);
        uint256 count = 0;

        for (uint256 i = 0; i < nextGameId; i++) {
            if (games[i].isReady && !games[i].isEnded) {
                ongoingGames[count] = i;
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = ongoingGames[i];
        }

        return result;
    }

    function getGovernorGames(address governor, bool includeEnded, bool includeOngoing, bool includeNotStarted) external view returns (uint256[] memory) {
        uint256[] memory governorGames = new uint256[](nextGameId);
        uint256 count = 0;

        for (uint256 i = 0; i < nextGameId; i++) {
            if (games[i].governor == governor) {
                bool shouldInclude = false;

                if (games[i].isEnded && includeEnded) {
                    shouldInclude = true;
                } else if (games[i].isReady && !games[i].isEnded && includeOngoing) {
                    shouldInclude = true;
                } else if (!games[i].isReady && !games[i].isEnded && includeNotStarted) {
                    shouldInclude = true;
                }

                if (shouldInclude) {
                    governorGames[count] = i;
                    count++;
                }
            }
        }

        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = governorGames[i];
        }

        return result;
    }

    function withdraw() external onlyOwner {
        uint256 amount = address(this).balance;
        require(amount > 0, "No funds to withdraw");
        (bool success, ) = owner.call{value: amount}("");
        require(success, "Withdrawal failed");
    }
}