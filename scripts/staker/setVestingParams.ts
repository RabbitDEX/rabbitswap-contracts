/**
 * RabbitStaker Set Vesting Parameters Script
 * 
 * This script allows the contract owner to update the vesting parameters
 * for the withdrawal system. These parameters control the minimum and maximum
 * vesting periods and their corresponding conversion rates.
 * 
 * Usage:
 *   npx hardhat run scripts/staker/setVestingParams.ts --network <network>
 * 
 * Environment Variables:
 *   MIN_VESTING_DAYS: Minimum vesting period in days (default: 15)
 *   MAX_VESTING_DAYS: Maximum vesting period in days (default: 180)
 *   MIN_CONVERSION_RATE: Minimum conversion rate in basis points (default: 5000 = 50%)
 *   MAX_CONVERSION_RATE: Maximum conversion rate in basis points (default: 10000 = 100%)
 */

import { ethers } from "hardhat";
import { addressFor } from "../metadata";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Setting vesting parameters for RabbitStaker...");
  console.log("Deployer address:", deployer.address);

  // Get vesting parameters from environment variables with defaults
  const minVestingDays = process.env.MIN_VESTING_DAYS ? parseInt(process.env.MIN_VESTING_DAYS) : 1;
  const maxVestingDays = process.env.MAX_VESTING_DAYS ? parseInt(process.env.MAX_VESTING_DAYS) : 180;
  const minConversionRate = process.env.MIN_CONVERSION_RATE ? parseInt(process.env.MIN_CONVERSION_RATE) : 5000;
  const maxConversionRate = process.env.MAX_CONVERSION_RATE ? parseInt(process.env.MAX_CONVERSION_RATE) : 10000;

  console.log("\nVesting parameters to set:");
  console.log("  Min vesting days:", minVestingDays);
  console.log("  Max vesting days:", maxVestingDays);
  console.log("  Min conversion rate:", minConversionRate, "basis points (", (minConversionRate / 100).toFixed(1), "%)");
  console.log("  Max conversion rate:", maxConversionRate, "basis points (", (maxConversionRate / 100).toFixed(1), "%)");

  // Validate parameters
  if (minVestingDays <= 0) {
    throw new Error("Min vesting days must be greater than 0");
  }
  if (maxVestingDays <= minVestingDays) {
    throw new Error("Max vesting days must be greater than min vesting days");
  }
  if (minConversionRate <= 0) {
    throw new Error("Min conversion rate must be greater than 0");
  }
  if (maxConversionRate <= minConversionRate) {
    throw new Error("Max conversion rate must be greater than min conversion rate");
  }
  if (maxConversionRate > 10000) {
    throw new Error("Max conversion rate cannot exceed 10000 basis points (100%)");
  }

  // Get contract address from metadata
  const rabbitStakerAddress = addressFor("RabbitStaker_Proxy");

  // Connect to contract
  const rabbitStaker = await ethers.getContractAt("RabbitStaker", rabbitStakerAddress);

  // Get current vesting parameters
  const [currentMinVestingDays, currentMaxVestingDays, currentMinConversionRate, currentMaxConversionRate] = 
    await rabbitStaker.getVestingParameters();

  console.log("\nCurrent vesting parameters:");
  console.log("  Min vesting days:", currentMinVestingDays.toString());
  console.log("  Max vesting days:", currentMaxVestingDays.toString());
  console.log("  Min conversion rate:", currentMinConversionRate.toString(), "basis points (", (Number(currentMinConversionRate) / 100).toFixed(1), "%)");
  console.log("  Max conversion rate:", currentMaxConversionRate.toString(), "basis points (", (Number(currentMaxConversionRate) / 100).toFixed(1), "%)");

  // Check if parameters are actually changing
  const isChanging = 
    currentMinVestingDays !== BigInt(minVestingDays) ||
    currentMaxVestingDays !== BigInt(maxVestingDays) ||
    currentMinConversionRate !== BigInt(minConversionRate) ||
    currentMaxConversionRate !== BigInt(maxConversionRate);

  if (!isChanging) {
    console.log("\n✓ Vesting parameters are already set to the desired values. No transaction needed.");
    return;
  }

  // Display conversion rate examples for different vesting periods
  console.log("\nConversion rate examples with new parameters:");
  const vestingPeriods = [minVestingDays, Math.floor((minVestingDays + maxVestingDays) / 2), maxVestingDays];
  for (const days of vestingPeriods) {
    try {
      const rate = await rabbitStaker.calculateConversionRate(days);
      const percentage = (Number(rate) / 100).toFixed(1);
      console.log(`  ${days} days: ${rate.toString()} basis points (${percentage}%)`);
    } catch (error) {
      console.log(`  ${days} days: Invalid (vesting period too short)`);
    }
  }

  // Execute the transaction
  console.log("\nExecuting setVestingParameters transaction...");
  const setVestingParamsTx = await rabbitStaker.setVestingParameters(
    minVestingDays,
    maxVestingDays,
    minConversionRate,
    maxConversionRate
  );
  
  const receipt = await setVestingParamsTx.wait();

  console.log("✓ Vesting parameters updated successfully!");
  console.log("Transaction hash:", receipt?.hash);
  console.log("Gas used:", receipt?.gasUsed?.toString());

  // Verify the new parameters
  const [newMinVestingDays, newMaxVestingDays, newMinConversionRate, newMaxConversionRate] = 
    await rabbitStaker.getVestingParameters();

  console.log("\nUpdated vesting parameters:");
  console.log("  Min vesting days:", newMinVestingDays.toString());
  console.log("  Max vesting days:", newMaxVestingDays.toString());
  console.log("  Min conversion rate:", newMinConversionRate.toString(), "basis points (", (Number(newMinConversionRate) / 100).toFixed(1), "%)");
  console.log("  Max conversion rate:", newMaxConversionRate.toString(), "basis points (", (Number(newMaxConversionRate) / 100).toFixed(1), "%)");

  console.log("\nNote: These parameters affect all future withdrawal requests. Existing withdrawal requests are not affected.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
