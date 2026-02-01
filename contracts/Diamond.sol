// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/******************************************************************************
 * Diamond Proxy (EIP-2535)
 * 
 * A diamond is a multi-facet proxy that allows:
 * - Multiple facets (logic contracts) sharing one storage
 * - Add/remove/replace facets without redeploying storage
 * - Call routing via function selector → facet address mapping
 ******************************************************************************/

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

library LibDiamond {
    bytes32 constant DIAMOND_STORAGE_POSITION = keccak256("diamond.standard.diamond.storage");

    struct FacetAddressAndPosition {
        address facetAddress;
        uint96 functionSelectorPosition;
    }

    struct DiamondStorage {
        mapping(bytes4 => FacetAddressAndPosition) facetAddressAndPosition;
        bytes4[] selectors;
        mapping(bytes4 => bool) supportedInterfaces;
        address contractOwner;
    }

    function diamondStorage() internal pure returns (DiamondStorage storage ds) {
        bytes32 position = DIAMOND_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }

    event DiamondCut(
        FacetCut[] indexed _diamondCut,
        address indexed _init,
        bytes _calldata
    );
    
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    struct FacetCut {
        address facetAddress;
        uint8 action; // 0: Add, 1: Replace, 2: Remove
        bytes4[] functionSelectors;
    }

    function addReplaceRemoveFacetSelectors(
        address _facetAddress,
        uint8 _action,
        bytes4[] memory _selectors
    ) internal {
        DiamondStorage storage ds = diamondStorage();
        require(_selectors.length > 0, "No selectors provided");

        if (_action == 0) {
            // Add
            require(_facetAddress != address(0), "Add: zero address");
            uint96 selectorCount = uint96(ds.selectors.length);
            for (uint256 i = 0; i < _selectors.length; i++) {
                bytes4 selector = _selectors[i];
                require(ds.facetAddressAndPosition[selector].facetAddress == address(0), "Selector exists");
                ds.facetAddressAndPosition[selector] = FacetAddressAndPosition(_facetAddress, selectorCount);
                ds.selectors.push(selector);
                selectorCount++;
            }
        } else if (_action == 1) {
            // Replace
            require(_facetAddress != address(0), "Replace: zero address");
            for (uint256 i = 0; i < _selectors.length; i++) {
                bytes4 selector = _selectors[i];
                require(ds.facetAddressAndPosition[selector].facetAddress != address(0), "Selector not found");
                ds.facetAddressAndPosition[selector].facetAddress = _facetAddress;
            }
        } else if (_action == 2) {
            // Remove
            require(_facetAddress == address(0), "Remove: must be zero address");
            uint256 selectorCount = ds.selectors.length;
            for (uint256 i = 0; i < _selectors.length; i++) {
                bytes4 selector = _selectors[i];
                require(ds.facetAddressAndPosition[selector].facetAddress != address(0), "Selector not found");
                
                // Swap with last
                uint96 position = ds.facetAddressAndPosition[selector].functionSelectorPosition;
                if (position != selectorCount - 1) {
                    bytes4 lastSelector = ds.selectors[selectorCount - 1];
                    ds.selectors[position] = lastSelector;
                    ds.facetAddressAndPosition[lastSelector].functionSelectorPosition = position;
                }
                ds.selectors.pop();
                delete ds.facetAddressAndPosition[selector];
                selectorCount--;
            }
        }
    }

    function initializeDiamondCut(address _init, bytes memory _calldata) internal {
        if (_init != address(0)) {
            enforceHasContractCode(_init, "Init: no code");
            (bool success, bytes memory error) = _init.delegatecall(_calldata);
            if (!success) {
                if (error.length > 0) {
                    assembly {
                        let returndata_size := mload(error)
                        revert(add(32, error), returndata_size)
                    }
                } else {
                    revert("Init failed");
                }
            }
        }
    }

    function enforceHasContractCode(address _contract, string memory _errorMessage) internal view {
        uint256 contractSize;
        assembly {
            contractSize := extcodesize(_contract)
        }
        require(contractSize > 0, _errorMessage);
    }
}

