// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.8.29;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IRabbitStaker.sol";

contract SRabbitToken is ERC20, Ownable, ISRabbitToken {
    
    mapping(address => bool) public minters;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) Ownable(msg.sender) {}

    function mint(address to, uint256 amount) external override {
        require(minters[msg.sender], "Not authorized to mint");
        _mint(to, amount);
    }

    function burn(uint256 amount) external override {
        _burn(msg.sender, amount);
    }

    function setMinter(address account, bool canMint) external onlyOwner {
        minters[account] = canMint;
    }
}
