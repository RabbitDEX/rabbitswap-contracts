import { ethers } from 'hardhat';
import { getSponsoredFarmContract, FARM_CONSTANTS } from './utils';

// Set new reward per block for a farm
export async function setRewardPerBlock(
  farmId: bigint = FARM_CONSTANTS.SET_REWARD.FARM_ID,
  rewardPerBlock: bigint = FARM_CONSTANTS.SET_REWARD.REWARD_PER_BLOCK
): Promise<void> {
  const sponsoredFarm = await getSponsoredFarmContract();
  
  console.log(`Setting new reward per block ${rewardPerBlock} for farm ID: ${farmId}`);
  
  // Only the owner can set a new reward per block
  const tx = await sponsoredFarm.setRewardPerBlock(farmId, rewardPerBlock);
  await tx.wait();
  
  console.log(`Successfully set new reward per block ${rewardPerBlock} for farm ID ${farmId}`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Executing with account:', deployer.address);
  
  try {
    // Use constants from utils.ts
    await setRewardPerBlock();
  } catch (error) {
    console.error('Error:', error);
    process.exitCode = 1;
  }
}

// Execute the script
if (require.main === module) {
  main();
} 