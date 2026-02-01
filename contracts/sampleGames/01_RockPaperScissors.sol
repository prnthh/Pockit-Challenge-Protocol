// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../GameEscrowV2.sol";

/**
 * @title 01_RockPaperScissors
 * @notice Classic RPS with commit-reveal pattern
 * @dev Players commit hashed moves, then reveal. Winner takes pot minus house fee.
 */
contract RockPaperScissors {
    GameEscrow public immutable escrow;
    
    enum Move { None, Rock, Paper, Scissors }
    
    struct Game {
        address player1;
        address player2;
        bytes32 commitment1;
        bytes32 commitment2;
        Move move1;
        Move move2;
        bool revealed1;
        bool revealed2;
        uint256 matchId;
    }
    
    mapping(uint256 => Game) public games;
    uint256 public nextGameId;
    
    event MoveCommitted(uint256 indexed gameId, address indexed player, bytes32 commitment);
    event MoveRevealed(uint256 indexed gameId, address indexed player, Move move);
    event GameResolved(uint256 indexed gameId, address winner);
    
    constructor(address _escrow) {
        escrow = GameEscrow(_escrow);
    }
    
    /**
     * @notice Create new RPS game and escrow match
     * @param opponent Address of player 2
     * @param commitment1 Player 1's hashed move (keccak256(abi.encodePacked(move, salt)))
     */
    function createGame(address opponent, bytes32 commitment1) external payable returns (uint256) {
        require(msg.value > 0, "Zero stake");
        require(opponent != msg.sender, "Can't play self");
        
        // Create escrow match
        address[] memory players = new address[](2);
        players[0] = msg.sender;
        players[1] = opponent;
        
        uint256[] memory stakes = new uint256[](2);
        stakes[0] = msg.value;
        stakes[1] = msg.value;
        
        uint256 matchId = escrow.createMatch{value: msg.value}(address(this), players, stakes);
        
        // Create game
        uint256 gameId = nextGameId++;
        Game storage game = games[gameId];
        game.player1 = msg.sender;
        game.player2 = opponent;
        game.commitment1 = commitment1;
        game.matchId = matchId;
        
        emit MoveCommitted(gameId, msg.sender, commitment1);
        return gameId;
    }
    
    /**
     * @notice Player 2 joins and commits move
     */
    function joinGame(uint256 gameId, bytes32 commitment2) external payable {
        Game storage game = games[gameId];
        require(msg.sender == game.player2, "Not player 2");
        require(game.commitment2 == bytes32(0), "Already joined");
        require(msg.value == escrow.getPlayerStake(game.matchId, game.player1), "Wrong stake");
        
        game.commitment2 = commitment2;
        
        emit MoveCommitted(gameId, msg.sender, commitment2);
    }
    
    /**
     * @notice Reveal move
     * @param move Move (1=Rock, 2=Paper, 3=Scissors)
     * @param salt Random salt used in commitment
     */
    function revealMove(uint256 gameId, Move move, bytes32 salt) external {
        Game storage game = games[gameId];
        require(move != Move.None, "Invalid move");
        
        bytes32 commitment = keccak256(abi.encodePacked(move, salt));
        
        if (msg.sender == game.player1) {
            require(commitment == game.commitment1, "Invalid reveal");
            require(!game.revealed1, "Already revealed");
            game.move1 = move;
            game.revealed1 = true;
            emit MoveRevealed(gameId, msg.sender, move);
        } else if (msg.sender == game.player2) {
            require(commitment == game.commitment2, "Invalid reveal");
            require(!game.revealed2, "Already revealed");
            game.move2 = move;
            game.revealed2 = true;
            emit MoveRevealed(gameId, msg.sender, move);
        } else {
            revert("Not player");
        }
        
        // Resolve if both revealed
        if (game.revealed1 && game.revealed2) {
            _resolveGame(gameId);
        }
    }
    
    function _resolveGame(uint256 gameId) internal {
        Game storage game = games[gameId];
        
        address winner;
        if (game.move1 == game.move2) {
            // Draw - split pot
            winner = address(0);
        } else if (
            (game.move1 == Move.Rock && game.move2 == Move.Scissors) ||
            (game.move1 == Move.Paper && game.move2 == Move.Rock) ||
            (game.move1 == Move.Scissors && game.move2 == Move.Paper)
        ) {
            winner = game.player1;
        } else {
            winner = game.player2;
        }
        
        // Calculate payouts
        uint256 totalStake = escrow.getPlayerStake(game.matchId, game.player1) * 2;
        uint256 fee = (totalStake * escrow.houseFeePercentage()) / 10000;
        uint256 pot = totalStake - fee;
        
        address[] memory winners;
        uint256[] memory payouts;
        
        if (winner == address(0)) {
            // Draw - return stakes
            winners = new address[](2);
            payouts = new uint256[](2);
            winners[0] = game.player1;
            winners[1] = game.player2;
            payouts[0] = pot / 2;
            payouts[1] = pot / 2;
        } else {
            // Winner takes all
            winners = new address[](1);
            payouts = new uint256[](1);
            winners[0] = winner;
            payouts[0] = pot;
        }
        
        escrow.resolveMatch(game.matchId, winners, payouts);
        emit GameResolved(gameId, winner);
    }
}
