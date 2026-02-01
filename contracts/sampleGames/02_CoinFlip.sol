// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../GameEscrowV2.sol";

/**
 * @title 02_CoinFlip
 * @notice 50/50 coin flip game with commit-reveal
 * @dev Players commit heads/tails, XOR of reveals determines outcome
 */
contract CoinFlip {
    GameEscrow public immutable escrow;
    
    struct Game {
        address player1;
        address player2;
        bytes32 commitment1;
        bytes32 commitment2;
        bool choice1; // true = heads, false = tails
        bool choice2;
        bool revealed1;
        bool revealed2;
        uint256 matchId;
    }
    
    mapping(uint256 => Game) public games;
    uint256 public nextGameId;
    
    event Committed(uint256 indexed gameId, address indexed player);
    event Revealed(uint256 indexed gameId, address indexed player, bool choice);
    event FlipResult(uint256 indexed gameId, bool result, address winner);
    
    constructor(address _escrow) {
        escrow = GameEscrow(_escrow);
    }
    
    function createGame(address opponent, bytes32 commitment) external payable returns (uint256) {
        require(msg.value > 0, "Zero stake");
        
        address[] memory players = new address[](2);
        players[0] = msg.sender;
        players[1] = opponent;
        
        uint256[] memory stakes = new uint256[](2);
        stakes[0] = msg.value;
        stakes[1] = msg.value;
        
        uint256 matchId = escrow.createMatch{value: msg.value}(address(this), players, stakes);
        
        uint256 gameId = nextGameId++;
        Game storage game = games[gameId];
        game.player1 = msg.sender;
        game.player2 = opponent;
        game.commitment1 = commitment;
        game.matchId = matchId;
        
        emit Committed(gameId, msg.sender);
        return gameId;
    }
    
    function joinGame(uint256 gameId, bytes32 commitment) external payable {
        Game storage game = games[gameId];
        require(msg.sender == game.player2, "Not player 2");
        require(game.commitment2 == bytes32(0), "Already joined");
        
        game.commitment2 = commitment;
        emit Committed(gameId, msg.sender);
    }
    
    function reveal(uint256 gameId, bool choice, bytes32 salt) external {
        Game storage game = games[gameId];
        bytes32 commitment = keccak256(abi.encodePacked(choice, salt));
        
        if (msg.sender == game.player1) {
            require(commitment == game.commitment1, "Invalid reveal");
            require(!game.revealed1, "Already revealed");
            game.choice1 = choice;
            game.revealed1 = true;
            emit Revealed(gameId, msg.sender, choice);
        } else if (msg.sender == game.player2) {
            require(commitment == game.commitment2, "Invalid reveal");
            require(!game.revealed2, "Already revealed");
            game.choice2 = choice;
            game.revealed2 = true;
            emit Revealed(gameId, msg.sender, choice);
        } else {
            revert("Not player");
        }
        
        if (game.revealed1 && game.revealed2) {
            _resolveFlip(gameId);
        }
    }
    
    function _resolveFlip(uint256 gameId) internal {
        Game storage game = games[gameId];
        
        // XOR of choices determines result
        bool result = game.choice1 != game.choice2; // true = heads, false = tails
        
        // If both picked same, house wins (incentivizes strategic play)
        address winner = game.choice1 == game.choice2 ? address(0) : 
                        (result ? game.player1 : game.player2);
        
        uint256 totalStake = escrow.getPlayerStake(game.matchId, game.player1) * 2;
        uint256 fee = (totalStake * escrow.houseFeePercentage()) / 10000;
        uint256 pot = totalStake - fee;
        
        address[] memory winners;
        uint256[] memory payouts;
        
        if (winner == address(0)) {
            // Both picked same - house takes all (or split as penalty)
            winners = new address[](2);
            payouts = new uint256[](2);
            winners[0] = game.player1;
            winners[1] = game.player2;
            payouts[0] = pot / 2;
            payouts[1] = pot / 2;
        } else {
            winners = new address[](1);
            payouts = new uint256[](1);
            winners[0] = winner;
            payouts[0] = pot;
        }
        
        escrow.resolveMatch(game.matchId, winners, payouts);
        emit FlipResult(gameId, result, winner);
    }
}
