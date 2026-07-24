import WalletManagerEvm, { type EvmWalletConfig } from '@tetherto/wdk-wallet-evm';
import { PassportSignerEvm } from './PassportSignerEvm';
import { SEPOLIA_CHAIN_ID, type PassportEvmTransport } from './protocol';

export type PassportWalletSession = {
  manager: WalletManagerEvm;
  account: Awaited<ReturnType<WalletManagerEvm['getAccount']>>;
  address: string;
};

export async function createPassportWalletSession(
  transport: PassportEvmTransport,
  config: Omit<EvmWalletConfig, 'chainId'> = {}
): Promise<PassportWalletSession> {
  const manager = new WalletManagerEvm(PassportSignerEvm.root(transport), {
    ...config,
    chainId: SEPOLIA_CHAIN_ID,
  });

  try {
    const account = await manager.getAccount(0);
    const address = await account.getAddress();
    return { manager, account, address };
  } catch (error) {
    manager.dispose();
    throw error;
  }
}
