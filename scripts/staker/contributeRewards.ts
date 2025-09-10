/**
 * RabbitStaker Contribute Rewards Script
 * 
 * This script allows users to contribute RABBIT tokens to the staking pool
 * to enhance the exchange rate for all stakers. Contributors do not receive
 * sRABBIT tokens in return - this is a pure contribution to the pool.
 * 
 * Usage:
 *   npx hardhat run scripts/staker/contributeRewards.ts --network <network>
 * 
 * Environment Variables:
 *   CONTRIBUTION_AMOUNT: Amount of RABBIT tokens to contribute (in wei)
 *   USER_ADDRESS: Address to contribute from (optional, defaults to deployer)
 */

import { ethers } from "hardhat";
import { addressFor } from "../metadata";

async function main() {
  const [deployer] = await ethers.getSigners();
  const userAddress = process.env.USER_ADDRESS || deployer.address;
  const contributionAmount = process.env.CONTRIBUTION_AMOUNT;

  if (!contributionAmount) {
    throw new Error("CONTRIBUTION_AMOUNT environment variable is required");
  }

  console.log("Contributing RABBIT rewards to staking pool...");
  console.log("User address:", userAddress);
  console.log("Contribution amount:", ethers.formatEther(contributionAmount), "RABBIT");

  // Get contract addresses from metadata
  const rabbitStakerAddress = addressFor("RabbitStaker_Proxy");
  const rabbitTokenAddress = addressFor("MockRabbitToken");

  // Connect to contracts
  const rabbitStaker = await ethers.getContractAt("RabbitStaker", rabbitStakerAddress);
  const rabbitToken = await ethers.getContractAt("MockERC20", rabbitTokenAddress);
  const sRabbitToken = await ethers.getContractAt("SRabbitToken", addressFor("SRabbitToken"));

  // Check user's RABBIT balance
  const userBalance = await rabbitToken.balanceOf(userAddress);
  console.log("User RABBIT balance:", ethers.formatEther(userBalance), "RABBIT");

  if (userBalance < BigInt(contributionAmount)) {
    throw new Error("Insufficient RABBIT balance");
  }

  // Get current pool state
  const totalRabbitInPool = await rabbitStaker.totalRabbitInPool();
  const rabbitPerShare = await rabbitStaker.getRabbitPerShare();
  const sRabbitTotalSupply = await sRabbitToken.totalSupply();
  
  console.log("Current pool state:");
  console.log("  Total RABBIT in pool:", ethers.formatEther(totalRabbitInPool));
  console.log("  Current exchange rate:", ethers.formatEther(rabbitPerShare));
  console.log("  sRABBIT total supply:", ethers.formatEther(sRabbitTotalSupply));

  // Calculate expected new exchange rate
  const newTotalRabbit = totalRabbitInPool + BigInt(contributionAmount);
  const newRabbitPerShare = sRabbitTotalSupply > 0n ? (newTotalRabbit * ethers.parseEther("1")) / sRabbitTotalSupply : ethers.parseEther("1");
  
  console.log("Expected new pool state:");
  console.log("  New total RABBIT in pool:", ethers.formatEther(newTotalRabbit));
  console.log("  New exchange rate:", ethers.formatEther(newRabbitPerShare));
  console.log("  Exchange rate improvement:", ethers.formatEther(newRabbitPerShare - rabbitPerShare));

  // Check allowance
  const allowance = await rabbitToken.allowance(userAddress, rabbitStakerAddress);
  console.log("Current allowance:", ethers.formatEther(allowance), "RABBIT");

  // Approve if needed
  if (allowance < BigInt(contributionAmount)) {
    console.log("Approving RABBIT tokens...");
    const approveTx = await rabbitToken.connect(deployer).approve(rabbitStakerAddress, contributionAmount);
    await approveTx.wait(10);
    console.log("✓ Approval confirmed");
  }

  // Perform contribution
  console.log("\nExecuting reward contribution...");
  const contributeTx = await rabbitStaker.connect(deployer).contributeRewards(contributionAmount);
  const receipt = await contributeTx.wait();

  // Get updated pool state
  const newTotalRabbitInPool = await rabbitStaker.totalRabbitInPool();
  const newRabbitPerShareAfter = await rabbitStaker.getRabbitPerShare();

  console.log("✓ Reward contribution successful!");
  console.log("Transaction hash:", receipt?.hash);
  console.log("Gas used:", receipt?.gasUsed?.toString());

  // Display updated balances and state
  const newUserBalance = await rabbitToken.balanceOf(userAddress);
  
  console.log("\nUpdated state:");
  console.log("User RABBIT balance:", ethers.formatEther(newUserBalance));
  console.log("Total RABBIT in pool:", ethers.formatEther(newTotalRabbitInPool));
  console.log("New exchange rate:", ethers.formatEther(newRabbitPerShareAfter));
  console.log("Exchange rate improvement:", ethers.formatEther(newRabbitPerShareAfter - rabbitPerShare));

  // Calculate impact on existing stakers
  if (sRabbitTotalSupply > 0n) {
    const totalValueAdded = (newRabbitPerShareAfter - rabbitPerShare) * sRabbitTotalSupply / ethers.parseEther("1");
    console.log("Total value added to existing stakers:", ethers.formatEther(totalValueAdded), "RABBIT");
  }

  console.log("\nNote: This contribution enhances the exchange rate for all stakers without receiving sRABBIT tokens in return.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
