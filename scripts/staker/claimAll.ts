/**
 * RabbitStaker Claim All Script
 * 
 * This script allows users to claim all available (vested) withdrawals in a single transaction.
 * It automatically identifies all claimable withdrawals and processes them together.
 * 
 * Usage:
 *   npx hardhat run scripts/staker/claimAll.ts --network <network>
 * 
 * Environment Variables:
 *   USER_ADDRESS: Address to claim for (optional, defaults to deployer)
 */

import { ethers } from "hardhat";
import { addressFor } from "../metadata";

async function main() {
  const [deployer] = await ethers.getSigners();
  const userAddress = process.env.USER_ADDRESS || deployer.address;

  console.log("Claiming all available withdrawals...");
  console.log("User address:", userAddress);

  // Get contract addresses from metadata
  const rabbitStakerAddress = addressFor("RabbitStaker_Proxy");

  // Connect to contract
  const rabbitStaker = await ethers.getContractAt("RabbitStaker", rabbitStakerAddress);

  // Get RABBIT token for balance checking
  const rabbitToken = await rabbitStaker.getRabbitToken();

  // Check user's withdrawal count
  const withdrawalCount = await rabbitStaker.getUserWithdrawalCount(userAddress);
  console.log("Total withdrawals:", withdrawalCount.toString());

  if (withdrawalCount === 0n) {
    console.log("No withdrawals found for this user");
    return;
  }

  // Get claimable withdrawal IDs
  const claimableIds = await rabbitStaker.getClaimableWithdrawalIds(userAddress);
  console.log("Claimable withdrawal IDs:", claimableIds.map(id => id.toString()).join(", "));

  if (claimableIds.length === 0) {
    console.log("No claimable withdrawals found");
    
    // Show all withdrawals with their status
    console.log("\nAll withdrawals status:");
    for (let i = 0; i < Number(withdrawalCount); i++) {
      const withdrawal = await rabbitStaker.getUserWithdrawal(userAddress, i);
      const unlockTime = new Date(Number(withdrawal.unlockTime) * 1000);
      const isClaimable = withdrawal.unlockTime <= BigInt(Math.floor(Date.now() / 1000)) && !withdrawal.claimed;
      
      console.log(`  Withdrawal ${i}:`);
      console.log(`    Amount: ${ethers.formatEther(withdrawal.rabbitAmount)} RABBIT`);
      console.log(`    Unlock time: ${unlockTime.toISOString()}`);
      console.log(`    Claimed: ${withdrawal.claimed}`);
      console.log(`    Claimable: ${isClaimable}`);
    }
    return;
  }

  // Get total claimable amount
  const totalClaimableAmount = await rabbitStaker.getClaimableAmount(userAddress);
  console.log("Total claimable amount:", ethers.formatEther(totalClaimableAmount), "RABBIT");

  // Get user's RABBIT balance before claiming
  const rabbitBalanceBefore = await rabbitToken.balanceOf(userAddress);
  console.log("RABBIT balance before:", ethers.formatEther(rabbitBalanceBefore), "RABBIT");

  // Show details of claimable withdrawals
  console.log("\nClaimable withdrawals details:");
  for (const id of claimableIds) {
    const withdrawal = await rabbitStaker.getUserWithdrawal(userAddress, id);
    const unlockTime = new Date(Number(withdrawal.unlockTime) * 1000);
    
    console.log(`  Withdrawal ${id}:`);
    console.log(`    Amount: ${ethers.formatEther(withdrawal.rabbitAmount)} RABBIT`);
    console.log(`    Unlock time: ${unlockTime.toISOString()}`);
  }

  // Perform claim all
  console.log("\nExecuting claim all...");
  const claimTx = await rabbitStaker.connect(deployer).claimAll();
  const receipt = await claimTx.wait();

  // Get user's RABBIT balance after claiming
  const rabbitBalanceAfter = await rabbitToken.balanceOf(userAddress);
  const claimedAmount = rabbitBalanceAfter - rabbitBalanceBefore;

  console.log("✓ Claim all successful!");
  console.log("Transaction hash:", receipt?.hash);
  console.log("Gas used:", receipt?.gasUsed?.toString());
  console.log("Total claimed:", ethers.formatEther(claimedAmount), "RABBIT");

  // Display updated balances
  const newTotalLockedRabbit = await rabbitStaker.totalLockedRabbit();
  const newClaimableAmount = await rabbitStaker.getClaimableAmount(userAddress);
  
  console.log("\nUpdated balances:");
  console.log("User RABBIT balance:", ethers.formatEther(rabbitBalanceAfter));
  console.log("Total locked RABBIT in pool:", ethers.formatEther(newTotalLockedRabbit));
  console.log("Remaining claimable amount:", ethers.formatEther(newClaimableAmount), "RABBIT");

  // Show remaining withdrawals
  const remainingClaimableIds = await rabbitStaker.getClaimableWithdrawalIds(userAddress);
  if (remainingClaimableIds.length > 0) {
    console.log("Remaining claimable withdrawal IDs:", remainingClaimableIds.map(id => id.toString()).join(", "));
  } else {
    console.log("All withdrawals have been claimed!");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
