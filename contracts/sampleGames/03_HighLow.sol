// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../GameEscrowV2.sol";

/**
 * @title 03_HighLow
 * @notice Predict if sum of two random numbers is higher or lower than threshold
 * @dev Uses block hash for randomness (not production-grade, but simple)
 */
contract HighLow {
    GameEscrow public immutable escrow;
    
    struct Game {
        address predictor;
        address challenger;
        bool predictedHigh; // true = high, false = low
        uint256 threshold; // default 50 (0-100 range)
        uint256 matchId;
        uint256 revealBlock;
    }
    
    mapping(uint256 => Game) public games;
    uint256 public nextGameId;
    
    event GameCreated(uint256 indexed gameId, address predictor, bool predictedHigh, uint256 threshold);
    event GameResolved(uint256 indexed gameId, uint256 result, address winner);
    
    constructor(address _escrow) {
        escrow = GameEscrow(_escrow);
    }
    
    function createGame(bool predictHigh, uint256 threshold) external payable returns (uint256) {
        require(msg.value > 0, "Zero stake");
        require(threshold > 0 && threshold < 100, "Invalid threshold");
        
        address[] memory players = new address[](2);
        players[0] = msg.sender;
        players[1] = address(0); // challenger fills later
        
        uint256[] memory stakes = new uint256[](2);
        stakes[0] = msg.value;
        stakes[1] = msg.value;
        
        uint256 matchId = escrow.createMatch{value: msg.value}(address(this), players, stakes);
        
        uint256 gameId = nextGameId++;
        Game storage game = games[gameId];
        game.predictor = msg.sender;
        game.predictedHigh = predictHigh;
        game.threshold = threshold;
        game.matchId = matchId;
        
        emit GameCreated(gameId, msg.sender, predictHigh, threshold);
        return gameId;
    }
    
    function joinGame(uint256 gameId) external payable {
        Game storage game = games[gameId];
        require(game.challenger == address(0), "Already joined");
        require(msg.value == escrow.getPlayerStake(game.matchId, game.predictor), "Wrong stake");
        
        game.challenger = msg.sender;
        game.revealBlock = block.number + 1; // reveal next block
    }
    
    function resolve(uint256 gameId) external {
        Game storage game = games[gameId];
        require(game.challenger != address(0), "No challenger");
        require(block.number >= game.revealBlock, "Too early");
        
        // Use block hash as randomness source (simplified)
        uint256 randomValue = uint256(blockhash(game.revealBlock)) % 100;
        
        bool isHigh = randomValue > game.threshold;
        address winner = (isHigh == game.predictedHigh) ? game.predictor : game.challenger;
        
        uint256 totalStake = escrow.getPlayerStake(game.matchId, game.predictor) * 2;
        uint256 fee = (totalStake * escrow.houseFeePercentage()) / 10000;
        uint256 pot = totalStake - fee;
        
        address[] memory winners = new address[](1);
        uint256[] memory payouts = new uint256[](1);
        winners[0] = winner;
        payouts[0] = pot;
        
        escrow.resolveMatch(game.matchId, winners, payouts);
        emit GameResolved(gameId, randomValue, winner);
    }
}
