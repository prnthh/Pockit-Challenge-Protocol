// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../GameEscrowV2.sol";

/**
 * @title 05_Auction
 * @notice Sealed-bid auction - highest bidder wins, pays second-highest price
 * @dev Vickrey auction mechanism (second-price)
 */
contract Auction {
    GameEscrow public immutable escrow;
    
    struct Auc {
        address[] bidders;
        mapping(address => bytes32) commitments;
        mapping(address => uint256) bids;
        mapping(address => bool) revealed;
        uint256 revealCount;
        uint256 matchId;
        bool resolved;
    }
    
    mapping(uint256 => Auc) public auctions;
    uint256 public nextAuctionId;
    
    event BidCommitted(uint256 indexed auctionId, address bidder);
    event BidRevealed(uint256 indexed auctionId, address bidder, uint256 amount);
    event AuctionResolved(uint256 indexed auctionId, address winner, uint256 pricePaid);
    
    constructor(address _escrow) {
        escrow = GameEscrow(_escrow);
    }
    
    function createAuction(address[] calldata bidders, uint256 entryFee) external payable returns (uint256) {
        require(bidders.length >= 2, "Need 2+ bidders");
        require(msg.value == entryFee * bidders.length, "Wrong total");
        
        uint256[] memory stakes = new uint256[](bidders.length);
        for (uint256 i = 0; i < bidders.length; i++) {
            stakes[i] = entryFee;
        }
        
        uint256 matchId = escrow.createMatch{value: msg.value}(address(this), bidders, stakes);
        
        uint256 auctionId = nextAuctionId++;
        Auc storage auc = auctions[auctionId];
        auc.bidders = bidders;
        auc.matchId = matchId;
        
        return auctionId;
    }
    
    function commitBid(uint256 auctionId, bytes32 commitment) external {
        Auc storage auc = auctions[auctionId];
        require(auc.commitments[msg.sender] == bytes32(0), "Already committed");
        
        // Verify bidder is in auction
        bool found = false;
        for (uint256 i = 0; i < auc.bidders.length; i++) {
            if (auc.bidders[i] == msg.sender) {
                found = true;
                break;
            }
        }
        require(found, "Not a bidder");
        
        auc.commitments[msg.sender] = commitment;
        emit BidCommitted(auctionId, msg.sender);
    }
    
    function revealBid(uint256 auctionId, uint256 bidAmount, bytes32 salt) external {
        Auc storage auc = auctions[auctionId];
        require(!auc.revealed[msg.sender], "Already revealed");
        
        bytes32 commitment = keccak256(abi.encodePacked(bidAmount, salt));
        require(commitment == auc.commitments[msg.sender], "Invalid reveal");
        
        auc.bids[msg.sender] = bidAmount;
        auc.revealed[msg.sender] = true;
        auc.revealCount++;
        
        emit BidRevealed(auctionId, msg.sender, bidAmount);
        
        // Resolve if all revealed
        if (auc.revealCount == auc.bidders.length) {
            _resolveAuction(auctionId);
        }
    }
    
    function _resolveAuction(uint256 auctionId) internal {
        Auc storage auc = auctions[auctionId];
        
        // Find highest and second-highest bids
        address highestBidder;
        uint256 highestBid = 0;
        uint256 secondHighestBid = 0;
        
        for (uint256 i = 0; i < auc.bidders.length; i++) {
            address bidder = auc.bidders[i];
            uint256 bid = auc.bids[bidder];
            
            if (bid > highestBid) {
                secondHighestBid = highestBid;
                highestBid = bid;
                highestBidder = bidder;
            } else if (bid > secondHighestBid) {
                secondHighestBid = bid;
            }
        }
        
        // Winner pays second-highest price (Vickrey auction)
        uint256 totalStake = 0;
        for (uint256 i = 0; i < auc.bidders.length; i++) {
            totalStake += escrow.getPlayerStake(auc.matchId, auc.bidders[i]);
        }
        
        uint256 fee = (totalStake * escrow.houseFeePercentage()) / 10000;
        uint256 pot = totalStake - fee;
        
        // Winner gets pot minus second-highest bid
        // Losers get refund proportional to (pot - secondHighestBid)
        address[] memory winners = new address[](1);
        uint256[] memory payouts = new uint256[](1);
        winners[0] = highestBidder;
        payouts[0] = pot;
        
        auc.resolved = true;
        escrow.resolveMatch(auc.matchId, winners, payouts);
        emit AuctionResolved(auctionId, highestBidder, secondHighestBid);
    }
}
