// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/**
 * @title GameEscrow
 * @notice Upgradeable escrow contract for N-player competitive games
 * @dev External game contracts call this for match lifecycle management
 */
contract GameEscrow is UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    
    // ============ State ============
    
    struct Match {
        address creator;
        address[] players;
        mapping(address => uint256) stakes;
        mapping(address => uint256) payouts;
        mapping(address => bool) hasWithdrawn;
        uint256 totalStake;
        bool resolved;
        address gameContract; // which game contract manages this match
    }
    
    mapping(uint256 => Match) public matches;
    mapping(address => bool) public approvedGames; // whitelist of game contracts
    uint256 public nextMatchId;
    uint256 public houseFeePercentage; // basis points (e.g., 250 = 2.5%)
    
    // ============ Events ============
    
    event MatchCreated(
        uint256 indexed matchId,
        address indexed creator,
        address gameContract,
        address[] players,
        uint256[] stakes
    );
    
    event MatchResolved(
        uint256 indexed matchId,
        address[] winners,
        uint256[] payouts
    );
    
    event PayoutWithdrawn(
        uint256 indexed matchId,
        address indexed player,
        uint256 amount
    );
    
    event GameApproved(address indexed gameContract, bool approved);
    
    // ============ Initialization ============
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(uint256 _houseFeePercentage) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        require(_houseFeePercentage <= 1000, "Fee too high"); // max 10%
        houseFeePercentage = _houseFeePercentage;
    }
    
    // ============ Match Lifecycle ============
    
    /**
     * @notice Create a new match with variable stakes per player
     * @param gameContract Address of game contract managing this match
     * @param players Array of player addresses
     * @param stakes Array of stake amounts (must match msg.value total)
     */
    function createMatch(
        address gameContract,
        address[] calldata players,
        uint256[] calldata stakes
    ) external payable nonReentrant returns (uint256) {
        require(approvedGames[gameContract], "Game not approved");
        require(players.length > 0, "No players");
        require(players.length == stakes.length, "Length mismatch");
        
        uint256 totalStake = 0;
        for (uint256 i = 0; i < stakes.length; i++) {
            require(stakes[i] > 0, "Zero stake");
            totalStake += stakes[i];
        }
        require(msg.value == totalStake, "Incorrect payment");
        
        uint256 matchId = nextMatchId++;
        Match storage m = matches[matchId];
        
        m.creator = msg.sender;
        m.gameContract = gameContract;
        m.totalStake = totalStake;
        m.players = players;
        
        for (uint256 i = 0; i < players.length; i++) {
            m.stakes[players[i]] = stakes[i];
        }
        
        emit MatchCreated(matchId, msg.sender, gameContract, players, stakes);
        return matchId;
    }
    
    /**
     * @notice Resolve match and set payouts (only callable by game contract)
     * @param matchId Match to resolve
     * @param winners Array of winner addresses
     * @param payouts Array of payout amounts (must sum to totalStake minus fee)
     */
    function resolveMatch(
        uint256 matchId,
        address[] calldata winners,
        uint256[] calldata payouts
    ) external nonReentrant {
        Match storage m = matches[matchId];
        require(msg.sender == m.gameContract, "Not game contract");
        require(!m.resolved, "Already resolved");
        require(winners.length == payouts.length, "Length mismatch");
        
        // Calculate house fee
        uint256 fee = (m.totalStake * houseFeePercentage) / 10000;
        uint256 payoutPool = m.totalStake - fee;
        
        // Verify payouts sum correctly
        uint256 totalPayout = 0;
        for (uint256 i = 0; i < payouts.length; i++) {
            totalPayout += payouts[i];
            m.payouts[winners[i]] = payouts[i];
        }
        require(totalPayout == payoutPool, "Payout mismatch");
        
        m.resolved = true;
        
        // Send house fee to owner
        if (fee > 0) {
            (bool success, ) = owner().call{value: fee}("");
            require(success, "Fee transfer failed");
        }
        
        emit MatchResolved(matchId, winners, payouts);
    }
    
    /**
     * @notice Withdraw payout from resolved match (pull pattern)
     * @param matchId Match to withdraw from
     */
    function withdraw(uint256 matchId) external nonReentrant {
        Match storage m = matches[matchId];
        require(m.resolved, "Not resolved");
        require(!m.hasWithdrawn[msg.sender], "Already withdrawn");
        
        uint256 payout = m.payouts[msg.sender];
        require(payout > 0, "No payout");
        
        m.hasWithdrawn[msg.sender] = true;
        
        (bool success, ) = msg.sender.call{value: payout}("");
        require(success, "Transfer failed");
        
        emit PayoutWithdrawn(matchId, msg.sender, payout);
    }
    
    // ============ Admin ============
    
    function approveGame(address gameContract, bool approved) external onlyOwner {
        approvedGames[gameContract] = approved;
        emit GameApproved(gameContract, approved);
    }
    
    function setHouseFee(uint256 _houseFeePercentage) external onlyOwner {
        require(_houseFeePercentage <= 1000, "Fee too high"); // max 10%
        houseFeePercentage = _houseFeePercentage;
    }
    
    // ============ Views ============
    
    function getMatch(uint256 matchId) external view returns (
        address creator,
        address[] memory players,
        uint256 totalStake,
        bool resolved,
        address gameContract
    ) {
        Match storage m = matches[matchId];
        return (m.creator, m.players, m.totalStake, m.resolved, m.gameContract);
    }
    
    function getPlayerStake(uint256 matchId, address player) external view returns (uint256) {
        return matches[matchId].stakes[player];
    }
    
    function getPlayerPayout(uint256 matchId, address player) external view returns (uint256) {
        return matches[matchId].payouts[player];
    }
    
    // ============ Upgrade ============
    
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
