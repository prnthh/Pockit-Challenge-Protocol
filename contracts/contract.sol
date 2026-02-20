// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract GameEscrow is ReentrancyGuard {
    modifier onlyGovernor(uint256 gameId) {
        require(games[gameId].governor == msg.sender, "Not governor");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    enum State { Open, Started, Resolved }

    struct Game {
        address governor;           // slot 0
        State state;                // slot 0 (1 byte) — packs with governor

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
        State state;
        address[] players;
        address[] losers;
        address[] whitelist;
        address[] forfeited;
    }

    mapping(uint256 => Game) public games;
    uint256 public nextGameId;
    address public owner;
    uint256 public houseFeePercentage;
    uint256 public accumulatedHouseFees;

    constructor() {
        owner = msg.sender;
    }

    event GameCreated(uint256 indexed gameId, address creator, uint256 stakeAmount);
    event PlayerJoined(uint256 indexed gameId, address player);
    event PlayerForfeited(uint256 indexed gameId, address player);
    event GameStarted(uint256 indexed gameId);
    event GameResolved(
        uint256 indexed gameId,
        address[] winners,
        address[] losers
    );

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
        require(game.state == State.Open, "Game not open");
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

        require(game.state == State.Open, "Game not open");
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

        // Auto-resolve if no active players remain
        if (game.activePlayers == 0) {
            game.state = State.Resolved;
        }
    }

    // --------------------------------------------------
    // Step 1: Start game (lock lobby, no more joins)
    // --------------------------------------------------

    function startGame(uint256 gameId) external onlyGovernor(gameId) {
        Game storage game = games[gameId];

        require(game.state == State.Open, "Game not open");
        require(game.activePlayers > 0, "No players");

        game.state = State.Started;
        emit GameStarted(gameId);
    }

    // --------------------------------------------------
    // Step 2: Resolve game (atomic loser marking + auto-payout)
    // --------------------------------------------------

    function resolveGame(
        uint256 gameId,
        address[] calldata losers,
        uint256 governorFeePercentage
    ) external nonReentrant onlyGovernor(gameId) {
        Game storage game = games[gameId];

        require(game.state == State.Started, "Game not started");
        require(houseFeePercentage + governorFeePercentage <= 100, "Fee overflow");

        // Mark all losers atomically
        for (uint256 i; i < losers.length; ) {
            address loser = losers[i];
            require(game.isPlayer[loser], "Not a player");
            require(!game.hasForfeit[loser], "Player forfeited");
            require(!game.isLoser[loser], "Duplicate loser");

            game.losers.push(loser);
            game.isLoser[loser] = true;
            unchecked { ++i; }
        }

        // Count winners
        uint256 winnerCount;
        uint256 playersLength = game.players.length;

        for (uint256 i; i < playersLength; ) {
            address p = game.players[i];
            if (!game.isLoser[p] && !game.hasForfeit[p]) {
                unchecked { ++winnerCount; }
            }
            unchecked { ++i; }
        }

        // Compute prize pool
        uint256 totalPrize = game.stakeAmount * game.activePlayers;
        uint256 houseFee = (totalPrize * houseFeePercentage) / 100;
        uint256 governorFee = (totalPrize * governorFeePercentage) / 100;
        uint256 remainingPrize = totalPrize - houseFee - governorFee;

        // Record house fee (owner withdraws separately)
        accumulatedHouseFees += houseFee;

        game.state = State.Resolved;

        // Pay governor fee
        if (governorFee > 0) {
            (bool ok, ) = game.governor.call{value: governorFee}("");
            require(ok, "Governor transfer failed");
        }

        // Build winners array + pay out in one pass
        address[] memory winners = new address[](winnerCount);
        uint256 wi;

        if (winnerCount > 0) {
            uint256 prizePerWinner = remainingPrize / winnerCount;
            uint256 dust = remainingPrize - (prizePerWinner * winnerCount);

            for (uint256 i; i < playersLength; ) {
                address p = game.players[i];
                if (!game.isLoser[p] && !game.hasForfeit[p]) {
                    winners[wi] = p;
                    uint256 payout = prizePerWinner;
                    if (wi == 0) payout += dust; // first winner gets dust
                    (bool ok, ) = p.call{value: payout}("");
                    require(ok, "Payout failed");
                    unchecked { ++wi; }
                }
                unchecked { ++i; }
            }
        } else {
            // No winners: governor gets remainder
            if (remainingPrize > 0) {
                (bool ok, ) = game.governor.call{value: remainingPrize}("");
                require(ok, "Remainder transfer failed");
            }
        }

        emit GameResolved(gameId, winners, game.losers);
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
            state: game.state,
            players: game.players,
            losers: game.losers,
            whitelist: game.whitelist,
            forfeited: game.forfeited
        });
    }

    function getGames(
        address governor,
        bool includeResolved,
        bool includeOngoing,
        bool includeNotStarted,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        uint256[] memory temp = new uint256[](limit);
        uint256 count = 0;
        bool filterByGovernor = governor != address(0);

        for (uint256 i = offset; i < nextGameId && count < limit; i++) {
            if (filterByGovernor && games[i].governor != governor) continue;

            State s = games[i].state;
            bool shouldInclude =
                (s == State.Open && includeNotStarted) ||
                (s == State.Started && includeOngoing) ||
                (s == State.Resolved && includeResolved);

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
        uint256 amount = accumulatedHouseFees;
        require(amount > 0, "No fees to withdraw");
        accumulatedHouseFees = 0;
        (bool success, ) = owner.call{value: amount}("");
        require(success, "Withdraw failed");
    }

    function setHouseFee(uint256 _houseFeePercentage) external onlyOwner {
        require(_houseFeePercentage <= 100, "Fee too high");
        houseFeePercentage = _houseFeePercentage;
    }
}