/**
 * RabbitStaker Upgrade Script - 2025-09-17-001
 * 
 * This script performs a comprehensive upgrade that includes:
 * 1. Deploy new SRabbitToken contract
 * 2. Set minter for the new SRabbitToken
 * 3. Upgrade RabbitStaker contract
 * 4. Set new SRabbitToken for the staker
 * 
 * Usage:
 *   npx hardhat run scripts/staker/upgrade-20250917-001.ts --network <network>
 * 
 * Prerequisites:
 *   - Existing RabbitStaker must be deployed and metadata must exist
 *   - Deployer account must have sufficient balance for gas
 *   - Deployer must be the owner of the proxy admin
 * 
 * The script will:
 *   1. Deploy new SRabbitToken implementation
 *   2. Set RabbitStaker as minter for new SRabbitToken
 *   3. Deploy new RabbitStaker implementation
 *   4. Upgrade the proxy to point to new implementation
 *   5. Set new SRabbitToken in RabbitStaker
 *   6. Verify the upgrade was successful
 *   7. Update metadata with new addresses
 */

import { ethers, upgrades } from "hardhat";
import { addressFor, writeMetadata } from "../metadata";

export const UPGRADE_RABBIT_STAKER_20250917_001 = async () => {
  console.log("Starting RabbitStaker upgrade process - 2025-09-17-001...");

  // Read existing contract addresses from metadata
  const proxyAddress = addressFor("RabbitStaker_Proxy");
  const currentImplementationAddress = addressFor("RabbitStaker_Implementation");
  const proxyAdminAddress = addressFor("RabbitStaker_ProxyAdmin");
  const currentSRabbitTokenAddress = addressFor("SRabbitToken");

  console.log("Current contract addresses:");
  console.log("RabbitStaker Proxy:", proxyAddress);
  console.log("Current Implementation:", currentImplementationAddress);
  console.log("ProxyAdmin:", proxyAdminAddress);
  console.log("Current SRabbitToken:", currentSRabbitTokenAddress);

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

  // Step 2: Deploy new RabbitStaker implementation
  console.log("\n" + "=".repeat(50));
  console.log("STEP 2: Deploying new RabbitStaker implementation...");
  console.log("=".repeat(50));
  
  const RabbitStakerFactory = await ethers.getContractFactory("RabbitStaker");
  
  const newImplementation = await upgrades.prepareUpgrade(proxyAddress, RabbitStakerFactory, {
    kind: "transparent",
    txOverrides: {
      gasLimit: 5000000,
    },
  });

  console.log("✓ New RabbitStaker implementation deployed at:", newImplementation);

  // Step 3: Upgrade the proxy to new implementation
  console.log("\n" + "=".repeat(50));
  console.log("STEP 3: Upgrading RabbitStaker proxy...");
  console.log("=".repeat(50));
  
  const upgradedContract = await upgrades.upgradeProxy(proxyAddress, RabbitStakerFactory, {
    kind: "transparent",
    txOverrides: {
      gasLimit: 5000000,
    },
  });

  await upgradedContract.waitForDeployment();

  // Verify the upgrade
  const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);

  console.log("✓ RabbitStaker proxy upgraded successfully");
  console.log("  New Implementation:", newImplementationAddress);
  console.log("  ProxyAdmin:", adminAddress);
  console.log("  Proxy address (unchanged):", proxyAddress);

  // Step 4: Set RabbitStaker as minter for new SRabbitToken
  console.log("\n" + "=".repeat(50));
  console.log("STEP 4: Setting minter for new SRabbitToken...");
  console.log("=".repeat(50));
  
  const setMinterTx = await newSRabbitToken.setMinter(proxyAddress, true, {
    gasLimit: 100000,
  });
  await setMinterTx.wait();
  
  console.log("✓ RabbitStaker set as minter for new SRabbitToken");

  // Step 5: Set new SRabbitToken in RabbitStaker
  console.log("\n" + "=".repeat(50));
  console.log("STEP 5: Setting new SRabbitToken in RabbitStaker...");
  console.log("=".repeat(50));
  
  const setSRabbitTokenTx = await upgradedContract.setSRabbitToken(newSRabbitTokenAddress, {
    gasLimit: 200000,
  });
  await setSRabbitTokenTx.wait();
  
  console.log("✓ New SRabbitToken set in RabbitStaker");

  // Step 6: Verify the upgrade and configuration
  console.log("\n" + "=".repeat(50));
  console.log("STEP 6: Verifying upgrade and configuration...");
  console.log("=".repeat(50));
  
  try {
    const rabbitToken = await upgradedContract.getRabbitToken();
    const sRabbitToken = await upgradedContract.getSRabbitToken();
    const rabbitPerShare = await upgradedContract.getRabbitPerShare();
    const totalRabbitInPool = await upgradedContract.totalRabbitInPool();
    const rabbitEmissionPerBlock = await upgradedContract.rabbitEmissionPerBlock();
    const vestingParams = await upgradedContract.getVestingParameters();

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
    throw new Error(`Contract functionality verification failed: ${error}`);
  }

  // Step 7: Update metadata
  console.log("\n" + "=".repeat(50));
  console.log("STEP 7: Updating metadata...");
  console.log("=".repeat(50));
  
  writeMetadata("SRabbitToken", newSRabbitTokenAddress);
  writeMetadata("RabbitStaker_Implementation", newImplementationAddress);
  
  console.log("✓ Metadata updated with new addresses");

  console.log("\n" + "=".repeat(60));
  console.log("UPGRADE COMPLETED SUCCESSFULLY!");
  console.log("=".repeat(60));
  console.log("RabbitStaker Proxy (unchanged):", proxyAddress);
  console.log("New RabbitStaker Implementation:", newImplementationAddress);
  console.log("New SRabbitToken:", newSRabbitTokenAddress);
  console.log("ProxyAdmin:", adminAddress);
  console.log("=".repeat(60));
  
  return {
    proxyAddress,
    newImplementationAddress,
    newSRabbitTokenAddress,
    adminAddress,
    upgradedContract,
    newSRabbitToken
  };
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");

  // Check if we're on the correct network
  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "Chain ID:", network.chainId.toString());

  try {
    const { 
      proxyAddress, 
      newImplementationAddress, 
      newSRabbitTokenAddress, 
      adminAddress 
    } = await UPGRADE_RABBIT_STAKER_20250917_001();

    console.log("\n" + "=".repeat(60));
    console.log("UPGRADE SUMMARY");
    console.log("=".repeat(60));
    console.log("RabbitStaker Proxy (unchanged):", proxyAddress);
    console.log("New RabbitStaker Implementation:", newImplementationAddress);
    console.log("New SRabbitToken:", newSRabbitTokenAddress);
    console.log("ProxyAdmin:", adminAddress);
    console.log("=".repeat(60));
    
    console.log("\nTo verify the new contracts on block explorer:");
    console.log(`npx hardhat verify --network ${process.env.HARDHAT_NETWORK || "hardhat"} ${newImplementationAddress}`);
    console.log(`npx hardhat verify --network ${process.env.HARDHAT_NETWORK || "hardhat"} ${newSRabbitTokenAddress}`);
    
  } catch (error) {
    console.error("\n❌ Upgrade failed:", error);
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
