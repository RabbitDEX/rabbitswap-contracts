// SPDX-License-Identifier: MIT
pragma solidity =0.8.29;

import "../vrc25/VRC25Permit.sol";
import "../rabbitstaker/interfaces/IRabbitStaker.sol";

contract MockSRabbitToken is VRC25Permit, ISRabbitToken {
    constructor(string memory name, string memory symbol) VRC25(name, symbol, 18) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(uint256 amount) external override(VRC25, ISRabbitToken) returns (bool) {
		uint256 fee = estimateFee(0);
		_burn(msg.sender, amount);
		_chargeFeeFrom(msg.sender, address(this), fee);
		return true;
	}

    function _estimateFee(uint256 /* value */) internal view override(VRC25) returns (uint256) {
        return minFee();
    }
}