/// @title Diamond
/// @notice EIP-2535 Multi-Facet Proxy
contract Diamond is ReentrancyGuard {
    using LibDiamond for LibDiamond.DiamondStorage;

    constructor(
        address _diamondCutFacet,
        address _init,
        bytes memory _calldata
    ) {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        ds.contractOwner = msg.sender;

        LibDiamond.FacetCut[] memory diamondCut = new LibDiamond.FacetCut[](1);
        diamondCut[0] = LibDiamond.FacetCut(
            _diamondCutFacet,
            0, // Add
            getDiamondCutSelectors()
        );

        LibDiamond.addReplaceRemoveFacetSelectors(
            _diamondCutFacet,
            0,
            getDiamondCutSelectors()
        );

        emit LibDiamond.DiamondCut(diamondCut, _init, _calldata);
        LibDiamond.initializeDiamondCut(_init, _calldata);
    }

    function getDiamondCutSelectors() internal pure returns (bytes4[] memory) {
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = bytes4(keccak256("diamondCut(tuple[],address,bytes)"));
        return selectors;
    }

    fallback() external payable {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        address facet = ds.facetAddressAndPosition[msg.sig].facetAddress;
        require(facet != address(0), "Function does not exist");
        
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    receive() external payable {}
}

/// @title DiamondCutFacet
/// @notice Manage facet cuts (add/remove/replace facets)
contract DiamondCutFacet {
    using LibDiamond for LibDiamond.DiamondStorage;

    function diamondCut(
        LibDiamond.FacetCut[] calldata _diamondCut,
        address _init,
        bytes calldata _calldata
    ) external {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        require(msg.sender == ds.contractOwner, "Not owner");

        for (uint256 i = 0; i < _diamondCut.length; i++) {
            LibDiamond.addReplaceRemoveFacetSelectors(
                _diamondCut[i].facetAddress,
                _diamondCut[i].action,
                _diamondCut[i].functionSelectors
            );
        }

        emit LibDiamond.DiamondCut(_diamondCut, _init, _calldata);
        LibDiamond.initializeDiamondCut(_init, _calldata);
    }

    function facetAddress(bytes4 _functionSelector) external view returns (address facetAddress_) {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        facetAddress_ = ds.facetAddressAndPosition[_functionSelector].facetAddress;
    }

    function facetAddresses() external view returns (address[] memory facetAddresses_) {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        facetAddresses_ = new address[](ds.selectors.length);
        for (uint256 i = 0; i < ds.selectors.length; i++) {
            facetAddresses_[i] = ds.facetAddressAndPosition[ds.selectors[i]].facetAddress;
        }
    }

    function facetFunctionSelectors(address _facet) external view returns (bytes4[] memory _facetFunctionSelectors) {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        uint256 selectorCount = ds.selectors.length;
        uint256 facetSelectorCount = 0;
        
        // Count matching selectors
        for (uint256 i = 0; i < selectorCount; i++) {
            if (ds.facetAddressAndPosition[ds.selectors[i]].facetAddress == _facet) {
                facetSelectorCount++;
            }
        }
        
        _facetFunctionSelectors = new bytes4[](facetSelectorCount);
        uint256 index = 0;
        for (uint256 i = 0; i < selectorCount; i++) {
            if (ds.facetAddressAndPosition[ds.selectors[i]].facetAddress == _facet) {
                _facetFunctionSelectors[index] = ds.selectors[i];
                index++;
            }
        }
    }

    function owner() external view returns (address) {
        return LibDiamond.diamondStorage().contractOwner;
    }

    function transferOwnership(address newOwner) external {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        require(msg.sender == ds.contractOwner, "Not owner");
        require(newOwner != address(0), "Invalid owner");
        
        address previousOwner = ds.contractOwner;
        ds.contractOwner = newOwner;
        
        emit LibDiamond.OwnershipTransferred(previousOwner, newOwner);
    }
}
