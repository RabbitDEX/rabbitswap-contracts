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

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    
    uint256 public constant PRECISION = 1e18; // 18 decimal precision for exchange rate calculations
    uint256 public constant BASIS_POINTS = 10000; // Basis points for percentage calculations

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // STATE VARIABLES
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    
    // Core token contracts
    IERC20 private _rabbitToken;
    ISRabbitToken private _sRabbitToken;
    
    // Exchange rate state
    uint256 private _rabbitPerShare; // Current RABBIT per sRABBIT share ratio
    uint256 private _totalRabbitInPool; // Total RABBIT deposited in staking pool
    
    // Reward distribution parameters
    uint256 private _rabbitEmissionPerBlock;
    uint256 private _lastRewardBlock;
    
    // Withdrawal vesting system state
    mapping(address => mapping(uint256 => WithdrawalRequest)) private _userWithdrawals;
    mapping(address => uint256) private _userWithdrawalCount;
    uint256 private _totalLockedRabbit; // Total RABBIT locked in pending withdrawals
    
    // Configurable vesting parameters
    uint256 private _minVestingDays; // Minimum vesting period in days
    uint256 private _maxVestingDays; // Maximum vesting period in days  
    uint256 private _minConversionRate; // Minimum conversion rate in basis points
    uint256 private _maxConversionRate; // Maximum conversion rate in basis points

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    
    /// @dev Updates reward calculations before function execution
    modifier updateRewards() {
        _updateRewards();
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    
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
        _rabbitPerShare = PRECISION; // Initialize with 1:1 exchange ratio
        _lastRewardBlock = block.number;
        
        // Initialize default vesting parameters
        _minVestingDays = 15; // 15 days minimum vesting period
        _maxVestingDays = 180; // 180 days maximum vesting period
        _minConversionRate = 5000; // 0.5x conversion rate in basis points
        _maxConversionRate = 10000; // 1.0x conversion rate in basis points
        
        __Context_init();
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Core Information
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    
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

    /// @notice Calculate sRABBIT mint amount for given RABBIT deposit
    function calculateSRabbitAmount(uint256 rabbitAmount) external view returns (uint256) {
        if (rabbitAmount == 0) return 0;
        uint256 currentRabbitPerShare = _getRabbitPerShare();
        return (rabbitAmount * PRECISION) / currentRabbitPerShare;
    }

    function getVestingParameters() external view returns (uint256, uint256, uint256, uint256) {
        return (_minVestingDays, _maxVestingDays, _minConversionRate, _maxConversionRate);
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // CORE USER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    
    /// @notice Deposit RABBIT tokens and receive sRABBIT in return
    function deposit(uint256 rabbitAmount) external nonReentrant updateRewards {
        require(rabbitAmount > 0, "Amount must be greater than 0");
        
        // Calculate sRABBIT mint amount based on current exchange rate
        uint256 sRabbitAmount = (rabbitAmount * PRECISION) / _rabbitPerShare;
        require(sRabbitAmount > 0, "sRABBIT amount too small");
        
        // Update pool state and transfer tokens
        _totalRabbitInPool += rabbitAmount;
        _rabbitToken.safeTransferFrom(msg.sender, address(this), rabbitAmount);
        _sRabbitToken.mint(msg.sender, sRabbitAmount);
        
        // Recalculate exchange rate following deposit
        _updateRabbitPerShare();
        
        emit Deposited(msg.sender, rabbitAmount, sRabbitAmount, _rabbitPerShare);
    }

    /// @notice Withdraw sRABBIT with specified vesting period (burns sRABBIT, locks RABBIT)
    function withdraw(uint256 sRabbitAmount, uint256 vestingDays) external nonReentrant updateRewards {
        require(sRabbitAmount > 0, "Amount must be greater than 0");
        require(vestingDays >= _minVestingDays, "Vesting period too short");
        require(vestingDays <= _maxVestingDays, "Vesting period too long");
        require(_sRabbitToken.balanceOf(msg.sender) >= sRabbitAmount, "Insufficient sRABBIT balance");
        
        // Calculate RABBIT output and validate pool liquidity
        uint256 rabbitAmount = calculateRabbitOutput(sRabbitAmount, vestingDays);
        require(rabbitAmount > 0, "RABBIT amount too small");
        uint256 actualRabbitBalance = _rabbitToken.balanceOf(address(this));
        require(actualRabbitBalance >= _totalLockedRabbit + rabbitAmount, "Insufficient RABBIT in pool");
        
        // Create withdrawal request with vesting schedule
        uint256 withdrawalId = _userWithdrawalCount[msg.sender];
        uint256 unlockTime = block.timestamp + (vestingDays * 1 days);
        
        _userWithdrawals[msg.sender][withdrawalId] = WithdrawalRequest({
            rabbitAmount: rabbitAmount,
            unlockTime: unlockTime,
            claimed: false
        });
        
        // Update tracking state and burn sRABBIT
        _userWithdrawalCount[msg.sender]++;
        _totalLockedRabbit += rabbitAmount;
        _sRabbitToken.transferFrom(msg.sender, address(this), sRabbitAmount);
        _sRabbitToken.burn(sRabbitAmount);
        
        // Recalculate exchange rate following sRABBIT burn
        _updateRabbitPerShare();
        
        emit WithdrawalRequested(
            msg.sender,
            withdrawalId,
            sRabbitAmount,
            rabbitAmount,
            vestingDays,
            unlockTime,
            calculateConversionRate(vestingDays)
        );
    }

    /// @notice Claim specific withdrawal after vesting period completion
    function claim(uint256 withdrawalId) external nonReentrant {
        require(withdrawalId < _userWithdrawalCount[msg.sender], "Invalid withdrawal ID");
        
        WithdrawalRequest storage withdrawal = _userWithdrawals[msg.sender][withdrawalId];
        require(!withdrawal.claimed, "Already claimed");
        require(block.timestamp >= withdrawal.unlockTime, "Still vesting");
        require(withdrawal.rabbitAmount > 0, "No amount to claim");
        
        // Process withdrawal claim
        withdrawal.claimed = true;
        _totalLockedRabbit -= withdrawal.rabbitAmount;
        _rabbitToken.safeTransfer(msg.sender, withdrawal.rabbitAmount);
        
        emit WithdrawalClaimed(msg.sender, withdrawalId, withdrawal.rabbitAmount);
    }

    /// @notice Claim all available withdrawals in single transaction
    function claimAll() external nonReentrant {
        uint256[] memory claimableIds = this.getClaimableWithdrawalIds(msg.sender);
        require(claimableIds.length > 0, "No claimable withdrawals");
        _processClaims(claimableIds);
    }

    /// @notice Claim specific withdrawals by ID array
    function claimMultiple(uint256[] calldata withdrawalIds) external nonReentrant {
        require(withdrawalIds.length > 0, "Empty withdrawal IDs");
        require(withdrawalIds.length <= 100, "Too many withdrawals per transaction");
        _processClaims(withdrawalIds);
    }

    /// @dev Internal function to process multiple withdrawal claims
    function _processClaims(uint256[] memory withdrawalIds) internal {
        uint256 totalClaimable = 0;
        uint256 withdrawalCount = _userWithdrawalCount[msg.sender];
        
        for (uint256 i = 0; i < withdrawalIds.length; i++) {
            uint256 withdrawalId = withdrawalIds[i];
            require(withdrawalId < withdrawalCount, "Invalid withdrawal ID");
            
            WithdrawalRequest storage withdrawal = _userWithdrawals[msg.sender][withdrawalId];
            require(!withdrawal.claimed, "Already claimed");
            require(block.timestamp >= withdrawal.unlockTime, "Still vesting");
            require(withdrawal.rabbitAmount > 0, "No amount to claim");
            
            // Process individual withdrawal claim
            withdrawal.claimed = true;
            _totalLockedRabbit -= withdrawal.rabbitAmount;
            totalClaimable += withdrawal.rabbitAmount;
            
            emit WithdrawalClaimed(msg.sender, withdrawalId, withdrawal.rabbitAmount);
        }
        
        _rabbitToken.safeTransfer(msg.sender, totalClaimable);
    }

    /// @notice Contribute RABBIT tokens to enhance exchange rate for all stakers (no sRABBIT received)
    function contributeRewards(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        
        // Transfer tokens and update pool state
        _rabbitToken.safeTransferFrom(msg.sender, address(this), amount);
        _totalRabbitInPool += amount;
        _updateRabbitPerShare();
        
        emit RewardContributed(msg.sender, amount, _rabbitPerShare);
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    
    /// @notice Set RABBIT emission rate per block (base reward distribution)
    function setRabbitEmissionPerBlock(uint256 newEmission) external onlyOwner {
        _updateRewards();
        
        uint256 oldEmission = _rabbitEmissionPerBlock;
        _rabbitEmissionPerBlock = newEmission;
        
        emit RabbitEmissionUpdated(oldEmission, newEmission);
    }

    /// @notice Update vesting parameters (restricted to contract owner)
    function setVestingParameters(
        uint256 minVestingDays,
        uint256 maxVestingDays,
        uint256 minConversionRate,
        uint256 maxConversionRate
    ) external onlyOwner {
        require(minVestingDays > 0, "Min vesting days must be > 0");
        require(maxVestingDays > minVestingDays, "Max vesting days must be > min");
        require(minConversionRate > 0, "Min conversion rate must be > 0");
        require(maxConversionRate > minConversionRate, "Max conversion rate must be > min");
        require(maxConversionRate <= BASIS_POINTS, "Max conversion rate cannot exceed 100%");
        
        uint256 oldMinVestingDays = _minVestingDays;
        uint256 oldMaxVestingDays = _maxVestingDays;
        uint256 oldMinConversionRate = _minConversionRate;
        uint256 oldMaxConversionRate = _maxConversionRate;
        
        _minVestingDays = minVestingDays;
        _maxVestingDays = maxVestingDays;
        _minConversionRate = minConversionRate;
        _maxConversionRate = maxConversionRate;
        
        emit VestingParametersUpdated(
            oldMinVestingDays, minVestingDays,
            oldMaxVestingDays, maxVestingDays,
            oldMinConversionRate, minConversionRate,
            oldMaxConversionRate, maxConversionRate
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // WITHDRAWAL CALCULATIONS
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    
    /// @notice Calculate conversion rate based on vesting period (linear interpolation)
    function calculateConversionRate(uint256 vestingDays) public view returns (uint256) {
        if (vestingDays < _minVestingDays) revert("Vesting period too short");
        if (vestingDays > _maxVestingDays) return _maxConversionRate;
        
        // Linear interpolation between minimum and maximum conversion rates
        uint256 additionalRate = ((vestingDays - _minVestingDays) * (_maxConversionRate - _minConversionRate)) / 
                                 (_maxVestingDays - _minVestingDays);
        return _minConversionRate + additionalRate;
    }

    /// @notice Calculate RABBIT output for given sRABBIT amount and vesting period
    function calculateRabbitOutput(uint256 sRabbitAmount, uint256 vestingDays) public view returns (uint256) {
        if (sRabbitAmount == 0) return 0;
        
        uint256 conversionRate = calculateConversionRate(vestingDays);
        uint256 currentRabbitPerShare = _getRabbitPerShare();
        
        // Calculation: sRABBIT × rabbitPerShare × conversionRate ÷ (PRECISION × BASIS_POINTS)
        return (sRabbitAmount * currentRabbitPerShare * conversionRate) / (PRECISION * BASIS_POINTS);
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Withdrawal Tracking
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    
    function getUserWithdrawal(address user, uint256 withdrawalId) external view returns (WithdrawalRequest memory) {
        require(withdrawalId < _userWithdrawalCount[user], "Invalid withdrawal ID");
        return _userWithdrawals[user][withdrawalId];
    }

    function getUserWithdrawalCount(address user) external view returns (uint256) {
        return _userWithdrawalCount[user];
    }

    /// @notice Get total claimable RABBIT amount across all ready withdrawals
    function getClaimableAmount(address user) external view returns (uint256) {
        uint256[] memory claimableIds = this.getClaimableWithdrawalIds(user);
        uint256 totalClaimable = 0;
        
        for (uint256 i = 0; i < claimableIds.length; i++) {
            totalClaimable += _userWithdrawals[user][claimableIds[i]].rabbitAmount;
        }
        
        return totalClaimable;
    }

    function totalLockedRabbit() external view returns (uint256) {
        return _totalLockedRabbit;
    }

    /// @notice Get available RABBIT for new withdrawal requests (pool total - locked amount)
    function getAvailableRabbitForWithdrawals() external view returns (uint256) {
        if (_totalRabbitInPool <= _totalLockedRabbit) {
            return 0;
        }
        return _totalRabbitInPool - _totalLockedRabbit;
    }

    /// @notice Get IDs of claimable withdrawals for user (utility for claimMultiple)
    function getClaimableWithdrawalIds(address user) external view returns (uint256[] memory) {
        uint256 withdrawalCount = _userWithdrawalCount[user];
        uint256[] memory temp = new uint256[](withdrawalCount);
        uint256 claimableCount = 0;
        
        // Identify all claimable withdrawal IDs
        for (uint256 i = 0; i < withdrawalCount; i++) {
            if (_isWithdrawalClaimable(user, i)) {
                temp[claimableCount] = i;
                claimableCount++;
            }
        }
        
        // Create array with exact size for claimable withdrawals
        uint256[] memory claimableIds = new uint256[](claimableCount);
        for (uint256 i = 0; i < claimableCount; i++) {
            claimableIds[i] = temp[i];
        }
        
        return claimableIds;
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS - Core Logic
    // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
    
    /// @dev Apply base rewards (emission) to the staking pool
    function _updateRewards() internal {
        if (block.number <= _lastRewardBlock) {
            return;
        }
        
        uint256 blocksPassed = block.number - _lastRewardBlock;
        uint256 baseReward = blocksPassed * _rabbitEmissionPerBlock;
        
        // Distribute base rewards to pool if blocks have elapsed
        if (baseReward > 0) {
            _totalRabbitInPool += baseReward;
            _updateRabbitPerShare();
        }
        
        _lastRewardBlock = block.number;
    }

    /// @dev Recalculate exchange rate: rabbitPerShare = availableRabbit / sRabbitSupply
    function _updateRabbitPerShare() internal {
        uint256 oldRabbitPerShare = _rabbitPerShare;
        uint256 availableRabbit = _totalRabbitInPool - _totalLockedRabbit;
        uint256 sRabbitSupply = _sRabbitToken.totalSupply();
        
        if (sRabbitSupply > 0) {
            _rabbitPerShare = (availableRabbit * PRECISION) / sRabbitSupply;
        } else {
            _rabbitPerShare = PRECISION;
        }
        
        emit RabbitPerShareUpdated(
            oldRabbitPerShare,
            _rabbitPerShare,
            availableRabbit,
            sRabbitSupply
        );
    }

    /// @dev Get current exchange rate including pending rewards (view-only calculation)
    function _getRabbitPerShare() internal view returns (uint256) {
        uint256 blocksPassed = block.number - _lastRewardBlock;
        uint256 baseReward = blocksPassed * _rabbitEmissionPerBlock;
        uint256 availableRabbitWithRewards = (_totalRabbitInPool - _totalLockedRabbit) + baseReward;
        
        uint256 sRabbitSupply = _sRabbitToken.totalSupply();
        if (sRabbitSupply > 0) {
            return (availableRabbitWithRewards * PRECISION) / sRabbitSupply;
        } else {
            return PRECISION; // 1:1 ratio when no sRABBIT exists
        }
    }

    /// @dev Check if withdrawal meets claimability criteria
    function _isWithdrawalClaimable(address user, uint256 withdrawalId) internal view returns (bool) {
        WithdrawalRequest storage withdrawal = _userWithdrawals[user][withdrawalId];
        return !withdrawal.claimed && 
               block.timestamp >= withdrawal.unlockTime && 
               withdrawal.rabbitAmount > 0;
    }
}