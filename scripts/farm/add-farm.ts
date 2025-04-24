import { ethers } from 'hardhat';
import { getSponsoredFarmContract, FARM_CONSTANTS } from './utils';

// Add a new farm
export async function addFarm(
  rewardToken: string = FARM_CONSTANTS.ADD_FARM.REWARD_TOKEN,
  signer: string = FARM_CONSTANTS.ADD_FARM.SIGNER,
  pool: string = FARM_CONSTANTS.ADD_FARM.POOL,
  rewardPerBlock: bigint = FARM_CONSTANTS.ADD_FARM.REWARD_PER_BLOCK
): Promise<void> {
  const sponsoredFarm = await getSponsoredFarmContract();
  
  console.log(`Adding farm with reward token: ${rewardToken}`);
  console.log(`Signer: ${signer}`);
  console.log(`Pool: ${pool}`);
  console.log(`Reward per block: ${rewardPerBlock}`);
  
  const tx = await sponsoredFarm.addFarm(rewardToken, signer, pool, rewardPerBlock);
  const receipt = await tx.wait();
  
  // Find the FarmAdded event to get the farmId
  const farmAddedEvent = receipt?.logs
    .filter((log) => log.topics[0] === sponsoredFarm.interface.getEvent('FarmAdded').topicHash)
    .map((log) => sponsoredFarm.interface.parseLog({ topics: log.topics as string[], data: log.data }))
    .find(Boolean);
  
  if (farmAddedEvent) {
    const farmId = farmAddedEvent.args.farmId;
    console.log(`Farm added successfully with ID: ${farmId}`);
  } else {
    console.log('Farm added successfully, but could not retrieve farm ID');
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Executing with account:', deployer.address);
  
  try {
    // Use constants from utils.ts
    await addFarm();
  } catch (error) {
    console.error('Error:', error);
    process.exitCode = 1;
  }
}

// Execute the script
if (require.main === module) {
  main();
} 