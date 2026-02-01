// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/GameEscrowV2.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DeployGameEscrow is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy implementation
        GameEscrow implementation = new GameEscrow();
        console.log("GameEscrow implementation deployed at:", address(implementation));
        
        // Deploy proxy with initialization
        bytes memory initData = abi.encodeCall(GameEscrow.initialize, 250); // 2.5% house fee
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        console.log("GameEscrow proxy deployed at:", address(proxy));
        
        // Wrap proxy in interface
        GameEscrow escrow = GameEscrow(address(proxy));
        console.log("Owner:", escrow.owner());
        console.log("House fee:", escrow.houseFeePercentage(), "basis points");
        
        vm.stopBroadcast();
    }
}
