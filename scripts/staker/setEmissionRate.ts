/**
 * RabbitStaker Emission Rate Update Script
 * 
 * This script updates the RABBIT emission rate per block in the RabbitStaker contract.
 * The emission rate determines how many RABBIT tokens are distributed as rewards
 * to stakers per block.
 * 
 * Usage:
 *   npx hardhat run scripts/staker/setEmissionRate.ts --network <network>
 * 
 * Environment Variables:
 *   EMISSION_RATE: New emission rate in wei (e.g., "1000000000000000000" for 1 RABBIT per block)
 * 
 * Prerequisites:
 *   - RabbitStaker must be deployed and metadata must exist
 *   - Deployer account must have sufficient balance for gas
 *   - Deployer must be the owner of the RabbitStaker contract
 * 
 * The script will:
 *   1. Read current emission rate from the contract
 *   2. Set new emission rate if provided
 *   3. Verify the update was successful
 *   4. Display emission rate information
 */

import { ethers } from "hardhat";
import { addressFor } from "../metadata";

const isProd = process.env.ENV === "production";

export const SET_EMISSION_RATE = async (newEmissionRate?: string) => {
  console.log("Starting RabbitStaker emission rate update...");

  // Read contract address from metadata
  const proxyAddress = isProd ? addressFor("RabbitStaker_Proxy") : addressFor("MockRabbitStaker_Proxy");
  console.log("RabbitStaker Proxy:", proxyAddress);

  // Get RabbitStaker contract instance
  const rabbitStaker = await ethers.getContractAt("RabbitStaker", proxyAddress);

  // Get current emission rate
  const currentEmissionRate = await rabbitStaker.rabbitEmissionPerBlock();
  console.log("Current emission rate:", ethers.formatUnits(currentEmissionRate, 18), "RABBIT per block");
  console.log("Current emission rate (wei):", currentEmissionRate.toString());

  // If no new emission rate provided, just display current info
  if (!newEmissionRate) {
    console.log("\nNo new emission rate provided. Current emission rate information:");
    console.log("=".repeat(60));
    console.log("Current Emission Rate:", ethers.formatUnits(currentEmissionRate, 18), "RABBIT per block");
    console.log("Current Emission Rate (wei):", currentEmissionRate.toString());
    console.log("=".repeat(60));
    
    console.log("\nTo set a new emission rate, use:");
    console.log("EMISSION_RATE=<value_in_wei> npx hardhat run scripts/staker/setEmissionRate.ts --network <network>");
    console.log("\nExamples:");
    console.log("EMISSION_RATE=1000000000000000000 npx hardhat run scripts/staker/setEmissionRate.ts --network vic-mainnet  # 1 RABBIT per block");
    console.log("EMISSION_RATE=500000000000000000 npx hardhat run scripts/staker/setEmissionRate.ts --network vic-mainnet   # 0.5 RABBIT per block");
    console.log("EMISSION_RATE=0 npx hardhat run scripts/staker/setEmissionRate.ts --network vic-mainnet                    # 0 RABBIT per block (disable)");
    
    return {
      proxyAddress,
      currentEmissionRate,
      newEmissionRate: null,
      rabbitStaker
    };
  }

  // Parse new emission rate
  const newEmissionRateWei = ethers.parseUnits(newEmissionRate, 18);
  console.log("New emission rate:", ethers.formatUnits(newEmissionRateWei, 18), "RABBIT per block");
  console.log("New emission rate (wei):", newEmissionRateWei.toString());

  // Check if emission rate is actually changing
  if (currentEmissionRate === newEmissionRateWei) {
    console.log("⚠️  New emission rate is the same as current rate. No update needed.");
    return {
      proxyAddress,
      currentEmissionRate,
      newEmissionRate: newEmissionRateWei,
      rabbitStaker
    };
  }

  // Set new emission rate
  console.log("\n" + "=".repeat(50));
  console.log("Setting new emission rate...");
  console.log("=".repeat(50));
  
  const setEmissionTx = await rabbitStaker.setRabbitEmissionPerBlock(newEmissionRateWei, {
    gasLimit: 200000,
  });
  
  console.log("Transaction hash:", setEmissionTx.hash);
  console.log("Waiting for confirmation...");
  
  const receipt = await setEmissionTx.wait();
  console.log("✓ Transaction confirmed in block:", receipt?.blockNumber);

  // Verify the update
  console.log("\n" + "=".repeat(50));
  console.log("Verifying emission rate update...");
  console.log("=".repeat(50));
  
  const updatedEmissionRate = await rabbitStaker.rabbitEmissionPerBlock();
  
  if (updatedEmissionRate !== newEmissionRateWei) {
    throw new Error("Emission rate update verification failed");
  }
  
  console.log("✓ Emission rate successfully updated");
  console.log("Previous emission rate:", ethers.formatUnits(currentEmissionRate, 18), "RABBIT per block");
  console.log("New emission rate:", ethers.formatUnits(updatedEmissionRate, 18), "RABBIT per block");

  // Get additional contract information
  const rabbitPerShare = await rabbitStaker.getRabbitPerShare();
  const totalRabbitInPool = await rabbitStaker.totalRabbitInPool();
  const vestingParams = await rabbitStaker.getVestingParameters();

  console.log("\n" + "=".repeat(60));
  console.log("CONTRACT STATE AFTER UPDATE");
  console.log("=".repeat(60));
  console.log("Emission Rate:", ethers.formatUnits(updatedEmissionRate, 18), "RABBIT per block");
  console.log("Rabbit per Share:", ethers.formatUnits(rabbitPerShare, 18));
  console.log("Total Rabbit in Pool:", ethers.formatUnits(totalRabbitInPool, 18));
  console.log("Vesting Parameters:", vestingParams.map(p => p.toString()).join(", "));
  console.log("=".repeat(60));

  return {
    proxyAddress,
    currentEmissionRate,
    newEmissionRate: updatedEmissionRate,
    rabbitStaker,
    transactionHash: setEmissionTx.hash,
    blockNumber: receipt?.blockNumber
  };
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Updating emission rate with account:", deployer.address);
  console.log("Account balance:", ethers.formatUnits(await deployer.provider.getBalance(deployer.address), 18), "ETH");

  // Check if we're on the correct network
  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "Chain ID:", network.chainId.toString());

  // Get emission rate from environment variable
  const newEmissionRate = process.env.EMISSION_RATE;

  try {
    const result = await SET_EMISSION_RATE(newEmissionRate);

    if (result.newEmissionRate !== null && result.transactionHash) {
      console.log("\n" + "=".repeat(60));
      console.log("EMISSION RATE UPDATE SUMMARY");
      console.log("=".repeat(60));
      console.log("RabbitStaker Proxy:", result.proxyAddress);
      console.log("Previous Emission Rate:", ethers.formatUnits(result.currentEmissionRate, 18), "RABBIT per block");
      console.log("New Emission Rate:", ethers.formatUnits(result.newEmissionRate, 18), "RABBIT per block");
      console.log("Transaction Hash:", result.transactionHash);
      console.log("Block Number:", result.blockNumber);
      console.log("=".repeat(60));
    }
    
  } catch (error) {
    console.error("\n❌ Emission rate update failed:", error);
    process.exitCode = 1;
  }
}

// Handle script execution
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
