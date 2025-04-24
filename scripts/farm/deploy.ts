import { ethers, upgrades } from "hardhat";
import type { RabbitSponsoredFarm } from "../../typechain";
import { writeMetadata } from "../metadata";

export const DEPLOY_SPONSORED_FARM = async () => {
  // Get NFT manager address based on network
  const supportedNetworks: Record<number, string> = {
    88: "0xbF73c6E53965C3f34020D58cfe85D027Fe375C96", // Viction Mainnet
  };
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const nftManagerAddress = supportedNetworks[chainId];

  // Deploy implementation and proxy
  const RabbitSponsoredFarm = await ethers.getContractFactory(
    "RabbitSponsoredFarm"
  );
  const sponsoredFarm = await upgrades.deployProxy(
    RabbitSponsoredFarm,
    [nftManagerAddress],
    {
      kind: "transparent",
      verifySourceCode: true,
    }
  );
  await sponsoredFarm.waitForDeployment();

  const proxyAddress = await sponsoredFarm.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(
    proxyAddress
  );
  const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);

  // Write metadata
  writeMetadata("RabbitSponsoredFarm_Proxy", proxyAddress);
  writeMetadata("RabbitSponsoredFarm_Implementation", implementationAddress);
  writeMetadata("RabbitSponsoredFarm_ProxyAdmin", adminAddress);

  return sponsoredFarm;
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const sponsoredFarm = await DEPLOY_SPONSORED_FARM();

  console.log("\nDeployment addresses:");
  console.log("Proxy:", await sponsoredFarm.getAddress());
  console.log(
    "Implementation:",
    await upgrades.erc1967.getImplementationAddress(
      await sponsoredFarm.getAddress()
    )
  );
  console.log(
    "ProxyAdmin:",
    await upgrades.erc1967.getAdminAddress(await sponsoredFarm.getAddress())
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
