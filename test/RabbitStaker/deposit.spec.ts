import { expect } from "chai";
import { ethers } from "hardhat";
import { deployRabbitStakerFixture, TestFixture, INITIAL_EMISSION_PER_BLOCK, approveAndDeposit } from "./shared/setup";

describe("RabbitStaker - Deposit Functionality", function () {
  let fixture: TestFixture;

  beforeEach(async function () {
    fixture = await deployRabbitStakerFixture();
  });

  describe("Basic Deposit Operations", function () {
    it("should allow first deposit with 1:1 exchange rate", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user1Address } = fixture;
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
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user1Address } = fixture;
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
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user2, user1Address, user2Address } = fixture;
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
      const { rabbitStaker, rabbitToken, user1 } = fixture;
      const initialDeposit = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, initialDeposit);
    });

    it("should maintain correct contract RABBIT balance", async function () {
      const { rabbitStaker, rabbitToken } = fixture;
      const contractBalance = await rabbitToken.balanceOf(await rabbitStaker.getAddress());
      const poolTotal = await rabbitStaker.totalRabbitInPool();
      expect(contractBalance).to.equal(poolTotal);
    });

    it("should maintain correct sRABBIT total supply", async function () {
      const { sRabbitToken } = fixture;
      const sRabbitSupply = await sRabbitToken.totalSupply();
      const expectedSupply = ethers.parseEther("1000"); // Initial deposit
      expect(sRabbitSupply).to.equal(expectedSupply);
    });

    it("should calculate sRABBIT amount correctly for new deposits", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, user2, user2Address } = fixture;
      const newDepositAmount = ethers.parseEther("500");
      const expectedSRabbitAmount = await rabbitStaker.calculateSRabbitAmount(newDepositAmount);
      
      await rabbitToken.connect(user2).approve(await rabbitStaker.getAddress(), newDepositAmount);
      
      const preDepositBalance = await sRabbitToken.balanceOf(user2Address);
      await rabbitStaker.connect(user2).deposit(newDepositAmount);
      const postDepositBalance = await sRabbitToken.balanceOf(user2Address);
      
      expect(postDepositBalance - preDepositBalance).to.equal(expectedSRabbitAmount);
    });

    it("should update exchange rate after deposits", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, user2 } = fixture;
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
      const { rabbitStaker, rabbitToken, user1, user1Address } = fixture;
      const depositAmount = ethers.parseEther("100");
      
      await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), depositAmount);
      
      const exchangeRate = await rabbitStaker.getRabbitPerShare();
      
      await expect(rabbitStaker.connect(user1).deposit(depositAmount))
        .to.emit(rabbitStaker, "Deposited")
        .withArgs(user1Address, depositAmount, depositAmount, exchangeRate);
    });

    it("should emit RabbitPerShareUpdated event", async function () {
      const { rabbitStaker, rabbitToken, user1 } = fixture;
      const depositAmount = ethers.parseEther("100");
      
      await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), depositAmount);
      
      await expect(rabbitStaker.connect(user1).deposit(depositAmount))
        .to.emit(rabbitStaker, "RabbitPerShareUpdated");
    });
  });

  describe("Edge Cases", function () {
    it("should handle very small deposits", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user1Address } = fixture;
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
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user1Address } = fixture;
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
      const { rabbitStaker, rabbitToken, user1, user2 } = fixture;
      // Make initial deposit
      const initialDeposit = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, initialDeposit);
      
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
      const { rabbitStaker, user1 } = fixture;
      await expect(rabbitStaker.connect(user1).deposit(0))
        .to.be.revertedWith("Amount must be greater than 0");
    });

    it("should revert on insufficient allowance", async function () {
      const { rabbitStaker, user1 } = fixture;
      const depositAmount = ethers.parseEther("100");
      
      // Don't approve tokens
      await expect(rabbitStaker.connect(user1).deposit(depositAmount))
        .to.be.reverted; // Will revert due to insufficient allowance
    });

    it("should revert on insufficient balance", async function () {
      const { rabbitStaker, rabbitToken, user1 } = fixture;
      const excessiveAmount = ethers.parseEther("2000000"); // More than user balance
      
      await rabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), excessiveAmount);
      
      await expect(rabbitStaker.connect(user1).deposit(excessiveAmount))
        .to.be.reverted; // Will revert due to insufficient balance
    });

    it("should handle deposits that result in zero sRABBIT minting", async function () {
      const { rabbitStaker, rabbitToken, owner, user1, user2, ownerAddress, user1Address, user2Address } = fixture;
      // Make a large initial deposit to create high exchange rate
      const largeInitialDeposit = ethers.parseEther("1000000");
      await rabbitToken.mint(user1Address, largeInitialDeposit);
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, largeInitialDeposit);
      
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
      const { rabbitStaker, rabbitToken, user1 } = fixture;
      const depositAmount = ethers.parseEther("100");
      
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, depositAmount);
      
      expect(await rabbitStaker.getRabbitPerShare()).to.equal(ethers.parseEther("1"));
    });

    it("should improve exchange rate after reward contributions", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, owner, user1, user2, ownerAddress, user2Address } = fixture;
      // Initial deposit
      const initialDeposit = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, initialDeposit);
      
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
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user2, user1Address, user2Address } = fixture;
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

  describe("Emission Per Block Mechanism", function () {
    beforeEach(async function () {
      // Reset emission to initial value for emission tests
      await fixture.rabbitStaker.setRabbitEmissionPerBlock(INITIAL_EMISSION_PER_BLOCK);
    });

    it("should accumulate emission rewards when blocks pass", async function () {
      const { rabbitStaker, rabbitToken, user1 } = fixture;
      
      // Make initial deposit
      const depositAmount = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, depositAmount);
      
      const initialPool = await rabbitStaker.totalRabbitInPool();
      expect(initialPool).to.be.gte(depositAmount);
      
      // Mine blocks to accumulate emission
      const blocksToMine = 5;
      for (let i = 0; i < blocksToMine; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Make another deposit to trigger emission calculation
      const secondDeposit = ethers.parseEther("100");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, secondDeposit);
      
      const finalPool = await rabbitStaker.totalRabbitInPool();
      const expectedEmission = BigInt(blocksToMine) * INITIAL_EMISSION_PER_BLOCK;
      
      // Pool should have grown by at least the expected emission amount
      const poolGrowth = finalPool - initialPool;
      expect(poolGrowth).to.be.gte(secondDeposit + expectedEmission);
    });

    it("should not accumulate rewards when emission is zero", async function () {
      const { rabbitStaker, rabbitToken, user1 } = fixture;
      
      // Set emission to zero
      await rabbitStaker.setRabbitEmissionPerBlock(0);
      
      // Make initial deposit
      const depositAmount = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, depositAmount);
      
      const initialPool = await rabbitStaker.totalRabbitInPool();
      expect(initialPool).to.be.gte(depositAmount);
      
      // Mine blocks
      for (let i = 0; i < 20; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Make another deposit
      const secondDeposit = ethers.parseEther("100");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, secondDeposit);
      
      const finalPool = await rabbitStaker.totalRabbitInPool();
      const expectedTotal = initialPool + secondDeposit;
      
      // Pool should only contain deposits, no emission rewards
      expect(finalPool).to.equal(expectedTotal);
    });

    it("should improve exchange rate when emission accumulates", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user2, user2Address } = fixture;
      
      // Make initial deposit
      const initialDeposit = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, initialDeposit);
      
      const initialRate = await rabbitStaker.getRabbitPerShare();
      
      // Mine blocks to accumulate emission
      const blocksToMine = 15;
      for (let i = 0; i < blocksToMine; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Make deposit to trigger rate update
      const testDeposit = ethers.parseEther("200");
      await approveAndDeposit(rabbitToken, rabbitStaker, user2, testDeposit);
      
      const finalRate = await rabbitStaker.getRabbitPerShare();
      
      // Rate should have improved due to emission
      expect(finalRate).to.be.gt(initialRate);
      
      // User should get less sRABBIT due to improved exchange rate
      const actualSRabbit = await sRabbitToken.balanceOf(user2Address);
      expect(actualSRabbit).to.be.lt(testDeposit);
    });

    it("should emit RabbitEmissionUpdated event when setting emission", async function () {
      const { rabbitStaker } = fixture;
      
      const newEmission = ethers.parseEther("0.5");
      
      await expect(rabbitStaker.setRabbitEmissionPerBlock(newEmission))
        .to.emit(rabbitStaker, "RabbitEmissionUpdated")
        .withArgs(INITIAL_EMISSION_PER_BLOCK, newEmission);
    });

    it("should handle emission rate changes correctly", async function () {
      const { rabbitStaker, rabbitToken, user1 } = fixture;
      
      // Make initial deposit
      const depositAmount = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, depositAmount);
      
      const initialPool = await rabbitStaker.totalRabbitInPool();
      
      // Mine blocks with initial emission rate
      for (let i = 0; i < 5; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Change emission rate
      const newEmissionRate = ethers.parseEther("0.2");
      await rabbitStaker.setRabbitEmissionPerBlock(newEmissionRate);
      
      // Mine more blocks with new emission rate
      for (let i = 0; i < 5; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Make deposit to trigger emission calculation
      const secondDeposit = ethers.parseEther("100");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, secondDeposit);
      
      const finalPool = await rabbitStaker.totalRabbitInPool();
      const expectedEmission = BigInt(5) * INITIAL_EMISSION_PER_BLOCK + BigInt(5) * newEmissionRate;
      
      // Pool should have grown by at least the expected emission amount
      const poolGrowth = finalPool - initialPool;
      expect(poolGrowth).to.be.gte(secondDeposit + expectedEmission);
    });

    it("should calculate sRABBIT amounts correctly with emission rewards", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user2, user2Address } = fixture;
      
      // Make initial deposit
      const initialDeposit = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, initialDeposit);
      
      // Mine blocks to accumulate emission
      for (let i = 0; i < 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Calculate expected sRABBIT before deposit
      const testDeposit = ethers.parseEther("200");
      const calculatedSRabbit = await rabbitStaker.calculateSRabbitAmount(testDeposit);
      
      // Make the deposit
      await approveAndDeposit(rabbitToken, rabbitStaker, user2, testDeposit);
      
      const actualSRabbit = await sRabbitToken.balanceOf(user2Address);
      
      // Should be reasonably close to calculated amount (allowing for rounding)
      const difference = actualSRabbit > calculatedSRabbit 
        ? actualSRabbit - calculatedSRabbit 
        : calculatedSRabbit - actualSRabbit;
      expect(difference).to.be.lte(BigInt(1e17)); // 0.1 token precision
      
      // Should get less than 1:1 due to improved exchange rate
      expect(actualSRabbit).to.be.lt(testDeposit);
    });

    it("should handle multiple emission updates correctly", async function () {
      const { rabbitStaker, rabbitToken, user1 } = fixture;
      
      // Make initial deposit
      const depositAmount = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, depositAmount);
      
      const initialPool = await rabbitStaker.totalRabbitInPool();
      let totalEmission = 0n;
      
      // Multiple rounds of mining and deposits
      for (let round = 0; round < 3; round++) {
        const blocksThisRound = 5;
        
        // Mine blocks
        for (let i = 0; i < blocksThisRound; i++) {
          await ethers.provider.send("evm_mine", []);
        }
        
        // Make deposit to trigger emission update
        await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("100"));
        
        totalEmission += BigInt(blocksThisRound) * INITIAL_EMISSION_PER_BLOCK;
      }
      
      const finalPool = await rabbitStaker.totalRabbitInPool();
      
      // Pool should have grown by at least the expected amount
      const poolGrowth = finalPool - initialPool;
      expect(poolGrowth).to.be.gte(ethers.parseEther("300") + totalEmission);
    });
  });
});
