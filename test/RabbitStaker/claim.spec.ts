import { expect } from "chai";
import { ethers } from "hardhat";
import { deployRabbitStakerFixture, TestFixture, approveAndDeposit, approveSRabbitAndWithdraw } from "./shared/setup";

describe("RabbitStaker - Claim Functionality", function () {
  let fixture: TestFixture;

  beforeEach(async function () {
    fixture = await deployRabbitStakerFixture();
  });

  describe("Single Claim Operations", function () {
    beforeEach(async function () {
      // Setup initial deposits and withdrawals for claim tests
      const { rabbitStaker, sRabbitToken, rabbitToken, user1, user2 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
      await approveAndDeposit(rabbitToken, rabbitStaker, user2, ethers.parseEther("500"));
      
      // Create some withdrawals with short vesting periods for quick testing
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("200"), 15); // ID 0
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("150"), 30); // ID 1
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user2, ethers.parseEther("100"), 20); // ID 0
    });

    it("should allow claiming after vesting period completes", async function () {
      const { rabbitStaker, rabbitToken, user1, user1Address } = fixture;
      
      const withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const initialRabbitBalance = await rabbitToken.balanceOf(user1Address);
      const initialTotalLocked = await rabbitStaker.totalLockedRabbit();
      
      // Fast forward time past vesting period
      await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60 + 1]); // 15 days + 1 second
      await ethers.provider.send("evm_mine", []);
      
      // Claim withdrawal
      await expect(rabbitStaker.connect(user1).claim(0))
        .to.emit(rabbitStaker, "WithdrawalClaimed")
        .withArgs(user1Address, 0, withdrawal.rabbitAmount);
      
      // Validate state changes
      expect(await rabbitToken.balanceOf(user1Address)).to.equal(initialRabbitBalance + withdrawal.rabbitAmount);
      expect(await rabbitStaker.totalLockedRabbit()).to.equal(initialTotalLocked - withdrawal.rabbitAmount);
      
      // Check withdrawal is marked as claimed
      const updatedWithdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      expect(updatedWithdrawal.claimed).to.be.true;
    });

    it("should handle claims from multiple users independently", async function () {
      const { rabbitStaker, rabbitToken, user1, user2, user1Address, user2Address } = fixture;
      
      const user1Withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const user2Withdrawal = await rabbitStaker.getUserWithdrawal(user2Address, 0);
      
      const user1InitialBalance = await rabbitToken.balanceOf(user1Address);
      const user2InitialBalance = await rabbitToken.balanceOf(user2Address);
      
      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [20 * 24 * 60 * 60 + 1]); // 20 days
      await ethers.provider.send("evm_mine", []);
      
      // Both users claim
      await rabbitStaker.connect(user1).claim(0);
      await rabbitStaker.connect(user2).claim(0);
      
      // Validate separate claims
      expect(await rabbitToken.balanceOf(user1Address)).to.equal(user1InitialBalance + user1Withdrawal.rabbitAmount);
      expect(await rabbitToken.balanceOf(user2Address)).to.equal(user2InitialBalance + user2Withdrawal.rabbitAmount);
    });

    it("should handle claiming multiple withdrawals by same user sequentially", async function () {
      const { rabbitStaker, rabbitToken, user1, user1Address } = fixture;
      
      const withdrawal0 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const withdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      
      const initialBalance = await rabbitToken.balanceOf(user1Address);
      
      // Fast forward past both vesting periods
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]); // 30 days
      await ethers.provider.send("evm_mine", []);
      
      // Claim first withdrawal
      await rabbitStaker.connect(user1).claim(0);
      expect(await rabbitToken.balanceOf(user1Address)).to.equal(initialBalance + withdrawal0.rabbitAmount);
      
      // Claim second withdrawal
      await rabbitStaker.connect(user1).claim(1);
      expect(await rabbitToken.balanceOf(user1Address)).to.equal(initialBalance + withdrawal0.rabbitAmount + withdrawal1.rabbitAmount);
      
      // Both should be marked as claimed
      const updatedWithdrawal0 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const updatedWithdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      expect(updatedWithdrawal0.claimed).to.be.true;
      expect(updatedWithdrawal1.claimed).to.be.true;
    });
  });

  describe("ClaimAll Functionality", function () {
    beforeEach(async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1, user2 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
      await approveAndDeposit(rabbitToken, rabbitStaker, user2, ethers.parseEther("500"));
      
      // Create multiple withdrawals with different vesting periods
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("100"), 15); // ID 0 - ready first
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("150"), 20); // ID 1 - ready second  
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("200"), 45); // ID 2 - ready later
    });

    it("should claim all available withdrawals in single transaction", async function () {
      const { rabbitStaker, rabbitToken, user1, user1Address } = fixture;
      
      // Fast forward to make first two withdrawals claimable
      await ethers.provider.send("evm_increaseTime", [20 * 24 * 60 * 60 + 1]); // 20 days
      await ethers.provider.send("evm_mine", []);
      
      const withdrawal0 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const withdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      const withdrawal2 = await rabbitStaker.getUserWithdrawal(user1Address, 2);
      
      const initialBalance = await rabbitToken.balanceOf(user1Address);
      const claimableIds = await rabbitStaker.getClaimableWithdrawalIds(user1Address);
      
      // Should have 2 claimable withdrawals (0 and 1)
      expect(claimableIds.length).to.equal(2);
      expect(claimableIds).to.deep.equal([0n, 1n]);
      
      // Claim all available
      const totalClaimable = await rabbitStaker.getClaimableAmount(user1Address);
      await expect(rabbitStaker.connect(user1).claimAll())
        .to.emit(rabbitStaker, "WithdrawalClaimed")
        .to.emit(rabbitStaker, "WithdrawalClaimed"); // Should emit twice
      
      // Validate total claimed amount
      expect(await rabbitToken.balanceOf(user1Address)).to.equal(initialBalance + totalClaimable);
      expect(totalClaimable).to.equal(withdrawal0.rabbitAmount + withdrawal1.rabbitAmount);
      
      // First two should be claimed, third should not
      const updatedWithdrawal0 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const updatedWithdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      const updatedWithdrawal2 = await rabbitStaker.getUserWithdrawal(user1Address, 2);
      
      expect(updatedWithdrawal0.claimed).to.be.true;
      expect(updatedWithdrawal1.claimed).to.be.true;
      expect(updatedWithdrawal2.claimed).to.be.false;
    });

    it("should handle claimAll when no withdrawals are ready", async function () {
      const { rabbitStaker, user1 } = fixture;
      
      // Don't fast forward time - no withdrawals should be claimable yet
      const claimableIds = await rabbitStaker.getClaimableWithdrawalIds(await user1.getAddress());
      expect(claimableIds.length).to.equal(0);
      
      await expect(rabbitStaker.connect(user1).claimAll())
        .to.be.revertedWith("No claimable withdrawals");
    });

    it("should handle claimAll when all withdrawals already claimed", async function () {
      const { rabbitStaker, user1, user1Address } = fixture;
      
      // Fast forward time to make all claimable
      await ethers.provider.send("evm_increaseTime", [45 * 24 * 60 * 60 + 1]); // 45 days
      await ethers.provider.send("evm_mine", []);
      
      // Claim all first time
      await rabbitStaker.connect(user1).claimAll();
      
      // Try to claim all again
      await expect(rabbitStaker.connect(user1).claimAll())
        .to.be.revertedWith("No claimable withdrawals");
    });
  });

  describe("ClaimMultiple Functionality", function () {
    beforeEach(async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
      
      // Create multiple withdrawals
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("100"), 15); // ID 0
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("150"), 20); // ID 1
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("200"), 25); // ID 2
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("80"), 30);  // ID 3
    });

    it("should claim specific withdrawals by ID array", async function () {
      const { rabbitStaker, rabbitToken, user1, user1Address } = fixture;
      
      // Fast forward to make all claimable
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]); // 30 days
      await ethers.provider.send("evm_mine", []);
      
      const withdrawal0 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const withdrawal2 = await rabbitStaker.getUserWithdrawal(user1Address, 2);
      
      const initialBalance = await rabbitToken.balanceOf(user1Address);
      
      // Claim specific withdrawals (0 and 2)
      await expect(rabbitStaker.connect(user1).claimMultiple([0, 2]))
        .to.emit(rabbitStaker, "WithdrawalClaimed")
        .to.emit(rabbitStaker, "WithdrawalClaimed");
      
      // Validate claimed amounts
      const expectedClaimed = withdrawal0.rabbitAmount + withdrawal2.rabbitAmount;
      expect(await rabbitToken.balanceOf(user1Address)).to.equal(initialBalance + expectedClaimed);
      
      // Check claim status
      const updatedWithdrawal0 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const updatedWithdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      const updatedWithdrawal2 = await rabbitStaker.getUserWithdrawal(user1Address, 2);
      const updatedWithdrawal3 = await rabbitStaker.getUserWithdrawal(user1Address, 3);
      
      expect(updatedWithdrawal0.claimed).to.be.true;
      expect(updatedWithdrawal1.claimed).to.be.false; // Not claimed
      expect(updatedWithdrawal2.claimed).to.be.true;
      expect(updatedWithdrawal3.claimed).to.be.false; // Not claimed
    });

    it("should handle claiming single withdrawal via claimMultiple", async function () {
      const { rabbitStaker, rabbitToken, user1, user1Address } = fixture;
      
      await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60 + 1]); // 15 days
      await ethers.provider.send("evm_mine", []);
      
      const withdrawal0 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const initialBalance = await rabbitToken.balanceOf(user1Address);
      
      await rabbitStaker.connect(user1).claimMultiple([0]);
      
      expect(await rabbitToken.balanceOf(user1Address)).to.equal(initialBalance + withdrawal0.rabbitAmount);
    });

    it("should handle claiming all withdrawals via claimMultiple", async function () {
      const { rabbitStaker, rabbitToken, user1, user1Address } = fixture;
      
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]); // 30 days
      await ethers.provider.send("evm_mine", []);
      
      const withdrawal0 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const withdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      const withdrawal2 = await rabbitStaker.getUserWithdrawal(user1Address, 2);
      const withdrawal3 = await rabbitStaker.getUserWithdrawal(user1Address, 3);
      
      const initialBalance = await rabbitToken.balanceOf(user1Address);
      
      await rabbitStaker.connect(user1).claimMultiple([0, 1, 2, 3]);
      
      const totalExpected = withdrawal0.rabbitAmount + withdrawal1.rabbitAmount + withdrawal2.rabbitAmount + withdrawal3.rabbitAmount;
      expect(await rabbitToken.balanceOf(user1Address)).to.equal(initialBalance + totalExpected);
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1, user2 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
      await approveAndDeposit(rabbitToken, rabbitStaker, user2, ethers.parseEther("500"));
      
      // Create withdrawals with different vesting periods
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("100"), 15); // Ready soon
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("150"), 45); // Ready later
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user2, ethers.parseEther("80"), 20);  // Different user
    });

    it("should return correct claimable withdrawal IDs", async function () {
      const { rabbitStaker, user1, user1Address } = fixture;
      
      // Initially no withdrawals should be claimable
      let claimableIds = await rabbitStaker.getClaimableWithdrawalIds(user1Address);
      expect(claimableIds.length).to.equal(0);
      
      // Fast forward to make first withdrawal claimable
      await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60 + 1]); // 15 days
      await ethers.provider.send("evm_mine", []);
      
      claimableIds = await rabbitStaker.getClaimableWithdrawalIds(user1Address);
      expect(claimableIds.length).to.equal(1);
      expect(claimableIds[0]).to.equal(0n);
      
      // Fast forward to make second withdrawal claimable
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // Additional 30 days
      await ethers.provider.send("evm_mine", []);
      
      claimableIds = await rabbitStaker.getClaimableWithdrawalIds(user1Address);
      expect(claimableIds.length).to.equal(2);
      expect(claimableIds).to.deep.equal([0n, 1n]);
    });

    it("should return correct total claimable amount", async function () {
      const { rabbitStaker, user1, user1Address } = fixture;
      
      // Initially no amount should be claimable
      let claimableAmount = await rabbitStaker.getClaimableAmount(user1Address);
      expect(claimableAmount).to.equal(0);
      
      // Fast forward to make first withdrawal claimable
      await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60 + 1]); // 15 days
      await ethers.provider.send("evm_mine", []);
      
      const withdrawal0 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      claimableAmount = await rabbitStaker.getClaimableAmount(user1Address);
      expect(claimableAmount).to.equal(withdrawal0.rabbitAmount);
      
      // Fast forward to make second withdrawal claimable
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // Additional 30 days
      await ethers.provider.send("evm_mine", []);
      
      const withdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      claimableAmount = await rabbitStaker.getClaimableAmount(user1Address);
      expect(claimableAmount).to.equal(withdrawal0.rabbitAmount + withdrawal1.rabbitAmount);
    });

    it("should handle claimable calculations after partial claims", async function () {
      const { rabbitStaker, user1, user1Address } = fixture;
      
      // Fast forward to make both claimable
      await ethers.provider.send("evm_increaseTime", [45 * 24 * 60 * 60 + 1]); // 45 days
      await ethers.provider.send("evm_mine", []);
      
      const withdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      
      // Claim first withdrawal only
      await rabbitStaker.connect(user1).claim(0);
      
      // Should only show second withdrawal as claimable
      const claimableIds = await rabbitStaker.getClaimableWithdrawalIds(user1Address);
      expect(claimableIds.length).to.equal(1);
      expect(claimableIds[0]).to.equal(1n);
      
      const claimableAmount = await rabbitStaker.getClaimableAmount(user1Address);
      expect(claimableAmount).to.equal(withdrawal1.rabbitAmount);
    });
  });

  describe("Error Cases", function () {
    beforeEach(async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1, user2 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("200"), 30);
    });

    it("should revert on invalid withdrawal ID", async function () {
      const { rabbitStaker, user1 } = fixture;
      
      await expect(rabbitStaker.connect(user1).claim(999))
        .to.be.revertedWith("Invalid withdrawal ID");
    });

    it("should revert on claiming already claimed withdrawal", async function () {
      const { rabbitStaker, user1 } = fixture;
      
      // Fast forward time and claim
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]); // 30 days
      await ethers.provider.send("evm_mine", []);
      
      await rabbitStaker.connect(user1).claim(0);
      
      // Try to claim again
      await expect(rabbitStaker.connect(user1).claim(0))
        .to.be.revertedWith("Already claimed");
    });

    it("should revert on claiming before vesting period completes", async function () {
      const { rabbitStaker, user1 } = fixture;
      
      // Don't fast forward time - still vesting
      await expect(rabbitStaker.connect(user1).claim(0))
        .to.be.revertedWith("Still vesting");
    });

    it("should revert on claimMultiple with empty array", async function () {
      const { rabbitStaker, user1 } = fixture;
      
      await expect(rabbitStaker.connect(user1).claimMultiple([]))
        .to.be.revertedWith("Empty withdrawal IDs");
    });

    it("should revert on claimMultiple with too many withdrawals", async function () {
      const { rabbitStaker, user1 } = fixture;
      
      // Create array with 101 elements (exceeds 100 limit)
      const tooManyIds = Array.from({ length: 101 }, (_, i) => i);
      
      await expect(rabbitStaker.connect(user1).claimMultiple(tooManyIds))
        .to.be.revertedWith("Too many withdrawals per transaction");
    });

    it("should revert on claimMultiple with invalid withdrawal ID", async function () {
      const { rabbitStaker, user1 } = fixture;
      
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]); // 30 days
      await ethers.provider.send("evm_mine", []);
      
      await expect(rabbitStaker.connect(user1).claimMultiple([0, 999]))
        .to.be.revertedWith("Invalid withdrawal ID");
    });

    it("should revert on claimMultiple with already claimed withdrawal", async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1 } = fixture;
      
      // Create second withdrawal
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("100"), 15);
      
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]); // 30 days
      await ethers.provider.send("evm_mine", []);
      
      // Claim first withdrawal
      await rabbitStaker.connect(user1).claim(0);
      
      // Try to claim both (including already claimed one)
      await expect(rabbitStaker.connect(user1).claimMultiple([0, 1]))
        .to.be.revertedWith("Already claimed");
    });

    it("should revert on claimMultiple with not yet vested withdrawal", async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1 } = fixture;
      
      // Create second withdrawal with longer vesting
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("100"), 60);
      
      // Fast forward only enough for first withdrawal
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]); // 30 days
      await ethers.provider.send("evm_mine", []);
      
      // Try to claim both (second not ready yet)
      await expect(rabbitStaker.connect(user1).claimMultiple([0, 1]))
        .to.be.revertedWith("Still vesting");
    });
  });

  describe("State Validation", function () {
    beforeEach(async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1, user2 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
      await approveAndDeposit(rabbitToken, rabbitStaker, user2, ethers.parseEther("500"));
      
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("200"), 20);
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user2, ethers.parseEther("150"), 25);
    });

    it("should update total locked RABBIT correctly after claims", async function () {
      const { rabbitStaker, user1, user2, user1Address, user2Address } = fixture;
      
      const user1Withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const user2Withdrawal = await rabbitStaker.getUserWithdrawal(user2Address, 0);
      
      const initialLocked = await rabbitStaker.totalLockedRabbit();
      expect(initialLocked).to.equal(user1Withdrawal.rabbitAmount + user2Withdrawal.rabbitAmount);
      
      // Fast forward and claim user1's withdrawal
      await ethers.provider.send("evm_increaseTime", [25 * 24 * 60 * 60 + 1]); // 25 days
      await ethers.provider.send("evm_mine", []);
      
      await rabbitStaker.connect(user1).claim(0);
      
      // Total locked should decrease by user1's claimed amount
      const afterUser1Claim = await rabbitStaker.totalLockedRabbit();
      expect(afterUser1Claim).to.equal(initialLocked - user1Withdrawal.rabbitAmount);
      
      // Claim user2's withdrawal
      await rabbitStaker.connect(user2).claim(0);
      
      // Total locked should decrease by user2's claimed amount
      const afterUser2Claim = await rabbitStaker.totalLockedRabbit();
      expect(afterUser2Claim).to.equal(afterUser1Claim - user2Withdrawal.rabbitAmount);
      expect(afterUser2Claim).to.equal(0); // Should be zero after all claims
    });

    it("should maintain correct available RABBIT for withdrawals after claims", async function () {
      const { rabbitStaker, user1, user2, user1Address } = fixture;
      
      const user1Withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const initialAvailable = await rabbitStaker.getAvailableRabbitForWithdrawals();
      
      // Fast forward and claim
      await ethers.provider.send("evm_increaseTime", [25 * 24 * 60 * 60 + 1]); // 25 days
      await ethers.provider.send("evm_mine", []);
      
      await rabbitStaker.connect(user1).claim(0);
      
      // Available should increase by claimed amount (since it's no longer locked)
      const afterClaim = await rabbitStaker.getAvailableRabbitForWithdrawals();
      expect(afterClaim).to.equal(initialAvailable + user1Withdrawal.rabbitAmount);
    });

    it("should handle contract RABBIT balance correctly during claims", async function () {
      const { rabbitStaker, rabbitToken, user1, user1Address } = fixture;
      
      const withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const initialContractBalance = await rabbitToken.balanceOf(await rabbitStaker.getAddress());
      
      // Fast forward and claim
      await ethers.provider.send("evm_increaseTime", [25 * 24 * 60 * 60 + 1]); // 25 days
      await ethers.provider.send("evm_mine", []);
      
      await rabbitStaker.connect(user1).claim(0);
      
      // Contract balance should decrease by claimed amount
      const afterClaimBalance = await rabbitToken.balanceOf(await rabbitStaker.getAddress());
      expect(afterClaimBalance).to.equal(initialContractBalance - withdrawal.rabbitAmount);
    });
  });

  describe("Event Emission", function () {
    beforeEach(async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("200"), 30);
    });

    it("should emit WithdrawalClaimed event with correct parameters", async function () {
      const { rabbitStaker, user1, user1Address } = fixture;
      
      const withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]); // 30 days
      await ethers.provider.send("evm_mine", []);
      
      await expect(rabbitStaker.connect(user1).claim(0))
        .to.emit(rabbitStaker, "WithdrawalClaimed")
        .withArgs(user1Address, 0, withdrawal.rabbitAmount);
    });

    it("should emit multiple WithdrawalClaimed events for claimMultiple", async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1, user1Address } = fixture;
      
      // Create second withdrawal
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("150"), 25);
      
      const withdrawal0 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const withdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]); // 30 days
      await ethers.provider.send("evm_mine", []);
      
      const claimTx = await rabbitStaker.connect(user1).claimMultiple([0, 1]);
      
      // Check that both events were emitted
      await expect(claimTx)
        .to.emit(rabbitStaker, "WithdrawalClaimed")
        .withArgs(user1Address, 0, withdrawal0.rabbitAmount);
      
      await expect(claimTx)
        .to.emit(rabbitStaker, "WithdrawalClaimed")
        .withArgs(user1Address, 1, withdrawal1.rabbitAmount);
    });
  });

  describe("Edge Cases", function () {
    beforeEach(async function () {
      const { rabbitStaker, sRabbitToken, rabbitToken, user1 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
    });

    it("should handle claiming immediately after unlock time", async function () {
      const { rabbitStaker, sRabbitToken, user1 } = fixture;
      
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("100"), 15);
      
      // Fast forward exactly to unlock time
      await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60]); // Exactly 15 days
      await ethers.provider.send("evm_mine", []);
      
      // Should be claimable now
      await expect(rabbitStaker.connect(user1).claim(0))
        .to.not.be.reverted;
    });

    it("should handle claiming very small withdrawal amounts", async function () {
      const { rabbitStaker, sRabbitToken, user1, user1Address } = fixture;
      
      const smallAmount = ethers.parseUnits("1", 12); // Very small amount
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, smallAmount, 15);
      
      const withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      
      if (withdrawal.rabbitAmount > 0) {
        await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60 + 1]);
        await ethers.provider.send("evm_mine", []);
        
        await expect(rabbitStaker.connect(user1).claim(0))
          .to.not.be.reverted;
      }
    });

    it("should handle claiming when user has no withdrawals", async function () {
      const { rabbitStaker, user2 } = fixture;
      
      // user2 has no withdrawals
      const claimableIds = await rabbitStaker.getClaimableWithdrawalIds(await user2.getAddress());
      expect(claimableIds.length).to.equal(0);
      
      const claimableAmount = await rabbitStaker.getClaimableAmount(await user2.getAddress());
      expect(claimableAmount).to.equal(0);
      
      await expect(rabbitStaker.connect(user2).claimAll())
        .to.be.revertedWith("No claimable withdrawals");
    });
  });

  describe("Claim with Emission Rate Impact", function () {
    beforeEach(async function () {
      // Setup initial deposits for emission tests
      const { rabbitStaker, sRabbitToken, rabbitToken, user1, user2 } = fixture;
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, ethers.parseEther("1000"));
      await approveAndDeposit(rabbitToken, rabbitStaker, user2, ethers.parseEther("500"));
    });

    it("should handle claims with accumulated emission rewards", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user1Address } = fixture;
      
      // Set emission rate
      await rabbitStaker.setRabbitEmissionPerBlock(ethers.parseEther("0.1"));
      
      // Create withdrawal
      const withdrawAmount = ethers.parseEther("200");
      const vestingDays = 15;
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      
      // Mine blocks to accumulate emission
      for (let i = 0; i < 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Fast forward time past vesting period
      await ethers.provider.send("evm_increaseTime", [vestingDays * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      
      const initialRabbitBalance = await rabbitToken.balanceOf(user1Address);
      const initialTotalLocked = await rabbitStaker.totalLockedRabbit();
      
      // Get withdrawal details
      const withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      
      // Claim withdrawal
      await expect(rabbitStaker.connect(user1).claim(0))
        .to.emit(rabbitStaker, "WithdrawalClaimed")
        .withArgs(user1Address, 0, withdrawal.rabbitAmount);
      
      // Validate state changes
      expect(await rabbitToken.balanceOf(user1Address)).to.equal(initialRabbitBalance + withdrawal.rabbitAmount);
      expect(await rabbitStaker.totalLockedRabbit()).to.equal(initialTotalLocked - withdrawal.rabbitAmount);
      
      // Check withdrawal is marked as claimed
      const updatedWithdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      expect(updatedWithdrawal.claimed).to.be.true;
    });

    it("should handle claims with zero emission rate", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user1Address } = fixture;
      
      // Ensure emission is zero
      await rabbitStaker.setRabbitEmissionPerBlock(0);
      
      // Create withdrawal
      const withdrawAmount = ethers.parseEther("150");
      const vestingDays = 20;
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      
      // Mine blocks (should not accumulate emission)
      for (let i = 0; i < 15; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Fast forward time past vesting period
      await ethers.provider.send("evm_increaseTime", [vestingDays * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      
      const initialRabbitBalance = await rabbitToken.balanceOf(user1Address);
      const initialTotalLocked = await rabbitStaker.totalLockedRabbit();
      
      // Get withdrawal details
      const withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      
      // Claim withdrawal
      await expect(rabbitStaker.connect(user1).claim(0))
        .to.emit(rabbitStaker, "WithdrawalClaimed")
        .withArgs(user1Address, 0, withdrawal.rabbitAmount);
      
      // Validate state changes
      expect(await rabbitToken.balanceOf(user1Address)).to.equal(initialRabbitBalance + withdrawal.rabbitAmount);
      expect(await rabbitStaker.totalLockedRabbit()).to.equal(initialTotalLocked - withdrawal.rabbitAmount);
      
      // Check withdrawal is marked as claimed
      const updatedWithdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      expect(updatedWithdrawal.claimed).to.be.true;
    });

    it("should handle multiple claims with emission accumulation", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user1Address } = fixture;
      
      // Set emission rate
      await rabbitStaker.setRabbitEmissionPerBlock(ethers.parseEther("0.1"));
      
      // Create multiple withdrawals
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("100"), 15);
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("150"), 20);
      
      // Mine blocks to accumulate emission
      for (let i = 0; i < 12; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Fast forward time past first vesting period
      await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      
      const initialRabbitBalance = await rabbitToken.balanceOf(user1Address);
      const initialTotalLocked = await rabbitStaker.totalLockedRabbit();
      
      // Get withdrawal details
      const withdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const withdrawal2 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      
      // Claim first withdrawal
      await expect(rabbitStaker.connect(user1).claim(0))
        .to.emit(rabbitStaker, "WithdrawalClaimed")
        .withArgs(user1Address, 0, withdrawal1.rabbitAmount);
      
      // Validate state after first claim
      expect(await rabbitToken.balanceOf(user1Address)).to.equal(initialRabbitBalance + withdrawal1.rabbitAmount);
      expect(await rabbitStaker.totalLockedRabbit()).to.equal(initialTotalLocked - withdrawal1.rabbitAmount);
      
      // Fast forward time past second vesting period
      await ethers.provider.send("evm_increaseTime", [5 * 24 * 60 * 60 + 1]); // 5 more days
      await ethers.provider.send("evm_mine", []);
      
      // Claim second withdrawal
      await expect(rabbitStaker.connect(user1).claim(1))
        .to.emit(rabbitStaker, "WithdrawalClaimed")
        .withArgs(user1Address, 1, withdrawal2.rabbitAmount);
      
      // Validate final state
      expect(await rabbitToken.balanceOf(user1Address)).to.equal(initialRabbitBalance + withdrawal1.rabbitAmount + withdrawal2.rabbitAmount);
      expect(await rabbitStaker.totalLockedRabbit()).to.equal(0);
      
      // Check both withdrawals are marked as claimed
      const updatedWithdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const updatedWithdrawal2 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      expect(updatedWithdrawal1.claimed).to.be.true;
      expect(updatedWithdrawal2.claimed).to.be.true;
    });

    it("should handle claimAll with emission rewards", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user1Address } = fixture;
      
      // Set emission rate
      await rabbitStaker.setRabbitEmissionPerBlock(ethers.parseEther("0.1"));
      
      // Create multiple withdrawals
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("100"), 15);
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("150"), 20);
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("200"), 25);
      
      // Mine blocks to accumulate emission
      for (let i = 0; i < 15; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Fast forward time past all vesting periods
      await ethers.provider.send("evm_increaseTime", [25 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      
      const initialRabbitBalance = await rabbitToken.balanceOf(user1Address);
      const initialTotalLocked = await rabbitStaker.totalLockedRabbit();
      
      // Get withdrawal details
      const withdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const withdrawal2 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      const withdrawal3 = await rabbitStaker.getUserWithdrawal(user1Address, 2);
      
      const expectedTotalClaimed = withdrawal1.rabbitAmount + withdrawal2.rabbitAmount + withdrawal3.rabbitAmount;
      
      // Claim all withdrawals
      await expect(rabbitStaker.connect(user1).claimAll())
        .to.emit(rabbitStaker, "WithdrawalClaimed")
        .withArgs(user1Address, 0, withdrawal1.rabbitAmount)
        .and.to.emit(rabbitStaker, "WithdrawalClaimed")
        .withArgs(user1Address, 1, withdrawal2.rabbitAmount)
        .and.to.emit(rabbitStaker, "WithdrawalClaimed")
        .withArgs(user1Address, 2, withdrawal3.rabbitAmount);
      
      // Validate final state
      expect(await rabbitToken.balanceOf(user1Address)).to.equal(initialRabbitBalance + expectedTotalClaimed);
      expect(await rabbitStaker.totalLockedRabbit()).to.equal(0);
      
      // Check all withdrawals are marked as claimed
      const updatedWithdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const updatedWithdrawal2 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      const updatedWithdrawal3 = await rabbitStaker.getUserWithdrawal(user1Address, 2);
      expect(updatedWithdrawal1.claimed).to.be.true;
      expect(updatedWithdrawal2.claimed).to.be.true;
      expect(updatedWithdrawal3.claimed).to.be.true;
    });

    it("should handle claims with emission rate changes", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user1Address } = fixture;
      
      // Set initial emission rate
      await rabbitStaker.setRabbitEmissionPerBlock(ethers.parseEther("0.1"));
      
      // Create withdrawal
      const withdrawAmount = ethers.parseEther("300");
      const vestingDays = 30;
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, vestingDays);
      
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
      
      // Fast forward time past vesting period
      await ethers.provider.send("evm_increaseTime", [vestingDays * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      
      const initialRabbitBalance = await rabbitToken.balanceOf(user1Address);
      const initialTotalLocked = await rabbitStaker.totalLockedRabbit();
      
      // Get withdrawal details
      const withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      
      // Claim withdrawal
      await expect(rabbitStaker.connect(user1).claim(0))
        .to.emit(rabbitStaker, "WithdrawalClaimed")
        .withArgs(user1Address, 0, withdrawal.rabbitAmount);
      
      // Validate state changes
      expect(await rabbitToken.balanceOf(user1Address)).to.equal(initialRabbitBalance + withdrawal.rabbitAmount);
      expect(await rabbitStaker.totalLockedRabbit()).to.equal(initialTotalLocked - withdrawal.rabbitAmount);
      
      // Check withdrawal is marked as claimed
      const updatedWithdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      expect(updatedWithdrawal.claimed).to.be.true;
    });

    it("should handle claimMultiple with emission rewards", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, user1, user1Address } = fixture;
      
      // Set emission rate
      await rabbitStaker.setRabbitEmissionPerBlock(ethers.parseEther("0.1"));
      
      // Create multiple withdrawals
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("100"), 15);
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("150"), 20);
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, ethers.parseEther("200"), 25);
      
      // Mine blocks to accumulate emission
      for (let i = 0; i < 15; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Fast forward time past all vesting periods
      await ethers.provider.send("evm_increaseTime", [25 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      
      const initialRabbitBalance = await rabbitToken.balanceOf(user1Address);
      const initialTotalLocked = await rabbitStaker.totalLockedRabbit();
      
      // Get withdrawal details
      const withdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const withdrawal2 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      const withdrawal3 = await rabbitStaker.getUserWithdrawal(user1Address, 2);
      
      // Claim specific withdrawals (0 and 2)
      await expect(rabbitStaker.connect(user1).claimMultiple([0, 2]))
        .to.emit(rabbitStaker, "WithdrawalClaimed")
        .withArgs(user1Address, 0, withdrawal1.rabbitAmount)
        .and.to.emit(rabbitStaker, "WithdrawalClaimed")
        .withArgs(user1Address, 2, withdrawal3.rabbitAmount);
      
      // Validate state after partial claims
      const expectedClaimed = withdrawal1.rabbitAmount + withdrawal3.rabbitAmount;
      expect(await rabbitToken.balanceOf(user1Address)).to.equal(initialRabbitBalance + expectedClaimed);
      expect(await rabbitStaker.totalLockedRabbit()).to.equal(initialTotalLocked - expectedClaimed);
      
      // Check specific withdrawals are marked as claimed
      const updatedWithdrawal1 = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      const updatedWithdrawal2 = await rabbitStaker.getUserWithdrawal(user1Address, 1);
      const updatedWithdrawal3 = await rabbitStaker.getUserWithdrawal(user1Address, 2);
      expect(updatedWithdrawal1.claimed).to.be.true;
      expect(updatedWithdrawal2.claimed).to.be.false; // Not claimed yet
      expect(updatedWithdrawal3.claimed).to.be.true;
    });
  });
});
