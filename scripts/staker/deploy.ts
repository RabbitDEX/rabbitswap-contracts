import { ethers, upgrades } from "hardhat";
import { addressFor, writeMetadata } from "../metadata";

export const DEPLOY_RABBIT_STAKER = async () => {
  const rabbitTokenAddress = addressFor("RabbitToken");
  const rabbitToken = await ethers.getContractAt("MockERC20", rabbitTokenAddress);

  // Deploy SRabbitToken
  const SRabbitTokenFactory = await ethers.getContractFactory("SRabbitToken");
  const sRabbitToken = await SRabbitTokenFactory.deploy(
    "Staked Rabbit Token",
    "sRABBIT",
    {
      gasLimit: 2000000,
    }
  );
  await sRabbitToken.waitForDeployment();
  const sRabbitTokenAddress = await sRabbitToken.getAddress();

  // Deploy RabbitStaker implementation and proxy
  const RabbitStakerFactory = await ethers.getContractFactory("RabbitStaker");
  const rabbitStaker = await upgrades.deployProxy(
    RabbitStakerFactory,
    [
      rabbitTokenAddress,
      sRabbitTokenAddress,
      ethers.parseEther("0") // Initial emission: 0 RABBIT per block
    ],
    {
      kind: "transparent",
      verifySourceCode: true,
      txOverrides: {
        gasLimit: 5000000,
      },
    }
  );
  await rabbitStaker.waitForDeployment();

  const proxyAddress = await rabbitStaker.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(
    proxyAddress
  );
  const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);

  // Set RabbitStaker as minter for SRabbitToken
  await sRabbitToken.setMinter(proxyAddress, true, {
    gasLimit: 100000,
  });

  // Write metadata
  writeMetadata("RabbitToken", rabbitTokenAddress);
  writeMetadata("SRabbitToken", sRabbitTokenAddress);
  writeMetadata("RabbitStaker_Proxy", proxyAddress);
  writeMetadata("RabbitStaker_Implementation", implementationAddress);
  writeMetadata("RabbitStaker_ProxyAdmin", adminAddress);

  return { rabbitStaker, sRabbitToken, rabbitToken };
};


async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const { rabbitStaker, sRabbitToken, rabbitToken } = await DEPLOY_RABBIT_STAKER();

  console.log("\nDeployment addresses:");
  console.log("RabbitToken:", await rabbitToken.getAddress());
  console.log("SRabbitToken:", await sRabbitToken.getAddress());
  console.log("RabbitStaker Proxy:", await rabbitStaker.getAddress());
  console.log(
    "RabbitStaker Implementation:",
    await upgrades.erc1967.getImplementationAddress(
      await rabbitStaker.getAddress()
    )
  );
  console.log(
    "RabbitStaker ProxyAdmin:",
    await upgrades.erc1967.getAdminAddress(await rabbitStaker.getAddress())
  );

  console.log("\nDeployment completed successfully!");
  console.log("To verify contracts, run: npx hardhat run scripts/staker/verify.ts --network vic-mainnet");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
