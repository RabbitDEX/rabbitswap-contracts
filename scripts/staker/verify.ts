import { ethers, run, upgrades } from "hardhat";
import { readMetadata } from "../metadata";

async function verifyContracts() {
  // Get addresses from metadata
  const mockRabbitTokenAddress = readMetadata("MockRabbitToken");
  const sRabbitTokenAddress = readMetadata("SRabbitToken");
  const proxyAddress = readMetadata("RabbitStaker_Proxy");
  const implementationAddress = readMetadata("RabbitStaker_Implementation");
  const adminAddress = readMetadata("RabbitStaker_ProxyAdmin");
  
  const [owner] = await ethers.getSigners();
  const ownerAddress = await owner.getAddress();

  console.log("Verification addresses:");
  console.log("MockRabbitToken:", mockRabbitTokenAddress);
  console.log("SRabbitToken:", sRabbitTokenAddress);
  console.log("Implementation:", implementationAddress);
  console.log("Proxy:", proxyAddress);
  console.log("ProxyAdmin:", adminAddress);
  console.log("Owner:", ownerAddress);

  // Verify MockERC20
  console.log("\nVerifying MockERC20 contract on block explorer...");
  try {
    await run("verify:verify", {
      address: mockRabbitTokenAddress,
      constructorArguments: ["Mock Rabbit Token", "mRB"],
      contract: "contracts/mocks/MockERC20.sol:MockERC20",
    });
    console.log("✓ MockERC20 verified successfully");
  } catch (error) {
    console.log("Error verifying MockERC20 contract:", error);
  }

  // Verify SRabbitToken
  console.log("\nVerifying SRabbitToken contract on block explorer...");
  try {
    await run("verify:verify", {
      address: sRabbitTokenAddress,
      constructorArguments: ["Mock Staked Rabbit Token", "msRB"],
      contract: "contracts/rabbitstaker/SRabbitToken.sol:SRabbitToken",
    });
    console.log("✓ SRabbitToken verified successfully");
  } catch (error) {
    console.log("Error verifying SRabbitToken contract:", error);
  }

  // Verify RabbitStaker implementation
  console.log("\nVerifying RabbitStaker implementation contract on block explorer...");
  try {
    await run("verify:verify", {
      address: implementationAddress,
      constructorArguments: [],
      contract: "contracts/rabbitstaker/RabbitStaker.sol:RabbitStaker",
    });
    console.log("✓ RabbitStaker implementation verified successfully");
  } catch (error) {
    console.log("Error verifying RabbitStaker implementation contract:", error);
  }

  // Verify proxy admin
  console.log("\nVerifying proxy admin contract on block explorer...");
  try {
    await run("verify:verify", {
      address: adminAddress,
      constructorArguments: [ownerAddress],
      contract: "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin",
    });
    console.log("✓ ProxyAdmin verified successfully");
  } catch (error) {
    console.log("Error verifying proxy admin contract:", error);
  }

  // Verify proxy - using the same pattern as farm verification
  console.log("\nVerifying proxy contract on block explorer...");
  try {
    await run("verify:verify", {
      address: proxyAddress,
      constructorArguments: [implementationAddress, adminAddress, "0x"],
      contract: "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy",
    });
  } catch (error) {
    console.log("Error verifying proxy contract:", error);
  }

  console.log("\nVerification complete:");
  console.log("MockRabbitToken:", mockRabbitTokenAddress);
  console.log("SRabbitToken:", sRabbitTokenAddress);
  console.log("Implementation:", implementationAddress);
  console.log("Proxy:", proxyAddress);
  console.log("ProxyAdmin:", adminAddress);
  console.log("Owner:", ownerAddress);
}

verifyContracts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
