import { ethers, upgrades } from "hardhat";
import type { RabbitSponsoredFarm } from "../../typechain";
import { addressFor, writeMetadata } from "../metadata";

export const UPGRADE_SPONSORED_FARM = async () => {
  const proxyAddress = addressFor("RabbitSponsoredFarm_Proxy");

  // Deploy new implementation
  const RabbitSponsoredFarm = await ethers.getContractFactory(
    "RabbitSponsoredFarm"
  );
  const sponsoredFarm = await upgrades.upgradeProxy(
    proxyAddress,
    RabbitSponsoredFarm
  );
  await sponsoredFarm.waitForDeployment();

  const implementationAddress = await upgrades.erc1967.getImplementationAddress(
    proxyAddress
  );
  writeMetadata("RabbitSponsoredFarm_Implementation_V2", implementationAddress);

  return sponsoredFarm;
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading contract with account:", deployer.address);

  const sponsoredFarm = await UPGRADE_SPONSORED_FARM();

  console.log("\nUpgrade complete:");
  console.log("Proxy:", await sponsoredFarm.getAddress());
  console.log(
    "New Implementation:",
    await upgrades.erc1967.getImplementationAddress(
      await sponsoredFarm.getAddress()
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
