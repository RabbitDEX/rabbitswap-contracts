/**
 * RabbitStaker Upgrade Script
 * 
 * This script upgrades the RabbitStaker contract implementation while preserving
 * the proxy address and all existing state.
 * 
 * Usage:
 *   npx hardhat run scripts/staker/upgrade.ts --network <network>
 * 
 * Prerequisites:
 *   - Contract must be deployed and metadata must exist
 *   - Deployer account must have sufficient balance for gas
 *   - Deployer must be the owner of the proxy admin
 * 
 * The script will:
 *   1. Validate existing contract addresses from metadata
 *   2. Deploy new implementation contract
 *   3. Upgrade the proxy to point to new implementation
 *   4. Verify the upgrade was successful
 *   5. Update metadata with new implementation address
 */

import { ethers, upgrades } from "hardhat";
import { addressFor, writeMetadata } from "../metadata";

export const UPGRADE_RABBIT_STAKER = async () => {
  console.log("Starting RabbitStaker upgrade process...");

  // Read existing contract addresses from metadata
  const proxyAddress = addressFor("RabbitStaker_Proxy");
  const currentImplementationAddress = addressFor("RabbitStaker_Implementation");
  const proxyAdminAddress = addressFor("RabbitStaker_ProxyAdmin");

  console.log("Current contract addresses:");
  console.log("Proxy:", proxyAddress);
  console.log("Current Implementation:", currentImplementationAddress);
  console.log("ProxyAdmin:", proxyAdminAddress);

  // Validate that the proxy exists and is upgradeable
  try {
    const currentImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    const currentAdmin = await upgrades.erc1967.getAdminAddress(proxyAddress);
    
    if (currentImplementation.toLowerCase() !== currentImplementationAddress.toLowerCase()) {
      throw new Error("Implementation address mismatch in metadata");
    }
    
    if (currentAdmin.toLowerCase() !== proxyAdminAddress.toLowerCase()) {
      throw new Error("ProxyAdmin address mismatch in metadata");
    }
    
    console.log("✓ Contract validation passed");
  } catch (error) {
    throw new Error(`Contract validation failed: ${error}`);
  }

  // Deploy new implementation
  console.log("\nDeploying new RabbitStaker implementation...");
  const RabbitStakerFactory = await ethers.getContractFactory("RabbitStaker");
  
  const newImplementation = await upgrades.prepareUpgrade(proxyAddress, RabbitStakerFactory, {
    kind: "transparent",
    txOverrides: {
      gasLimit: 5000000,
    },
  });

  console.log("New implementation deployed at:", newImplementation);

  // Perform the upgrade
  console.log("\nPerforming upgrade...");
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

  console.log("\nUpgrade verification:");
  console.log("New Implementation:", newImplementationAddress);
  console.log("ProxyAdmin:", adminAddress);
  console.log("Proxy address (unchanged):", proxyAddress);

  // Update metadata with new implementation address
  writeMetadata("RabbitStaker_Implementation", newImplementationAddress);

  // Verify the contract is working correctly
  console.log("\nVerifying contract functionality...");
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
  } catch (error) {
    throw new Error(`Contract functionality verification failed: ${error}`);
  }

  console.log("\n✓ RabbitStaker upgrade completed successfully!");
  console.log("✓ New implementation address updated in metadata");
  
  return {
    proxyAddress,
    newImplementationAddress,
    adminAddress,
    upgradedContract
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
    const { proxyAddress, newImplementationAddress, adminAddress } = await UPGRADE_RABBIT_STAKER();

    console.log("\n" + "=".repeat(60));
    console.log("UPGRADE SUMMARY");
    console.log("=".repeat(60));
    console.log("Proxy Address (unchanged):", proxyAddress);
    console.log("New Implementation:", newImplementationAddress);
    console.log("ProxyAdmin:", adminAddress);
    console.log("=".repeat(60));
    
    console.log("\nTo verify the new implementation on block explorer:");
    console.log(`npx hardhat verify --network ${process.env.HARDHAT_NETWORK || "hardhat"} ${newImplementationAddress}`);
    
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
