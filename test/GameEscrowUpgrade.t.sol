// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/GameEscrowV2.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract GameEscrowV2Upgraded is GameEscrow {
    // New state variable added in upgrade
    uint256 public newFeature;
    
    function setNewFeature(uint256 value) external onlyOwner {
        newFeature = value;
    }
}

contract GameEscrowUpgradeTest is Test {
    GameEscrow public escrow;
    ERC1967Proxy public proxy;
    
    address owner = address(1);
    address player1 = address(2);
    address player2 = address(3);
    address gameContract = address(4);
    
    function setUp() public {
        vm.startPrank(owner);
        
        // Deploy implementation
        GameEscrow implementation = new GameEscrow();
        
        // Deploy proxy pointing to implementation
        bytes memory initData = abi.encodeCall(GameEscrow.initialize, 250); // 2.5% fee
        proxy = new ERC1967Proxy(address(implementation), initData);
        
        // Wrap proxy in ABI
        escrow = GameEscrow(address(proxy));
        
        // Approve game contract
        escrow.approveGame(gameContract, true);
        
        vm.stopPrank();
    }
    
    function testDeployment() public {
        assertEq(escrow.owner(), owner);
        assertEq(escrow.houseFeePercentage(), 250);
        assertTrue(escrow.approvedGames(gameContract));
        assertEq(escrow.nextMatchId(), 0);
    }
    
    function testCreateMatch() public {
        address[] memory players = new address[](2);
        players[0] = player1;
        players[1] = player2;
        
        uint256[] memory stakes = new uint256[](2);
        stakes[0] = 1 ether;
        stakes[1] = 1 ether;
        
        vm.deal(gameContract, 2 ether);
        vm.prank(gameContract);
        uint256 matchId = escrow.createMatch{value: 2 ether}(gameContract, players, stakes);
        
        assertEq(matchId, 0);
        
        (address creator, address[] memory matchPlayers, uint256 totalStake, bool resolved, address game) = 
            escrow.getMatch(matchId);
        
        assertEq(creator, gameContract);
        assertEq(matchPlayers.length, 2);
        assertEq(totalStake, 2 ether);
        assertFalse(resolved);
        assertEq(game, gameContract);
    }
    
    function testUpgrade() public {
        // Create a match with V1
        address[] memory players = new address[](2);
        players[0] = player1;
        players[1] = player2;
        
        uint256[] memory stakes = new uint256[](2);
        stakes[0] = 1 ether;
        stakes[1] = 1 ether;
        
        vm.deal(gameContract, 2 ether);
        vm.prank(gameContract);
        uint256 matchId = escrow.createMatch{value: 2 ether}(gameContract, players, stakes);
        
        // Verify V1 state
        (address creator, , uint256 totalStake, , ) = escrow.getMatch(matchId);
        assertEq(creator, gameContract);
        assertEq(totalStake, 2 ether);
        
        // Deploy V2 implementation
        vm.startPrank(owner);
        GameEscrowV2Upgraded implementationV2 = new GameEscrowV2Upgraded();
        
        // Upgrade proxy to V2
        GameEscrow(address(proxy)).upgradeToAndCall(address(implementationV2), "");
        
        // Wrap proxy in V2 ABI
        GameEscrowV2Upgraded escrowV2 = GameEscrowV2Upgraded(address(proxy));
        
        // Verify state persisted after upgrade
        (address creatorAfter, , uint256 totalStakeAfter, , ) = escrowV2.getMatch(matchId);
        assertEq(creatorAfter, gameContract);
        assertEq(totalStakeAfter, 2 ether);
        assertEq(escrowV2.houseFeePercentage(), 250); // old state preserved
        
        // Test new functionality
        escrowV2.setNewFeature(42);
        assertEq(escrowV2.newFeature(), 42);
        
        vm.stopPrank();
    }
    
    function testUpgradeUnauthorized() public {
        GameEscrowV2Upgraded implementationV2 = new GameEscrowV2Upgraded();
        
        vm.prank(player1);
        vm.expectRevert();
        GameEscrow(address(proxy)).upgradeToAndCall(address(implementationV2), "");
    }
    
    function testResolveAndWithdraw() public {
        // Create match
        address[] memory players = new address[](2);
        players[0] = player1;
        players[1] = player2;
        
        uint256[] memory stakes = new uint256[](2);
        stakes[0] = 1 ether;
        stakes[1] = 1 ether;
        
        vm.deal(gameContract, 2 ether);
        vm.prank(gameContract);
        uint256 matchId = escrow.createMatch{value: 2 ether}(gameContract, players, stakes);
        
        // Resolve match (player1 wins all)
        address[] memory winners = new address[](1);
        winners[0] = player1;
        
        uint256[] memory payouts = new uint256[](1);
        uint256 fee = (2 ether * 250) / 10000; // 2.5%
        payouts[0] = 2 ether - fee;
        
        vm.prank(gameContract);
        escrow.resolveMatch(matchId, winners, payouts);
        
        // Withdraw
        uint256 balanceBefore = player1.balance;
        vm.prank(player1);
        escrow.withdraw(matchId);
        
        assertEq(player1.balance - balanceBefore, payouts[0]);
        assertEq(escrow.getPlayerPayout(matchId, player1), payouts[0]);
    }
    
    function testFullUpgradeFlow() public {
        // 1. Create match on V1
        address[] memory players = new address[](2);
        players[0] = player1;
        players[1] = player2;
        
        uint256[] memory stakes = new uint256[](2);
        stakes[0] = 1 ether;
        stakes[1] = 1 ether;
        
        vm.deal(gameContract, 2 ether);
        vm.prank(gameContract);
        uint256 matchId = escrow.createMatch{value: 2 ether}(gameContract, players, stakes);
        
        // 2. Upgrade to V2
        vm.startPrank(owner);
        GameEscrowV2Upgraded implementationV2 = new GameEscrowV2Upgraded();
        GameEscrow(address(proxy)).upgradeToAndCall(address(implementationV2), "");
        GameEscrowV2Upgraded escrowV2 = GameEscrowV2Upgraded(address(proxy));
        vm.stopPrank();
        
        // 3. Resolve match on V2 (verify old match works after upgrade)
        address[] memory winners = new address[](1);
        winners[0] = player1;
        
        uint256[] memory payouts = new uint256[](1);
        uint256 fee = (2 ether * 250) / 10000;
        payouts[0] = 2 ether - fee;
        
        vm.prank(gameContract);
        escrowV2.resolveMatch(matchId, winners, payouts);
        
        // 4. Withdraw on V2
        uint256 balanceBefore = player1.balance;
        vm.prank(player1);
        escrowV2.withdraw(matchId);
        
        assertEq(player1.balance - balanceBefore, payouts[0]);
        
        // 5. Verify new V2 functionality still works
        vm.prank(owner);
        escrowV2.setNewFeature(123);
        assertEq(escrowV2.newFeature(), 123);
    }
}
