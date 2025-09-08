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

  describe("Emission Rewards Integration", function () {
    beforeEach(async function () {
      // Reset emission to initial value for emission tests
      await fixture.rabbitStaker.setRabbitEmissionPerBlock(INITIAL_EMISSION_PER_BLOCK);
    });

    it("should accumulate rewards and improve exchange rate", async function () {
      const { rabbitStaker, rabbitToken, user1, user2 } = fixture;
      // Make initial deposit
      const initialDeposit = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, initialDeposit);
      
      const initialRate = await rabbitStaker.getRabbitPerShare();
      
      // Mine blocks to accumulate rewards
      for (let i = 0; i < 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Make another deposit to trigger reward update
      const secondDeposit = ethers.parseEther("500");
      await approveAndDeposit(rabbitToken, rabbitStaker, user2, secondDeposit);
      
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
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user2, user2Address } = fixture;
      // Initial deposit
      const depositAmount = ethers.parseEther("100");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, depositAmount);
      
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
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user2, user2Address } = fixture;
      // Initial setup
      const initialDeposit = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, initialDeposit);
      
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
});
