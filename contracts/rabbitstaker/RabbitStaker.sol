// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.8.29;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "./interfaces/IRabbitStaker.sol";

contract RabbitStaker is
    IRabbitStaker,
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    // Constants
    uint256 public constant PRECISION = 1e18; // 18 decimal precision for exchange rate calculations

    // State variables
    IERC20 private _rabbitToken;
    ISRabbitToken private _sRabbitToken;
    
    // Tracks RABBIT per sRABBIT share ratio
    uint256 private _rabbitPerShare;
    
    // Total RABBIT deposited in the pool
    uint256 private _totalRabbitInPool;
    
    // Reward configuration
    uint256 private _rabbitEmissionPerBlock;
    uint256 private _lastRewardBlock;

    // Modifiers
    modifier updateRewards() {
        _updateRabbitPerShare();
        _;
    }

    receive() external payable {}

    function initialize(
        IERC20 rabbitToken,
        ISRabbitToken sRabbitToken,
        uint256 initialRabbitEmissionPerBlock
    ) external initializer {
        require(address(rabbitToken) != address(0), "Invalid RABBIT token");
        require(address(sRabbitToken) != address(0), "Invalid sRABBIT token");
        
        _rabbitToken = rabbitToken;
        _sRabbitToken = sRabbitToken;
        _rabbitEmissionPerBlock = initialRabbitEmissionPerBlock;
        _rabbitPerShare = PRECISION; // Start with 1:1 ratio
        _lastRewardBlock = block.number;
        
        __Context_init();
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
    }

    // View functions
    function getRabbitToken() external view returns (IERC20) {
        return _rabbitToken;
    }

    function getSRabbitToken() external view returns (ISRabbitToken) {
        return _sRabbitToken;
    }

    function getRabbitPerShare() external view returns (uint256) {
        return _getRabbitPerShare();
    }

    function totalRabbitInPool() external view returns (uint256) {
        return _totalRabbitInPool;
    }

    function rabbitEmissionPerBlock() external view returns (uint256) {
        return _rabbitEmissionPerBlock;
    }

    function calculateSRabbitAmount(uint256 rabbitAmount) external view returns (uint256) {
        if (rabbitAmount == 0) return 0;
        uint256 currentRabbitPerShare = _getRabbitPerShare();
        return (rabbitAmount * PRECISION) / currentRabbitPerShare;
    }

    // Main deposit function
    function deposit(uint256 rabbitAmount) external nonReentrant updateRewards {
        require(rabbitAmount > 0, "Amount must be greater than 0");
        
        // Calculate sRABBIT amount to mint based on current ratio
        uint256 sRabbitAmount = (rabbitAmount * PRECISION) / _rabbitPerShare;
        require(sRabbitAmount > 0, "sRABBIT amount too small");
        
        // Update total RABBIT in pool
        _totalRabbitInPool += rabbitAmount;
        
        // Transfer RABBIT from user to contract
        _rabbitToken.safeTransferFrom(msg.sender, address(this), rabbitAmount);
        
        // Mint sRABBIT to user
        _sRabbitToken.mint(msg.sender, sRabbitAmount);
        
        // Recalculate rabbit per share after deposit
        _updateRabbitPerShareAfterDeposit();
        
        emit Deposited(msg.sender, rabbitAmount, sRabbitAmount, _rabbitPerShare);
    }

    // Admin functions
    function setRabbitEmissionPerBlock(uint256 newEmission) external onlyOwner {
        _updateRabbitPerShare();
        
        uint256 oldEmission = _rabbitEmissionPerBlock;
        _rabbitEmissionPerBlock = newEmission;
        
        emit RabbitEmissionUpdated(oldEmission, newEmission);
    }

    function depositTopUpReward(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        
        // Transfer reward tokens to contract
        _rabbitToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // Add to pool (increases rabbit per share ratio)
        _totalRabbitInPool += amount;
        _updateRabbitPerShareAfterDeposit();
        
        emit TopUpRewardDeposited(amount, _rabbitPerShare);
    }

    // Internal functions
    function _updateRabbitPerShare() internal {
        if (block.number <= _lastRewardBlock) {
            return;
        }
        
        uint256 blocksPassed = block.number - _lastRewardBlock;
        uint256 baseReward = blocksPassed * _rabbitEmissionPerBlock;
        
        if (baseReward > 0) {
            _totalRabbitInPool += baseReward;
            _updateRabbitPerShareAfterDeposit();
        }
        
        _lastRewardBlock = block.number;
    }

    function _updateRabbitPerShareAfterDeposit() internal {
        uint256 oldRabbitPerShare = _rabbitPerShare;
        uint256 sRabbitSupply = _sRabbitToken.totalSupply();
        
        if (sRabbitSupply > 0) {
            _rabbitPerShare = (_totalRabbitInPool * PRECISION) / sRabbitSupply;
        } else {
            _rabbitPerShare = PRECISION; // Reset to 1:1 if no sRABBIT exists
        }
        
        // Emit event only if the ratio actually changed
        if (_rabbitPerShare != oldRabbitPerShare) {
            emit RabbitPerShareUpdated(
                oldRabbitPerShare,
                _rabbitPerShare,
                _totalRabbitInPool,
                sRabbitSupply
            );
        }
    }

    function _getRabbitPerShare() internal view returns (uint256) {
        uint256 blocksPassed = block.number - _lastRewardBlock;
        uint256 baseReward = blocksPassed * _rabbitEmissionPerBlock;
        uint256 totalRabbitWithRewards = _totalRabbitInPool + baseReward;
        
        uint256 sRabbitSupply = _sRabbitToken.totalSupply();
        if (sRabbitSupply > 0) {
            return (totalRabbitWithRewards * PRECISION) / sRabbitSupply;
        } else {
            return PRECISION; // 1:1 ratio when no sRABBIT exists
        }
    }
}