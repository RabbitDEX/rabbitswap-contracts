/**
 * RabbitStaker Withdraw Script
 * 
 * This script allows users to withdraw sRABBIT tokens with a specified vesting period.
 * The conversion rate depends on the vesting period (longer vesting = better rate).
 * 
 * Usage:
 *   npx hardhat run scripts/staker/withdraw.ts --network <network>
 * 
 * Environment Variables:
 *   WITHDRAW_AMOUNT: Amount of sRABBIT tokens to withdraw (in wei)
 *   VESTING_DAYS: Vesting period in days (15-180)
 *   USER_ADDRESS: Address to withdraw for (optional, defaults to deployer)
 */

import { ethers } from "hardhat";
import { addressFor } from "../metadata";

async function main() {
  const [deployer] = await ethers.getSigners();
  const userAddress = process.env.USER_ADDRESS || deployer.address;
  const withdrawAmount = process.env.WITHDRAW_AMOUNT;
  const vestingDays = process.env.VESTING_DAYS;

  if (!withdrawAmount) {
    throw new Error("WITHDRAW_AMOUNT environment variable is required");
  }

  if (!vestingDays) {
    throw new Error("VESTING_DAYS environment variable is required");
  }

  const vestingDaysNum = parseInt(vestingDays);
  if (vestingDaysNum < 15 || vestingDaysNum > 180) {
    throw new Error("VESTING_DAYS must be between 15 and 180");
  }

  console.log("Withdrawing sRABBIT tokens...");
  console.log("User address:", userAddress);
  console.log("Withdraw amount:", ethers.formatEther(withdrawAmount), "sRABBIT");
  console.log("Vesting period:", vestingDaysNum, "days");

  // Get contract addresses from metadata
  const rabbitStakerAddress = addressFor("RabbitStaker_Proxy");

  // Connect to contract
  const rabbitStaker = await ethers.getContractAt("RabbitStaker", rabbitStakerAddress);
  const sRabbitToken = await ethers.getContractAt("SRabbitToken", addressFor("SRabbitToken"));

  // Check user's sRABBIT balance
  const userSRabbitBalance = await sRabbitToken.balanceOf(userAddress);
  console.log("User sRABBIT balance:", ethers.formatEther(userSRabbitBalance), "sRABBIT");

  if (userSRabbitBalance < BigInt(withdrawAmount)) {
    throw new Error("Insufficient sRABBIT balance");
  }

  // Check vesting parameters
  const vestingParams = await rabbitStaker.getVestingParameters();
  const [minVestingDays, maxVestingDays, minConversionRate, maxConversionRate] = vestingParams;
  
  console.log("Vesting parameters:");
  console.log("  Min vesting days:", minVestingDays.toString());
  console.log("  Max vesting days:", maxVestingDays.toString());
  console.log("  Min conversion rate:", (Number(minConversionRate) / 100).toFixed(2) + "%");
  console.log("  Max conversion rate:", (Number(maxConversionRate) / 100).toFixed(2) + "%");

  // Calculate conversion rate and expected RABBIT output
  const conversionRate = await rabbitStaker.calculateConversionRate(vestingDaysNum);
  const expectedRabbitOutput = await rabbitStaker.calculateRabbitOutput(withdrawAmount, vestingDaysNum);
  
  console.log("Conversion rate for", vestingDaysNum, "days:", (Number(conversionRate) / 100).toFixed(2) + "%");
  console.log("Expected RABBIT output:", ethers.formatEther(expectedRabbitOutput), "RABBIT");

  // Check pool liquidity
  const availableRabbit = await rabbitStaker.getAvailableRabbitForWithdrawals();
  console.log("Available RABBIT in pool:", ethers.formatEther(availableRabbit), "RABBIT");

  if (availableRabbit < expectedRabbitOutput) {
    throw new Error("Insufficient RABBIT liquidity in pool for withdrawal");
  }

  // Get current withdrawal count
  const currentWithdrawalCount = await rabbitStaker.getUserWithdrawalCount(userAddress);
  console.log("Current withdrawal count:", currentWithdrawalCount.toString());

  // Check allowance
  const allowance = await sRabbitToken.allowance(userAddress, rabbitStakerAddress);
  console.log("Current allowance:", ethers.formatEther(allowance), "sRABBIT");

  // Approve if needed
  if (allowance < BigInt(withdrawAmount)) {
    console.log("Approving sRABBIT tokens...");
    const approveTx = await sRabbitToken.connect(deployer).approve(rabbitStakerAddress, withdrawAmount);
    await approveTx.wait();
    console.log("✓ Approval confirmed");
  }

  // Perform withdrawal
  console.log("\nExecuting withdrawal...");
  const withdrawTx = await rabbitStaker.connect(deployer).withdraw(withdrawAmount, vestingDaysNum);
  const receipt = await withdrawTx.wait();

  // Get new withdrawal count
  const newWithdrawalCount = await rabbitStaker.getUserWithdrawalCount(userAddress);
  const withdrawalId = newWithdrawalCount - 1n;

  // Get withdrawal details
  const withdrawal = await rabbitStaker.getUserWithdrawal(userAddress, withdrawalId);
  const unlockTime = new Date(Number(withdrawal.unlockTime) * 1000);

  console.log("✓ Withdrawal successful!");
  console.log("Transaction hash:", receipt?.hash);
  console.log("Gas used:", receipt?.gasUsed?.toString());
  console.log("Withdrawal ID:", withdrawalId.toString());
  console.log("RABBIT amount locked:", ethers.formatEther(withdrawal.rabbitAmount), "RABBIT");
  console.log("Unlock time:", unlockTime.toISOString());

  // Display updated balances
  const newUserSRabbitBalance = await sRabbitToken.balanceOf(userAddress);
  const totalLockedRabbit = await rabbitStaker.totalLockedRabbit();
  
  console.log("\nUpdated balances:");
  console.log("User sRABBIT balance:", ethers.formatEther(newUserSRabbitBalance));
  console.log("Total locked RABBIT in pool:", ethers.formatEther(totalLockedRabbit));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
