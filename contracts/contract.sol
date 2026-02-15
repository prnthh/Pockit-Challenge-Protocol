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

    struct Game {
        address governor;           // slot 0
        bool isReady;               // slot 0
        bool isEnded;               // slot 0

        uint256 stakeAmount;        // slot 1
        uint256 maxPlayers;         // slot 2
        uint256 activePlayers;      // slot 3

        address[] players;          // slot 4
        address[] losers;           // slot 5
        address[] whitelist;        // slot 6
        address[] forfeited;        // slot 7

        mapping(address => bool) isLoser;        // slot 8
        mapping(address => bool) isWhitelisted;  // slot 9
        mapping(address => bool) hasForfeit;     // slot 10
        mapping(address => bool) isPlayer;       // slot 11
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
    event PlayerForfeited(uint256 indexed gameId, address player);
    event GameReady(uint256 indexed gameId);
    event LoserAdded(uint256 indexed gameId, address loser);
    event GameResolved(
        uint256 indexed gameId,
        address[] winners,
        address[] losers
    );
    event GameEnded(uint256 indexed gameId);

    // --------------------------------------------------
    // Game lifecycle
    // --------------------------------------------------

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

        game.players.push(msg.sender);
        game.isPlayer[msg.sender] = true;
        game.activePlayers = 1;

        if (whitelist.length > 0) {
            for (uint256 i; i < whitelist.length; ) {
                game.whitelist.push(whitelist[i]);
                game.isWhitelisted[whitelist[i]] = true;
                unchecked { ++i; }
            }
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
        require(!game.isPlayer[msg.sender], "Already joined");
        require(msg.value == game.stakeAmount, "Incorrect stake");

        if (game.maxPlayers > 0) {
            require(game.players.length < game.maxPlayers, "Game full");
        }

        if (game.whitelist.length > 0) {
            require(game.isWhitelisted[msg.sender], "Not whitelisted");
        }

        game.players.push(msg.sender);
        game.isPlayer[msg.sender] = true;
        game.activePlayers += 1;

        emit PlayerJoined(gameId, msg.sender);
    }

    // --------------------------------------------------
    // Pre-start forfeit (immediate refund)
    // --------------------------------------------------

    function forfeitGame(uint256 gameId) external nonReentrant {
        Game storage game = games[gameId];

        require(!game.isReady, "Game already started");
        require(!game.isEnded, "Game ended");
        require(game.isPlayer[msg.sender], "Not a player");
        require(!game.hasForfeit[msg.sender], "Already forfeited");

        // effects
        game.hasForfeit[msg.sender] = true;
        game.forfeited.push(msg.sender);
        game.activePlayers -= 1;

        emit PlayerForfeited(gameId, msg.sender);

        // interaction
        (bool success, ) = msg.sender.call{value: game.stakeAmount}("");
        require(success, "Refund failed");

        // Auto-end if no active players remain
        if (game.activePlayers == 0) {
            game.isEnded = true;
            emit GameEnded(gameId);
        }
    }

    // --------------------------------------------------
    // Game resolution
    // --------------------------------------------------

    function setGameReady(uint256 gameId) external onlyGovernor(gameId) {
        Game storage game = games[gameId];

        require(!game.isEnded, "Game ended");
        require(!game.isReady, "Already ready");
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

    function endGame(uint256 gameId, uint256 governorFeePercentage)
        external
        nonReentrant
        onlyGovernor(gameId)
    {
        Game storage game = games[gameId];

        require(game.isReady, "Game not ready");
        require(!game.isEnded, "Game already ended");
        require(houseFeePercentage + governorFeePercentage <= 100, "Fee overflow");

        game.isEnded = true;

        // Invariant:
        // totalPrize == stakeAmount * activePlayers
        uint256 totalPrize = game.stakeAmount * game.activePlayers;

        uint256 houseFee = (totalPrize * houseFeePercentage) / 100;
        uint256 governorFee = (totalPrize * governorFeePercentage) / 100;
        uint256 remainingPrize = totalPrize - houseFee - governorFee;

        if (governorFee > 0) {
            (bool ok, ) = game.governor.call{value: governorFee}("");
            require(ok, "Governor transfer failed");
        }

        uint256 winnerCount;
        uint256 playersLength = game.players.length;

        for (uint256 i; i < playersLength; ) {
            address p = game.players[i];
            if (!game.isLoser[p] && !game.hasForfeit[p]) {
                unchecked { ++winnerCount; }
            }
            unchecked { ++i; }
        }

        if (winnerCount == 0) {
            if (remainingPrize > 0) {
                (bool ok, ) = game.governor.call{value: remainingPrize}("");
                require(ok, "Remainder transfer failed");
            }
        } else {
            uint256 prizePerWinner = remainingPrize / winnerCount;
            for (uint256 i; i < playersLength; ) {
                address p = game.players[i];
                if (!game.isLoser[p] && !game.hasForfeit[p]) {
                    (bool ok, ) = p.call{value: prizePerWinner}("");
                    require(ok, "Payout failed");
                }
                unchecked { ++i; }
            }
        }

        // Build winners and losers arrays for event emission
        address[] memory winners = new address[](winnerCount);
        address[] memory losers = new address[](game.losers.length);
        
        uint256 winnerIndex = 0;
        for (uint256 i; i < playersLength; ) {
            address p = game.players[i];
            if (!game.isLoser[p] && !game.hasForfeit[p]) {
                winners[winnerIndex] = p;
                unchecked { ++winnerIndex; }
            }
            unchecked { ++i; }
        }
        
        for (uint256 i; i < game.losers.length; ) {
            losers[i] = game.losers[i];
            unchecked { ++i; }
        }

        emit GameResolved(gameId, winners, losers);
        emit GameEnded(gameId);
    }

    // --------------------------------------------------
    // Views
    // --------------------------------------------------

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

    function getNotStartedGames(
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
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

    function getOngoingGames(
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
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
            if (games[i].governor != governor) continue;

            bool shouldInclude = false;

            if (games[i].isEnded && includeEnded) {
                shouldInclude = true;
            } else if (games[i].isReady && !games[i].isEnded && includeOngoing) {
                shouldInclude = true;
            } else if (!games[i].isReady && !games[i].isEnded && includeNotStarted) {
                shouldInclude = true;
            }

            if (shouldInclude) {
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

    // --------------------------------------------------
    // Admin
    // --------------------------------------------------

    function withdraw() external onlyOwner {
        uint256 amount = address(this).balance;
        require(amount > 0, "No funds");
        (bool success, ) = owner.call{value: amount}("");
        require(success, "Withdraw failed");
    }
}
