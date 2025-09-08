import { ethers } from "hardhat";
import { ContractTransactionResponse, Signer } from "ethers";
import { RabbitStaker, MockERC20, MockSRabbitToken } from "../../../typechain";

export interface TestFixture {
  rabbitStaker: RabbitStaker;
  rabbitToken: MockERC20;
  sRabbitToken: MockSRabbitToken;
  owner: Signer;
  user1: Signer;
  user2: Signer;
  ownerAddress: string;
  user1Address: string;
  user2Address: string;
}

export const INITIAL_EMISSION_PER_BLOCK = ethers.parseEther("0.1"); // 0.1 RABBIT per block
export const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M RABBIT tokens

export async function deployRabbitStakerFixture(): Promise<TestFixture> {
  // Get signers
  const [owner, user1, user2] = await ethers.getSigners();
  const ownerAddress = await owner.getAddress();
  const user1Address = await user1.getAddress();
  const user2Address = await user2.getAddress();

  // Deploy mock tokens
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const rabbitToken = await MockERC20Factory.deploy("Rabbit Token", "RABBIT");
  
  const MockSRabbitTokenFactory = await ethers.getContractFactory("MockSRabbitToken");
  const sRabbitToken = await MockSRabbitTokenFactory.deploy("Staked Rabbit Token", "sRABBIT");

  // Deploy RabbitStaker
  const RabbitStakerFactory = await ethers.getContractFactory("RabbitStaker");
  const rabbitStaker = await RabbitStakerFactory.deploy();

  // Initialize the contract with ZERO emission for cleaner testing
  await rabbitStaker.initialize(
    await rabbitToken.getAddress(),
    await sRabbitToken.getAddress(),
    0 // Initialize with zero emission
  );

  // Mint initial tokens to users for testing
  await rabbitToken.mint(user1Address, INITIAL_SUPPLY);
  await rabbitToken.mint(user2Address, INITIAL_SUPPLY);

  return {
    rabbitStaker,
    rabbitToken,
    sRabbitToken,
    owner,
    user1,
    user2,
    ownerAddress,
    user1Address,
    user2Address,
  };
}

export async function setupUserTokens(
  rabbitToken: MockERC20,
  userAddress: string,
  amount: bigint
): Promise<void> {
  await rabbitToken.mint(userAddress, amount);
}

export async function approveAndDeposit(
  rabbitToken: MockERC20,
  rabbitStaker: RabbitStaker,
  user: Signer,
  amount: bigint
): Promise<void> {
  await rabbitToken.connect(user).approve(await rabbitStaker.getAddress(), amount);
  await rabbitStaker.connect(user).deposit(amount);
}

export async function approveSRabbitAndWithdraw(
  sRabbitToken: MockSRabbitToken,
  rabbitStaker: RabbitStaker,
  user: Signer,
  amount: bigint,
  vestingDays: number
): Promise<ContractTransactionResponse> {
  await sRabbitToken.connect(user).approve(await rabbitStaker.getAddress(), amount);
  return await rabbitStaker.connect(user).withdraw(amount, vestingDays);
}
