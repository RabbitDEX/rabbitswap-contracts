// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.8.29;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../vrc25/interfaces/IVRC25.sol";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/// @title ISRabbitToken - Interface for sRABBIT token (VRC-25 with mint/burn)
interface ISRabbitToken is IVRC25 {
    function mint(address to, uint256 amount) external;
    function burn(uint256 amount) external returns (bool);
}

/// @title IRabbitStaker - Interface for RABBIT staking with vesting withdrawals
interface IRabbitStaker {
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    
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
    
    event RewardContributed(
        address indexed contributor,
        uint256 amount,
        uint256 newRabbitPerShare
    );
    
    event VestingParametersUpdated(
        uint256 oldMinVestingDays,
        uint256 newMinVestingDays,
        uint256 oldMaxVestingDays,
        uint256 newMaxVestingDays,
        uint256 oldMinConversionRate,
        uint256 newMinConversionRate,
        uint256 oldMaxConversionRate,
        uint256 newMaxConversionRate
    );
    
    event RabbitPerShareUpdated(
        uint256 oldRabbitPerShare,
        uint256 newRabbitPerShare,
        uint256 totalRabbitInPool,
        uint256 sRabbitTotalSupply
    );
    
    event WithdrawalRequested(
        address indexed user,
        uint256 indexed withdrawalId,
        uint256 sRabbitAmount,
        uint256 rabbitAmount,
        uint256 vestingDays,
        uint256 unlockTime,
        uint256 conversionRate
    );
    
    event WithdrawalClaimed(
        address indexed user,
        uint256 indexed withdrawalId,
        uint256 rabbitAmount
    );

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    
    function getRabbitToken() external view returns (IERC20);
    function getSRabbitToken() external view returns (ISRabbitToken);
    function getRabbitPerShare() external view returns (uint256);
    function totalRabbitInPool() external view returns (uint256);
    function rabbitEmissionPerBlock() external view returns (uint256);
    function calculateSRabbitAmount(uint256 rabbitAmount) external view returns (uint256);

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    // DATA STRUCTURES
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    
    struct WithdrawalRequest {
        uint256 rabbitAmount;    // RABBIT amount to unlock
        uint256 unlockTime;      // When claimable  
        bool claimed;            // Claim status
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    // MAIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    
    function deposit(uint256 rabbitAmount) external;
    function withdraw(uint256 sRabbitAmount, uint256 vestingDays) external;
    function claim(uint256 withdrawalId) external;
    function claimAll() external;
    function claimMultiple(uint256[] calldata withdrawalIds) external;
    function contributeRewards(uint256 amount) external;

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    // WITHDRAWAL VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    
    function calculateConversionRate(uint256 vestingDays) external view returns (uint256);
    function calculateRabbitOutput(uint256 sRabbitAmount, uint256 vestingDays) external view returns (uint256);
    function getUserWithdrawal(address user, uint256 withdrawalId) external view returns (WithdrawalRequest memory);
    function getUserWithdrawalCount(address user) external view returns (uint256);
    function getClaimableAmount(address user) external view returns (uint256);
    function getClaimableWithdrawalIds(address user) external view returns (uint256[] memory);
    function getVestingParameters() external view returns (uint256, uint256, uint256, uint256);

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
    
    function setRabbitEmissionPerBlock(uint256 newEmission) external;
    function setVestingParameters(uint256 minVestingDays, uint256 maxVestingDays, uint256 minConversionRate, uint256 maxConversionRate) external;
}
