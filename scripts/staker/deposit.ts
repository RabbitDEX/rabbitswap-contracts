/**
 * RabbitStaker Deposit Script
 * 
 * This script allows users to deposit RABBIT tokens and receive sRABBIT in return.
 * The exchange rate is calculated based on the current pool state.
 * 
 * Usage:
 *   npx hardhat run scripts/staker/deposit.ts --network <network>
 * 
 * Environment Variables:
 *   DEPOSIT_AMOUNT: Amount of RABBIT tokens to deposit (in wei)
 *   USER_ADDRESS: Address to deposit for (optional, defaults to deployer)
 */

import { ethers } from "hardhat";
import { addressFor } from "../metadata";

async function main() {
  const [deployer] = await ethers.getSigners();
  const userAddress = process.env.USER_ADDRESS || deployer.address;
  const depositAmount = process.env.DEPOSIT_AMOUNT;

  if (!depositAmount) {
    throw new Error("DEPOSIT_AMOUNT environment variable is required");
  }

  console.log("Depositing RABBIT tokens...");
  console.log("User address:", userAddress);
  console.log("Deposit amount:", ethers.formatEther(depositAmount), "RABBIT");

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

  if (userBalance < BigInt(depositAmount)) {
    throw new Error("Insufficient RABBIT balance");
  }

  // Check current exchange rate
  const rabbitPerShare = await rabbitStaker.getRabbitPerShare();
  const expectedSRabbitAmount = await rabbitStaker.calculateSRabbitAmount(depositAmount);
  
  console.log("Current exchange rate (RABBIT per sRABBIT):", ethers.formatEther(rabbitPerShare));
  console.log("Expected sRABBIT received:", ethers.formatEther(expectedSRabbitAmount));

  // Check allowance
  const allowance = await rabbitToken.allowance(userAddress, rabbitStakerAddress);
  console.log("Current allowance:", ethers.formatEther(allowance), "RABBIT");

  // Approve if needed
  if (allowance < BigInt(depositAmount)) {
    console.log("Approving RABBIT tokens...");
    const approveTx = await rabbitToken.connect(deployer).approve(rabbitStakerAddress, depositAmount);
    await approveTx.wait();
    console.log("✓ Approval confirmed");
  }

  // Get sRABBIT balance before deposit
  const sRabbitBalanceBefore = await sRabbitToken.balanceOf(userAddress);
  console.log("sRABBIT balance before:", ethers.formatEther(sRabbitBalanceBefore));

  // Perform deposit
  console.log("\nExecuting deposit...");
  const depositTx = await rabbitStaker.connect(deployer).deposit(depositAmount);
  const receipt = await depositTx.wait();

  // Get sRABBIT balance after deposit
  const sRabbitBalanceAfter = await sRabbitToken.balanceOf(userAddress);
  const sRabbitReceived = sRabbitBalanceAfter - sRabbitBalanceBefore;

  console.log("✓ Deposit successful!");
  console.log("Transaction hash:", receipt?.hash);
  console.log("Gas used:", receipt?.gasUsed?.toString());
  console.log("sRABBIT received:", ethers.formatEther(sRabbitReceived));

  // Display updated balances
  const newUserBalance = await rabbitToken.balanceOf(userAddress);
  const newRabbitPerShare = await rabbitStaker.getRabbitPerShare();
  
  console.log("\nUpdated balances:");
  console.log("User RABBIT balance:", ethers.formatEther(newUserBalance));
  console.log("User sRABBIT balance:", ethers.formatEther(sRabbitBalanceAfter));
  console.log("New exchange rate:", ethers.formatEther(newRabbitPerShare));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
