import { ethers } from 'hardhat';
import { getSponsoredFarmContract, FARM_CONSTANTS } from './utils';

// Unstake a position
export async function unstakePosition(
  tokenId: bigint = FARM_CONSTANTS.POSITION.TOKEN_ID
): Promise<void> {
  const sponsoredFarm = await getSponsoredFarmContract();
  const [user] = await ethers.getSigners();
  
  console.log(`Unstaking position with token ID: ${tokenId}`);
  
  // Check if the user is the owner of the staked position
  const owner = await sponsoredFarm.positionOwner(tokenId);
  if (owner !== user.address) {
    throw new Error(`User is not the owner of staked token ID ${tokenId}`);
  }
  
  const tx = await sponsoredFarm.unstake(tokenId);
  await tx.wait();
  console.log(`Position with token ID ${tokenId} unstaked successfully`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Executing with account:', deployer.address);
  
  try {
    // Use constants from utils.ts
    await unstakePosition();
  } catch (error) {
    console.error('Error:', error);
    process.exitCode = 1;
  }
}

// Execute the script
if (require.main === module) {
  main();
} 