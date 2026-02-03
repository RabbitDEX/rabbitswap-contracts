/**
 * RabbitStaker SRabbitToken Update Script - 2025-09-18-001
 * 
 * This script performs a simplified update that includes:
 * 1. Deploy new SRabbitToken contract
 * 2. Set minter for the new SRabbitToken
 * 3. Set new SRabbitToken for the staker
 * 
 * Note: No contract upgrade needed as RabbitStaker implementation hasn't changed
 * 
 * Usage:
 *   npx hardhat run scripts/staker/upgrade-20250918-001.ts --network <network>
 * 
 * Prerequisites:
 *   - Existing RabbitStaker must be deployed and metadata must exist
 *   - Deployer account must have sufficient balance for gas
 *   - Deployer must be the owner of the RabbitStaker and new SRabbitToken
 * 
 * The script will:
 *   1. Deploy new SRabbitToken implementation
 *   2. Set RabbitStaker as minter for new SRabbitToken
 *   3. Set new SRabbitToken in existing RabbitStaker
 *   4. Verify the configuration was successful
 *   5. Update metadata with new SRabbitToken address
 */

import { ethers } from "hardhat";
import { addressFor, writeMetadata } from "../metadata";

export const UPDATE_SRABBIT_TOKEN_20250918_001 = async () => {
  console.log("Starting SRabbitToken update process - 2025-09-18-001...");

  // Read existing contract addresses from metadata
  const proxyAddress = addressFor("RabbitStaker_Proxy");
  const currentSRabbitTokenAddress = addressFor("SRabbitToken");

  console.log("Current contract addresses:");
  console.log("RabbitStaker Proxy:", proxyAddress);
  console.log("Current SRabbitToken:", currentSRabbitTokenAddress);

  // Get existing RabbitStaker contract instance
  const rabbitStaker = await ethers.getContractAt("RabbitStaker", proxyAddress);

  // Step 1: Deploy new SRabbitToken
  console.log("\n" + "=".repeat(50));
  console.log("STEP 1: Deploying new SRabbitToken...");
  console.log("=".repeat(50));
  
  const SRabbitTokenFactory = await ethers.getContractFactory("SRabbitToken");
  const newSRabbitToken = await SRabbitTokenFactory.deploy({
    gasLimit: 2000000,
  });
  await newSRabbitToken.waitForDeployment();
  const newSRabbitTokenAddress = await newSRabbitToken.getAddress();
  
  console.log("✓ New SRabbitToken deployed at:", newSRabbitTokenAddress);

  // Step 2: Set RabbitStaker as minter for new SRabbitToken
  console.log("\n" + "=".repeat(50));
  console.log("STEP 2: Setting minter for new SRabbitToken...");
  console.log("=".repeat(50));
  
  const setMinterTx = await newSRabbitToken.setMinter(proxyAddress, true, {
    gasLimit: 100000,
  });
  await setMinterTx.wait();
  
  console.log("✓ RabbitStaker set as minter for new SRabbitToken");

  // Step 3: Set new SRabbitToken in RabbitStaker
  console.log("\n" + "=".repeat(50));
  console.log("STEP 3: Setting new SRabbitToken in RabbitStaker...");
  console.log("=".repeat(50));
  
  const setSRabbitTokenTx = await rabbitStaker.setSRabbitToken(newSRabbitTokenAddress, {
    gasLimit: 200000,
  });
  await setSRabbitTokenTx.wait();
  
  console.log("✓ New SRabbitToken set in RabbitStaker");

  // Step 4: Verify the configuration
  console.log("\n" + "=".repeat(50));
  console.log("STEP 4: Verifying configuration...");
  console.log("=".repeat(50));
  
  try {
    const rabbitToken = await rabbitStaker.getRabbitToken();
    const sRabbitToken = await rabbitStaker.getSRabbitToken();
    const rabbitPerShare = await rabbitStaker.getRabbitPerShare();
    const totalRabbitInPool = await rabbitStaker.totalRabbitInPool();
    const rabbitEmissionPerBlock = await rabbitStaker.rabbitEmissionPerBlock();
    const vestingParams = await rabbitStaker.getVestingParameters();

    console.log("✓ Contract state verification:");
    console.log("  Rabbit Token:", rabbitToken);
    console.log("  sRabbit Token:", sRabbitToken);
    console.log("  Rabbit per Share:", rabbitPerShare.toString());
    console.log("  Total Rabbit in Pool:", totalRabbitInPool.toString());
    console.log("  Rabbit Emission per Block:", rabbitEmissionPerBlock.toString());
    console.log("  Vesting Parameters:", vestingParams.map(p => p.toString()).join(", "));

    // Verify the new SRabbitToken is correctly set
    if (sRabbitToken.toLowerCase() !== newSRabbitTokenAddress.toLowerCase()) {
      throw new Error("New SRabbitToken not correctly set in RabbitStaker");
    }
    console.log("✓ New SRabbitToken correctly configured in RabbitStaker");

    // Verify minter status
    const isMinter = await newSRabbitToken.minters(proxyAddress);
    if (!isMinter) {
      throw new Error("RabbitStaker not set as minter for new SRabbitToken");
    }
    console.log("✓ RabbitStaker correctly set as minter for new SRabbitToken");

  } catch (error) {
    throw new Error(`Configuration verification failed: ${error}`);
  }

  // Step 5: Update metadata
  console.log("\n" + "=".repeat(50));
  console.log("STEP 5: Updating metadata...");
  console.log("=".repeat(50));
  
  writeMetadata("SRabbitToken", newSRabbitTokenAddress);
  
  console.log("✓ Metadata updated with new SRabbitToken address");

  console.log("\n" + "=".repeat(60));
  console.log("SRABBIT TOKEN UPDATE COMPLETED SUCCESSFULLY!");
  console.log("=".repeat(60));
  console.log("RabbitStaker Proxy (unchanged):", proxyAddress);
  console.log("New SRabbitToken:", newSRabbitTokenAddress);
  console.log("Previous SRabbitToken:", currentSRabbitTokenAddress);
  console.log("=".repeat(60));
  
  return {
    proxyAddress,
    newSRabbitTokenAddress,
    currentSRabbitTokenAddress,
    rabbitStaker,
    newSRabbitToken
  };
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Updating SRabbitToken with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");

  // Check if we're on the correct network
  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "Chain ID:", network.chainId.toString());

  try {
    const { 
      proxyAddress, 
      newSRabbitTokenAddress, 
      currentSRabbitTokenAddress 
    } = await UPDATE_SRABBIT_TOKEN_20250918_001();

    console.log("\n" + "=".repeat(60));
    console.log("UPDATE SUMMARY");
    console.log("=".repeat(60));
    console.log("RabbitStaker Proxy (unchanged):", proxyAddress);
    console.log("New SRabbitToken:", newSRabbitTokenAddress);
    console.log("Previous SRabbitToken:", currentSRabbitTokenAddress);
    console.log("=".repeat(60));
    
    console.log("\nTo verify the new SRabbitToken on block explorer:");
    console.log(`npx hardhat verify --network ${process.env.HARDHAT_NETWORK || "hardhat"} ${newSRabbitTokenAddress}`);
    
  } catch (error) {
    console.error("\n❌ SRabbitToken update failed:", error);
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