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

    // Initialize the contract with ZERO emission for cleaner testing
    await rabbitStaker.initialize(
      await rabbitToken.getAddress(),
      await sRabbitToken.getAddress(),
      0 // Initialize with zero emission
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
      expect(await rabbitStaker.rabbitEmissionPerBlock()).to.equal(0); // Initialize with zero emission
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
      expect(await rabbitStaker.rabbitEmissionPerBlock()).to.equal(0);
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

  describe("Deposit Functionality", function () {

    describe("Basic Deposit Operations", function () {
      it("should allow first deposit with 1:1 exchange rate", async function () {
        const depositAmount = ethers.parseEther("100");
        
        // Approve tokens
        await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), depositAmount);
        
        // Record initial state
        const initialRabbitBalance = await rabbitToken.balanceOf(user1Address);
        const initialSRabbitBalance = await sRabbitToken.balanceOf(user1Address);
        const initialPoolTotal = await rabbitStaker.totalRabbitInPool();
        const initialExchangeRate = await rabbitStaker.getRabbitPerShare();
        
        // Perform deposit
        await expect(rabbitStaker.connect(user1).deposit(depositAmount))
          .to.emit(rabbitStaker, "Deposited")
          .withArgs(user1Address, depositAmount, depositAmount, initialExchangeRate);
        
        // Validate state changes
        expect(await rabbitToken.balanceOf(user1Address)).to.equal(initialRabbitBalance - depositAmount);
        expect(await sRabbitToken.balanceOf(user1Address)).to.equal(initialSRabbitBalance + depositAmount);
        expect(await rabbitStaker.totalRabbitInPool()).to.equal(initialPoolTotal + depositAmount);
        expect(await sRabbitToken.totalSupply()).to.equal(depositAmount);
        
        // Exchange rate should remain 1:1 for first deposit
        expect(await rabbitStaker.getRabbitPerShare()).to.equal(ethers.parseEther("1"));
      });

      it("should handle subsequent deposits correctly", async function () {
        const firstDeposit = ethers.parseEther("100");
        const secondDeposit = ethers.parseEther("50");
        
        // First deposit
        await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), firstDeposit);
        await rabbitStaker.connect(user1).deposit(firstDeposit);
        
        // Second deposit by same user
        await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), secondDeposit);
        
        const preDepositSRabbitBalance = await sRabbitToken.balanceOf(user1Address);
        const preDepositPoolTotal = await rabbitStaker.totalRabbitInPool();
        
        await rabbitStaker.connect(user1).deposit(secondDeposit);
        
        // Validate cumulative state
        expect(await sRabbitToken.balanceOf(user1Address)).to.equal(preDepositSRabbitBalance + secondDeposit);
        expect(await rabbitStaker.totalRabbitInPool()).to.equal(preDepositPoolTotal + secondDeposit);
        expect(await sRabbitToken.totalSupply()).to.equal(firstDeposit + secondDeposit);
      });

      it("should handle deposits from multiple users", async function () {
        const user1Deposit = ethers.parseEther("100");
        const user2Deposit = ethers.parseEther("200");
        
        // User1 deposit
        await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), user1Deposit);
        await rabbitStaker.connect(user1).deposit(user1Deposit);
        
        // User2 deposit
        await rabbitToken.connect(user2).approve(await rabbitStaker.getAddress(), user2Deposit);
        await rabbitStaker.connect(user2).deposit(user2Deposit);
        
        // Validate individual balances
        expect(await sRabbitToken.balanceOf(user1Address)).to.equal(user1Deposit);
        expect(await sRabbitToken.balanceOf(user2Address)).to.equal(user2Deposit);
        
        // Validate pool state
        expect(await rabbitStaker.totalRabbitInPool()).to.equal(user1Deposit + user2Deposit);
        expect(await sRabbitToken.totalSupply()).to.equal(user1Deposit + user2Deposit);
      });
    });

    describe("State Validation", function () {
      beforeEach(async function () {
        // Setup initial deposit for state validation tests
        const initialDeposit = ethers.parseEther("1000");
        await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), initialDeposit);
        await rabbitStaker.connect(user1).deposit(initialDeposit);
      });

      it("should maintain correct contract RABBIT balance", async function () {
        const contractBalance = await rabbitToken.balanceOf(await rabbitStaker.getAddress());
        const poolTotal = await rabbitStaker.totalRabbitInPool();
        expect(contractBalance).to.equal(poolTotal);
      });

      it("should maintain correct sRABBIT total supply", async function () {
        const sRabbitSupply = await sRabbitToken.totalSupply();
        const expectedSupply = ethers.parseEther("1000"); // Initial deposit
        expect(sRabbitSupply).to.equal(expectedSupply);
      });

      it("should calculate sRABBIT amount correctly for new deposits", async function () {
        const newDepositAmount = ethers.parseEther("500");
        const expectedSRabbitAmount = await rabbitStaker.calculateSRabbitAmount(newDepositAmount);
        
        await rabbitToken.connect(user2).approve(await rabbitStaker.getAddress(), newDepositAmount);
        
        const preDepositBalance = await sRabbitToken.balanceOf(user2Address);
        await rabbitStaker.connect(user2).deposit(newDepositAmount);
        const postDepositBalance = await sRabbitToken.balanceOf(user2Address);
        
        expect(postDepositBalance - preDepositBalance).to.equal(expectedSRabbitAmount);
      });

      it("should update exchange rate after deposits", async function () {
        const preDepositRate = await rabbitStaker.getRabbitPerShare();
        const depositAmount = ethers.parseEther("100");
        
        await rabbitToken.connect(user2).approve(await rabbitStaker.getAddress(), depositAmount);
        await rabbitStaker.connect(user2).deposit(depositAmount);
        
        const postDepositRate = await rabbitStaker.getRabbitPerShare();
        
        // Exchange rate should be recalculated
        const totalRabbit = await rabbitStaker.totalRabbitInPool();
        const totalSRabbit = await sRabbitToken.totalSupply();
        const expectedRate = (totalRabbit * ethers.parseEther("1")) / totalSRabbit;
        
        expect(postDepositRate).to.equal(expectedRate);
      });
    });

    describe("Event Emission", function () {
      it("should emit Deposited event with correct parameters", async function () {
        const depositAmount = ethers.parseEther("100");
        
        await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), depositAmount);
        
        const exchangeRate = await rabbitStaker.getRabbitPerShare();
        
        await expect(rabbitStaker.connect(user1).deposit(depositAmount))
          .to.emit(rabbitStaker, "Deposited")
          .withArgs(user1Address, depositAmount, depositAmount, exchangeRate);
      });

      it("should emit RabbitPerShareUpdated event", async function () {
        const depositAmount = ethers.parseEther("100");
        
        await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), depositAmount);
        
        const oldRabbitPerShare = await rabbitStaker.getRabbitPerShare();
        
        await expect(rabbitStaker.connect(user1).deposit(depositAmount))
          .to.emit(rabbitStaker, "RabbitPerShareUpdated");
      });
    });

    describe("Edge Cases", function () {
      it("should handle very small deposits", async function () {
        const smallAmount = ethers.parseUnits("1", 6); // 0.000001 RABBIT
        
        await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), smallAmount);
        
        // This might revert due to "sRABBIT amount too small" or succeed
        try {
          await rabbitStaker.connect(user1).deposit(smallAmount);
          // If it succeeds, validate state
          expect(await sRabbitToken.balanceOf(user1Address)).to.be.gt(0);
        } catch (error: any) {
          // Expected to revert for very small amounts
          expect(error.message).to.include("sRABBIT amount too small");
        }
      });

      it("should handle large deposits", async function () {
        const largeAmount = ethers.parseEther("100000");
        
        // Mint additional tokens for large deposit
        await rabbitToken.mint(user1Address, largeAmount);
        await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), largeAmount);
        
        const preDepositPoolTotal = await rabbitStaker.totalRabbitInPool();
        
        await rabbitStaker.connect(user1).deposit(largeAmount);
        
        expect(await rabbitStaker.totalRabbitInPool()).to.equal(preDepositPoolTotal + largeAmount);
        expect(await sRabbitToken.balanceOf(user1Address)).to.equal(largeAmount);
      });

      it("should handle deposits correctly with zero emission", async function () {
        // Make initial deposit
        const initialDeposit = ethers.parseEther("1000");
        await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), initialDeposit);
        await rabbitStaker.connect(user1).deposit(initialDeposit);
        
        // Mine blocks - should have no effect with zero emission
        for (let i = 0; i < 10; i++) {
          await ethers.provider.send("evm_mine", []);
        }
        
        // Make another deposit
        const secondDeposit = ethers.parseEther("500");
        await rabbitToken.connect(user2).approve(await rabbitStaker.getAddress(), secondDeposit);
        
        const preDepositRate = await rabbitStaker.getRabbitPerShare();
        await rabbitStaker.connect(user2).deposit(secondDeposit);
        const postDepositRate = await rabbitStaker.getRabbitPerShare();
        
        // Exchange rate should remain stable with zero emission
        expect(postDepositRate).to.equal(preDepositRate);
        
        // Pool should equal exactly the sum of deposits
        const totalPool = await rabbitStaker.totalRabbitInPool();
        expect(totalPool).to.equal(initialDeposit + secondDeposit);
      });
    });

    describe("Error Cases", function () {
      it("should revert on zero amount deposit", async function () {
        await expect(rabbitStaker.connect(user1).deposit(0))
          .to.be.revertedWith("Amount must be greater than 0");
      });

      it("should revert on insufficient allowance", async function () {
        const depositAmount = ethers.parseEther("100");
        
        // Don't approve tokens
        await expect(rabbitStaker.connect(user1).deposit(depositAmount))
          .to.be.reverted; // Will revert due to insufficient allowance
      });

      it("should revert on insufficient balance", async function () {
        const excessiveAmount = ethers.parseEther("2000000"); // More than user balance
        
        await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), excessiveAmount);
        
        await expect(rabbitStaker.connect(user1).deposit(excessiveAmount))
          .to.be.reverted; // Will revert due to insufficient balance
      });

      it("should handle deposits that result in zero sRABBIT minting", async function () {
        // Make a large initial deposit to create high exchange rate
        const largeInitialDeposit = ethers.parseEther("1000000");
        await rabbitToken.mint(user1Address, largeInitialDeposit);
        await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), largeInitialDeposit);
        await rabbitStaker.connect(user1).deposit(largeInitialDeposit);
        
        // Contribute large rewards to significantly increase exchange rate
        const largeReward = ethers.parseEther("1000000");
        await rabbitToken.mint(ownerAddress, largeReward);
        await rabbitToken.connect(owner).approve(await rabbitStaker.getAddress(), largeReward);
        await rabbitStaker.connect(owner).contributeRewards(largeReward);
        
        // Try to deposit a very small amount that might result in zero sRABBIT
        const tinyAmount = 1; // 1 wei
        await rabbitToken.mint(user2Address, tinyAmount);
        await rabbitToken.connect(user2).approve(await rabbitStaker.getAddress(), tinyAmount);
        
        await expect(rabbitStaker.connect(user2).deposit(tinyAmount))
          .to.be.revertedWith("sRABBIT amount too small");
      });
    });

    describe("Exchange Rate Evolution", function () {
      it("should maintain 1:1 ratio for initial deposits", async function () {
        const depositAmount = ethers.parseEther("100");
        
        await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), depositAmount);
        await rabbitStaker.connect(user1).deposit(depositAmount);
        
        expect(await rabbitStaker.getRabbitPerShare()).to.equal(ethers.parseEther("1"));
      });

      it("should improve exchange rate after reward contributions", async function () {
        // Initial deposit
        const initialDeposit = ethers.parseEther("1000");
        await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), initialDeposit);
        await rabbitStaker.connect(user1).deposit(initialDeposit);
        
        const initialRate = await rabbitStaker.getRabbitPerShare();
        
        // Contribute rewards to improve exchange rate
        const rewardAmount = ethers.parseEther("100");
        await rabbitToken.mint(ownerAddress, rewardAmount);
        await rabbitToken.connect(owner).approve(await rabbitStaker.getAddress(), rewardAmount);
        await rabbitStaker.connect(owner).contributeRewards(rewardAmount);
        
        const improvedRate = await rabbitStaker.getRabbitPerShare();
        expect(improvedRate).to.be.gt(initialRate);
        
        // New deposit should receive fewer sRABBIT due to improved rate
        const newDeposit = ethers.parseEther("100");
        await rabbitToken.connect(user2).approve(await rabbitStaker.getAddress(), newDeposit);
        
        const expectedSRabbit = await rabbitStaker.calculateSRabbitAmount(newDeposit);
        
        await rabbitStaker.connect(user2).deposit(newDeposit);
        
        expect(await sRabbitToken.balanceOf(user2Address)).to.equal(expectedSRabbit);
        expect(expectedSRabbit).to.be.lt(newDeposit); // Should get less than 1:1
      });

      it("should handle exchange rate calculations correctly across multiple deposits", async function () {
        const deposits = [
          ethers.parseEther("100"),
          ethers.parseEther("200"),
          ethers.parseEther("150")
        ];
        
        let totalSRabbitMinted = 0n;
        
        for (let i = 0; i < deposits.length; i++) {
          const user = i === 0 ? user1 : user2;
          const userAddress = i === 0 ? user1Address : user2Address;
          
          await rabbitToken.connect(user).approve(await rabbitStaker.getAddress(), deposits[i]);
          
          const preBalance = await sRabbitToken.balanceOf(userAddress);
          const expectedSRabbit = await rabbitStaker.calculateSRabbitAmount(deposits[i]);
          
          await rabbitStaker.connect(user).deposit(deposits[i]);
          
          const postBalance = await sRabbitToken.balanceOf(userAddress);
          const actualSRabbitMinted = postBalance - preBalance;
          
          expect(actualSRabbitMinted).to.equal(expectedSRabbit);
          totalSRabbitMinted += actualSRabbitMinted;
        }
        
        // Validate total supply matches sum of individual mints
        expect(await sRabbitToken.totalSupply()).to.equal(totalSRabbitMinted);
      });
    });
  });

  describe("Emission Rewards Integration", function () {
    beforeEach(async function () {
      // Reset emission to initial value for emission tests
      await rabbitStaker.setRabbitEmissionPerBlock(INITIAL_EMISSION_PER_BLOCK);
    });

    it("should accumulate rewards and improve exchange rate", async function () {
      // Make initial deposit
      const initialDeposit = ethers.parseEther("1000");
      await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), initialDeposit);
      await rabbitStaker.connect(user1).deposit(initialDeposit);
      
      const initialRate = await rabbitStaker.getRabbitPerShare();
      
      // Mine blocks to accumulate rewards
      for (let i = 0; i < 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Make another deposit to trigger reward update
      const secondDeposit = ethers.parseEther("500");
      await rabbitToken.connect(user2).approve(await rabbitStaker.getAddress(), secondDeposit);
      
      await rabbitStaker.connect(user2).deposit(secondDeposit);
      
      const finalRate = await rabbitStaker.getRabbitPerShare();
      
      // Exchange rate should have improved due to rewards
      expect(finalRate).to.be.gt(initialRate);
      
      // Pool should include deposits plus accumulated rewards
      const totalPool = await rabbitStaker.totalRabbitInPool();
      expect(totalPool).to.be.gt(initialDeposit + secondDeposit);
      
      // Calculate expected rewards (10 blocks * emission per block)
      const expectedRewards = BigInt(10) * INITIAL_EMISSION_PER_BLOCK;
      expect(totalPool).to.be.gte(initialDeposit + secondDeposit + expectedRewards);
    });

    it("should provide fewer sRABBIT when exchange rate improves", async function () {
      // Initial deposit
      const depositAmount = ethers.parseEther("100");
      await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), depositAmount);
      await rabbitStaker.connect(user1).deposit(depositAmount);
      
      // Mine blocks to improve exchange rate  
      for (let i = 0; i < 20; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Calculate expected sRABBIT amount BEFORE making the deposit
      const expectedSRabbit = await rabbitStaker.calculateSRabbitAmount(depositAmount);
      
      // Second user deposit should get less sRABBIT due to improved rate
      await rabbitToken.connect(user2).approve(await rabbitStaker.getAddress(), depositAmount);
      await rabbitStaker.connect(user2).deposit(depositAmount);
      
      const user2SRabbitBalance = await sRabbitToken.balanceOf(user2Address);
      
      // Allow for rounding differences due to block timing and emission accumulation
      const tolerance = ethers.parseEther("1"); // 1 token tolerance for emission tests
      const difference = user2SRabbitBalance > expectedSRabbit 
        ? user2SRabbitBalance - expectedSRabbit 
        : expectedSRabbit - user2SRabbitBalance;
      expect(difference).to.be.lte(tolerance);
      expect(user2SRabbitBalance).to.be.lt(depositAmount); // Should get less than 1:1
    });

    it("should calculate correct sRABBIT amounts with accumulated rewards", async function () {
      // Initial setup
      const initialDeposit = ethers.parseEther("1000");
      await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), initialDeposit);
      await rabbitStaker.connect(user1).deposit(initialDeposit);
      
      // Accumulate rewards
      for (let i = 0; i < 15; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Test calculation accuracy - calculate BEFORE deposit
      const testDeposit = ethers.parseEther("200");
      const calculatedSRabbit = await rabbitStaker.calculateSRabbitAmount(testDeposit);
      
      await rabbitToken.connect(user2).approve(await rabbitStaker.getAddress(), testDeposit);
      
      const preBalance = await sRabbitToken.balanceOf(user2Address);
      await rabbitStaker.connect(user2).deposit(testDeposit);
      const postBalance = await sRabbitToken.balanceOf(user2Address);
      
      const actualSRabbitMinted = postBalance - preBalance;
      
      // Allow for rounding differences due to block timing and emission accumulation
      const tolerance = ethers.parseEther("1"); // 1 token tolerance for emission tests
      const difference = actualSRabbitMinted > calculatedSRabbit 
        ? actualSRabbitMinted - calculatedSRabbit 
        : calculatedSRabbit - actualSRabbitMinted;
      expect(difference).to.be.lte(tolerance);
    });
  });

  describe("Base Emission Rewards", function () {
    beforeEach(async function () {
      // Reset emission to initial value for base emission tests
      await rabbitStaker.setRabbitEmissionPerBlock(INITIAL_EMISSION_PER_BLOCK);
    });

    it("should accumulate base emission rewards over time", async function () {
      // Make initial deposit
      const initialDeposit = ethers.parseEther("1000");
      await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), initialDeposit);
      await rabbitStaker.connect(user1).deposit(initialDeposit);
      
      const initialPoolTotal = await rabbitStaker.totalRabbitInPool();
      const initialRate = await rabbitStaker.getRabbitPerShare();
      
      // Mine blocks to accumulate base emission rewards
      const blocksToMine = 10;
      for (let i = 0; i < blocksToMine; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Check current state (view function includes pending rewards)
      const currentRate = await rabbitStaker.getRabbitPerShare();
      expect(currentRate).to.be.gt(initialRate);
      
      // Trigger reward update by making another transaction
      const secondDeposit = ethers.parseEther("100");
      await rabbitToken.connect(user2).approve(await rabbitStaker.getAddress(), secondDeposit);
      await rabbitStaker.connect(user2).deposit(secondDeposit);
      
      const finalPoolTotal = await rabbitStaker.totalRabbitInPool();
      const expectedMinRewards = BigInt(blocksToMine) * INITIAL_EMISSION_PER_BLOCK;
      
      // Pool should have grown by at least the expected base emission rewards
      expect(finalPoolTotal).to.be.gte(initialPoolTotal + secondDeposit + expectedMinRewards);
    });

    it("should distribute base emission rewards proportionally to all stakers", async function () {
      // User1 makes initial deposit
      const user1Deposit = ethers.parseEther("800");
      await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), user1Deposit);
      await rabbitStaker.connect(user1).deposit(user1Deposit);
      
      // User2 makes deposit (different amount)
      const user2Deposit = ethers.parseEther("200");
      await rabbitToken.connect(user2).approve(await rabbitStaker.getAddress(), user2Deposit);
      await rabbitStaker.connect(user2).deposit(user2Deposit);
      
      const user1SRabbitBalance = await sRabbitToken.balanceOf(user1Address);
      const user2SRabbitBalance = await sRabbitToken.balanceOf(user2Address);
      
      // Mine blocks to accumulate rewards
      for (let i = 0; i < 15; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Both users should benefit from the improved exchange rate equally per sRABBIT token
      const finalRate = await rabbitStaker.getRabbitPerShare();
      
      // Calculate expected RABBIT backing for each user's sRABBIT
      const user1ExpectedRabbit = (user1SRabbitBalance * finalRate) / ethers.parseEther("1");
      const user2ExpectedRabbit = (user2SRabbitBalance * finalRate) / ethers.parseEther("1");
      
      // Both should have more RABBIT backing than their original deposits due to rewards
      expect(user1ExpectedRabbit).to.be.gt(user1Deposit);
      expect(user2ExpectedRabbit).to.be.gt(user2Deposit);
      
      // The ratio should reflect their proportional holdings
      const expectedRatio = (user1SRabbitBalance * ethers.parseEther("1")) / user2SRabbitBalance;
      const actualRatio = (user1ExpectedRabbit * ethers.parseEther("1")) / user2ExpectedRabbit;
      
      // Ratios should be approximately equal (allowing for rounding)
      const ratioTolerance = ethers.parseUnits("1", 15); // Small tolerance
      const ratioDifference = expectedRatio > actualRatio 
        ? expectedRatio - actualRatio 
        : actualRatio - expectedRatio;
      expect(ratioDifference).to.be.lte(ratioTolerance);
    });

    it("should calculate base emission rewards correctly per block", async function () {
      // Make initial deposit
      const initialDeposit = ethers.parseEther("1000");
      await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), initialDeposit);
      await rabbitStaker.connect(user1).deposit(initialDeposit);
      
      const startingBlock = await ethers.provider.getBlockNumber();
      const initialPoolTotal = await rabbitStaker.totalRabbitInPool();
      
      // Mine exactly 5 blocks
      const blocksToMine = 5;
      for (let i = 0; i < blocksToMine; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Trigger reward update with a small deposit
      const triggerAmount = ethers.parseEther("1");
      await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), triggerAmount);
      await rabbitStaker.connect(user1).deposit(triggerAmount);
      
      const finalPoolTotal = await rabbitStaker.totalRabbitInPool();
      const expectedRewards = BigInt(blocksToMine) * INITIAL_EMISSION_PER_BLOCK;
      
      // Pool growth should match expected emission rewards plus trigger deposit
      const actualRewards = finalPoolTotal - initialPoolTotal - triggerAmount;
      expect(actualRewards).to.be.gte(expectedRewards);
    });

    it("should handle base emission when no stakers are present", async function () {
      // Ensure no sRABBIT tokens exist
      expect(await sRabbitToken.totalSupply()).to.equal(0);
      
      // Mine blocks with emission enabled
      for (let i = 0; i < 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Pool should remain at 0 since no stakers to receive rewards
      expect(await rabbitStaker.totalRabbitInPool()).to.equal(0);
      
      // Exchange rate should remain at default 1:1
      expect(await rabbitStaker.getRabbitPerShare()).to.equal(ethers.parseEther("1"));
    });

    it("should update exchange rate correctly after base emission accumulation", async function () {
      // Initial deposit
      const depositAmount = ethers.parseEther("500");
      await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), depositAmount);
      await rabbitStaker.connect(user1).deposit(depositAmount);
      
      const initialRate = await rabbitStaker.getRabbitPerShare();
      const initialSupply = await sRabbitToken.totalSupply();
      
      // Mine blocks to accumulate rewards
      const blocksToMine = 8;
      for (let i = 0; i < blocksToMine; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Make another deposit to trigger update
      await rabbitToken.connect(user2).approve(await rabbitStaker.getAddress(), depositAmount);
      await rabbitStaker.connect(user2).deposit(depositAmount);
      
      const finalRate = await rabbitStaker.getRabbitPerShare();
      const finalPoolTotal = await rabbitStaker.totalRabbitInPool();
      const finalSupply = await sRabbitToken.totalSupply();
      
      // Rate should have improved
      expect(finalRate).to.be.gt(initialRate);
      
      // Validate the rate calculation: totalRabbit / totalSRabbit
      const expectedRate = (finalPoolTotal * ethers.parseEther("1")) / finalSupply;
      expect(finalRate).to.equal(expectedRate);
    });

    it("should handle base emission with multiple deposits and withdrawals", async function () {
      // Initial setup with deposits
      const deposit1 = ethers.parseEther("400");
      const deposit2 = ethers.parseEther("600");
      
      await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), deposit1);
      await rabbitStaker.connect(user1).deposit(deposit1);
      
      await rabbitToken.connect(user2).approve(await rabbitStaker.getAddress(), deposit2);
      await rabbitStaker.connect(user2).deposit(deposit2);
      
      const initialPoolTotal = await rabbitStaker.totalRabbitInPool();
      
      // Mine blocks to accumulate base emission rewards
      for (let i = 0; i < 12; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // User1 withdraws some sRABBIT
      const withdrawAmount = ethers.parseEther("200");
      const vestingDays = 30;
      await rabbitStaker.connect(user1).withdraw(withdrawAmount, vestingDays);
      
      const poolAfterWithdraw = await rabbitStaker.totalRabbitInPool();
      
      // Pool should still be larger than initial due to accumulated rewards
      // Even after withdrawal, remaining pool should reflect emission gains
      expect(poolAfterWithdraw).to.be.gt(initialPoolTotal);
      
      // Exchange rate should still be improved due to emission rewards
      const finalRate = await rabbitStaker.getRabbitPerShare();
      expect(finalRate).to.be.gt(ethers.parseEther("1"));
    });

    it("should emit correct events when base emission rewards are distributed", async function () {
      // Make initial deposit
      const depositAmount = ethers.parseEther("300");
      await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), depositAmount);
      await rabbitStaker.connect(user1).deposit(depositAmount);
      
      // Mine blocks
      for (let i = 0; i < 6; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Make another deposit to trigger reward distribution and events
      await rabbitToken.connect(user2).approve(await rabbitStaker.getAddress(), depositAmount);
      
      await expect(rabbitStaker.connect(user2).deposit(depositAmount))
        .to.emit(rabbitStaker, "RabbitPerShareUpdated")
        .to.emit(rabbitStaker, "Deposited");
    });
  });
});
