// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../GameEscrowV2.sol";

/**
 * @title 04_LastStanding
 * @notice N-player elimination game - losers marked progressively, last player wins
 * @dev Governor marks losers each round until one remains
 */
contract LastStanding {
    GameEscrow public immutable escrow;
    
    struct Game {
        address governor;
        address[] players;
        mapping(address => bool) eliminated;
        uint256 eliminatedCount;
        uint256 matchId;
        bool resolved;
    }
    
    mapping(uint256 => Game) public games;
    uint256 public nextGameId;
    
    event PlayerEliminated(uint256 indexed gameId, address player);
    event GameResolved(uint256 indexed gameId, address winner);
    
    constructor(address _escrow) {
        escrow = GameEscrow(_escrow);
    }
    
    function createGame(address[] calldata players, uint256 stakePerPlayer, address governor) external payable returns (uint256) {
        require(players.length >= 3, "Need 3+ players");
        require(msg.value == stakePerPlayer * players.length, "Wrong total stake");
        
        uint256[] memory stakes = new uint256[](players.length);
        for (uint256 i = 0; i < players.length; i++) {
            stakes[i] = stakePerPlayer;
        }
        
        uint256 matchId = escrow.createMatch{value: msg.value}(address(this), players, stakes);
        
        uint256 gameId = nextGameId++;
        Game storage game = games[gameId];
        game.governor = governor;
        game.players = players;
        game.matchId = matchId;
        
        return gameId;
    }
    
    function eliminatePlayer(uint256 gameId, address player) external {
        Game storage game = games[gameId];
        require(msg.sender == game.governor, "Not governor");
        require(!game.resolved, "Already resolved");
        require(!game.eliminated[player], "Already eliminated");
        
        // Verify player is in game
        bool found = false;
        for (uint256 i = 0; i < game.players.length; i++) {
            if (game.players[i] == player) {
                found = true;
                break;
            }
        }
        require(found, "Not a player");
        
        game.eliminated[player] = true;
        game.eliminatedCount++;
        
        emit PlayerEliminated(gameId, player);
        
        // If only one player left, resolve
        if (game.eliminatedCount == game.players.length - 1) {
            _resolveGame(gameId);
        }
    }
    
    function _resolveGame(uint256 gameId) internal {
        Game storage game = games[gameId];
        
        // Find last standing player
        address winner;
        for (uint256 i = 0; i < game.players.length; i++) {
            if (!game.eliminated[game.players[i]]) {
                winner = game.players[i];
                break;
            }
        }
        require(winner != address(0), "No winner found");
        
        uint256 totalStake = 0;
        for (uint256 i = 0; i < game.players.length; i++) {
            totalStake += escrow.getPlayerStake(game.matchId, game.players[i]);
        }
        
        uint256 fee = (totalStake * escrow.houseFeePercentage()) / 10000;
        uint256 pot = totalStake - fee;
        
        address[] memory winners = new address[](1);
        uint256[] memory payouts = new uint256[](1);
        winners[0] = winner;
        payouts[0] = pot;
        
        game.resolved = true;
        escrow.resolveMatch(game.matchId, winners, payouts);
        emit GameResolved(gameId, winner);
    }
}
