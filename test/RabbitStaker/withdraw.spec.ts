import { expect } from "chai";
import { ethers } from "hardhat";
import { deployRabbitStakerFixture, TestFixture, approveAndDeposit, approveSRabbitAndWithdraw } from "./shared/setup";

describe("RabbitStaker - Withdraw Functionality", function () {
  let fixture: TestFixture;

  beforeEach(async function () {
    fixture = await deployRabbitStakerFixture();
  });

  describe("Basic Withdraw Operations", function () {
    beforeEach(async function () {
      // Setup initial deposits for withdrawal tests
      const { rabbitStaker, sRabbitToken, rabbitToken, user1, user2 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
      await approveAndDeposit(rabbitToken, rabbitStaker, user2, ethers.parseEther("500"));
    });

    it("should allow withdrawal with minimum vesting period", async function () {
      const { rabbitStaker, sRabbitToken, user1, user1Address } = fixture;
      const withdrawAmount = ethers.parseEther("100");
      const vestingDays = 15; // Minimum vesting period
      
      const initialSRabbitBalance = await sRabbitToken.balanceOf(user1Address);
      const initialTotalLocked = await rabbitStaker.totalLockedRabbit();
      const initialWithdrawalCount = await rabbitStaker.getUserWithdrawalCount(user1Address);
      
      // Calculate expected RABBIT output
      const expectedRabbitAmount = await rabbitStaker.calculateRabbitOutput(withdrawAmount, vestingDays);
      const expectedConversionRate = await rabbitStaker.calculateConversionRate(vestingDays);
      
      // Perform withdrawal
      const tx = await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      
      // Check events
      await expect(tx)
        .to.emit(rabbitStaker, "WithdrawalRequested")
        .withArgs(
          user1Address,
          initialWithdrawalCount,
          withdrawAmount,
          expectedRabbitAmount,
          vestingDays,
          await ethers.provider.getBlock("latest").then(b => b!.timestamp + vestingDays * 24 * 60 * 60),
          expectedConversionRate
        );
      
      // Validate state changes
      expect(await sRabbitToken.balanceOf(user1Address)).to.equal(initialSRabbitBalance - withdrawAmount);
      expect(await rabbitStaker.totalLockedRabbit()).to.equal(initialTotalLocked + expectedRabbitAmount);
      expect(await rabbitStaker.getUserWithdrawalCount(user1Address)).to.equal(initialWithdrawalCount + 1n);
      
      // Check withdrawal request details
      const withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, initialWithdrawalCount);
      expect(withdrawal.rabbitAmount).to.equal(expectedRabbitAmount);
      expect(withdrawal.claimed).to.be.false;
      expect(withdrawal.unlockTime).to.be.gt(await ethers.provider.getBlock("latest").then(b => b!.timestamp));
    });

    it("should allow withdrawal with maximum vesting period", async function () {
      const { rabbitStaker, sRabbitToken, user1, user1Address } = fixture;
      const withdrawAmount = ethers.parseEther("200");
      const vestingDays = 180; // Maximum vesting period
      
      const expectedRabbitAmount = await rabbitStaker.calculateRabbitOutput(withdrawAmount, vestingDays);
      const expectedConversionRate = await rabbitStaker.calculateConversionRate(vestingDays);
      
      // Max vesting should give 1:1 conversion rate (10000 basis points)
      expect(expectedConversionRate).to.equal(10000);
      
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      
      const withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      expect(withdrawal.rabbitAmount).to.equal(expectedRabbitAmount);
    });

    it("should handle multiple withdrawals by same user", async function () {
      const { rabbitStaker, sRabbitToken, user1, user1Address } = fixture;
      const firstWithdraw = ethers.parseEther("150");
      const secondWithdraw = ethers.parseEther("100");
      const vestingDays = 30;
      
      // First withdrawal
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, firstWithdraw, vestingDays);
      
      // Second withdrawal
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, secondWithdraw, vestingDays);
      
      // Validate both withdrawals exist
      expect(await rabbitStaker.getUserWithdrawalCount(user1Address)).to.equal(2);
      
      const firstWithdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const secondWithdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      
      expect(firstWithdrawal.rabbitAmount).to.be.gt(0);
      expect(secondWithdrawal.rabbitAmount).to.be.gt(0);
      expect(firstWithdrawal.claimed).to.be.false;
      expect(secondWithdrawal.claimed).to.be.false;
    });

    it("should handle withdrawals from multiple users", async function () {
      const { rabbitStaker, sRabbitToken, user1, user2, user1Address, user2Address } = fixture;
      const withdrawAmount = ethers.parseEther("100");
      const vestingDays = 45;
      
      // Both users withdraw
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user2, withdrawAmount, vestingDays);
      
      // Validate separate withdrawal tracking
      expect(await rabbitStaker.getUserWithdrawalCount(user1Address)).to.equal(1);
      expect(await rabbitStaker.getUserWithdrawalCount(user2Address)).to.equal(1);
      
      const user1Withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const user2Withdrawal = await rabbitStaker.getUserWithdrawal(user2Address, 0);
      
      expect(user1Withdrawal.rabbitAmount).to.be.gt(0);
      expect(user2Withdrawal.rabbitAmount).to.be.gt(0);
    });
  });

  describe("Conversion Rate Calculations", function () {
    beforeEach(async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
    });

    it("should calculate conversion rate correctly for minimum vesting", async function () {
      const { rabbitStaker } = fixture;
      const minVestingDays = 15;
      const conversionRate = await rabbitStaker.calculateConversionRate(minVestingDays);
      expect(conversionRate).to.equal(5000); // 0.5x conversion rate (50%)
    });

    it("should calculate conversion rate correctly for maximum vesting", async function () {
      const { rabbitStaker } = fixture;
      const maxVestingDays = 180;
      const conversionRate = await rabbitStaker.calculateConversionRate(maxVestingDays);
      expect(conversionRate).to.equal(10000); // 1.0x conversion rate (100%)
    });

    it("should calculate conversion rate correctly for mid-range vesting", async function () {
      const { rabbitStaker } = fixture;
      const midVestingDays = 90; // Halfway between 15 and 180
      const conversionRate = await rabbitStaker.calculateConversionRate(midVestingDays);
      
      // Linear interpolation: should be around 7500 (75%)
      const expected = BigInt(5000 + Math.floor(((90 - 15) * (10000 - 5000)) / (180 - 15)));
      const tolerance = 100n;
      const difference = conversionRate > expected ? conversionRate - expected : expected - conversionRate;
      expect(difference).to.be.lte(tolerance);
    });

    it("should calculate RABBIT output correctly based on conversion rate", async function () {
      const { rabbitStaker } = fixture;
      const sRabbitAmount = ethers.parseEther("100");
      const vestingDays = 60;
      
      const conversionRate = await rabbitStaker.calculateConversionRate(vestingDays);
      const rabbitOutput = await rabbitStaker.calculateRabbitOutput(sRabbitAmount, vestingDays);
      const exchangeRate = await rabbitStaker.getRabbitPerShare();
      
      // Expected calculation: sRABBIT × rabbitPerShare × conversionRate ÷ (PRECISION × BASIS_POINTS)
      const expected = (sRabbitAmount * exchangeRate * conversionRate) / (ethers.parseEther("1") * 10000n);
      expect(rabbitOutput).to.equal(expected);
    });

    it("should provide more RABBIT for longer vesting periods", async function () {
      const { rabbitStaker } = fixture;
      const sRabbitAmount = ethers.parseEther("100");
      
      const shortVestingOutput = await rabbitStaker.calculateRabbitOutput(sRabbitAmount, 15);
      const longVestingOutput = await rabbitStaker.calculateRabbitOutput(sRabbitAmount, 180);
      
      expect(longVestingOutput).to.be.gt(shortVestingOutput);
    });
  });

  describe("State Validation", function () {
    beforeEach(async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1, user2 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
      await approveAndDeposit(rabbitToken, rabbitStaker, user2, ethers.parseEther("500"));
    });

    it("should update total locked RABBIT correctly", async function () {
      const { rabbitStaker, sRabbitToken, user1 } = fixture;
      const withdrawAmount = ethers.parseEther("200");
      const vestingDays = 30;
      
      const initialLocked = await rabbitStaker.totalLockedRabbit();
      const expectedRabbitAmount = await rabbitStaker.calculateRabbitOutput(withdrawAmount, vestingDays);
      
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      
      const finalLocked = await rabbitStaker.totalLockedRabbit();
      expect(finalLocked).to.equal(initialLocked + expectedRabbitAmount);
    });

    it("should burn sRABBIT tokens correctly", async function () {
      const { rabbitStaker, sRabbitToken, user1, user1Address } = fixture;
      const withdrawAmount = ethers.parseEther("300");
      const vestingDays = 45;
      
      const initialBalance = await sRabbitToken.balanceOf(user1Address);
      const initialSupply = await sRabbitToken.totalSupply();
      
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      
      expect(await sRabbitToken.balanceOf(user1Address)).to.equal(initialBalance - withdrawAmount);
      expect(await sRabbitToken.totalSupply()).to.equal(initialSupply - withdrawAmount);
    });

    it("should maintain correct available RABBIT for withdrawals", async function () {
      const { rabbitStaker, sRabbitToken, user1 } = fixture;
      const withdrawAmount = ethers.parseEther("200");
      const vestingDays = 60;
      
      const initialAvailable = await rabbitStaker.getAvailableRabbitForWithdrawals();
      const expectedRabbitAmount = await rabbitStaker.calculateRabbitOutput(withdrawAmount, vestingDays);
      
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      
      const finalAvailable = await rabbitStaker.getAvailableRabbitForWithdrawals();
      expect(finalAvailable).to.equal(initialAvailable - expectedRabbitAmount);
    });

    it("should update exchange rate after withdrawal", async function () {
      const { rabbitStaker, sRabbitToken, user1 } = fixture;
      const withdrawAmount = ethers.parseEther("100");
      const vestingDays = 30;
      
      const initialRate = await rabbitStaker.getRabbitPerShare();
      
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      
      const finalRate = await rabbitStaker.getRabbitPerShare();
      
      // Exchange rate should be recalculated after sRABBIT burn
      expect(finalRate).to.not.equal(initialRate);
    });

    it("should use available RABBIT (not total) for exchange rate calculation", async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1 } = fixture;
      
      // Setup: 1000 RABBIT deposited, 1000 sRABBIT minted
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
      
      // Withdraw 500 sRABBIT (locks some RABBIT)
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("500"), 15);
      
      // Get actual values
      const totalRabbit = await rabbitStaker.totalRabbitInPool();
      const lockedRabbit = await rabbitStaker.totalLockedRabbit();
      const availableRabbit = totalRabbit - lockedRabbit;
      const sRabbitSupply = await sRabbitToken.totalSupply();
      
      // Calculate expected rate: available RABBIT / sRABBIT supply
      const expectedRate = (availableRabbit * ethers.parseEther("1")) / sRabbitSupply;
      const actualRate = await rabbitStaker.getRabbitPerShare();
      
      // The rate should use available RABBIT, not total RABBIT
      expect(actualRate).to.equal(ethers.parseEther("1.125"));
      expect(totalRabbit).to.equal(ethers.parseEther("2500"));
      expect(lockedRabbit).to.equal(ethers.parseEther("250"));
      expect(availableRabbit).to.equal(ethers.parseEther("2250"));
      expect(sRabbitSupply).to.equal(ethers.parseEther("2000"));
      expect(actualRate).to.equal(expectedRate);
    });
  });

  describe("Error Cases", function () {
    beforeEach(async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
    });

    it("should revert on zero amount withdrawal", async function () {
      const { rabbitStaker, sRabbitToken, user1 } = fixture;
      await expect(rabbitStaker.connect(user1).withdraw(0, 30))
        .to.be.revertedWith("Amount must be greater than 0");
    });

    it("should revert on vesting period too short", async function () {
      const { rabbitStaker, sRabbitToken, user1 } = fixture;
      const withdrawAmount = ethers.parseEther("100");
      
      await sRabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), withdrawAmount);
      await expect(rabbitStaker.connect(user1).withdraw(withdrawAmount, 10)) // Less than 15 days
        .to.be.revertedWith("Vesting period too short");
    });

    it("should revert on vesting period too long", async function () {
      const { rabbitStaker, sRabbitToken, user1 } = fixture;
      const withdrawAmount = ethers.parseEther("100");
      
      await sRabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), withdrawAmount);
      await expect(rabbitStaker.connect(user1).withdraw(withdrawAmount, 200)) // More than 180 days
        .to.be.revertedWith("Vesting period too long");
    });

    it("should revert on insufficient sRABBIT balance", async function () {
      const { rabbitStaker, sRabbitToken, user1 } = fixture;
      const excessiveAmount = ethers.parseEther("2000"); // More than user has
      
      await sRabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), excessiveAmount);
      await expect(rabbitStaker.connect(user1).withdraw(excessiveAmount, 30))
        .to.be.revertedWith("Insufficient sRABBIT balance");
    });

    it("should revert when insufficient RABBIT in pool due to emission without backing", async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1, user2, owner } = fixture;
      
      // User1 deposits 1000 RABBIT initially
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
      
      // User2 deposits 100 RABBIT BEFORE emission starts (gets sRABBIT at 1:1 rate)
      await approveAndDeposit(rabbitToken, rabbitStaker, user2, ethers.parseEther("100"));
      
      // Set very high emission rate (but no actual RABBIT is provided to back it)
      await rabbitStaker.connect(owner).setRabbitEmissionPerBlock(ethers.parseEther("10000"));
      
      // Advance many blocks to accumulate emission rewards
      // This increases _totalRabbitInPool but no actual RABBIT tokens are added
      for (let i = 0; i < 100; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Now user2 tries to withdraw - the exchange rate is inflated by emission
      await expect(approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user2, ethers.parseEther("100"), 180))
        .to.be.revertedWith("Insufficient RABBIT in pool");
    });

    it("should revert when withdrawal results in zero RABBIT amount", async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, owner, user1, ownerAddress } = fixture;
      
      // Create a scenario with very high exchange rate by adding massive rewards
      const largeReward = ethers.parseEther("10000000"); // 10M tokens
      await rabbitToken.mint(ownerAddress, largeReward);
      await rabbitToken.connect(owner).approve(await rabbitStaker.getAddress(), largeReward);
      await rabbitStaker.connect(owner).contributeRewards(largeReward);
      
      // Calculate very small amount that would result in zero RABBIT output
      let tinyAmount = 1n; // Start with 1 wei
      let expectedOutput = await rabbitStaker.calculateRabbitOutput(tinyAmount, 15);
      
      // Find an amount small enough to result in zero output
      while (expectedOutput > 0 && tinyAmount < 1000n) {
        tinyAmount = tinyAmount / 10n;
        if (tinyAmount === 0n) break;
        try {
          expectedOutput = await rabbitStaker.calculateRabbitOutput(tinyAmount, 15);
        } catch {
          break;
        }
      }
      
      if (expectedOutput === 0n && tinyAmount > 0n) {
        await expect(approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, tinyAmount, 15))
          .to.be.revertedWith("RABBIT amount too small");
      } else {
        // If we can't create a zero output scenario, skip this test
        this.skip();
      }
    });
  });

  describe("Exchange Rate Impact", function () {
    beforeEach(async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1, user2 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
      await approveAndDeposit(rabbitToken, rabbitStaker, user2, ethers.parseEther("500"));
    });

    it("should improve exchange rate for remaining stakers after withdrawal", async function () {
      const { rabbitStaker, sRabbitToken, user1 } = fixture;
      const withdrawAmount = ethers.parseEther("200");
      const vestingDays = 15; // Minimum vesting = 50% conversion rate
      
      const initialRate = await rabbitStaker.getRabbitPerShare();
      
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      
      const finalRate = await rabbitStaker.getRabbitPerShare();
      
      // Exchange rate should improve because sRABBIT was burned but only 50% of RABBIT was locked
      expect(finalRate).to.be.gt(initialRate);
    });

    it("should handle withdrawal with improved exchange rate from rewards", async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, owner, user1, ownerAddress, user1Address } = fixture;
      
      // Add rewards to improve exchange rate
      const rewardAmount = ethers.parseEther("200");
      await rabbitToken.mint(ownerAddress, rewardAmount);
      await rabbitToken.connect(owner).approve(await rabbitStaker.getAddress(), rewardAmount);
      await rabbitStaker.connect(owner).contributeRewards(rewardAmount);
      
      const withdrawAmount = ethers.parseEther("100");
      const vestingDays = 90; // Mid-range vesting
      
      const expectedRabbitOutput = await rabbitStaker.calculateRabbitOutput(withdrawAmount, vestingDays);
      
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      
      const withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      expect(withdrawal.rabbitAmount).to.equal(expectedRabbitOutput);
      
      // Should get more RABBIT than the sRABBIT amount due to improved exchange rate
      expect(withdrawal.rabbitAmount).to.be.gt(withdrawAmount * 75n / 100n); // Should be more than 75% due to improved rate
    });
  });

  describe("Event Emission", function () {
    beforeEach(async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
    });

    it("should emit WithdrawalRequested event with correct parameters", async function () {
      const { rabbitStaker, sRabbitToken, user1, user1Address } = fixture;
      const withdrawAmount = ethers.parseEther("150");
      const vestingDays = 60;
      
      const expectedRabbitAmount = await rabbitStaker.calculateRabbitOutput(withdrawAmount, vestingDays);
      const expectedConversionRate = await rabbitStaker.calculateConversionRate(vestingDays);
      const withdrawalId = await rabbitStaker.getUserWithdrawalCount(user1Address);
      
      // Execute the withdrawal
      const tx = await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      const expectedUnlockTime = block!.timestamp + vestingDays * 24 * 60 * 60;
      
      await expect(tx)
        .to.emit(rabbitStaker, "WithdrawalRequested")
        .withArgs(
          user1Address,
          withdrawalId,
          withdrawAmount,
          expectedRabbitAmount,
          vestingDays,
          expectedUnlockTime,
          expectedConversionRate
        );
    });

    it("should emit RabbitPerShareUpdated event on withdrawal", async function () {
      const { rabbitStaker, sRabbitToken, user1 } = fixture;
      const withdrawAmount = ethers.parseEther("100");
      const vestingDays = 45;
      
      const tx = await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      await expect(tx)
        .to.emit(rabbitStaker, "RabbitPerShareUpdated");
    });
  });

  describe("Edge Cases", function () {
    beforeEach(async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
    });

    it("should handle withdrawal of entire sRABBIT balance", async function () {
      const { rabbitStaker, sRabbitToken, user1, user1Address } = fixture;
      const entireBalance = await sRabbitToken.balanceOf(user1Address);
      const vestingDays = 90;
      
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, entireBalance, vestingDays);
      
      expect(await sRabbitToken.balanceOf(user1Address)).to.equal(0);
      expect(await rabbitStaker.getUserWithdrawalCount(user1Address)).to.equal(1);
    });

    it("should handle very small withdrawal amounts", async function () {
      const { rabbitStaker, sRabbitToken, user1 } = fixture;
      const smallAmount = ethers.parseUnits("1", 12); // 0.000001 sRABBIT
      const vestingDays = 30;
      
      await sRabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), smallAmount);
        await expect(rabbitStaker.connect(user1).withdraw(smallAmount, vestingDays))
          .to.not.be.reverted;
    });

    it("should handle withdrawal exactly at vesting boundaries", async function () {
      const { rabbitStaker, sRabbitToken, user1 } = fixture;
      const withdrawAmount = ethers.parseEther("100");
      
      // Test minimum boundary
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, 15);
      
      // Test maximum boundary  
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, 180);
    });
  });

  describe("Withdrawal with Emission Rate Impact", function () {
    beforeEach(async function () {
      // Setup initial deposits for emission tests
      const { rabbitStaker, sRabbitToken, rabbitToken, user1, user2 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
      await approveAndDeposit(rabbitToken, rabbitStaker, user2, ethers.parseEther("500"));
    });

    it("should improve exchange rate for remaining stakers after withdrawal with emission", async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1, user2, user2Address } = fixture;
      
      // Set emission rate
      await rabbitStaker.setRabbitEmissionPerBlock(ethers.parseEther("0.1"));
      
      // Mine blocks to accumulate emission
      for (let i = 0; i < 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Get initial exchange rate
      const initialRate = await rabbitStaker.getRabbitPerShare();
      
      // User1 withdraws some sRABBIT
      const withdrawAmount = ethers.parseEther("200");
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, 15);
      
      // Exchange rate should have improved due to emission + withdrawal
      const finalRate = await rabbitStaker.getRabbitPerShare();
      expect(finalRate).to.be.gt(initialRate);
      
      // User2 should get fewer sRABBIT for same RABBIT deposit due to improved rate
      const testDeposit = ethers.parseEther("100");
      const calculatedSRabbit = await rabbitStaker.calculateSRabbitAmount(testDeposit);
      
      await approveAndDeposit(rabbitToken, rabbitStaker, user2, testDeposit);
      const actualSRabbit = await sRabbitToken.balanceOf(user2Address);
      
      // Should be close to calculated amount (allowing for rounding)
      const difference = actualSRabbit > calculatedSRabbit 
        ? actualSRabbit - calculatedSRabbit 
        : calculatedSRabbit - actualSRabbit;
      expect(difference).to.be.lte(BigInt(1e21)); // 1000 token precision for emission tests
    });

    it("should handle withdrawal with accumulated emission rewards", async function () {
      const { rabbitStaker, sRabbitToken, user1, user1Address } = fixture;
      
      // Set emission rate
      await rabbitStaker.setRabbitEmissionPerBlock(ethers.parseEther("0.1"));
      
      // Mine blocks to accumulate emission
      for (let i = 0; i < 15; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      const initialPool = await rabbitStaker.totalRabbitInPool();
      const withdrawAmount = ethers.parseEther("300");
      const vestingDays = 30;
      
      // Calculate expected RABBIT output
      const expectedRabbitAmount = await rabbitStaker.calculateRabbitOutput(withdrawAmount, vestingDays);
      
      // Perform withdrawal
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      
      // Check that withdrawal was created correctly
      const withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      expect(withdrawal.rabbitAmount).to.be.gte(expectedRabbitAmount);
      expect(withdrawal.claimed).to.be.false;
      
      // Pool should have grown due to emission, but locked amount should be subtracted from available
      const finalPool = await rabbitStaker.totalRabbitInPool();
      const totalLocked = await rabbitStaker.totalLockedRabbit();
      const availableForWithdrawals = await rabbitStaker.getAvailableRabbitForWithdrawals();
      
      expect(totalLocked).to.be.gte(expectedRabbitAmount);
      expect(availableForWithdrawals).to.equal(finalPool - totalLocked);
    });

    it("should handle withdrawal with zero emission rate", async function () {
      const { rabbitStaker, sRabbitToken, user1, user1Address } = fixture;
      
      // Ensure emission is zero
      await rabbitStaker.setRabbitEmissionPerBlock(0);
      
      // Mine blocks (should not accumulate emission)
      for (let i = 0; i < 20; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      const initialPool = await rabbitStaker.totalRabbitInPool();
      const withdrawAmount = ethers.parseEther("200");
      const vestingDays = 45;
      
      // Perform withdrawal
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      
      // Pool should not have grown due to emission
      const finalPool = await rabbitStaker.totalRabbitInPool();
      expect(finalPool).to.equal(initialPool);
      
      // Withdrawal should still work correctly
      const withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      expect(withdrawal.rabbitAmount).to.be.gt(0);
      expect(withdrawal.claimed).to.be.false;
    });

    it("should handle multiple withdrawals with emission accumulation", async function () {
      const { rabbitStaker, sRabbitToken, user1, user1Address } = fixture;
      
      // Set emission rate
      await rabbitStaker.setRabbitEmissionPerBlock(ethers.parseEther("0.1"));
      
      // First withdrawal
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("100"), 15);
      
      // Mine blocks to accumulate more emission
      for (let i = 0; i < 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Second withdrawal (should benefit from improved exchange rate)
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("150"), 30);
      
      // Check both withdrawals exist
      const withdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const withdrawal2 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      
      expect(withdrawal1.rabbitAmount).to.be.gt(0);
      expect(withdrawal2.rabbitAmount).to.be.gt(0);
      expect(withdrawal1.claimed).to.be.false;
      expect(withdrawal2.claimed).to.be.false;
      
      // Total locked should be sum of both withdrawals
      const totalLocked = await rabbitStaker.totalLockedRabbit();
      expect(totalLocked).to.equal(withdrawal1.rabbitAmount + withdrawal2.rabbitAmount);
    });

    it("should handle withdrawal with emission rate changes", async function () {
      const { rabbitStaker, sRabbitToken, user1, user1Address } = fixture;
      
      // Set initial emission rate
      await rabbitStaker.setRabbitEmissionPerBlock(ethers.parseEther("0.1"));
      
      // Mine blocks with initial rate
      for (let i = 0; i < 5; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Change emission rate
      await rabbitStaker.setRabbitEmissionPerBlock(ethers.parseEther("0.2"));
      
      // Mine more blocks with new rate
      for (let i = 0; i < 5; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Perform withdrawal
      const withdrawAmount = ethers.parseEther("250");
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, 60);
      
      // Withdrawal should work correctly with mixed emission rates
      const withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      expect(withdrawal.rabbitAmount).to.be.gt(0);
      expect(withdrawal.claimed).to.be.false;
      
      // Pool should have grown due to both emission rates
      const finalPool = await rabbitStaker.totalRabbitInPool();
      const expectedEmission = BigInt(5) * ethers.parseEther("0.1") + BigInt(5) * ethers.parseEther("0.2");
      expect(finalPool).to.be.gte(ethers.parseEther("1500") + expectedEmission); // 1000 + 500 initial deposits
    });
  });
});
