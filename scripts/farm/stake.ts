import { ethers } from 'hardhat';
import { getSponsoredFarmContract, FARM_CONSTANTS } from './utils';

// Stake a position
export async function stakePosition(
  tokenId: bigint = FARM_CONSTANTS.POSITION.TOKEN_ID
): Promise<void> {
  const sponsoredFarm = await getSponsoredFarmContract();
  const [user] = await ethers.getSigners();
  
  console.log(`Staking position with token ID: ${tokenId}`);
  
  // First, approve the NFT transfer if needed
  const nftManager = await ethers.getContractAt(
    'INonfungiblePositionManager',
    await sponsoredFarm.nonfungiblePositionManager()
  );
  
  const owner = await nftManager.ownerOf(tokenId);
  if (owner !== user.address) {
    throw new Error(`User is not the owner of token ID ${tokenId}`);
  }
  
  // Check if already approved
  const isApproved = await nftManager.isApprovedForAll(user.address, await sponsoredFarm.getAddress());
  if (!isApproved) {
    console.log('Approving NFT manager to transfer tokens...');
    const approveTx = await nftManager.setApprovalForAll(await sponsoredFarm.getAddress(), true);
    await approveTx.wait();
    console.log('Approval successful');
  }
  
  // Stake the position
  const tx = await sponsoredFarm.stake(tokenId);
  await tx.wait();
  console.log(`Position with token ID ${tokenId} staked successfully`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Executing with account:', deployer.address);
  
  try {
    // Use constants from utils.ts
    await stakePosition();
  } catch (error) {
    console.error('Error:', error);
    process.exitCode = 1;
  }
}

// Execute the script
if (require.main === module) {
  main();
} 