// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./GameEscrowV1.sol";

contract DeployGameEscrow is Script {
    function run() external {
        vm.startBroadcast();

        // Deploy implementation
        GameEscrowV1 implementation = new GameEscrowV1();
        bytes memory initData = abi.encodeCall(GameEscrowV1.initialize, (10)); // 10% fee

        // Deploy proxy
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);

        vm.stopBroadcast();

        console.log("Implementation deployed at:", address(implementation));
        console.log("Proxy deployed at:", address(proxy));
        console.log("Use proxy address for interactions");
    }
}
