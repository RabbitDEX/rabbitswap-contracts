/* eslint-disable @typescript-eslint/no-unused-expressions */
import {
  ContractTransactionReceipt,
  ContractTransactionResponse,
} from 'ethers';
import { expect } from './expect';

export default async function snapshotGasCost(
  x:
    | Promise<ContractTransactionResponse>
    | ContractTransactionResponse
    | Promise<ContractTransactionReceipt>
    | ContractTransactionReceipt
    | Promise<bigint>
    | bigint,
): Promise<void> {
  const resolved = await x;
  if (typeof resolved === 'bigint') {
    expect(resolved.toString()).toMatchSnapshot();
  } else if ('wait' in resolved) {
    const waited = await resolved.wait();
    waited && expect(waited.gasUsed).toMatchSnapshot();
  } else {
    expect(resolved.gasUsed).toMatchSnapshot();
  }
}
