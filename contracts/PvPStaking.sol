// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/******************************************************************************
 * LibPvPStaking - Full-featured PvP staking with N-player support
 ******************************************************************************/

library LibPvPStaking {
    bytes32 constant STORAGE_POSITION = keccak256("pvp.staking.storage");

    struct Match {
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

    struct MatchInfo {
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

    struct StorageData {
        mapping(uint256 => Match) matches;
        uint256 nextMatchId;
        address owner;
        uint256 houseFeePercentage;
    }

    function getStorage() internal pure returns (StorageData storage s) {
        bytes32 position = STORAGE_POSITION;
        assembly {
            s.slot := position
        }
    }

    event MatchCreated(uint256 indexed matchId, address creator, uint256 stakeAmount);
    event MatchJoined(uint256 indexed matchId, address player);
    event MatchForfeited(uint256 indexed matchId, address player);
    event MatchReady(uint256 indexed matchId);
    event LoserAdded(uint256 indexed matchId, address loser);
    event MatchEnded(uint256 indexed matchId);
}

/******************************************************************************
 * PvPStakingFacet - Full escrow logic
 ******************************************************************************/

contract PvPStakingFacet {
    using LibPvPStaking for LibPvPStaking.StorageData;

    modifier onlyGovernor(uint256 matchId) {
        require(msg.sender == LibPvPStaking.getStorage().matches[matchId].governor, "Not governor");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == LibPvPStaking.getStorage().owner, "Not owner");
        _;
    }

    /// @notice Create a new match (player1 posts stake)
    function createMatch(
        address governor,
        uint256 stakeAmount,
        uint256 maxPlayers,
        address[] calldata whitelist
    ) external payable returns (uint256) {
        require(stakeAmount > 0, "Stake must be positive");
        require(msg.value == stakeAmount, "Incorrect stake");
        require(governor != address(0), "Invalid governor");

        LibPvPStaking.StorageData storage s = LibPvPStaking.getStorage();
        uint256 matchId = s.nextMatchId++;

        LibPvPStaking.Match storage m = s.matches[matchId];
        m.governor = governor;
        m.stakeAmount = stakeAmount;
        m.maxPlayers = maxPlayers;
        m.activePlayers = 1;

        m.players.push(msg.sender);
        m.isPlayer[msg.sender] = true;

        if (whitelist.length > 0) {
            for (uint256 i = 0; i < whitelist.length; i++) {
                m.whitelist.push(whitelist[i]);
                m.isWhitelisted[whitelist[i]] = true;
            }
        }
        m.whitelist.push(msg.sender);
        m.isWhitelisted[msg.sender] = true;

        emit LibPvPStaking.MatchCreated(matchId, msg.sender, stakeAmount);
        return matchId;
    }

    /// @notice Join an existing match
    function joinMatch(uint256 matchId) external payable {
        LibPvPStaking.StorageData storage s = LibPvPStaking.getStorage();
        LibPvPStaking.Match storage m = s.matches[matchId];

        require(msg.value == m.stakeAmount, "Incorrect stake");
        require(!m.isReady, "Match already started");
        require(!m.isEnded, "Match ended");
        require(!m.isPlayer[msg.sender], "Already joined");

        if (m.whitelist.length > 0) {
            require(m.isWhitelisted[msg.sender], "Not whitelisted");
        }

        if (m.maxPlayers > 0) {
            require(m.activePlayers < m.maxPlayers, "Match full");
        }

        m.players.push(msg.sender);
        m.isPlayer[msg.sender] = true;
        m.activePlayers++;

        emit LibPvPStaking.MatchJoined(matchId, msg.sender);
    }

    /// @notice Governor starts the match
    function setMatchReady(uint256 matchId) external onlyGovernor(matchId) {
        LibPvPStaking.StorageData storage s = LibPvPStaking.getStorage();
        LibPvPStaking.Match storage m = s.matches[matchId];

        require(!m.isReady, "Match not ready");
        require(m.activePlayers > 0, "No players");

        m.isReady = true;
        emit LibPvPStaking.MatchReady(matchId);
    }

    /// @notice Governor marks a player as loser
    function addLoser(uint256 matchId, address loser) external onlyGovernor(matchId) {
        LibPvPStaking.StorageData storage s = LibPvPStaking.getStorage();
        LibPvPStaking.Match storage m = s.matches[matchId];

        require(m.isReady, "Match not ready");
        require(!m.isEnded, "Match ended");
        require(m.isPlayer[loser], "Not a player");
        require(!m.isLoser[loser], "Already loser");
        require(!m.hasForfeit[loser], "Player forfeited");

        m.losers.push(loser);
        m.isLoser[loser] = true;

        emit LibPvPStaking.LoserAdded(matchId, loser);
    }

    /// @notice Player forfeits before match starts
    function forfeitMatch(uint256 matchId) external {
        LibPvPStaking.StorageData storage s = LibPvPStaking.getStorage();
        LibPvPStaking.Match storage m = s.matches[matchId];

        require(!m.isReady, "Match already started");
        require(!m.isEnded, "Match ended");
        require(m.isPlayer[msg.sender], "Not a player");
        require(!m.hasForfeit[msg.sender], "Already forfeited");

        m.forfeited.push(msg.sender);
        m.hasForfeit[msg.sender] = true;
        m.activePlayers--;

        (bool success, ) = msg.sender.call{value: m.stakeAmount}("");
        require(success, "Refund failed");

        emit LibPvPStaking.MatchForfeited(matchId, msg.sender);

        if (m.activePlayers == 0) {
            m.isEnded = true;
        }
    }

    /// @notice Resolve match and distribute prizes
    function endMatch(uint256 matchId, uint256 governorFeePercentage) 
        external 
        onlyGovernor(matchId) 
    {
        LibPvPStaking.StorageData storage s = LibPvPStaking.getStorage();
        LibPvPStaking.Match storage m = s.matches[matchId];

        require(m.isReady, "Match not ready");
        require(!m.isEnded, "Match already ended");
        require(governorFeePercentage <= 100, "Fee overflow");

        m.isEnded = true;

        uint256 totalStake = m.stakeAmount * m.activePlayers;
        uint256 governorFee = (totalStake * governorFeePercentage) / 100;
        uint256 prizePool = totalStake - governorFee;

        // Send governor fee
        if (governorFee > 0) {
            (bool success, ) = m.governor.call{value: governorFee}("");
            require(success, "Governor transfer failed");
        }

        // Determine winners (non-losers and non-forfeited)
        uint256 winnerCount = 0;
        for (uint256 i = 0; i < m.players.length; i++) {
            if (!m.isLoser[m.players[i]] && !m.hasForfeit[m.players[i]]) {
                winnerCount++;
            }
        }

        if (winnerCount == 0) {
            // If all lost, distribute equally to non-forfeited
            uint256 remainder = prizePool;
            uint256 nonForfeitCount = m.activePlayers;
            for (uint256 i = 0; i < m.players.length; i++) {
                if (!m.hasForfeit[m.players[i]]) {
                    uint256 share = remainder / nonForfeitCount;
                    (bool success, ) = m.players[i].call{value: share}("");
                    require(success, "Payout failed");
                    remainder -= share;
                    nonForfeitCount--;
                }
            }
        } else {
            // Distribute equally among winners
            uint256 prizePerWinner = prizePool / winnerCount;
            uint256 remainder = prizePool % winnerCount;

            for (uint256 i = 0; i < m.players.length; i++) {
                if (!m.isLoser[m.players[i]] && !m.hasForfeit[m.players[i]]) {
                    uint256 prize = prizePerWinner;
                    if (remainder > 0) {
                        prize += 1;
                        remainder--;
                    }
                    (bool success, ) = m.players[i].call{value: prize}("");
                    require(success, "Payout failed");
                }
            }
        }

        emit LibPvPStaking.MatchEnded(matchId);
    }

    /// @notice Get match info
    function getMatch(uint256 matchId) 
        external 
        view 
        returns (LibPvPStaking.MatchInfo memory)
    {
        LibPvPStaking.Match storage m = LibPvPStaking.getStorage().matches[matchId];
        return LibPvPStaking.MatchInfo({
            governor: m.governor,
            stakeAmount: m.stakeAmount,
            maxPlayers: m.maxPlayers,
            activePlayers: m.activePlayers,
            isReady: m.isReady,
            isEnded: m.isEnded,
            players: m.players,
            losers: m.losers,
            whitelist: m.whitelist,
            forfeited: m.forfeited
        });
    }

    /// @notice Query not-started matches
    function getNotStartedMatches(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory)
    {
        LibPvPStaking.StorageData storage s = LibPvPStaking.getStorage();
        uint256[] memory temp = new uint256[](limit);
        uint256 count = 0;

        for (uint256 i = offset; i < s.nextMatchId && count < limit; i++) {
            if (!s.matches[i].isReady && !s.matches[i].isEnded) {
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

    /// @notice Query ongoing matches
    function getOngoingMatches(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory)
    {
        LibPvPStaking.StorageData storage s = LibPvPStaking.getStorage();
        uint256[] memory temp = new uint256[](limit);
        uint256 count = 0;

        for (uint256 i = offset; i < s.nextMatchId && count < limit; i++) {
            if (s.matches[i].isReady && !s.matches[i].isEnded) {
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

    /// @notice Query governor's matches
    function getGovernorMatches(
        address governor,
        bool includeEnded,
        bool includeOngoing,
        bool includeNotStarted,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        LibPvPStaking.StorageData storage s = LibPvPStaking.getStorage();
        uint256[] memory temp = new uint256[](limit);
        uint256 count = 0;

        for (uint256 i = offset; i < s.nextMatchId && count < limit; i++) {
            if (s.matches[i].governor == governor) {
                bool matches = false;
                if (includeEnded && s.matches[i].isEnded) matches = true;
                if (includeOngoing && s.matches[i].isReady && !s.matches[i].isEnded) matches = true;
                if (includeNotStarted && !s.matches[i].isReady && !s.matches[i].isEnded) matches = true;

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

    /// @notice Get house fee percentage
    function getHouseFeePercentage() external view returns (uint256) {
        return LibPvPStaking.getStorage().houseFeePercentage;
    }

    /// @notice Get next match ID
    function getNextMatchId() external view returns (uint256) {
        return LibPvPStaking.getStorage().nextMatchId;
    }

    /// @notice Owner withdraw unclaimed funds
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds");
        (bool success, ) = msg.sender.call{value: balance}("");
        require(success, "Withdraw failed");
    }
}

/******************************************************************************
 * LibDiamond - Minimal EIP-2535 proxy storage
 ******************************************************************************/

library LibDiamond {
    bytes32 constant DIAMOND_STORAGE_POSITION = keccak256("diamond.standard.storage");

    struct FacetInfo {
        address facetAddress;
        uint96 selectorPosition;
    }

    struct DiamondStorageData {
        mapping(bytes4 => FacetInfo) facets;
        bytes4[] selectors;
        address owner;
    }

    function getStorage() internal pure returns (DiamondStorageData storage s) {
        bytes32 position = DIAMOND_STORAGE_POSITION;
        assembly {
            s.slot := position
        }
    }

    event DiamondCut(address indexed facetAddress, uint8 action, bytes4[] selectors);

    function addFacet(address facetAddress, bytes4[] memory selectors) internal {
        DiamondStorageData storage s = LibDiamond.getStorage();
        require(facetAddress != address(0), "Zero address");
        require(selectors.length > 0, "No selectors");

        uint96 position = uint96(s.selectors.length);
        for (uint256 i = 0; i < selectors.length; i++) {
            require(s.facets[selectors[i]].facetAddress == address(0), "Selector exists");
            s.facets[selectors[i]] = FacetInfo(facetAddress, position);
            s.selectors.push(selectors[i]);
            position++;
        }

        emit DiamondCut(facetAddress, 0, selectors);
    }

    function removeFacet(bytes4[] memory selectors) internal {
        DiamondStorageData storage s = LibDiamond.getStorage();
        uint256 selectorCount = s.selectors.length;

        for (uint256 i = 0; i < selectors.length; i++) {
            bytes4 selector = selectors[i];
            require(s.facets[selector].facetAddress != address(0), "Selector not found");

            uint96 position = s.facets[selector].selectorPosition;
            if (position != selectorCount - 1) {
                bytes4 lastSelector = s.selectors[selectorCount - 1];
                s.selectors[position] = lastSelector;
                s.facets[lastSelector].selectorPosition = position;
            }
            s.selectors.pop();
            delete s.facets[selector];
            selectorCount--;
        }

        emit DiamondCut(address(0), 2, selectors);
    }
}

/******************************************************************************
 * Diamond - Minimal EIP-2535 proxy
 ******************************************************************************/

contract Diamond {
    using LibDiamond for LibDiamond.DiamondStorageData;

    constructor(address facetAddress, bytes4[] memory selectors) {
        LibDiamond.DiamondStorageData storage s = LibDiamond.getStorage();
        s.owner = msg.sender;
        LibDiamond.addFacet(facetAddress, selectors);
    }

    fallback() external payable {
        LibDiamond.DiamondStorageData storage s = LibDiamond.getStorage();
        address facet = s.facets[msg.sig].facetAddress;
        require(facet != address(0), "Function not found");

        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    receive() external payable {}
}

/******************************************************************************
 * DiamondManagerFacet - Manage facets
 ******************************************************************************/

contract DiamondManagerFacet {
    using LibDiamond for LibDiamond.DiamondStorageData;

    modifier onlyOwner() {
        require(msg.sender == LibDiamond.getStorage().owner, "Not owner");
        _;
    }

    function addFacet(address facetAddress, bytes4[] calldata selectors) external onlyOwner {
        LibDiamond.addFacet(facetAddress, selectors);
    }

    function removeFacet(bytes4[] calldata selectors) external onlyOwner {
        LibDiamond.removeFacet(selectors);
    }

    function facetAddress(bytes4 selector) external view returns (address) {
        return LibDiamond.getStorage().facets[selector].facetAddress;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        LibDiamond.getStorage().owner = newOwner;
    }

    function owner() external view returns (address) {
        return LibDiamond.getStorage().owner;
    }
}

/******************************************************************************
 * GovernanceFacet - Owner/governance management
 ******************************************************************************/

contract GovernanceFacet {
    using LibPvPStaking for LibPvPStaking.StorageData;

    modifier onlyOwner() {
        require(msg.sender == LibPvPStaking.getStorage().owner, "Not owner");
        _;
    }

    function setHouseFeePercentage(uint256 newFeePercentage) external onlyOwner {
        require(newFeePercentage <= 100, "Fee too high");
        LibPvPStaking.getStorage().houseFeePercentage = newFeePercentage;
    }

    function getOwner() external view returns (address) {
        return LibPvPStaking.getStorage().owner;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        LibPvPStaking.getStorage().owner = newOwner;
    }

    function initializeOwner(address owner_) external {
        LibPvPStaking.StorageData storage s = LibPvPStaking.getStorage();
        require(s.owner == address(0), "Already initialized");
        require(owner_ != address(0), "Invalid owner");
        s.owner = owner_;
    }

    function initializeHouseFee(uint256 feePercentage) external {
        LibPvPStaking.StorageData storage s = LibPvPStaking.getStorage();
        require(s.owner != address(0), "Initialize owner first");
        require(feePercentage <= 100, "Fee too high");
        s.houseFeePercentage = feePercentage;
    }
}
