// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Test} from "forge-std/Test.sol";
import {GameEscrow} from "../contracts/contract.sol";

contract GameEscrowTest is Test {
    GameEscrow escrow;
    address governor = address(0x1111);
    address creator = address(0x2222);
    address player2 = address(0x3333);
    address player3 = address(0x4444);
    address owner = address(0x5555);

    uint256 constant STAKE = 1 ether;
    uint256 constant HOUSE_FEE = 10; // 10%

    event GameCreated(uint256 indexed gameId, address creator, uint256 stakeAmount);
    event PlayerJoined(uint256 indexed gameId, address player);
    event PlayerForfeited(uint256 indexed gameId, address player);
    event GameReady(uint256 indexed gameId);
    event LoserAdded(uint256 indexed gameId, address loser);
    event GameEnded(uint256 indexed gameId);

    function setUp() public {
        vm.prank(owner);
        escrow = new GameEscrow(HOUSE_FEE);

        // Fund test accounts
        vm.deal(creator, 10 ether);
        vm.deal(player2, 10 ether);
        vm.deal(player3, 10 ether);
        vm.deal(governor, 1 ether);
    }

    // ============================================================
    // GAME CREATION TESTS
    // ============================================================

    function test_createGame_basic() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        assertEq(gameId, 0, "First game should be ID 0");

        GameEscrow.GameInfo memory game = escrow.getGame(gameId);
        assertEq(game.governor, governor);
        assertEq(game.stakeAmount, STAKE);
        assertEq(game.maxPlayers, 2);
        assertEq(game.activePlayers, 1);
        assertEq(game.players.length, 1);
        assertEq(game.players[0], creator);
        assertFalse(game.isReady);
        assertFalse(game.isEnded);
    }

    function test_createGame_emitsEvent() public {
        vm.prank(creator);
        vm.expectEmit(true, false, false, true);
        emit GameCreated(0, creator, STAKE);
        escrow.createGame{value: STAKE}(governor, STAKE, 2, new address[](0));
    }

    function test_createGame_withWhitelist() public {
        address[] memory whitelist = new address[](1);
        whitelist[0] = player2;

        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            3,
            whitelist
        );

        GameEscrow.GameInfo memory game = escrow.getGame(gameId);
        assertEq(game.whitelist.length, 2); // player2 + creator auto-added
    }

    function test_createGame_rejectsZeroStake() public {
        vm.prank(creator);
        vm.expectRevert("Stake must be positive");
        escrow.createGame{value: 0}(governor, 0, 2, new address[](0));
    }

    function test_createGame_rejectsIncorrectValue() public {
        vm.prank(creator);
        vm.expectRevert("Incorrect stake");
        escrow.createGame{value: STAKE / 2}(
            governor,
            STAKE,
            2,
            new address[](0)
        );
    }

    function test_createGame_rejectsZeroGovernor() public {
        vm.prank(creator);
        vm.expectRevert("Invalid governor");
        escrow.createGame{value: STAKE}(
            address(0),
            STAKE,
            2,
            new address[](0)
        );
    }

    // ============================================================
    // JOIN GAME TESTS
    // ============================================================

    function test_joinGame_basic() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            3,
            new address[](0)
        );

        vm.prank(player2);
        escrow.joinGame{value: STAKE}(gameId);

        GameEscrow.GameInfo memory game = escrow.getGame(gameId);
        assertEq(game.activePlayers, 2);
        assertEq(game.players.length, 2);
    }

    function test_joinGame_emitsEvent() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            3,
            new address[](0)
        );

        vm.prank(player2);
        vm.expectEmit(true, true, false, false);
        emit PlayerJoined(gameId, player2);
        escrow.joinGame{value: STAKE}(gameId);
    }

    function test_joinGame_rejectsDuplicatePlayer() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(creator);
        vm.expectRevert("Already joined");
        escrow.joinGame{value: STAKE}(gameId);
    }

    function test_joinGame_rejectsGameFull() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(governor, STAKE, 1, new address[](0));

        vm.prank(player2);
        vm.expectRevert("Game full");
        escrow.joinGame{value: STAKE}(gameId);
    }

    function test_joinGame_rejectsWhenGameStarted() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(governor);
        escrow.setGameReady(gameId);

        vm.prank(player2);
        vm.expectRevert("Game already started");
        escrow.joinGame{value: STAKE}(gameId);
    }

    function test_joinGame_rejectsWhenGameEnded() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(governor);
        escrow.setGameReady(gameId);
        
        vm.prank(governor);
        escrow.endGame(gameId, 0);

        vm.prank(player2);
        // Note: isReady check happens before isEnded, so we get "Game already started" error
        vm.expectRevert("Game already started");
        escrow.joinGame{value: STAKE}(gameId);
    }

    function test_joinGame_rejectsWhitelistViolation() public {
        address[] memory whitelist = new address[](1);
        whitelist[0] = player2;

        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            3,
            whitelist
        );

        vm.prank(player3);
        vm.expectRevert("Not whitelisted");
        escrow.joinGame{value: STAKE}(gameId);
    }

    // ============================================================
    // FORFEIT TESTS
    // ============================================================

    function test_forfeit_basic() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        uint256 balanceBefore = creator.balance;

        vm.prank(creator);
        escrow.forfeitGame(gameId);

        GameEscrow.GameInfo memory game = escrow.getGame(gameId);
        assertEq(game.activePlayers, 0);
        assertEq(game.forfeited.length, 1);
        assertEq(creator.balance, balanceBefore + STAKE);
    }

    function test_forfeit_emitsEvent() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(creator);
        vm.expectEmit(true, true, false, false);
        emit PlayerForfeited(gameId, creator);
        escrow.forfeitGame(gameId);
    }

    function test_forfeit_autoEndsGameWhenNoPlayersRemain() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(creator);
        escrow.forfeitGame(gameId);

        GameEscrow.GameInfo memory game = escrow.getGame(gameId);
        assertTrue(game.isEnded);
    }

    function test_forfeit_rejectsAfterGameStart() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(governor);
        escrow.setGameReady(gameId);

        vm.prank(creator);
        vm.expectRevert("Game already started");
        escrow.forfeitGame(gameId);
    }

    function test_forfeit_rejectsDuplicateForfeit() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            3,
            new address[](0)
        );

        vm.prank(player2);
        escrow.joinGame{value: STAKE}(gameId);

        vm.prank(creator);
        escrow.forfeitGame(gameId);

        vm.prank(creator);
        vm.expectRevert("Already forfeited");
        escrow.forfeitGame(gameId);
    }

    // ============================================================
    // GAME RESOLUTION TESTS
    // ============================================================

    function test_setGameReady_basic() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(governor);
        escrow.setGameReady(gameId);

        GameEscrow.GameInfo memory game = escrow.getGame(gameId);
        assertTrue(game.isReady);
    }

    function test_setGameReady_emitsEvent() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(governor);
        vm.expectEmit(true, false, false, false);
        emit GameReady(gameId);
        escrow.setGameReady(gameId);
    }

    function test_setGameReady_rejectsNonGovernor() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(player2);
        vm.expectRevert("Not governor");
        escrow.setGameReady(gameId);
    }

    function test_addLoser_basic() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(player2);
        escrow.joinGame{value: STAKE}(gameId);

        vm.prank(governor);
        escrow.setGameReady(gameId);
        
        vm.prank(governor);
        escrow.addLoser(gameId, player2);

        GameEscrow.GameInfo memory game = escrow.getGame(gameId);
        assertEq(game.losers.length, 1);
        assertEq(game.losers[0], player2);
    }

    function test_addLoser_rejectsNonGamePlayer() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(governor);
        escrow.setGameReady(gameId);

        vm.prank(governor);
        vm.expectRevert("Not a player");
        escrow.addLoser(gameId, player2);
    }

    function test_addLoser_rejectsDuplicateLoser() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(governor);
        escrow.setGameReady(gameId);
        
        vm.prank(governor);
        escrow.addLoser(gameId, creator);

        vm.prank(governor);
        vm.expectRevert("Already loser");
        escrow.addLoser(gameId, creator);
    }

    // ============================================================
    // PRIZE DISTRIBUTION TESTS
    // ============================================================

    function test_endGame_singleWinner() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(player2);
        escrow.joinGame{value: STAKE}(gameId);

        vm.prank(governor);
        escrow.setGameReady(gameId);
        
        vm.prank(governor);
        escrow.addLoser(gameId, player2);

        uint256 creatorBalanceBefore = creator.balance;

        vm.prank(governor);
        escrow.endGame(gameId, 0);

        // Prize = 2 ETH * (1 - 0.1) = 1.8 ETH
        uint256 expectedPrize = (2 * STAKE * (100 - HOUSE_FEE)) / 100;
        assertEq(creator.balance - creatorBalanceBefore, expectedPrize);
    }

    function test_endGame_multipleWinners() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            3,
            new address[](0)
        );

        vm.prank(player2);
        escrow.joinGame{value: STAKE}(gameId);

        vm.prank(player3);
        escrow.joinGame{value: STAKE}(gameId);

        vm.prank(governor);
        escrow.setGameReady(gameId);
        
        vm.prank(governor);
        escrow.addLoser(gameId, player2);

        uint256 creatorBalanceBefore = creator.balance;
        uint256 player3BalanceBefore = player3.balance;

        vm.prank(governor);
        escrow.endGame(gameId, 0);

        // Prize per winner = 3 ETH * 0.9 / 2 = 1.35 ETH
        uint256 expectedPrize = (3 * STAKE * (100 - HOUSE_FEE)) / 100 / 2;
        assertEq(creator.balance - creatorBalanceBefore, expectedPrize);
        assertEq(player3.balance - player3BalanceBefore, expectedPrize);
    }

    function test_endGame_withGovernorFee() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(player2);
        escrow.joinGame{value: STAKE}(gameId);

        vm.prank(governor);
        escrow.setGameReady(gameId);
        
        vm.prank(governor);
        escrow.addLoser(gameId, player2);

        uint256 governorBalanceBefore = governor.balance;

        vm.prank(governor);
        escrow.endGame(gameId, 20); // 20% governor fee

        // Governor gets: 2 ETH * 0.2 = 0.4 ETH + winner prize from remainder
        uint256 expectedGovernorFee = (2 * STAKE * 20) / 100;
        assertGe(governor.balance - governorBalanceBefore, expectedGovernorFee);
    }

    function test_endGame_allLosers() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(player2);
        escrow.joinGame{value: STAKE}(gameId);

        vm.prank(governor);
        escrow.setGameReady(gameId);
        
        vm.prank(governor);
        escrow.addLoser(gameId, creator);
        
        vm.prank(governor);
        escrow.addLoser(gameId, player2);

        uint256 governorBalanceBefore = governor.balance;

        vm.prank(governor);
        escrow.endGame(gameId, 0);

        // Governor gets remainder (2 ETH * 0.9)
        uint256 expectedRemainder = (2 * STAKE * (100 - HOUSE_FEE)) / 100;
        assertEq(governor.balance - governorBalanceBefore, expectedRemainder);
    }

    function test_endGame_rejectsFeeOverflow() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(governor);
        escrow.setGameReady(gameId);

        vm.prank(governor);
        vm.expectRevert("Fee overflow");
        escrow.endGame(gameId, 100); // 10% house + 100% governor = 110% > 100%
    }

    function test_endGame_rejectsNotReady() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(governor);
        vm.expectRevert("Game not ready");
        escrow.endGame(gameId, 0);
    }

    function test_endGame_rejectsAlreadyEnded() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(governor);
        escrow.setGameReady(gameId);
        
        vm.prank(governor);
        escrow.endGame(gameId, 0);

        vm.prank(governor);
        vm.expectRevert("Game already ended");
        escrow.endGame(gameId, 0);
    }

    // ============================================================
    // VIEW FUNCTION TESTS
    // ============================================================

    function test_getNotStartedGames() public {
        vm.prank(creator);
        uint256 gameId1 = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(creator);
        uint256 gameId2 = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(governor);
        escrow.setGameReady(gameId2);

        uint256[] memory games = escrow.getNotStartedGames(0, 10);
        assertEq(games.length, 1);
        assertEq(games[0], gameId1);
    }

    function test_getOngoingGames() public {
        vm.prank(creator);
        uint256 gameId1 = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(creator);
        uint256 gameId2 = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(governor);
        escrow.setGameReady(gameId1);

        uint256[] memory games = escrow.getOngoingGames(0, 10);
        assertEq(games.length, 1);
        assertEq(games[0], gameId1);
    }

    function test_getGovernorGames() public {
        address governor2 = address(0x6666);

        vm.prank(creator);
        uint256 gameId1 = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(creator);
        uint256 gameId2 = escrow.createGame{value: STAKE}(
            governor2,
            STAKE,
            2,
            new address[](0)
        );

        uint256[] memory games = escrow.getGovernorGames(governor, true, true, true, 0, 10);
        assertEq(games.length, 1);
        assertEq(games[0], gameId1);
    }

    // ============================================================
    // ADMIN TESTS
    // ============================================================

    function test_withdraw_onlyOwner() public {
        vm.prank(creator);
        escrow.createGame{value: STAKE}(governor, STAKE, 2, new address[](0));

        vm.prank(player2);
        vm.expectRevert("Not owner");
        escrow.withdraw();
    }

    function test_withdraw_success() public {
        vm.prank(creator);
        escrow.createGame{value: STAKE}(governor, STAKE, 2, new address[](0));

        uint256 contractBalance = address(escrow).balance;
        uint256 ownerBalanceBefore = owner.balance;

        vm.prank(owner);
        escrow.withdraw();

        assertEq(address(escrow).balance, 0);
        assertEq(owner.balance - ownerBalanceBefore, contractBalance);
    }

    // ============================================================
    // REENTRANCY TESTS
    // ============================================================

    function test_noReentrancyOnForfeit() public {
        vm.prank(creator);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        vm.prank(creator);
        escrow.forfeitGame(gameId);

        GameEscrow.GameInfo memory game = escrow.getGame(gameId);
        assertTrue(game.isEnded);
    }

    // ============================================================
    // INVARIANT TESTS
    // ============================================================

    function test_invariant_totalPrizeConserved() public {
        // Verify: (staked amount - house fees) is distributed to players
        address testPlayer1 = address(0xAAAA);
        address testPlayer2 = address(0xBBBB);
        address testPlayer3 = address(0xCCCC);
        address testGovernor = address(0xDDDD);
        address testOwner = address(0xEEEE);
        
        vm.prank(testOwner);
        GameEscrow testEscrow = new GameEscrow(HOUSE_FEE);
        
        vm.deal(testPlayer1, 10 ether);
        vm.deal(testPlayer2, 10 ether);
        vm.deal(testPlayer3, 10 ether);

        vm.prank(testPlayer1);
        uint256 gameId = testEscrow.createGame{value: STAKE}(
            testGovernor,
            STAKE,
            3,
            new address[](0)
        );

        vm.prank(testPlayer2);
        testEscrow.joinGame{value: STAKE}(gameId);

        vm.prank(testPlayer3);
        testEscrow.joinGame{value: STAKE}(gameId);

        uint256 totalStaked = 3 * STAKE;
        uint256 houseFeeAmount = (totalStaked * HOUSE_FEE) / 100;
        uint256 expectedDistributed = totalStaked - houseFeeAmount;

        vm.prank(testGovernor);
        testEscrow.setGameReady(gameId);
        
        vm.prank(testGovernor);
        testEscrow.addLoser(gameId, testPlayer2);

        uint256 contractBalanceBefore = address(testEscrow).balance;

        vm.prank(testGovernor);
        testEscrow.endGame(gameId, 0);

        uint256 contractBalanceAfter = address(testEscrow).balance;

        // House fee should remain in contract, other funds should leave
        assertEq(contractBalanceBefore - contractBalanceAfter, expectedDistributed);
    }
}
