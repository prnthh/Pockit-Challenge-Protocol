// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract GameEscrow {
    modifier nonReentrant() {
        require(_notEntered, "Reentrant call");
        _notEntered = false;
        _;
        _notEntered = true;
    }

    modifier onlyGovernor(uint256 gameId) {
        require(games[gameId].governor == msg.sender, "Not governor");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    struct Game {
        address governor;
        uint256 stakeAmount;
        bool isReady;
        bool isEnded;
        address[] players;
        address[] losers;
        mapping(address => bool) isLoser;
    }

    struct GameInfo {
        address governor;
        uint256 stakeAmount;
        bool isReady;
        bool isEnded;
        address[] players;
        address[] losers;
    }

    bool private _notEntered = true;
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
    event GameEnded(uint256 indexed gameId);

    function createGame(address governor, uint256 stakeAmount) external payable returns (uint256) {
        require(stakeAmount > 0, "Stake must be positive");
        require(msg.value == stakeAmount, "Incorrect stake amount");
        require(governor != address(0), "Invalid governor");

        uint256 gameId = nextGameId++;
        Game storage game = games[gameId];
        
        game.governor = governor;
        game.stakeAmount = stakeAmount;
        game.players.push(msg.sender);

        emit GameCreated(gameId, msg.sender, stakeAmount);
        return gameId;
    }

    function joinGame(uint256 gameId) external payable nonReentrant {
        Game storage game = games[gameId];
        require(!game.isEnded, "Game ended");
        require(msg.value == game.stakeAmount, "Incorrect stake amount");

        for (uint256 i = 0; i < game.players.length; i++) {
            require(game.players[i] != msg.sender, "Already joined");
        }

        game.players.push(msg.sender);
        emit PlayerJoined(gameId, msg.sender);
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

        bool playerFound = false;
        for (uint256 i = 0; i < game.players.length; i++) {
            if (game.players[i] == loser) {
                playerFound = true;
                break;
            }
        }
        require(playerFound, "Player not in game");

        game.losers.push(loser);
        game.isLoser[loser] = true;

        emit LoserAdded(gameId, loser);
    }

    function endGame(uint256 gameId, uint256 governorFeePercentage) external nonReentrant onlyGovernor(gameId) {
        Game storage game = games[gameId];
        require(game.isReady, "Game not ready");
        require(!game.isEnded, "Game already ended");
        require(houseFeePercentage + governorFeePercentage <= 100, "Total fee exceeds 100%");
        require(governorFeePercentage <= 100, "Governor fee exceeds 100%");

        game.isEnded = true;

        uint256 totalPrize = game.stakeAmount * game.players.length;
        uint256 houseFee = (totalPrize * houseFeePercentage) / 100;
        uint256 governorFee = (totalPrize * governorFeePercentage) / 100;
        uint256 remainingPrize = totalPrize - houseFee - governorFee;

        // Transfer governor fee to governor
        if (governorFee > 0) {
            (bool successGov, ) = game.governor.call{value: governorFee}("");
            require(successGov, "Governor transfer failed");
        }

        uint256 winnerCount = 0;
        for (uint256 i = 0; i < game.players.length; i++) {
            if (!game.isLoser[game.players[i]]) {
                winnerCount++;
            }
        }

        if (winnerCount == 0) {
            // Send remaining prize to governor if no winners
            if (remainingPrize > 0) {
                (bool successRemaining, ) = game.governor.call{value: remainingPrize}("");
                require(successRemaining, "Governor remaining transfer failed");
            }
        } else {
            uint256 prizePerWinner = remainingPrize / winnerCount;
            for (uint256 i = 0; i < game.players.length; i++) {
                address player = game.players[i];
                if (!game.isLoser[player]) {
                    (bool success, ) = player.call{value: prizePerWinner}("");
                    require(success, "Transfer failed");
                }
            }
        }

        emit GameEnded(gameId);
    }

    function getGame(uint256 gameId) external view returns (GameInfo memory) {
        Game storage game = games[gameId];
        return GameInfo({
            governor: game.governor,
            stakeAmount: game.stakeAmount,
            isReady: game.isReady,
            isEnded: game.isEnded,
            players: game.players,
            losers: game.losers
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

    function withdraw() external onlyOwner {
        uint256 amount = address(this).balance;
        require(amount > 0, "No funds to withdraw");
        (bool success, ) = owner.call{value: amount}("");
        require(success, "Withdrawal failed");
    }
}