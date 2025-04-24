import { ethers } from 'hardhat';
import { getSponsoredFarmContract, FARM_CONSTANTS } from './utils';

// Deposit rewards to a farm
export async function depositReward(
  farmId: bigint = FARM_CONSTANTS.DEPOSIT.FARM_ID,
  amount: bigint = FARM_CONSTANTS.DEPOSIT.AMOUNT
): Promise<void> {
  const sponsoredFarm = await getSponsoredFarmContract();
  const [depositor] = await ethers.getSigners();
  
  console.log(`Depositing ${amount} rewards to farm ID: ${farmId}`);
  
  // Get the farm details
  const farm = await sponsoredFarm.farms(farmId);
  
  // Get the reward token contract
  const rewardToken = await ethers.getContractAt('IERC20Upgradeable', farm.rewardToken);
  
  // Check allowance
  const allowance = await rewardToken.allowance(depositor.address, await sponsoredFarm.getAddress());
  if (allowance < amount) {
    console.log('Approving tokens for deposit...');
    const approveTx = await rewardToken.approve(await sponsoredFarm.getAddress(), amount);
    await approveTx.wait();
    console.log('Approval successful');
  }
  
  // Deposit the rewards
  const tx = await sponsoredFarm.depositReward(farmId, amount);
  await tx.wait();
  
  console.log(`Successfully deposited ${amount} rewards to farm ID ${farmId}`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Executing with account:', deployer.address);
  
  try {
    // Use constants from utils.ts
    await depositReward();
  } catch (error) {
    console.error('Error:', error);
    process.exitCode = 1;
  }
}

// Execute the script
if (require.main === module) {
  main();
} 