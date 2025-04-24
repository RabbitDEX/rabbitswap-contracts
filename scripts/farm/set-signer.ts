import { ethers } from 'hardhat';
import { getSponsoredFarmContract, FARM_CONSTANTS } from './utils';

// Set a new signer for a farm
export async function setSigner(
  farmId: bigint = FARM_CONSTANTS.SET_SIGNER.FARM_ID,
  newSigner: string = FARM_CONSTANTS.SET_SIGNER.NEW_SIGNER
): Promise<void> {
  const sponsoredFarm = await getSponsoredFarmContract();
  
  console.log(`Setting new signer ${newSigner} for farm ID: ${farmId}`);
  
  // Only the owner can set a new signer
  const tx = await sponsoredFarm.setSigner(farmId, newSigner);
  await tx.wait();
  
  console.log(`Successfully set new signer ${newSigner} for farm ID ${farmId}`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Executing with account:', deployer.address);
  
  try {
    // Use constants from utils.ts
    await setSigner();
  } catch (error) {
    console.error('Error:', error);
    process.exitCode = 1;
  }
}

// Execute the script
if (require.main === module) {
  main();
} 