import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { RabbitStaker, MockERC20, MockSRabbitToken } from "../typechain";

describe.only("RabbitStaker", function () {
  let rabbitStaker: RabbitStaker;
  let rabbitToken: MockERC20;
  let sRabbitToken: MockSRabbitToken;
  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let ownerAddress: string;
  let user1Address: string;
  let user2Address: string;

  const INITIAL_EMISSION_PER_BLOCK = ethers.parseEther("0.1"); // 0.1 RABBIT per block
  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M RABBIT tokens

  beforeEach(async function () {
    // Get signers
    [owner, user1, user2] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    user1Address = await user1.getAddress();
    user2Address = await user2.getAddress();

    // Deploy mock tokens
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    rabbitToken = await MockERC20Factory.deploy("Rabbit Token", "RABBIT");
    
    const MockSRabbitTokenFactory = await ethers.getContractFactory("MockSRabbitToken");
    sRabbitToken = await MockSRabbitTokenFactory.deploy("Staked Rabbit Token", "sRABBIT");

    // Deploy RabbitStaker
    const RabbitStakerFactory = await ethers.getContractFactory("RabbitStaker");
    rabbitStaker = await RabbitStakerFactory.deploy();

    // Initialize the contract
    await rabbitStaker.initialize(
      await rabbitToken.getAddress(),
      await sRabbitToken.getAddress(),
      INITIAL_EMISSION_PER_BLOCK
    );

    // Mint initial tokens to users for testing
    await rabbitToken.mint(user1Address, INITIAL_SUPPLY);
    await rabbitToken.mint(user2Address, INITIAL_SUPPLY);
  });

  describe("Deployment", function () {
    it("should deploy successfully", async function () {
      expect(await rabbitStaker.getAddress()).to.be.properAddress;
    });

    it("should initialize with correct parameters", async function () {
      expect(await rabbitStaker.getRabbitToken()).to.equal(await rabbitToken.getAddress());
      expect(await rabbitStaker.getSRabbitToken()).to.equal(await sRabbitToken.getAddress());
      expect(await rabbitStaker.rabbitEmissionPerBlock()).to.equal(INITIAL_EMISSION_PER_BLOCK);
      expect(await rabbitStaker.getRabbitPerShare()).to.equal(ethers.parseEther("1")); // 1:1 ratio initially
      expect(await rabbitStaker.totalRabbitInPool()).to.equal(0);
    });

    it("should set correct owner", async function () {
      expect(await rabbitStaker.owner()).to.equal(ownerAddress);
    });

    it("should initialize with default vesting parameters", async function () {
      const [minVestingDays, maxVestingDays, minConversionRate, maxConversionRate] = 
        await rabbitStaker.getVestingParameters();
      
      expect(minVestingDays).to.equal(15);
      expect(maxVestingDays).to.equal(180);
      expect(minConversionRate).to.equal(5000); // 0.5x
      expect(maxConversionRate).to.equal(10000); // 1.0x
    });
  });

  describe("Constants", function () {
    it("should have correct PRECISION constant", async function () {
      // Note: We can't directly access private constants, but we can verify through behavior
      // The initial rabbitPerShare should be 1e18 (PRECISION)
      expect(await rabbitStaker.getRabbitPerShare()).to.equal(ethers.parseEther("1"));
    });

    it("should have correct BASIS_POINTS constant", async function () {
      // Verify through vesting parameters that use BASIS_POINTS
      const [, , , maxConversionRate] = await rabbitStaker.getVestingParameters();
      expect(maxConversionRate).to.equal(10000); // 100% in basis points
    });
  });

  describe("Access Control", function () {
    it("should allow owner to call admin functions", async function () {
      const newEmission = ethers.parseEther("0.2");
      await expect(rabbitStaker.setRabbitEmissionPerBlock(newEmission))
        .to.not.be.reverted;
      
      expect(await rabbitStaker.rabbitEmissionPerBlock()).to.equal(newEmission);
    });

    it("should not allow non-owner to call admin functions", async function () {
      const newEmission = ethers.parseEther("0.2");
      await expect(
        rabbitStaker.connect(user1).setRabbitEmissionPerBlock(newEmission)
      ).to.be.revertedWithCustomError(rabbitStaker, "OwnableUnauthorizedAccount");
    });
  });

  describe("Initial State", function () {
    it("should start with zero total rabbit in pool", async function () {
      expect(await rabbitStaker.totalRabbitInPool()).to.equal(0);
    });

    it("should start with zero total locked rabbit", async function () {
      expect(await rabbitStaker.totalLockedRabbit()).to.equal(0);
    });

    it("should start with zero sRabbit supply", async function () {
      expect(await sRabbitToken.totalSupply()).to.equal(0);
    });

    it("should have correct initial rabbit per share", async function () {
      expect(await rabbitStaker.getRabbitPerShare()).to.equal(ethers.parseEther("1"));
    });
  });

  describe("View Functions", function () {
    it("should return correct token addresses", async function () {
      expect(await rabbitStaker.getRabbitToken()).to.equal(await rabbitToken.getAddress());
      expect(await rabbitStaker.getSRabbitToken()).to.equal(await sRabbitToken.getAddress());
    });

    it("should return correct emission rate", async function () {
      expect(await rabbitStaker.rabbitEmissionPerBlock()).to.equal(INITIAL_EMISSION_PER_BLOCK);
    });

    it("should return correct vesting parameters", async function () {
      const [minVestingDays, maxVestingDays, minConversionRate, maxConversionRate] = 
        await rabbitStaker.getVestingParameters();
      
      expect(minVestingDays).to.equal(15);
      expect(maxVestingDays).to.equal(180);
      expect(minConversionRate).to.equal(5000);
      expect(maxConversionRate).to.equal(10000);
    });
  });
});
