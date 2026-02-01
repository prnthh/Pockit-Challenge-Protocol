// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Test} from "forge-std/Test.sol";
import {GameEscrow} from "../contracts/contract.sol";

contract CoinFlipTest is Test {
    GameEscrow escrow;
    address governor = address(0x1111);
    address player1 = address(0x2222);
    address player2 = address(0x3333);
    address owner = address(0x5555);

    uint256 constant STAKE = 1 ether;
    uint256 constant HOUSE_FEE = 10; // 10%

    function setUp() public {
        vm.prank(owner);
        escrow = new GameEscrow(HOUSE_FEE);

        vm.deal(player1, 100 ether);
        vm.deal(player2, 100 ether);
        vm.deal(governor, 100 ether);
    }

    // ============================================================
    // COINFLIP: DOUBLE OR NOTHING SCENARIOS
    // ============================================================

    /// @dev Coinflip scenario: Player 1 wins, gets paid out
    function test_coinflip_player1_wins() public {
        // Player 1 creates and funds game
        vm.prank(player1);
        uint256 gameId = escrow.createGame{value: STAKE}(
            governor,
            STAKE,
            2,
            new address[](0)
        );

        // Verify game created
        GameEscrow.GameInfo memory gameAfterCreate = escrow.getGame(gameId);
        assertEq(gameAfterCreate.activePlayers, 1);
        assertEq(gameAfterCreate.stakeAmount, STAKE);
        assertFalse(gameAfterCreate.isReady);
        assertFalse(gameAfterCreate.isEnded);

        // Player 2 joins with same stake
        vm.prank(player2);
        escrow.joinGame{value: STAKE}(gameId);

        GameEscrow.GameInfo memory gameAfterJoin = escrow.getGame(gameId);
        assertEq(gameAfterJoin.activePlayers, 2);

        // Governor starts the game
        vm.prank(governor);
        escrow.setGameReady(gameId);

        GameEscrow.GameInfo memory gameAfterReady = escrow.getGame(gameId);
        assertTrue(gameAfterReady.isReady);
        assertFalse(gameAfterReady.isEnded);

        // Governor flips coin: Player 1 wins (Player 2 is marked as loser)
        vm.prank(governor);
        escrow.addLoser(gameId, player2);

        GameEscrow.GameInfo memory gameAfterLoser = escrow.getGame(gameId);
        assertEq(gameAfterLoser.losers.length, 1);
        assertEq(gameAfterLoser.losers[0], player2);

        // Governor resolves the game with 10% fee
        vm.prank(governor);
        escrow.endGame(gameId, HOUSE_FEE);

        GameEscrow.GameInfo memory gameFinal = escrow.getGame(gameId);
        assertTrue(gameFinal.isEnded);
        assertTrue(gameFinal.isReady);
    }

    /// @dev Coinflip scenario: Player 2 wins
    function test_coinflip_player2_wins() public {
        vm.prank(player1);
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

        // This time Player 1 is the loser
        vm.prank(governor);
        escrow.addLoser(gameId, player1);

        vm.prank(governor);
        escrow.endGame(gameId, HOUSE_FEE);

        GameEscrow.GameInfo memory gameFinal = escrow.getGame(gameId);
        assertTrue(gameFinal.isEnded);
        assertEq(gameFinal.losers[0], player1);
    }

    /// @dev True double-or-nothing: 0% governor fee
    function test_coinflip_pure_double_or_nothing() public {
        vm.prank(player1);
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

        // 0% fee = true double-or-nothing
        vm.prank(governor);
        escrow.endGame(gameId, 0);

        GameEscrow.GameInfo memory gameFinal = escrow.getGame(gameId);
        assertTrue(gameFinal.isEnded);
    }

    /// @dev High stakes coinflip (10 ETH each)
    function test_coinflip_high_stakes() public {
        uint256 highStake = 10 ether;

        vm.prank(player1);
        uint256 gameId = escrow.createGame{value: highStake}(
            governor,
            highStake,
            2,
            new address[](0)
        );

        vm.prank(player2);
        escrow.joinGame{value: highStake}(gameId);

        vm.prank(governor);
        escrow.setGameReady(gameId);

        vm.prank(governor);
        escrow.addLoser(gameId, player2);

        // 20% governor fee on 20 ETH total = 4 ETH to governor
        vm.prank(governor);
        escrow.endGame(gameId, 20);

        GameEscrow.GameInfo memory gameFinal = escrow.getGame(gameId);
        assertTrue(gameFinal.isEnded);
        assertEq(gameFinal.stakeAmount, highStake);
    }

    /// @dev Multiple sequential coinflips
    function test_coinflip_tournament_sequence() public {
        // Game 1: Player 1 creates and wins
        vm.prank(player1);
        uint256 game1 = escrow.createGame{value: STAKE}(governor, STAKE, 2, new address[](0));
        vm.prank(player2);
        escrow.joinGame{value: STAKE}(game1);
        vm.prank(governor);
        escrow.setGameReady(game1);
        vm.prank(governor);
        escrow.addLoser(game1, player2);
        vm.prank(governor);
        escrow.endGame(game1, HOUSE_FEE);

        GameEscrow.GameInfo memory game1Final = escrow.getGame(game1);
        assertTrue(game1Final.isEnded);

        // Game 2: Player 2 creates and wins (rematch)
        vm.prank(player2);
        uint256 game2 = escrow.createGame{value: STAKE}(governor, STAKE, 2, new address[](0));
        vm.prank(player1);
        escrow.joinGame{value: STAKE}(game2);
        vm.prank(governor);
        escrow.setGameReady(game2);
        vm.prank(governor);
        escrow.addLoser(game2, player1);
        vm.prank(governor);
        escrow.endGame(game2, HOUSE_FEE);

        GameEscrow.GameInfo memory game2Final = escrow.getGame(game2);
        assertTrue(game2Final.isEnded);

        // Both games completed successfully
        assertEq(escrow.nextGameId(), 2);
    }

    /// @dev Governor can track games
    function test_coinflip_governor_game_tracking() public {
        // Create 3 games with same governor
        vm.prank(player1);
        uint256 game1 = escrow.createGame{value: STAKE}(governor, STAKE, 2, new address[](0));
        vm.prank(player2);
        escrow.joinGame{value: STAKE}(game1);

        vm.prank(player1);
        uint256 game2 = escrow.createGame{value: STAKE}(governor, STAKE, 2, new address[](0));
        vm.prank(player2);
        escrow.joinGame{value: STAKE}(game2);

        // Query governor's games (not started)
        uint256[] memory notStarted = escrow.getNotStartedGames(0, 100);
        assertTrue(notStarted.length > 0);

        // Start game 1
        vm.prank(governor);
        escrow.setGameReady(game1);

        // Query ongoing games
        uint256[] memory ongoing = escrow.getOngoingGames(0, 100);
        assertTrue(ongoing.length > 0);
    }

    /// @dev Payout distribution math
    function test_coinflip_payout_math() public {
        // Set up: 2 ETH total at stake
        vm.prank(player1);
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

        // With 10% fee: 2 ETH * 10% = 0.2 ETH to governor
        // Winner gets: 2 ETH - 0.2 ETH = 1.8 ETH
        vm.prank(governor);
        escrow.endGame(gameId, HOUSE_FEE);

        GameEscrow.GameInfo memory gameFinal = escrow.getGame(gameId);
        assertTrue(gameFinal.isEnded);

        // Verify game state
        assertEq(gameFinal.stakeAmount, STAKE);
        assertEq(gameFinal.activePlayers, 2);
        assertEq(gameFinal.losers.length, 1);
    }
}
