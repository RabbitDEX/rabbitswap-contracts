// SPDX-License-Identifier: MIT
pragma solidity =0.8.29;

contract MockNFTManager {
    mapping(uint256 => address) private _owners;

    function setOwner(uint256 tokenId, address owner) external {
        _owners[tokenId] = owner;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }

    function transferFrom(address, address to, uint256 tokenId) external {
        // No validation needed for mock
        _owners[tokenId] = to;
    }
}
