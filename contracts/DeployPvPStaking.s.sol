// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "forge-std/Script.sol";
import "./PvPStaking.sol";

contract DeployPvPStaking is Script {
    function run() external {
        vm.startBroadcast();

        // Deploy facets
        PvPStakingFacet pvpFacet = new PvPStakingFacet();
        DiamondManagerFacet diamondMgr = new DiamondManagerFacet();

        // Prepare selectors for PvP facet
        bytes4[] memory pvpSelectors = new bytes4[](5);
        pvpSelectors[0] = PvPStakingFacet.createMatch.selector;
        pvpSelectors[1] = PvPStakingFacet.joinMatch.selector;
        pvpSelectors[2] = PvPStakingFacet.resolveMatch.selector;
        pvpSelectors[3] = PvPStakingFacet.getMatch.selector;
        pvpSelectors[4] = PvPStakingFacet.withdraw.selector;

        // Deploy diamond with PvP facet
        Diamond diamond = new Diamond(address(pvpFacet), pvpSelectors);

        // Add diamond manager
        bytes4[] memory mgrSelectors = new bytes4[](5);
        mgrSelectors[0] = DiamondManagerFacet.addFacet.selector;
        mgrSelectors[1] = DiamondManagerFacet.removeFacet.selector;
        mgrSelectors[2] = DiamondManagerFacet.facetAddress.selector;
        mgrSelectors[3] = DiamondManagerFacet.transferOwnership.selector;
        mgrSelectors[4] = DiamondManagerFacet.owner.selector;

        // Call addFacet through diamond
        DiamondManagerFacet(address(diamond)).addFacet(address(diamondMgr), mgrSelectors);

        vm.stopBroadcast();

        console.log("Diamond deployed at:", address(diamond));
        console.log("PvPStakingFacet deployed at:", address(pvpFacet));
        console.log("DiamondManagerFacet deployed at:", address(diamondMgr));
    }
}
