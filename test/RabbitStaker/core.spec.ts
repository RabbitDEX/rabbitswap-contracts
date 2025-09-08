import { expect } from "chai";
import { ethers } from "hardhat";
import { deployRabbitStakerFixture, TestFixture } from "./shared/setup";

describe("RabbitStaker - Core", function () {
  let fixture: TestFixture;

  beforeEach(async function () {
    fixture = await deployRabbitStakerFixture();
  });

  describe("Deployment & Initialization", function () {
    it("should deploy successfully", async function () {
      const { rabbitStaker } = fixture;
      expect(await rabbitStaker.getAddress()).to.be.properAddress;
    });

    it("should initialize with correct parameters", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken } = fixture;
      expect(await rabbitStaker.getRabbitToken()).to.equal(await rabbitToken.getAddress());
      expect(await rabbitStaker.getSRabbitToken()).to.equal(await sRabbitToken.getAddress());
      expect(await rabbitStaker.rabbitEmissionPerBlock()).to.equal(0); // Initialize with zero emission
      expect(await rabbitStaker.getRabbitPerShare()).to.equal(ethers.parseEther("1")); // 1:1 ratio initially
      expect(await rabbitStaker.totalRabbitInPool()).to.equal(0);
    });

    it("should set correct owner", async function () {
      const { rabbitStaker, ownerAddress } = fixture;
      expect(await rabbitStaker.owner()).to.equal(ownerAddress);
    });

    it("should initialize with default vesting parameters", async function () {
      const { rabbitStaker } = fixture;
      const [minVestingDays, maxVestingDays, minConversionRate, maxConversionRate] = 
        await rabbitStaker.getVestingParameters();
      
      expect(minVestingDays).to.equal(15);
      expect(maxVestingDays).to.equal(180);
      expect(minConversionRate).to.equal(5000); // 0.5x
      expect(maxConversionRate).to.equal(10000); // 1.0x
    });
  });

  describe("Constants & View Functions", function () {
    it("should have correct PRECISION constant", async function () {
      const { rabbitStaker } = fixture;
      // The initial rabbitPerShare should be 1e18 (PRECISION)
      expect(await rabbitStaker.getRabbitPerShare()).to.equal(ethers.parseEther("1"));
    });

    it("should have correct BASIS_POINTS constant", async function () {
      const { rabbitStaker } = fixture;
      // Verify through vesting parameters that use BASIS_POINTS
      const [, , , maxConversionRate] = await rabbitStaker.getVestingParameters();
      expect(maxConversionRate).to.equal(10000); // 100% in basis points
    });

    it("should return correct token addresses", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken } = fixture;
      expect(await rabbitStaker.getRabbitToken()).to.equal(await rabbitToken.getAddress());
      expect(await rabbitStaker.getSRabbitToken()).to.equal(await sRabbitToken.getAddress());
    });

    it("should return correct emission rate", async function () {
      const { rabbitStaker } = fixture;
      expect(await rabbitStaker.rabbitEmissionPerBlock()).to.equal(0);
    });

    it("should return correct vesting parameters", async function () {
      const { rabbitStaker } = fixture;
      const [minVestingDays, maxVestingDays, minConversionRate, maxConversionRate] = 
        await rabbitStaker.getVestingParameters();
      
      expect(minVestingDays).to.equal(15);
      expect(maxVestingDays).to.equal(180);
      expect(minConversionRate).to.equal(5000);
      expect(maxConversionRate).to.equal(10000);
    });
  });

  describe("Access Control", function () {
    it("should allow owner to call admin functions", async function () {
      const { rabbitStaker } = fixture;
      const newEmission = ethers.parseEther("0.2");
      await expect(rabbitStaker.setRabbitEmissionPerBlock(newEmission))
        .to.not.be.reverted;
      
      expect(await rabbitStaker.rabbitEmissionPerBlock()).to.equal(newEmission);
    });

    it("should not allow non-owner to call admin functions", async function () {
      const { rabbitStaker, user1 } = fixture;
      const newEmission = ethers.parseEther("0.2");
      await expect(
        rabbitStaker.connect(user1).setRabbitEmissionPerBlock(newEmission)
      ).to.be.revertedWithCustomError(rabbitStaker, "OwnableUnauthorizedAccount");
    });
  });

  describe("Initial State", function () {
    it("should start with zero total rabbit in pool", async function () {
      const { rabbitStaker } = fixture;
      expect(await rabbitStaker.totalRabbitInPool()).to.equal(0);
    });

    it("should start with zero total locked rabbit", async function () {
      const { rabbitStaker } = fixture;
      expect(await rabbitStaker.totalLockedRabbit()).to.equal(0);
    });

    it("should start with zero sRabbit supply", async function () {
      const { sRabbitToken } = fixture;
      expect(await sRabbitToken.totalSupply()).to.equal(0);
    });

    it("should have correct initial rabbit per share", async function () {
      const { rabbitStaker } = fixture;
      expect(await rabbitStaker.getRabbitPerShare()).to.equal(ethers.parseEther("1"));
    });
  });

  describe("Admin Functions", function () {
    it("should allow setting emission rate", async function () {
      const { rabbitStaker } = fixture;
      const newEmission = ethers.parseEther("0.5");
      
      await expect(rabbitStaker.setRabbitEmissionPerBlock(newEmission))
        .to.emit(rabbitStaker, "RabbitEmissionUpdated")
        .withArgs(0, newEmission);
      
      expect(await rabbitStaker.rabbitEmissionPerBlock()).to.equal(newEmission);
    });

    it("should allow setting vesting parameters", async function () {
      const { rabbitStaker } = fixture;
      const newMinVesting = 10;
      const newMaxVesting = 200;
      const newMinRate = 3000;
      const newMaxRate = 10000;
      
      await expect(rabbitStaker.setVestingParameters(newMinVesting, newMaxVesting, newMinRate, newMaxRate))
        .to.emit(rabbitStaker, "VestingParametersUpdated");
      
      const [minVesting, maxVesting, minRate, maxRate] = await rabbitStaker.getVestingParameters();
      expect(minVesting).to.equal(newMinVesting);
      expect(maxVesting).to.equal(newMaxVesting);
      expect(minRate).to.equal(newMinRate);
      expect(maxRate).to.equal(newMaxRate);
    });

    it("should revert on invalid vesting parameters", async function () {
      const { rabbitStaker } = fixture;
      
      // Min vesting days must be > 0
      await expect(rabbitStaker.setVestingParameters(0, 180, 5000, 10000))
        .to.be.revertedWith("Min vesting days must be > 0");
      
      // Max vesting days must be > min
      await expect(rabbitStaker.setVestingParameters(180, 15, 5000, 10000))
        .to.be.revertedWith("Max vesting days must be > min");
      
      // Min conversion rate must be > 0
      await expect(rabbitStaker.setVestingParameters(15, 180, 0, 10000))
        .to.be.revertedWith("Min conversion rate must be > 0");
      
      // Max conversion rate must be > min
      await expect(rabbitStaker.setVestingParameters(15, 180, 10000, 5000))
        .to.be.revertedWith("Max conversion rate must be > min");
      
      // Max conversion rate cannot exceed 100%
      await expect(rabbitStaker.setVestingParameters(15, 180, 5000, 15000))
        .to.be.revertedWith("Max conversion rate cannot exceed 100%");
    });
  });

  describe("Reward Contribution", function () {
    it("should allow contributing rewards to improve exchange rate", async function () {
      const { rabbitStaker, rabbitToken, owner, ownerAddress } = fixture;
      const rewardAmount = ethers.parseEther("100");
      
      // Mint and approve tokens for reward contribution
      await rabbitToken.mint(ownerAddress, rewardAmount);
      await rabbitToken.connect(owner).approve(await rabbitStaker.getAddress(), rewardAmount);
      
      const initialPoolTotal = await rabbitStaker.totalRabbitInPool();
      
      await expect(rabbitStaker.connect(owner).contributeRewards(rewardAmount))
        .to.emit(rabbitStaker, "RewardContributed")
        .withArgs(ownerAddress, rewardAmount, await rabbitStaker.getRabbitPerShare());
      
      expect(await rabbitStaker.totalRabbitInPool()).to.equal(initialPoolTotal + rewardAmount);
    });

    it("should revert on zero reward contribution", async function () {
      const { rabbitStaker, owner } = fixture;
      
      await expect(rabbitStaker.connect(owner).contributeRewards(0))
        .to.be.revertedWith("Amount must be greater than 0");
    });
  });
});
