"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const hardhat_1 = require("hardhat");
describe("RabbitSponsoredFarm", () => {
    let farm;
    let implementation;
    let proxyAdmin;
    let proxy;
    let owner;
    let nftManager;
    let rewardToken;
    let signer;
    let user;
    const tokenId = 1;
    const farmId = 0;
    beforeEach(async () => {
        [owner, signer, user] = await hardhat_1.ethers.getSigners();
        // Deploy mock NFT manager
        const MockNFTManager = await hardhat_1.ethers.getContractFactory("MockNFTManager");
        nftManager = await MockNFTManager.deploy();
        await nftManager.waitForDeployment();
        // Deploy mock reward token
        const MockERC20 = await hardhat_1.ethers.getContractFactory("MockERC20");
        rewardToken = await MockERC20.deploy("Reward Token", "RWD");
        await rewardToken.waitForDeployment();
        // Deploy implementation
        const RabbitSponsoredFarm = await hardhat_1.ethers.getContractFactory("RabbitSponsoredFarm");
        implementation = await RabbitSponsoredFarm.deploy();
        await implementation.waitForDeployment();
        // Deploy proxy
        farm = (await hardhat_1.upgrades.deployProxy(RabbitSponsoredFarm, [await nftManager.getAddress()], { kind: "transparent" }));
        // Add farm
        await farm.addFarm(await rewardToken.getAddress(), signer.address, hardhat_1.ethers.Wallet.createRandom().address, 0);
    });
    describe("deployment", () => {
        it("should set correct owner", async () => {
            (0, chai_1.expect)(await farm.owner()).to.equal(owner.address);
        });
        it("should set correct NFT manager", async () => {
            (0, chai_1.expect)(await farm.nonfungiblePositionManager()).to.equal(await nftManager.getAddress());
        });
        it("should initialize with zero total staked", async () => {
            (0, chai_1.expect)(await farm.totalStaked()).to.equal(0);
        });
    });
    describe("addFarm", () => {
        it("should add new farm with correct parameters", async () => {
            const MockERC20 = await hardhat_1.ethers.getContractFactory("MockERC20");
            const newToken = (await MockERC20.deploy("New Token", "NEW"));
            await newToken.waitForDeployment();
            const poolAddress = hardhat_1.ethers.Wallet.createRandom().address;
            const initialRewardPerBlock = hardhat_1.ethers.parseEther("5");
            await farm.addFarm(await newToken.getAddress(), signer.address, poolAddress, initialRewardPerBlock);
            const farmData = await farm.farms(1);
            (0, chai_1.expect)(farmData.rewardToken).to.equal(await newToken.getAddress());
            (0, chai_1.expect)(farmData.signer).to.equal(signer.address);
            (0, chai_1.expect)(farmData.active).to.equal(true);
            (0, chai_1.expect)(farmData.totalClaimable).to.equal(0);
            (0, chai_1.expect)(farmData.totalClaimed).to.equal(0);
            (0, chai_1.expect)(farmData.pool).to.equal(poolAddress);
            (0, chai_1.expect)(farmData.rewardPerBlock).to.equal(initialRewardPerBlock);
        });
        it("should not allow zero address reward token", async () => {
            await (0, chai_1.expect)(farm.addFarm(hardhat_1.ethers.ZeroAddress, signer.address, hardhat_1.ethers.Wallet.createRandom().address, 0)).to.be.revertedWith("Invalid reward token");
        });
        it("should not allow zero address signer", async () => {
            const MockERC20 = await hardhat_1.ethers.getContractFactory("MockERC20");
            const newToken = await MockERC20.deploy("New Token", "NEW");
            await newToken.waitForDeployment();
            await (0, chai_1.expect)(farm.addFarm(await newToken.getAddress(), hardhat_1.ethers.ZeroAddress, hardhat_1.ethers.Wallet.createRandom().address, 0)).to.be.revertedWith("Invalid signer");
        });
        it("should not allow zero address pool", async () => {
            const MockERC20 = await hardhat_1.ethers.getContractFactory("MockERC20");
            const newToken = await MockERC20.deploy("New Token", "NEW");
            await newToken.waitForDeployment();
            await (0, chai_1.expect)(farm.addFarm(await newToken.getAddress(), signer.address, hardhat_1.ethers.ZeroAddress, 0)).to.be.revertedWith("Invalid pool");
        });
        it("should emit FarmAdded event", async () => {
            const MockERC20 = await hardhat_1.ethers.getContractFactory("MockERC20");
            const newToken = (await MockERC20.deploy("New Token", "NEW"));
            await newToken.waitForDeployment();
            const poolAddress = hardhat_1.ethers.Wallet.createRandom().address;
            const initialRewardPerBlock = hardhat_1.ethers.parseEther("5");
            await (0, chai_1.expect)(farm.addFarm(await newToken.getAddress(), signer.address, poolAddress, initialRewardPerBlock))
                .to.emit(farm, "FarmAdded")
                .withArgs(1, await newToken.getAddress(), signer.address, poolAddress, initialRewardPerBlock);
        });
    });
    describe("stake", () => {
        beforeEach(async () => {
            await nftManager.setOwner(tokenId, user.address);
        });
        it("should stake NFT successfully", async () => {
            const tx = await farm.connect(user).stake(tokenId);
            const receipt = await tx.wait();
            const block = await hardhat_1.ethers.provider.getBlock(receipt.blockNumber);
            (0, chai_1.expect)(await farm.positionOwner(tokenId)).to.equal(user.address);
            (0, chai_1.expect)(await farm.totalStaked()).to.equal(1);
            await (0, chai_1.expect)(tx)
                .to.emit(farm, "PositionStaked")
                .withArgs(user.address, tokenId, receipt.blockNumber, block.timestamp);
        });
        it("should not allow staking already staked NFT", async () => {
            await farm.connect(user).stake(tokenId);
            await (0, chai_1.expect)(farm.connect(user).stake(tokenId)).to.be.revertedWith("Already staked");
        });
        it("should not allow staking NFT not owned", async () => {
            await nftManager.setOwner(tokenId, owner.address);
            await (0, chai_1.expect)(farm.connect(user).stake(tokenId)).to.be.revertedWith("Not owner");
        });
        it("should allow staking on deactivated farm", async () => {
            await farm.deactivateFarm(farmId);
            await (0, chai_1.expect)(farm.connect(user).stake(tokenId)).to.not.be.reverted;
        });
    });
    describe("unstake", () => {
        beforeEach(async () => {
            await nftManager.setOwner(tokenId, user.address);
            await farm.connect(user).stake(tokenId);
        });
        it("should unstake NFT successfully", async () => {
            await farm.connect(user).unstake(tokenId);
            (0, chai_1.expect)(await farm.positionOwner(tokenId)).to.equal(hardhat_1.ethers.ZeroAddress);
            (0, chai_1.expect)(await farm.totalStaked()).to.equal(0);
        });
        it("should not allow unstaking by non-owner", async () => {
            await (0, chai_1.expect)(farm.connect(owner).unstake(tokenId)).to.be.revertedWith("Not owner");
        });
        it("should emit PositionUnstaked event", async () => {
            const tx = await farm.connect(user).unstake(tokenId);
            const receipt = await tx.wait();
            const block = await hardhat_1.ethers.provider.getBlock(receipt.blockNumber);
            await (0, chai_1.expect)(tx)
                .to.emit(farm, "PositionUnstaked")
                .withArgs(user.address, tokenId, receipt.blockNumber, block.timestamp);
        });
        it("should allow unstaking from deactivated farm", async () => {
            await farm.deactivateFarm(farmId);
            await (0, chai_1.expect)(farm.connect(user).unstake(tokenId)).to.not.be.reverted;
        });
    });
    describe("harvest", () => {
        const amount = hardhat_1.ethers.parseEther("100");
        beforeEach(async () => {
            await nftManager.setOwner(tokenId, user.address);
            await farm.connect(user).stake(tokenId);
            await rewardToken.mint(owner.address, amount);
            await rewardToken.connect(owner).approve(await farm.getAddress(), amount);
            await farm.connect(owner).depositReward(farmId, amount);
        });
        it("should harvest rewards successfully", async () => {
            const domain = {
                name: "RabbitSponsoredFarm",
                version: "1",
                chainId: (await hardhat_1.ethers.provider.getNetwork()).chainId,
                verifyingContract: await farm.getAddress(),
            };
            const types = {
                Harvest: [
                    { name: "tokenId", type: "uint256" },
                    { name: "farmId", type: "uint256" },
                    { name: "totalClaimable", type: "uint256" },
                    { name: "blockNumber", type: "uint256" },
                ],
            };
            const blockNumber = await hardhat_1.ethers.provider.getBlockNumber();
            const value = {
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
            };
            const signature = await signer.signTypedData(domain, types, value);
            const balanceBefore = await rewardToken.balanceOf(user.address);
            await farm.connect(user).harvest({
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
                signature,
            });
            (0, chai_1.expect)(await rewardToken.balanceOf(user.address)).to.equal(balanceBefore + amount);
            (0, chai_1.expect)(await farm.positionTotalClaimed(tokenId, farmId)).to.equal(amount);
        });
        it("should not allow harvest with future block number", async () => {
            const domain = {
                name: "RabbitSponsoredFarm",
                version: "1",
                chainId: (await hardhat_1.ethers.provider.getNetwork()).chainId,
                verifyingContract: await farm.getAddress(),
            };
            const types = {
                Harvest: [
                    { name: "tokenId", type: "uint256" },
                    { name: "farmId", type: "uint256" },
                    { name: "totalClaimable", type: "uint256" },
                    { name: "blockNumber", type: "uint256" },
                ],
            };
            const blockNumber = (await hardhat_1.ethers.provider.getBlockNumber()) + 100;
            const value = {
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
            };
            const signature = await signer.signTypedData(domain, types, value);
            await (0, chai_1.expect)(farm.connect(user).harvest({
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
                signature,
            })).to.be.revertedWith("Block not reached");
        });
        it("should not allow harvest with invalid signature", async () => {
            const domain = {
                name: "RabbitSponsoredFarm",
                version: "1",
                chainId: (await hardhat_1.ethers.provider.getNetwork()).chainId,
                verifyingContract: await farm.getAddress(),
            };
            const types = {
                Harvest: [
                    { name: "tokenId", type: "uint256" },
                    { name: "farmId", type: "uint256" },
                    { name: "totalClaimable", type: "uint256" },
                    { name: "blockNumber", type: "uint256" },
                ],
            };
            const blockNumber = await hardhat_1.ethers.provider.getBlockNumber();
            const value = {
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
            };
            const signature = await owner.signTypedData(domain, types, value);
            await (0, chai_1.expect)(farm.connect(user).harvest({
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
                signature,
            })).to.be.revertedWith("Invalid signature");
        });
        it("should emit RewardHarvested event", async () => {
            const domain = {
                name: "RabbitSponsoredFarm",
                version: "1",
                chainId: (await hardhat_1.ethers.provider.getNetwork()).chainId,
                verifyingContract: await farm.getAddress(),
            };
            const types = {
                Harvest: [
                    { name: "tokenId", type: "uint256" },
                    { name: "farmId", type: "uint256" },
                    { name: "totalClaimable", type: "uint256" },
                    { name: "blockNumber", type: "uint256" },
                ],
            };
            const blockNumber = await hardhat_1.ethers.provider.getBlockNumber();
            const value = {
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
            };
            const signature = await signer.signTypedData(domain, types, value);
            const tx = await farm.connect(user).harvest({
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
                signature,
            });
            const receipt = await tx.wait();
            const block = await hardhat_1.ethers.provider.getBlock(receipt.blockNumber);
            await (0, chai_1.expect)(tx)
                .to.emit(farm, "RewardHarvested")
                .withArgs(user.address, tokenId, farmId, amount, receipt.blockNumber, block.timestamp);
        });
        it("should not allow harvest on deactivated farm", async () => {
            const domain = {
                name: "RabbitSponsoredFarm",
                version: "1",
                chainId: (await hardhat_1.ethers.provider.getNetwork()).chainId,
                verifyingContract: await farm.getAddress(),
            };
            const types = {
                Harvest: [
                    { name: "tokenId", type: "uint256" },
                    { name: "farmId", type: "uint256" },
                    { name: "totalClaimable", type: "uint256" },
                    { name: "blockNumber", type: "uint256" },
                ],
            };
            const blockNumber = await hardhat_1.ethers.provider.getBlockNumber();
            const value = {
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
            };
            const signature = await signer.signTypedData(domain, types, value);
            await farm.deactivateFarm(farmId);
            await (0, chai_1.expect)(farm.connect(user).harvest({
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
                signature,
            })).to.be.revertedWith("Farm not active");
        });
        it("should allow harvest after reactivating farm", async () => {
            const domain = {
                name: "RabbitSponsoredFarm",
                version: "1",
                chainId: (await hardhat_1.ethers.provider.getNetwork()).chainId,
                verifyingContract: await farm.getAddress(),
            };
            const types = {
                Harvest: [
                    { name: "tokenId", type: "uint256" },
                    { name: "farmId", type: "uint256" },
                    { name: "totalClaimable", type: "uint256" },
                    { name: "blockNumber", type: "uint256" },
                ],
            };
            const blockNumber = await hardhat_1.ethers.provider.getBlockNumber();
            const value = {
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
            };
            const signature = await signer.signTypedData(domain, types, value);
            await farm.deactivateFarm(farmId);
            await farm.activateFarm(farmId);
            await (0, chai_1.expect)(farm.connect(user).harvest({
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
                signature,
            })).to.not.be.reverted;
        });
    });
    describe("harvestAndUnstake", () => {
        const amount = hardhat_1.ethers.parseEther("100");
        beforeEach(async () => {
            await nftManager.setOwner(tokenId, user.address);
            await farm.connect(user).stake(tokenId);
            await rewardToken.mint(owner.address, amount);
            await rewardToken.connect(owner).approve(await farm.getAddress(), amount);
            await farm.connect(owner).depositReward(farmId, amount);
        });
        it("should harvest rewards and unstake NFT successfully", async () => {
            const domain = {
                name: "RabbitSponsoredFarm",
                version: "1",
                chainId: (await hardhat_1.ethers.provider.getNetwork()).chainId,
                verifyingContract: await farm.getAddress(),
            };
            const types = {
                Harvest: [
                    { name: "tokenId", type: "uint256" },
                    { name: "farmId", type: "uint256" },
                    { name: "totalClaimable", type: "uint256" },
                    { name: "blockNumber", type: "uint256" },
                ],
            };
            const blockNumber = await hardhat_1.ethers.provider.getBlockNumber();
            const value = {
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
            };
            const signature = await signer.signTypedData(domain, types, value);
            const balanceBefore = await rewardToken.balanceOf(user.address);
            await farm.connect(user).harvestAndUnstake({
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
                signature,
            });
            (0, chai_1.expect)(await rewardToken.balanceOf(user.address)).to.equal(balanceBefore + amount);
            (0, chai_1.expect)(await farm.positionTotalClaimed(tokenId, farmId)).to.equal(amount);
            (0, chai_1.expect)(await farm.positionOwner(tokenId)).to.equal(hardhat_1.ethers.ZeroAddress);
            (0, chai_1.expect)(await farm.totalStaked()).to.equal(0);
            (0, chai_1.expect)(await nftManager.ownerOf(tokenId)).to.equal(user.address);
        });
        it("should not allow harvestAndUnstake by non-owner", async () => {
            const domain = {
                name: "RabbitSponsoredFarm",
                version: "1",
                chainId: (await hardhat_1.ethers.provider.getNetwork()).chainId,
                verifyingContract: await farm.getAddress(),
            };
            const types = {
                Harvest: [
                    { name: "tokenId", type: "uint256" },
                    { name: "farmId", type: "uint256" },
                    { name: "totalClaimable", type: "uint256" },
                    { name: "blockNumber", type: "uint256" },
                ],
            };
            const blockNumber = await hardhat_1.ethers.provider.getBlockNumber();
            const value = {
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
            };
            const signature = await signer.signTypedData(domain, types, value);
            await (0, chai_1.expect)(farm.connect(owner).harvestAndUnstake({
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
                signature,
            })).to.be.revertedWith("Not owner");
        });
        it("should emit both RewardHarvested and PositionUnstaked events", async () => {
            const domain = {
                name: "RabbitSponsoredFarm",
                version: "1",
                chainId: (await hardhat_1.ethers.provider.getNetwork()).chainId,
                verifyingContract: await farm.getAddress(),
            };
            const types = {
                Harvest: [
                    { name: "tokenId", type: "uint256" },
                    { name: "farmId", type: "uint256" },
                    { name: "totalClaimable", type: "uint256" },
                    { name: "blockNumber", type: "uint256" },
                ],
            };
            const blockNumber = await hardhat_1.ethers.provider.getBlockNumber();
            const value = {
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
            };
            const signature = await signer.signTypedData(domain, types, value);
            const tx = await farm.connect(user).harvestAndUnstake({
                tokenId,
                farmId,
                totalClaimable: amount,
                blockNumber,
                signature,
            });
            const receipt = await tx.wait();
            const block = await hardhat_1.ethers.provider.getBlock(receipt.blockNumber);
            await (0, chai_1.expect)(tx)
                .to.emit(farm, "RewardHarvested")
                .withArgs(user.address, tokenId, farmId, amount, receipt.blockNumber, block.timestamp);
            await (0, chai_1.expect)(tx)
                .to.emit(farm, "PositionUnstaked")
                .withArgs(user.address, tokenId, receipt.blockNumber, block.timestamp);
        });
    });
    describe("depositReward", () => {
        const amount = hardhat_1.ethers.parseEther("100");
        beforeEach(async () => {
            await rewardToken.mint(owner.address, amount);
            await rewardToken.approve(await farm.getAddress(), amount);
        });
        it("should deposit rewards successfully", async () => {
            await farm.depositReward(farmId, amount);
            const farmData = await farm.farms(farmId);
            (0, chai_1.expect)(farmData.totalClaimable).to.equal(amount);
        });
        it("should not allow deposit of zero amount", async () => {
            await (0, chai_1.expect)(farm.depositReward(farmId, 0)).to.be.revertedWith("Amount must be greater than 0");
        });
        it("should allow deposit to inactive farm", async () => {
            await farm.deactivateFarm(farmId);
            await (0, chai_1.expect)(farm.depositReward(farmId, amount)).to.not.be.reverted;
        });
        it("should emit RewardDeposited event", async () => {
            await (0, chai_1.expect)(farm.depositReward(farmId, amount))
                .to.emit(farm, "RewardDeposited")
                .withArgs(farmId, amount);
        });
    });
    describe("setSigner", () => {
        const newSigner = hardhat_1.ethers.Wallet.createRandom();
        it("should update signer successfully", async () => {
            await farm.setSigner(farmId, newSigner.address);
            const farmData = await farm.farms(farmId);
            (0, chai_1.expect)(farmData.signer).to.equal(newSigner.address);
        });
        it("should not allow setting zero address signer", async () => {
            await (0, chai_1.expect)(farm.setSigner(farmId, hardhat_1.ethers.ZeroAddress)).to.be.revertedWith("Invalid signer");
        });
        it("should allow setting signer for inactive farm", async () => {
            await farm.deactivateFarm(farmId);
            await (0, chai_1.expect)(farm.setSigner(farmId, newSigner.address)).to.not.be
                .reverted;
        });
        it("should emit SignerUpdated event", async () => {
            await (0, chai_1.expect)(farm.setSigner(farmId, newSigner.address))
                .to.emit(farm, "SignerUpdated")
                .withArgs(farmId, signer.address, newSigner.address);
        });
    });
    describe("setRewardPerBlock", () => {
        const newRewardPerBlock = hardhat_1.ethers.parseEther("10");
        it("should update reward per block successfully", async () => {
            await farm.setRewardPerBlock(farmId, newRewardPerBlock);
            const farmData = await farm.farms(farmId);
            (0, chai_1.expect)(farmData.rewardPerBlock).to.equal(newRewardPerBlock);
        });
        it("should allow setting reward per block for inactive farm", async () => {
            await farm.deactivateFarm(farmId);
            await (0, chai_1.expect)(farm.setRewardPerBlock(farmId, newRewardPerBlock)).to.not.be
                .reverted;
        });
        it("should emit RewardPerBlockUpdated event", async () => {
            await (0, chai_1.expect)(farm.setRewardPerBlock(farmId, newRewardPerBlock))
                .to.emit(farm, "RewardPerBlockUpdated")
                .withArgs(farmId, 0, newRewardPerBlock);
        });
    });
    describe("upgrades", () => {
        it("should be upgradeable", async () => {
            // Deploy V2 implementation
            const RabbitSponsoredFarmV2 = await hardhat_1.ethers.getContractFactory("RabbitSponsoredFarm");
            const implementationV2 = await RabbitSponsoredFarmV2.deploy();
            await implementationV2.waitForDeployment();
            // Upgrade using upgrades plugin
            await hardhat_1.upgrades.upgradeProxy(await farm.getAddress(), RabbitSponsoredFarmV2);
            // Get V2 instance
            const farmV2 = RabbitSponsoredFarmV2.attach(await farm.getAddress());
            // Check that storage values are preserved
            (0, chai_1.expect)(await farmV2.owner()).to.equal(owner.address);
            (0, chai_1.expect)(await farmV2.nonfungiblePositionManager()).to.equal(await nftManager.getAddress());
            (0, chai_1.expect)(await farmV2.totalStaked()).to.equal(0);
            const farmData = await farmV2.farms(0);
            (0, chai_1.expect)(farmData.rewardToken).to.equal(await rewardToken.getAddress());
            (0, chai_1.expect)(farmData.signer).to.equal(signer.address);
            (0, chai_1.expect)(farmData.active).to.equal(true);
        });
    });
    describe("farm activation", () => {
        it("should deactivate farm successfully", async () => {
            await farm.deactivateFarm(farmId);
            const farmData = await farm.farms(farmId);
            (0, chai_1.expect)(farmData.active).to.equal(false);
        });
        it("should activate farm successfully", async () => {
            await farm.deactivateFarm(farmId);
            await farm.activateFarm(farmId);
            const farmData = await farm.farms(farmId);
            (0, chai_1.expect)(farmData.active).to.equal(true);
        });
        it("should emit FarmDeactivated event", async () => {
            await (0, chai_1.expect)(farm.deactivateFarm(farmId))
                .to.emit(farm, "FarmDeactivated")
                .withArgs(farmId);
        });
        it("should emit FarmActivated event", async () => {
            await farm.deactivateFarm(farmId);
            await (0, chai_1.expect)(farm.activateFarm(farmId))
                .to.emit(farm, "FarmActivated")
                .withArgs(farmId);
        });
        it("should not allow deactivating already inactive farm", async () => {
            await farm.deactivateFarm(farmId);
            await (0, chai_1.expect)(farm.deactivateFarm(farmId)).to.be.revertedWith("Farm already inactive");
        });
        it("should not allow activating already active farm", async () => {
            await (0, chai_1.expect)(farm.activateFarm(farmId)).to.be.revertedWith("Farm already active");
        });
        it("should not allow deactivating non-existent farm", async () => {
            await (0, chai_1.expect)(farm.deactivateFarm(999)).to.be.revertedWith("Farm does not exist");
        });
        it("should not allow activating non-existent farm", async () => {
            await (0, chai_1.expect)(farm.activateFarm(999)).to.be.revertedWith("Farm does not exist");
        });
        it("should not allow non-owner to deactivate farm", async () => {
            await (0, chai_1.expect)(farm.connect(user).deactivateFarm(farmId)).to.be.reverted;
        });
        it("should not allow non-owner to activate farm", async () => {
            await farm.deactivateFarm(farmId);
            await (0, chai_1.expect)(farm.connect(user).activateFarm(farmId)).to.be.reverted;
        });
        it("should allow operations after reactivating farm", async () => {
            await farm.deactivateFarm(farmId);
            await farm.activateFarm(farmId);
            // Test depositReward
            await rewardToken.mint(owner.address, 100);
            await rewardToken.connect(owner).approve(await farm.getAddress(), 100);
            await (0, chai_1.expect)(farm.depositReward(farmId, 100)).to.not.be.reverted;
            // Test setSigner
            await (0, chai_1.expect)(farm.setSigner(farmId, signer.address)).to.not.be.reverted;
            // Test setRewardPerBlock
            await (0, chai_1.expect)(farm.setRewardPerBlock(farmId, 100)).to.not.be.reverted;
        });
    });
});
