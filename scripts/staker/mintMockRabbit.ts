/**
 * Mock RABBIT Token Minting Script
 * 
 * This script allows minting of Mock RABBIT tokens for testing purposes.
 * The MockERC20 contract has a public mint function that anyone can call.
 * 
 * Usage:
 *   npx hardhat run scripts/staker/mintMockRabbit.ts --network <network>
 * 
 * Environment Variables:
 *   MINT_AMOUNT: Amount of RABBIT tokens to mint (in wei)
 *   RECIPIENT_ADDRESS: Address to mint tokens to (optional, defaults to deployer)
 */

import { ethers } from "hardhat";
import { addressFor } from "../metadata";

async function main() {
  const [deployer] = await ethers.getSigners();
  const recipientAddress = process.env.RECIPIENT_ADDRESS || deployer.address;
  const mintAmount = process.env.MINT_AMOUNT;

  if (!mintAmount) {
    throw new Error("MINT_AMOUNT environment variable is required");
  }

  console.log("Minting Mock RABBIT tokens...");
  console.log("Recipient address:", recipientAddress);
  console.log("Mint amount:", ethers.formatEther(mintAmount), "RABBIT");

  // Get contract address from metadata
  const mockRabbitTokenAddress = addressFor("MockRabbitToken");

  // Connect to contract
  const mockRabbitToken = await ethers.getContractAt("MockERC20", mockRabbitTokenAddress);

  // Get token info
  const tokenName = await mockRabbitToken.name();
  const tokenSymbol = await mockRabbitToken.symbol();
  const tokenDecimals = await mockRabbitToken.decimals();

  console.log("Token info:");
  console.log("  Name:", tokenName);
  console.log("  Symbol:", tokenSymbol);
  console.log("  Decimals:", tokenDecimals.toString());

  // Check recipient's balance before minting
  const balanceBefore = await mockRabbitToken.balanceOf(recipientAddress);
  console.log("Recipient balance before:", ethers.formatEther(balanceBefore), "RABBIT");

  // Check total supply before minting
  const totalSupplyBefore = await mockRabbitToken.totalSupply();
  console.log("Total supply before:", ethers.formatEther(totalSupplyBefore), "RABBIT");

  // Perform minting
  console.log("\nExecuting mint...");
  const mintTx = await mockRabbitToken.connect(deployer).mint(recipientAddress, mintAmount);
  const receipt = await mintTx.wait();

  // Check balances after minting
  const balanceAfter = await mockRabbitToken.balanceOf(recipientAddress);
  const totalSupplyAfter = await mockRabbitToken.totalSupply();
  const mintedAmount = balanceAfter - balanceBefore;

  console.log("✓ Mint successful!");
  console.log("Transaction hash:", receipt?.hash);
  console.log("Gas used:", receipt?.gasUsed?.toString());
  console.log("Amount minted:", ethers.formatEther(mintedAmount), "RABBIT");

  // Display updated balances
  console.log("\nUpdated balances:");
  console.log("Recipient balance:", ethers.formatEther(balanceAfter), "RABBIT");
  console.log("Total supply:", ethers.formatEther(totalSupplyAfter), "RABBIT");

  // Verify the mint was successful
  if (mintedAmount !== BigInt(mintAmount)) {
    throw new Error("Mint amount mismatch");
  }

  console.log("\n✓ Mint verification passed");
  console.log("Recipient now has sufficient RABBIT tokens for staking operations");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
