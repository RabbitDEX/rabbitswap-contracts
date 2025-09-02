// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.8.29;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISRabbitToken is IERC20 {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

interface IRabbitStaker {
    // Events
    event Deposited(
        address indexed user,
        uint256 rabbitAmount,
        uint256 sRabbitAmount,
        uint256 newRabbitPerShare
    );
    
    event RabbitEmissionUpdated(
        uint256 oldEmission,
        uint256 newEmission
    );
    
    event TopUpRewardDeposited(
        uint256 amount,
        uint256 newRabbitPerShare
    );
    
    event RabbitPerShareUpdated(
        uint256 oldRabbitPerShare,
        uint256 newRabbitPerShare,
        uint256 totalRabbitInPool,
        uint256 sRabbitTotalSupply
    );

    // View functions
    function getRabbitToken() external view returns (IERC20);
    function getSRabbitToken() external view returns (ISRabbitToken);
    function getRabbitPerShare() external view returns (uint256);
    function totalRabbitInPool() external view returns (uint256);
    function rabbitEmissionPerBlock() external view returns (uint256);
    function calculateSRabbitAmount(uint256 rabbitAmount) external view returns (uint256);

    // Main functions
    function deposit(uint256 rabbitAmount) external;

    // Admin functions
    function setRabbitEmissionPerBlock(uint256 newEmission) external;
    function depositTopUpReward(uint256 amount) external;
}
