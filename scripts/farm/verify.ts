import { ethers, run } from "hardhat";
import { addressFor } from "../metadata";

async function verifyContracts() {
  // Get addresses from metadata
  const proxyAddress = addressFor("RabbitSponsoredFarm_Proxy");
  const implementationAddress = addressFor(
    "RabbitSponsoredFarm_Implementation"
  );
  const adminAddress = addressFor("RabbitSponsoredFarm_ProxyAdmin");
  const [owner] = await ethers.getSigners();
  const ownerAddress = await owner.getAddress();

  // verify implementation address
  console.log("Verifying implementation contract on block explorer...");
  try {
    await run("verify:verify", {
      address: implementationAddress,
      constructorArguments: [],
      contract: "contracts/farm/RabbitSponsoredFarm.sol:RabbitSponsoredFarm",
    });
  } catch (error) {
    console.log("Error verifying implementation contract:", error);
  }

  // verify proxy admin
  console.log("\nVerifying proxy admin contract on block explorer...");
  try {
    await run("verify:verify", {
      address: adminAddress,
      constructorArguments: [ownerAddress],
      contract:
        "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin",
    });
  } catch (error) {
    console.log("Error verifying proxy admin contract:", error);
  }

  // verify proxy
  console.log("\nVerifying proxy contract on block explorer...");
  try {
    await run("verify:verify", {
      address: proxyAddress,
      constructorArguments: [implementationAddress, adminAddress, "0x"],
      contract:
        "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy",
    });
  } catch (error) {
    console.log("Error verifying proxy contract:", error);
  }

  console.log("\nVerification complete:");
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
