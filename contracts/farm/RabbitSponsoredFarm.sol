// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.8.29;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IRabbitSponsoredFarm.sol";
import "../periphery/interfaces/INonfungiblePositionManager.sol";

contract RabbitSponsoredFarm is
    IRabbitSponsoredFarm,
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    EIP712Upgradeable
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    bytes32 private constant HARVEST_TYPEHASH =
        keccak256(
            "Harvest(uint256 tokenId,uint256 farmId,uint256 totalClaimable,uint256 blockNumber)"
        );

    INonfungiblePositionManager private _nonfungiblePositionManager;
    mapping(uint256 => Farm) private _farms; // farmId => Farm
    mapping(uint256 => address) private _positionOwner; // tokenId => owner
    mapping(uint256 => uint256) private _positionLastHarvestBlock; // tokenId => lastHarvestBlock
    mapping(uint256 => mapping(uint256 => uint256))
        private _positionTotalClaimed; // tokenId => farmId => amount
    uint256 private _totalStaked;
    uint256 private _nextFarmId;

    receive() external payable {}

    function nonfungiblePositionManager()
        external
        view
        override
        returns (INonfungiblePositionManager)
    {
        return _nonfungiblePositionManager;
    }

    function farms(
        uint256 farmId
    ) external view override returns (Farm memory) {
        return _farms[farmId];
    }

    function positionOwner(
        uint256 tokenId
    ) external view override returns (address) {
        return _positionOwner[tokenId];
    }

    function positionLastHarvestBlock(
        uint256 tokenId
    ) external view override returns (uint256) {
        return _positionLastHarvestBlock[tokenId];
    }

    function positionTotalClaimed(
        uint256 tokenId,
        uint256 farmId
    ) external view override returns (uint256) {
        return _positionTotalClaimed[tokenId][farmId];
    }

    function totalStaked() external view override returns (uint256) {
        return _totalStaked;
    }

    function initialize(
        INonfungiblePositionManager nftManager
    ) public initializer {
        require(address(nftManager) != address(0), "Invalid NFT manager");
        _nonfungiblePositionManager = nftManager;
        __Context_init();
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __EIP712_init("RabbitSponsoredFarm", "1");
    }

    function addFarm(
        address rewardToken,
        address signer,
        address pool,
        uint256 rewardPerBlock
    ) external override onlyOwner {
        require(rewardToken != address(0), "Invalid reward token");
        require(signer != address(0), "Invalid signer");
        require(pool != address(0), "Invalid pool");

        uint256 farmId = _nextFarmId++;
        _farms[farmId] = Farm({
            rewardToken: IERC20(rewardToken),
            signer: signer,
            active: true,
            totalClaimable: 0,
            totalClaimed: 0,
            pool: pool,
            rewardPerBlock: rewardPerBlock
        });

        emit FarmAdded(farmId, rewardToken, signer, pool, rewardPerBlock);
    }

    function stake(uint256 tokenId) external override nonReentrant {
        // Checks
        require(_positionOwner[tokenId] == address(0), "Already staked");
        require(
            _nonfungiblePositionManager.ownerOf(tokenId) == msg.sender,
            "Not owner"
        );

        // Effects
        _positionOwner[tokenId] = msg.sender;
        _positionLastHarvestBlock[tokenId] = block.number;
        _totalStaked++;

        // Interactions
        _nonfungiblePositionManager.transferFrom(
            msg.sender,
            address(this),
            tokenId
        );

        // Events
        emit PositionStaked(msg.sender, tokenId, block.number, block.timestamp);
    }

    function unstake(uint256 tokenId) external override nonReentrant {
        require(_positionOwner[tokenId] == msg.sender, "Not owner");
        _unstake(tokenId, msg.sender);
    }

    function harvestAndUnstake(
        HarvestParams calldata params
    ) external override nonReentrant {
        require(_positionOwner[params.tokenId] == msg.sender, "Not owner");
        _harvest(params, msg.sender);
        _unstake(params.tokenId, msg.sender);
    }

    function harvest(
        HarvestParams calldata params
    ) external override nonReentrant {
        require(_positionOwner[params.tokenId] == msg.sender, "Not owner");
        _harvest(params, msg.sender);
    }

    function _harvest(HarvestParams calldata params, address to) internal {
        // Checks
        require(block.number >= params.blockNumber, "Block not reached");
        require(
            _positionLastHarvestBlock[params.tokenId] <= params.blockNumber,
            "Invalid block number"
        );

        Farm memory farm = _farms[params.farmId];
        require(farm.active, "Farm not active");

        bytes32 structHash = keccak256(
            abi.encode(
                HARVEST_TYPEHASH,
                params.tokenId,
                params.farmId,
                params.totalClaimable,
                params.blockNumber
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);

        require(
            digest.recover(params.signature) == farm.signer,
            "Invalid signature"
        );

        uint256 harvestAmount = params.totalClaimable -
            _positionTotalClaimed[params.tokenId][params.farmId];
        require(harvestAmount > 0, "No rewards to harvest");
        require(
            harvestAmount <= farm.totalClaimable - farm.totalClaimed,
            "Insufficient farm rewards"
        );

        // Effects
        _positionLastHarvestBlock[params.tokenId] = block.number;
        _positionTotalClaimed[params.tokenId][params.farmId] = params
            .totalClaimable;
        _farms[params.farmId].totalClaimed += harvestAmount;

        // Interactions
        farm.rewardToken.safeTransfer(to, harvestAmount);

        // Events
        emit RewardHarvested(
            to,
            params.tokenId,
            params.farmId,
            harvestAmount,
            block.number,
            block.timestamp
        );
    }

    function _unstake(uint256 tokenId, address to) internal {
        // Checks
        require(_positionOwner[tokenId] == msg.sender, "Not owner");

        // Effects
        delete _positionOwner[tokenId];
        delete _positionLastHarvestBlock[tokenId];
        _totalStaked--;

        // Interactions
        _nonfungiblePositionManager.transferFrom(address(this), to, tokenId);

        // Events
        emit PositionUnstaked(to, tokenId, block.number, block.timestamp);
    }

    function depositReward(
        uint256 farmId,
        uint256 amount
    ) external override onlyOwner {
        // Checks
        require(amount > 0, "Amount must be greater than 0");
        Farm memory farm = _farms[farmId];
        require(address(farm.rewardToken) != address(0), "Farm does not exist");

        // Effects
        _farms[farmId].totalClaimable += amount;

        // Interactions
        farm.rewardToken.safeTransferFrom(msg.sender, address(this), amount);

        // Events
        emit RewardDeposited(farmId, amount);
    }

    function setSigner(
        uint256 farmId,
        address _signer
    ) external override onlyOwner {
        // Checks
        require(_signer != address(0), "Invalid signer");
        Farm memory farm = _farms[farmId];
        require(address(farm.rewardToken) != address(0), "Farm does not exist");

        // Effects
        address oldSigner = farm.signer;
        _farms[farmId].signer = _signer;

        // Events
        emit SignerUpdated(farmId, oldSigner, _signer);
    }

    function setRewardPerBlock(
        uint256 farmId,
        uint256 rewardPerBlock
    ) external override onlyOwner {
        // Checks
        Farm memory farm = _farms[farmId];
        require(address(farm.rewardToken) != address(0), "Farm does not exist");

        // Effects
        uint256 oldRewardPerBlock = farm.rewardPerBlock;
        _farms[farmId].rewardPerBlock = rewardPerBlock;

        // Events
        emit RewardPerBlockUpdated(farmId, oldRewardPerBlock, rewardPerBlock);
    }

    function activateFarm(uint256 farmId) external override onlyOwner {
        // Checks
        Farm memory farm = _farms[farmId];
        require(!farm.active, "Farm already active");
        require(address(farm.rewardToken) != address(0), "Farm does not exist");

        // Effects
        _farms[farmId].active = true;

        // Events
        emit FarmActivated(farmId);
    }

    function deactivateFarm(uint256 farmId) external override onlyOwner {
        // Checks
        Farm memory farm = _farms[farmId];
        require(address(farm.rewardToken) != address(0), "Farm does not exist");
        require(farm.active, "Farm already inactive");

        // Effects
        _farms[farmId].active = false;

        // Events
        emit FarmDeactivated(farmId);
    }
}
