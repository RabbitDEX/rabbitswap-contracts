// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.8.29;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IRabbitStaker.sol";
import "../vrc25/VRC25.sol";

contract SRabbitToken is VRC25, ISRabbitToken {
    mapping(address => bool) public minters;

    constructor() VRC25('Staked Rabbit Token', 'sRABBIT', 18) {}

    function mint(address to, uint256 amount) external {
        require(minters[msg.sender], "Not authorized to mint");
        _mint(to, amount);
    }
    
    function burn(uint256 amount) external override(VRC25, ISRabbitToken) returns (bool) {
		uint256 fee = estimateFee(0);
		_burn(msg.sender, amount);
		_chargeFeeFrom(msg.sender, address(this), fee);
        return true;
    }

    function setMinter(address account, bool canMint) external onlyOwner {
        minters[account] = canMint;
    }

    function _estimateFee(uint256 /* value */) internal view override returns (uint256) {
        return minFee();
    }
}
