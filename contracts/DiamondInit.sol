// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./facets/GameEscrowFacets.sol";

/// @title DiamondInit
/// @notice Initializes Diamond with GameEscrow facets and storage
contract DiamondInit {
    function init(uint256 houseFeePercentage) external {
        LibGameEscrow.Storage storage ds = LibGameEscrow.diamondStorage();
        
        // Get owner from diamond storage or set to caller
        if (ds.owner == address(0)) {
            ds.owner = msg.sender;
        }
        
        ds.houseFeePercentage = houseFeePercentage;
        ds.nextGameId = 0;
    }
}
