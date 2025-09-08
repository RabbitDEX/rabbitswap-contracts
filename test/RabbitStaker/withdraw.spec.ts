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

    it("should revert when insufficient RABBIT in pool", async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1, user2 } = fixture;
      
      // Give user2 large sRABBIT balance
      await approveAndDeposit(rabbitToken, rabbitStaker, user2, ethers.parseEther("5000"));
      
      // Lock most RABBIT in the pool, leaving very little available
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("1000"), 180);
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user2, ethers.parseEther("4000"), 180); 
      // user2 still has 1000 sRABBIT remaining
      
      // Try to withdraw a smaller amount that user2 has but would exceed available pool
      await expect(approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user2, ethers.parseEther("500"), 180))
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
      
      const expectedRabbitOutput = await rabbitStaker.calculateRabbitOutput(smallAmount, vestingDays);
      
      if (expectedRabbitOutput > 0) {
        await sRabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), smallAmount);
        await expect(rabbitStaker.connect(user1).withdraw(smallAmount, vestingDays))
          .to.not.be.reverted;
      } else {
        await sRabbitToken.connect(user1).approve(await rabbitStaker.getAddress(), smallAmount);
        await expect(rabbitStaker.connect(user1).withdraw(smallAmount, vestingDays))
          .to.be.revertedWith("RABBIT amount too small");
      }
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
});
