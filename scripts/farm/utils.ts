import { ethers } from "hardhat";
import { RabbitSponsoredFarm } from "../../typechain";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { addressFor } from "../metadata";

// Constants for farm operations
export const FARM_CONSTANTS = {
  // Add farm constants
  ADD_FARM: {
    REWARD_TOKEN: "0xBB2Baa333C07bb978c10de0F14d5809cbC82cFE8",
    SIGNER: "0x799cfe204bD0BA4f5dB7aa97069247FaBffbB5d9",
    POOL: "0xC8E762af329FFa942f89f4528092f37323514Cea",
    REWARD_PER_BLOCK: BigInt(1000000000000000), // 0.001 token per block (with 18 decimals)
  },

  // Stake/Unstake constants
  POSITION: {
    TOKEN_ID: BigInt(87), // Replace with actual token ID
  },

  // Harvest constants
  HARVEST: {
    TOKEN_ID: BigInt(87), // Replace with actual token ID
    FARM_ID: BigInt(2), // Replace with actual farm ID
    TOTAL_CLAIMABLE: BigInt(2000000000000000), // 0.002 token (with 18 decimals)
    BLOCK_NUMBER: BigInt(91709463), // Will be set to current block number in the script
    SIGNER_PRIVATE_KEY:
      process.env.FARM_SIGNER_PRIVATE_KEY ||
      "0x0000000000000000000000000000000000000000000000000000000000000000", // Replace with actual private key
  },

  // Deposit constants
  DEPOSIT: {
    FARM_ID: BigInt(2), // Replace with actual farm ID
    AMOUNT: BigInt(100000000000000000000), // 100 tokens (with 18 decimals)
  },

  // Set signer constants
  SET_SIGNER: {
    FARM_ID: BigInt(0), // Replace with actual farm ID
    NEW_SIGNER: "0x0000000000000000000000000000000000000000", // Replace with actual new signer address
  },

  // Set reward per block constants
  SET_REWARD: {
    FARM_ID: BigInt(2), // Replace with actual farm ID
    REWARD_PER_BLOCK: BigInt(1000000000000000), // 0.001 tokens per block (with 18 decimals)
  },
};

// Helper function to get the sponsored farm contract
export async function getSponsoredFarmContract(): Promise<RabbitSponsoredFarm> {
  // Get the proxy address from metadata
  const proxyAddress = addressFor("RabbitSponsoredFarm_Proxy");

  const sponsoredFarmFactory = await ethers.getContractFactory(
    "RabbitSponsoredFarm"
  );
  return sponsoredFarmFactory.attach(proxyAddress) as RabbitSponsoredFarm;
}

// Create a signature for harvesting
export async function createHarvestSignature(
  signer: SignerWithAddress,
  tokenId: bigint,
  farmId: bigint,
  totalClaimable: bigint,
  blockNumber: bigint,
  sponsoredFarm: RabbitSponsoredFarm
): Promise<string> {
  // Get the domain separator
  const chainId = await signer.provider.getNetwork().then((n) => n.chainId);
  const verifyingContract = await sponsoredFarm.getAddress();

  const domain = {
    name: "RabbitSponsoredFarm",
    version: "1",
    chainId,
    verifyingContract,
  };

  // Define the types
  const types = {
    Harvest: [
      { name: "tokenId", type: "uint256" },
      { name: "farmId", type: "uint256" },
      { name: "totalClaimable", type: "uint256" },
      { name: "blockNumber", type: "uint256" },
    ],
  };

  // Create the data to sign
  const value = {
    tokenId,
    farmId,
    totalClaimable,
    blockNumber,
  };

  // Sign the data
  return await signer.signTypedData(domain, types, value);
}
