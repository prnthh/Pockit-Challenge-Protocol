// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/******************************************************************************
 * LibPvPStaking - Minimal shared storage for PvP games
 ******************************************************************************/

library LibPvPStaking {
    bytes32 constant STORAGE_POSITION = keccak256("pvp.staking.storage");

    struct Match {
        address player1;
        address player2;
        uint256 stakeAmount;
        address winner;
        bool resolved;
    }

    struct StorageData {
        mapping(uint256 => Match) matches;
        uint256 nextMatchId;
        address owner;
    }

    function getStorage() internal pure returns (StorageData storage s) {
        bytes32 position = STORAGE_POSITION;
        assembly {
            s.slot := position
        }
    }

    event MatchCreated(uint256 indexed matchId, address indexed player1, uint256 stakeAmount);
    event MatchJoined(uint256 indexed matchId, address indexed player2);
    event MatchResolved(uint256 indexed matchId, address indexed winner, uint256 prize);
}

/******************************************************************************
 * PvPStakingFacet - Core staking logic
 ******************************************************************************/

contract PvPStakingFacet {
    using LibPvPStaking for LibPvPStaking.StorageData;

    modifier onlyOwner() {
        require(msg.sender == LibPvPStaking.getStorage().owner, "Not owner");
        _;
    }

    function createMatch(uint256 stakeAmount) external payable returns (uint256) {
        require(msg.value == stakeAmount, "Incorrect stake");
        require(stakeAmount > 0, "Stake must be positive");

        LibPvPStaking.StorageData storage s = LibPvPStaking.getStorage();
        uint256 matchId = s.nextMatchId++;

        s.matches[matchId] = LibPvPStaking.Match({
            player1: msg.sender,
            player2: address(0),
            stakeAmount: stakeAmount,
            winner: address(0),
            resolved: false
        });

        emit LibPvPStaking.MatchCreated(matchId, msg.sender, stakeAmount);
        return matchId;
    }

    function joinMatch(uint256 matchId) external payable {
        LibPvPStaking.StorageData storage s = LibPvPStaking.getStorage();
        LibPvPStaking.Match storage m = s.matches[matchId];

        require(msg.value == m.stakeAmount, "Incorrect stake");
        require(m.player2 == address(0), "Match already full");
        require(m.winner == address(0), "Match resolved");
        require(msg.sender != m.player1, "Cannot join own match");

        m.player2 = msg.sender;

        emit LibPvPStaking.MatchJoined(matchId, msg.sender);
    }

    function resolveMatch(uint256 matchId, address winner) external onlyOwner {
        LibPvPStaking.StorageData storage s = LibPvPStaking.getStorage();
        LibPvPStaking.Match storage m = s.matches[matchId];

        require(m.player2 != address(0), "Match not full");
        require(!m.resolved, "Already resolved");
        require(
            winner == m.player1 || winner == m.player2,
            "Winner must be a player"
        );

        m.winner = winner;
        m.resolved = true;

        uint256 prize = m.stakeAmount * 2;
        (bool success, ) = winner.call{value: prize}("");
        require(success, "Prize transfer failed");

        emit LibPvPStaking.MatchResolved(matchId, winner, prize);
    }

    function getMatch(uint256 matchId)
        external
        view
        returns (
            address player1,
            address player2,
            uint256 stakeAmount,
            address winner,
            bool resolved
        )
    {
        LibPvPStaking.Match storage m = LibPvPStaking.getStorage().matches[matchId];
        return (m.player1, m.player2, m.stakeAmount, m.winner, m.resolved);
    }

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

    function addFacet(
        address facetAddress,
        bytes4[] memory selectors
    ) internal {
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
