import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { getSponsoredFarmContract, createHarvestSignature, FARM_CONSTANTS } from './utils';

// Harvest rewards
export async function harvestRewards(
  tokenId: bigint = FARM_CONSTANTS.HARVEST.TOKEN_ID,
  farmId: bigint = FARM_CONSTANTS.HARVEST.FARM_ID,
  totalClaimable: bigint = FARM_CONSTANTS.HARVEST.TOTAL_CLAIMABLE,
  blockNumber: bigint = FARM_CONSTANTS.HARVEST.BLOCK_NUMBER,
  signerPrivateKey: string = FARM_CONSTANTS.HARVEST.SIGNER_PRIVATE_KEY
): Promise<void> {
  const sponsoredFarm = await getSponsoredFarmContract();
  
  // If blockNumber is 0, use the current block number
  if (blockNumber === BigInt(0)) {
    blockNumber = BigInt(await ethers.provider.getBlockNumber());
  }
  
  console.log(`Harvesting rewards for token ID: ${tokenId}, farm ID: ${farmId}`);
  console.log(`Total claimable: ${totalClaimable}, block number: ${blockNumber}`);
  
  // Create a wallet from the private key
  const signerWallet = new ethers.Wallet(signerPrivateKey, ethers.provider);

  const claimedBefore = await sponsoredFarm.positionTotalClaimed(tokenId, farmId)
  
  // Create the signature
  const signature = await createHarvestSignature(
    signerWallet as unknown as SignerWithAddress,
    tokenId,
    farmId,
    totalClaimable,
    blockNumber,
    sponsoredFarm
  );

  console.log(`Signature: ${signature}`);
  
  // Prepare the harvest params
  const harvestParams = {
    tokenId,
    farmId,
    totalClaimable,
    blockNumber,
    signature
  };

  // Log tuple for using on explorer
  console.log(`[${tokenId.toString()},${farmId.toString()},${totalClaimable.toString()},${blockNumber.toString()},"${signature}"]`);

  // Harvest the rewards
  const tx = await sponsoredFarm.harvest(harvestParams);
  await tx.wait();
  
  console.log(`Rewards harvested successfully for token ID ${tokenId}, farm ID ${farmId}`);
  console.log(`Amount harvested: ${totalClaimable - claimedBefore}`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Executing with account:', deployer.address);
  
  try {
    // Use constants from utils.ts
    await harvestRewards();
  } catch (error) {
    console.error('Error:', error);
    process.exitCode = 1;
  }
}

// Execute the script
if (require.main === module) {
  main();
} 