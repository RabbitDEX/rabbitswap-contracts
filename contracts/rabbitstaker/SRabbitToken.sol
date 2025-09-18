// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.8.29;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IRabbitStaker.sol";
import "../vrc25/VRC25Permit.sol";

contract SRabbitToken is VRC25Permit {
    mapping(address => bool) public minters;

    constructor() VRC25('Staked Rabbit Token', 'sRABBIT', 18) {}

    function mint(address to, uint256 amount) external {
        require(minters[msg.sender], "Not authorized to mint");
        _mint(to, amount);
    }

    function setMinter(address account, bool canMint) external onlyOwner {
        minters[account] = canMint;
    }

    function _estimateFee(uint256 /* value */) internal view override returns (uint256) {
        return minFee();
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IVRC25).interfaceId || super.supportsInterface(interfaceId);
    }
}
