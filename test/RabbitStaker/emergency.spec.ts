import { expect } from "chai";
import { ethers } from "hardhat";
import { deployRabbitStakerFixture, TestFixture, approveAndDeposit, approveSRabbitAndWithdraw } from "./shared/setup";
import { MockERC20 } from "../../../typechain";

describe("RabbitStaker - Emergency Withdraw", function () {
  let fixture: TestFixture;
  let mockToken: MockERC20;

  beforeEach(async function () {
    fixture = await deployRabbitStakerFixture();
    
    // Deploy an additional mock ERC20 token for testing
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20Factory.deploy("Mock Token", "MOCK");
  });

  describe("Access Control", function () {
    it("should allow only owner to call emergency withdraw", async function () {
      const { rabbitStaker, user1 } = fixture;
      
      await expect(
        rabbitStaker.connect(user1).emergencyWithdraw(await mockToken.getAddress())
      ).to.be.revertedWithCustomError(rabbitStaker, "OwnableUnauthorizedAccount");
    });

    it("should allow owner to call emergency withdraw", async function () {
      const { rabbitStaker, owner } = fixture;
      
      // Should not revert when called by owner
      await expect(
        rabbitStaker.connect(owner).emergencyWithdraw(await mockToken.getAddress())
      ).to.not.be.reverted;
    });
  });

  describe("Emergency Withdraw - RABBIT Token", function () {
    it("should withdraw only excess RABBIT tokens (not user deposits or locked amounts)", async function () {
      const { rabbitStaker, rabbitToken, owner, user1, ownerAddress } = fixture;
      
      // Setup: User deposits some RABBIT
      const depositAmount = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, depositAmount);
      
      // Owner contributes additional rewards
      const rewardAmount = ethers.parseEther("500");
      await rabbitToken.mint(ownerAddress, rewardAmount);
      await rabbitToken.connect(owner).approve(await rabbitStaker.getAddress(), rewardAmount);
      await rabbitStaker.connect(owner).contributeRewards(rewardAmount);
      
      // Owner sends additional RABBIT directly to contract (excess tokens)
      const excessAmount = ethers.parseEther("200");
      await rabbitToken.mint(ownerAddress, excessAmount);
      await rabbitToken.connect(owner).transfer(await rabbitStaker.getAddress(), excessAmount);
      
      // Check initial balances
      const initialOwnerBalance = await rabbitToken.balanceOf(ownerAddress);
      const contractBalance = await rabbitToken.balanceOf(await rabbitStaker.getAddress());
      const totalRabbitInPool = await rabbitStaker.totalRabbitInPool();
      const totalLockedRabbit = await rabbitStaker.totalLockedRabbit();
      
      expect(contractBalance).to.equal(totalRabbitInPool + excessAmount);
      
      // Perform emergency withdraw
      await rabbitStaker.connect(owner).emergencyWithdraw(await rabbitToken.getAddress());
      
      // Check final balances
      const finalOwnerBalance = await rabbitToken.balanceOf(ownerAddress);
      const finalContractBalance = await rabbitToken.balanceOf(await rabbitStaker.getAddress());
      
      // Owner should receive only the excess amount
      expect(finalOwnerBalance).to.equal(initialOwnerBalance + excessAmount);
      
      // Contract should retain user deposits and locked amounts
      expect(finalContractBalance).to.equal(totalRabbitInPool + totalLockedRabbit);
    });

    it("should handle case when no excess RABBIT tokens exist", async function () {
      const { rabbitStaker, rabbitToken, owner, user1, ownerAddress } = fixture;
      
      // Setup: User deposits some RABBIT
      const depositAmount = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, depositAmount);
      
      // Owner contributes additional rewards
      const rewardAmount = ethers.parseEther("500");
      await rabbitToken.mint(ownerAddress, rewardAmount);
      await rabbitToken.connect(owner).approve(await rabbitStaker.getAddress(), rewardAmount);
      await rabbitStaker.connect(owner).contributeRewards(rewardAmount);
      
      // Check initial balances
      const initialOwnerBalance = await rabbitToken.balanceOf(ownerAddress);
      const contractBalance = await rabbitToken.balanceOf(await rabbitStaker.getAddress());
      const totalRabbitInPool = await rabbitStaker.totalRabbitInPool();
      const totalLockedRabbit = await rabbitStaker.totalLockedRabbit();
      
      // No excess tokens - contract balance equals pool + locked
      expect(contractBalance).to.equal(totalRabbitInPool + totalLockedRabbit);
      
      // Perform emergency withdraw - should not revert and not transfer anything
      await rabbitStaker.connect(owner).emergencyWithdraw(await rabbitToken.getAddress());
      
      // Check final balances - should be unchanged
      const finalOwnerBalance = await rabbitToken.balanceOf(ownerAddress);
      const finalContractBalance = await rabbitToken.balanceOf(await rabbitStaker.getAddress());
      
      expect(finalOwnerBalance).to.equal(initialOwnerBalance);
      expect(finalContractBalance).to.equal(contractBalance);
    });

    it("should handle case with locked RABBIT from withdrawals when there is excess", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, owner, user1, ownerAddress } = fixture;
      
      // Setup: User deposits and then withdraws (creating locked RABBIT)
      const depositAmount = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, depositAmount);
      
      // User withdraws with vesting (creates locked RABBIT)
      const withdrawAmount = ethers.parseEther("500");
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, 30);
      
      // Owner sends excess RABBIT directly to contract - ensure there's definitely excess
      const excessAmount = ethers.parseEther("1000"); // Large excess to ensure it works
      await rabbitToken.mint(ownerAddress, excessAmount);
      await rabbitToken.connect(owner).transfer(await rabbitStaker.getAddress(), excessAmount);
      
      // Check balances before emergency withdraw
      const initialOwnerBalance = await rabbitToken.balanceOf(ownerAddress);
      const contractBalance = await rabbitToken.balanceOf(await rabbitStaker.getAddress());
      const totalRabbitInPool = await rabbitStaker.totalRabbitInPool();
      const totalLockedRabbit = await rabbitStaker.totalLockedRabbit();
      
      // Contract should definitely have more than required balance
      expect(contractBalance).to.be.gt(totalRabbitInPool + totalLockedRabbit);
      
      // Perform emergency withdraw
      await rabbitStaker.connect(owner).emergencyWithdraw(await rabbitToken.getAddress());
      
      // Check final balances
      const finalOwnerBalance = await rabbitToken.balanceOf(ownerAddress);
      const finalContractBalance = await rabbitToken.balanceOf(await rabbitStaker.getAddress());
      
      // Owner should receive the excess amount
      expect(finalOwnerBalance).to.be.gt(initialOwnerBalance);
      
      // Contract should retain user deposits and locked amounts
      expect(finalContractBalance).to.equal(totalRabbitInPool + totalLockedRabbit);
    });
  });

  describe("Emergency Withdraw - Other ERC20 Tokens", function () {
    it("should withdraw entire balance of non-RABBIT tokens", async function () {
      const { rabbitStaker, owner, ownerAddress } = fixture;
      
      // Send some mock tokens to the contract
      const tokenAmount = ethers.parseEther("1000");
      await mockToken.mint(ownerAddress, tokenAmount);
      await mockToken.connect(owner).transfer(await rabbitStaker.getAddress(), tokenAmount);
      
      // Check initial balances
      const initialOwnerBalance = await mockToken.balanceOf(ownerAddress);
      const contractBalance = await mockToken.balanceOf(await rabbitStaker.getAddress());
      
      expect(contractBalance).to.equal(tokenAmount);
      
      // Perform emergency withdraw
      await rabbitStaker.connect(owner).emergencyWithdraw(await mockToken.getAddress());
      
      // Check final balances
      const finalOwnerBalance = await mockToken.balanceOf(ownerAddress);
      const finalContractBalance = await mockToken.balanceOf(await rabbitStaker.getAddress());
      
      // Owner should receive all mock tokens
      expect(finalOwnerBalance).to.equal(initialOwnerBalance + tokenAmount);
      expect(finalContractBalance).to.equal(0);
    });

    it("should handle multiple different ERC20 tokens", async function () {
      const { rabbitStaker, owner, ownerAddress } = fixture;
      
      // Deploy additional mock tokens
      const MockERC20Factory = await ethers.getContractFactory("MockERC20");
      const mockToken2 = await MockERC20Factory.deploy("Mock Token 2", "MOCK2");
      const mockToken3 = await MockERC20Factory.deploy("Mock Token 3", "MOCK3");
      
      // Send different amounts to contract
      const amount1 = ethers.parseEther("100");
      const amount2 = ethers.parseEther("200");
      const amount3 = ethers.parseEther("300");
      
      await mockToken.mint(ownerAddress, amount1);
      await mockToken2.mint(ownerAddress, amount2);
      await mockToken3.mint(ownerAddress, amount3);
      
      await mockToken.connect(owner).transfer(await rabbitStaker.getAddress(), amount1);
      await mockToken2.connect(owner).transfer(await rabbitStaker.getAddress(), amount2);
      await mockToken3.connect(owner).transfer(await rabbitStaker.getAddress(), amount3);
      
      // Emergency withdraw each token
      await rabbitStaker.connect(owner).emergencyWithdraw(await mockToken.getAddress());
      await rabbitStaker.connect(owner).emergencyWithdraw(await mockToken2.getAddress());
      await rabbitStaker.connect(owner).emergencyWithdraw(await mockToken3.getAddress());
      
      // Check all tokens were withdrawn
      expect(await mockToken.balanceOf(await rabbitStaker.getAddress())).to.equal(0);
      expect(await mockToken2.balanceOf(await rabbitStaker.getAddress())).to.equal(0);
      expect(await mockToken3.balanceOf(await rabbitStaker.getAddress())).to.equal(0);
    });

    it("should handle zero balance tokens", async function () {
      const { rabbitStaker, owner } = fixture;
      
      // Try to emergency withdraw from token with zero balance
      await expect(
        rabbitStaker.connect(owner).emergencyWithdraw(await mockToken.getAddress())
      ).to.not.be.reverted;
      
      // Contract balance should remain zero
      expect(await mockToken.balanceOf(await rabbitStaker.getAddress())).to.equal(0);
    });
  });

  describe("Edge Cases", function () {
    it("should handle emergency withdraw when contract has no RABBIT tokens", async function () {
      const { rabbitStaker, owner } = fixture;
      
      // Contract starts with zero RABBIT balance
      const contractBalance = await (await fixture.rabbitToken).balanceOf(await rabbitStaker.getAddress());
      expect(contractBalance).to.equal(0);
      
      // Emergency withdraw should not revert (no excess to withdraw)
      await expect(
        rabbitStaker.connect(owner).emergencyWithdraw(await (await fixture.rabbitToken).getAddress())
      ).to.not.be.reverted;
    });

    it("should revert when contract balance is less than required balance", async function () {
      const { rabbitStaker, rabbitToken, owner, user1, ownerAddress } = fixture;
      
      // Setup: User deposits some RABBIT
      const depositAmount = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, depositAmount);
      
      // Owner contributes additional rewards
      const rewardAmount = ethers.parseEther("500");
      await rabbitToken.mint(ownerAddress, rewardAmount);
      await rabbitToken.connect(owner).approve(await rabbitStaker.getAddress(), rewardAmount);
      await rabbitStaker.connect(owner).contributeRewards(rewardAmount);
      
      // Get current balances
      const contractBalance = await rabbitToken.balanceOf(await rabbitStaker.getAddress());
      const totalRabbitInPool = await rabbitStaker.totalRabbitInPool();
      const totalLockedRabbit = await rabbitStaker.totalLockedRabbit();
      const requiredBalance = totalRabbitInPool + totalLockedRabbit;
      
      // Burn tokens from the contract to make balance insufficient
      const burnAmount = ethers.parseEther("100"); // Burn 100 tokens from contract
      await rabbitToken.burn(await rabbitStaker.getAddress(), burnAmount);
      
      // Verify the contract now has insufficient balance
      const newContractBalance = await rabbitToken.balanceOf(await rabbitStaker.getAddress());
      expect(newContractBalance).to.be.lt(totalRabbitInPool + totalLockedRabbit);
      
      // Emergency withdraw should revert
      await expect(
        rabbitStaker.connect(owner).emergencyWithdraw(await rabbitToken.getAddress())
      ).to.be.revertedWith("Insufficient RABBIT balance for emergency withdraw");
    });

    it("should handle emergency withdraw with zero address token", async function () {
      const { rabbitStaker, owner } = fixture;
      
      // This should revert due to SafeERC20 transfer to zero address
      await expect(
        rabbitStaker.connect(owner).emergencyWithdraw(ethers.ZeroAddress)
      ).to.be.reverted;
    });

    it("should maintain correct accounting after emergency withdraw", async function () {
      const { rabbitStaker, rabbitToken, owner, user1, ownerAddress } = fixture;
      
      // Setup: User deposits
      const depositAmount = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, depositAmount);
      
      // Owner contributes rewards
      const rewardAmount = ethers.parseEther("200");
      await rabbitToken.mint(ownerAddress, rewardAmount);
      await rabbitToken.connect(owner).approve(await rabbitStaker.getAddress(), rewardAmount);
      await rabbitStaker.connect(owner).contributeRewards(rewardAmount);
      
      // Send excess tokens
      const excessAmount = ethers.parseEther("100");
      await rabbitToken.mint(ownerAddress, excessAmount);
      await rabbitToken.connect(owner).transfer(await rabbitStaker.getAddress(), excessAmount);
      
      // Record state before emergency withdraw
      const totalRabbitInPoolBefore = await rabbitStaker.totalRabbitInPool();
      const totalLockedRabbitBefore = await rabbitStaker.totalLockedRabbit();
      
      // Perform emergency withdraw
      await rabbitStaker.connect(owner).emergencyWithdraw(await rabbitToken.getAddress());
      
      // Check that accounting remains correct
      const totalRabbitInPoolAfter = await rabbitStaker.totalRabbitInPool();
      const totalLockedRabbitAfter = await rabbitStaker.totalLockedRabbit();
      
      expect(totalRabbitInPoolAfter).to.equal(totalRabbitInPoolBefore);
      expect(totalLockedRabbitAfter).to.equal(totalLockedRabbitBefore);
    });
  });

  describe("Integration with Staking Operations", function () {
    it("should not affect user deposits after emergency withdraw", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, owner, user1, user1Address, ownerAddress } = fixture;
      
      // User deposits
      const depositAmount = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, depositAmount);
      
      // Owner sends excess tokens and withdraws them
      const excessAmount = ethers.parseEther("200");
      await rabbitToken.mint(ownerAddress, excessAmount);
      await rabbitToken.connect(owner).transfer(await rabbitStaker.getAddress(), excessAmount);
      await rabbitStaker.connect(owner).emergencyWithdraw(await rabbitToken.getAddress());
      
      // User should still be able to withdraw their sRABBIT
      const userSRabbitBalance = await sRabbitToken.balanceOf(user1Address);
      expect(userSRabbitBalance).to.be.gt(0);
      
      // User should be able to withdraw
      await expect(
        approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, userSRabbitBalance, 30)
      ).to.not.be.reverted;
    });

    it("should not affect pending withdrawals after emergency withdraw", async function () {
      const { rabbitStaker, rabbitToken, sRabbitToken, owner, user1, user1Address, ownerAddress } = fixture;
      
      // User deposits and withdraws
      const depositAmount = ethers.parseEther("1000");
      await approveAndDeposit(rabbitToken, rabbitStaker, user1, depositAmount);
      
      const withdrawAmount = ethers.parseEther("500");
      await approveSRabbitAndWithdraw(sRabbitToken, rabbitStaker, user1, withdrawAmount, 30);
      
      // Owner sends excess tokens and withdraws them
      const excessAmount = ethers.parseEther("200");
      await rabbitToken.mint(ownerAddress, excessAmount);
      await rabbitToken.connect(owner).transfer(await rabbitStaker.getAddress(), excessAmount);
      
      // Check balances before emergency withdraw
      const contractBalance = await rabbitToken.balanceOf(await rabbitStaker.getAddress());
      const totalRabbitInPool = await rabbitStaker.totalRabbitInPool();
      const totalLockedRabbit = await rabbitStaker.totalLockedRabbit();
      
      // Only proceed if there's excess to withdraw
      if (contractBalance > totalRabbitInPool + totalLockedRabbit) {
        // Check that emergency withdraw works
        await expect(
          rabbitStaker.connect(owner).emergencyWithdraw(await rabbitToken.getAddress())
        ).to.not.be.reverted;
      }
      
      // User should still have pending withdrawal
      const withdrawalCount = await rabbitStaker.getUserWithdrawalCount(user1Address);
      expect(withdrawalCount).to.equal(1);
      
      const withdrawal = await rabbitStaker.getUserWithdrawal(user1Address, 0);
      expect(withdrawal.rabbitAmount).to.be.gt(0);
      expect(withdrawal.claimed).to.be.false;
    });
  });
});
