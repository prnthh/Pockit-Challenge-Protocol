// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "forge-std/Script.sol";
import "./Diamond.sol";
import "./DiamondInit.sol";
import "./facets/GameEscrowFacets.sol";

contract DeployDiamond is Script {
    function run() external {
        vm.startBroadcast();

        // Deploy facets
        GameEscrowFacet gameEscrowFacet = new GameEscrowFacet();
        GameQueryFacet gameQueryFacet = new GameQueryFacet();
        GovernanceFacet governanceFacet = new GovernanceFacet();
        DiamondCutFacet diamondCutFacet = new DiamondCutFacet();

        // Deploy init contract
        DiamondInit diamondInit = new DiamondInit();

        // Prepare diamond cut for initial facets
        LibDiamond.FacetCut[] memory diamondCut = new LibDiamond.FacetCut[](3);

        // Add GameEscrowFacet functions
        bytes4[] memory gameEscrowSelectors = new bytes4[](6);
        gameEscrowSelectors[0] = GameEscrowFacet.createGame.selector;
        gameEscrowSelectors[1] = GameEscrowFacet.joinGame.selector;
        gameEscrowSelectors[2] = GameEscrowFacet.setGameReady.selector;
        gameEscrowSelectors[3] = GameEscrowFacet.addLoser.selector;
        gameEscrowSelectors[4] = GameEscrowFacet.forfeitGame.selector;
        gameEscrowSelectors[5] = GameEscrowFacet.endGame.selector;
        diamondCut[0] = LibDiamond.FacetCut(address(gameEscrowFacet), 0, gameEscrowSelectors);

        // Add GameQueryFacet functions
        bytes4[] memory querySelectors = new bytes4[](5);
        querySelectors[0] = GameQueryFacet.getGame.selector;
        querySelectors[1] = GameQueryFacet.getNotStartedGames.selector;
        querySelectors[2] = GameQueryFacet.getOngoingGames.selector;
        querySelectors[3] = GameQueryFacet.getGovernorGames.selector;
        querySelectors[4] = GameQueryFacet.nextGameId.selector;
        diamondCut[1] = LibDiamond.FacetCut(address(gameQueryFacet), 0, querySelectors);

        // Add GovernanceFacet functions
        bytes4[] memory govSelectors = new bytes4[](4);
        govSelectors[0] = GovernanceFacet.setHouseFeePercentage.selector;
        govSelectors[1] = GovernanceFacet.getOwner.selector;
        govSelectors[2] = GovernanceFacet.transferOwnership.selector;
        govSelectors[3] = GovernanceFacet.initializeOwner.selector;
        diamondCut[2] = LibDiamond.FacetCut(address(governanceFacet), 0, govSelectors);

        // Deploy Diamond
        Diamond diamond = new Diamond(
            address(diamondCutFacet),
            address(diamondInit),
            abi.encodeCall(DiamondInit.init, (10)) // 10% house fee
        );

        vm.stopBroadcast();

        console.log("Diamond deployed at:", address(diamond));
        console.log("GameEscrowFacet deployed at:", address(gameEscrowFacet));
        console.log("GameQueryFacet deployed at:", address(gameQueryFacet));
        console.log("GovernanceFacet deployed at:", address(governanceFacet));
        console.log("DiamondCutFacet deployed at:", address(diamondCutFacet));
        console.log("DiamondInit deployed at:", address(diamondInit));
    }
}
