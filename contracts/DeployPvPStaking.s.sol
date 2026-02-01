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
        GovernanceFacet govFacet = new GovernanceFacet();

        // Prepare selectors for PvP facet
        bytes4[] memory pvpSelectors = new bytes4[](10);
        pvpSelectors[0] = PvPStakingFacet.createMatch.selector;
        pvpSelectors[1] = PvPStakingFacet.joinMatch.selector;
        pvpSelectors[2] = PvPStakingFacet.setMatchReady.selector;
        pvpSelectors[3] = PvPStakingFacet.addLoser.selector;
        pvpSelectors[4] = PvPStakingFacet.forfeitMatch.selector;
        pvpSelectors[5] = PvPStakingFacet.endMatch.selector;
        pvpSelectors[6] = PvPStakingFacet.getMatch.selector;
        pvpSelectors[7] = PvPStakingFacet.getNotStartedMatches.selector;
        pvpSelectors[8] = PvPStakingFacet.getOngoingMatches.selector;
        pvpSelectors[9] = PvPStakingFacet.withdraw.selector;

        // Deploy diamond with PvP facet
        Diamond diamond = new Diamond(address(pvpFacet), pvpSelectors);

        // Add diamond manager selectors
        bytes4[] memory mgrSelectors = new bytes4[](5);
        mgrSelectors[0] = DiamondManagerFacet.addFacet.selector;
        mgrSelectors[1] = DiamondManagerFacet.removeFacet.selector;
        mgrSelectors[2] = DiamondManagerFacet.facetAddress.selector;
        mgrSelectors[3] = DiamondManagerFacet.transferOwnership.selector;
        mgrSelectors[4] = DiamondManagerFacet.owner.selector;

        // Call addFacet through diamond
        DiamondManagerFacet(address(diamond)).addFacet(address(diamondMgr), mgrSelectors);

        // Add governance selectors
        bytes4[] memory govSelectors = new bytes4[](5);
        govSelectors[0] = GovernanceFacet.setHouseFeePercentage.selector;
        govSelectors[1] = GovernanceFacet.getOwner.selector;
        govSelectors[2] = GovernanceFacet.transferOwnership.selector;
        govSelectors[3] = GovernanceFacet.initializeOwner.selector;
        govSelectors[4] = GovernanceFacet.initializeHouseFee.selector;

        // Add governance facet
        DiamondManagerFacet(address(diamond)).addFacet(address(govFacet), govSelectors);

        vm.stopBroadcast();

        console.log("Diamond deployed at:", address(diamond));
        console.log("PvPStakingFacet deployed at:", address(pvpFacet));
        console.log("DiamondManagerFacet deployed at:", address(diamondMgr));
        console.log("GovernanceFacet deployed at:", address(govFacet));
    }
}
