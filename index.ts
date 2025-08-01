import { LocalAccountSigner } from "@aa-sdk/core";
import { alchemy, baseSepolia } from "@account-kit/infra";
import {
  concatHex,
  encodeFunctionData,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { createSmartWalletClient } from "@account-kit/wallet-client";
import { semiModularAccountBytecodeAbi } from "@account-kit/smart-contracts";

import { erc20MintableAbi } from "./erc20MintableAbi";

const explorerBaseUrl = "https://sepolia.basescan.org/tx/";

// Load vars from env
const gasManagerPolicyId = process.env.GAS_MANAGER_POLICY_ID;
if (!gasManagerPolicyId) {
  throw new Error("GAS_MANAGER_POLICY_ID environment variable is required");
}
const alchemyApiKey = process.env.ALCHEMY_API_KEY;
if (!alchemyApiKey) {
  throw new Error("ALCHEMY_API_KEY environment variable is required");
}

// Generate private key signer
const signer = LocalAccountSigner.generatePrivateKeySigner();
const signerAddress = await signer.getAddress();

console.log("Signer address:", signerAddress);

// Sample mintable ERC-20 token on base sepolia. Token name is "Demo USDC".
const mintableErc20Address: Address =
  "0xCFf7C6dA719408113DFcb5e36182c6d5aa491443";

// Create a smart wallet owned by the signer key
const smartWalletClient = createSmartWalletClient({
  transport: alchemy({
    apiKey: alchemyApiKey,
  }),
  chain: baseSepolia,
  signer,
});

// Get the smart wallet address
const account = await smartWalletClient.requestAccount();

console.log("Smart wallet address:", account.address);

// Deploy the smart wallet, and mint 100 demo USDC to the smart wallet
const preparedCalls = await smartWalletClient.prepareCalls({
  calls: [
    {
      to: mintableErc20Address,
      data: encodeFunctionData({
        abi: erc20MintableAbi,
        functionName: "mint",
        args: [account.address, parseEther("100")], // 100 Demo USDC
      }),
    },
  ],
  from: account.address,
  capabilities: {
    paymasterService: {
      policyId: gasManagerPolicyId,
    },
  },
});

// Sign Calls
const signedCalls = await smartWalletClient.signPreparedCalls(preparedCalls);

// Send the transaction
const result = await smartWalletClient.sendPreparedCalls(signedCalls);

console.log(
  "Submitted prepared calls, got call id:",
  result.preparedCallIds[0],
);

// Poll until the transaction is complete

const pollCallStatus = async (callId: Hex) => {
  // Poll the call status until it's no longer 100
  console.log("Polling call status...");
  let currentStatus;
  while (true) {
    currentStatus = await smartWalletClient.getCallsStatus(callId);

    if (currentStatus.status === 100) {
      console.log(
        `Status: ${currentStatus.status} - Still pending, waiting for transaction to complete...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
    } else if (currentStatus.status === 200) {
      console.log("Transaction completed successfully!");
      return currentStatus;
    } else {
      throw new Error(
        `Transaction failed with status: ${currentStatus.status}`,
      );
    }
  }
};

const mintAndDeployTransactionResult = await pollCallStatus(
  result.preparedCallIds[0]!,
);

console.log(
  `Successfully minted ERC-20 token and deployed smart wallet. Explorer link: ${explorerBaseUrl}${mintAndDeployTransactionResult.receipts?.[0]?.transactionHash}`,
);

// Ok, now the smart wallet is deployed, and has an ERC-20 balance.
// We can now atomically pull the funds from the smart wallet, back to the signer address, via EIP-7702 and gas sponsorship.

// For EIP-7702, we don't need to separately run `wallet_requestAccount` - we can just send from the signer address,
// and use EIP-7702 as a capability.

// For the call to encode, we want the signer address, now delegated as an EIP-7702 smart EOA, to call `executeWithRuntimeValidation`
// on the original smart wallet, encoding itself as the authorized party, and performing a transfer of the ERC-20 out to the signer address.
// Then, we batch a transfer from the signer address out to the final destination. This can be replaced with a bridge, deposit, etc.

const destinationAddress: Address =
  "0x1234123412341234123412341234123412341234";

const signerPreparedCalls = await smartWalletClient.prepareCalls({
  calls: [
    // First, transfer out the funds from the smart wallet to the signer address
    {
      to: account.address,
      data: encodeFunctionData({
        abi: semiModularAccountBytecodeAbi,
        functionName: "executeWithRuntimeValidation",
        args: [
          // The call for the smart wallet to make. Need to ABI-encode the call to execute, which is the transfer of the ERC-20 out to the signer address.
          encodeFunctionData({
            abi: semiModularAccountBytecodeAbi,
            functionName: "execute",
            args: [
              // to:
              mintableErc20Address,
              // value:
              0n,
              // data:
              encodeFunctionData({
                // The ERC-20 function call to transfer assets back to the signer address
                abi: erc20MintableAbi,
                functionName: "transfer",
                args: [signerAddress, parseEther("100")],
              }),
            ],
          }),
          // The authorization. Because this is using the account's root owner permission, this is validation entity id 0, and uses global validation.
          // Ref: https://github.com/alchemyplatform/modular-account/blob/v2.0.1/src/libraries/ValidationLocatorLib.sol
          concatHex([
            // Global validation option
            "0x01",
            // Validation entity id
            "0x00000000",
            // Validation signature segment
            "0xFF",
            // No further data needed, authorized by `msg.sender`
          ]),
        ],
      }),
    },
    // Second, transfer out the funds from the signer address to the destination address
    // Note: you can replace this with a deposit, bridge, etc.
    {
      to: mintableErc20Address,
      data: encodeFunctionData({
        abi: erc20MintableAbi,
        functionName: "transfer",
        args: [destinationAddress, parseEther("100")],
      }),
    },
  ],
  from: signerAddress,
  capabilities: {
    paymasterService: {
      policyId: gasManagerPolicyId,
    },
    // Enable delegation here
    eip7702Auth: true,
  },
});

// Note: because this is a batch of calls that needs a 7702 authorization, the resulting prepared call is of type "array", and needs the user op transaction and 7702 authorization to be signed separately.
// See the array type result in the reference docs here: https://www.alchemy.com/docs/wallets/api/smart-wallets/wallet-api-endpoints/wallet-api-endpoints/wallet-prepare-calls

const signedSignerCalls = await smartWalletClient.signPreparedCalls(
  signerPreparedCalls,
);

const signerResult = await smartWalletClient.sendPreparedCalls(
  signedSignerCalls,
);

console.log(
  "Submitted signer calls, got call id:",
  signerResult.preparedCallIds[0],
);

// Poll for the signer calls that:
//   1. Delegate via 7702
//   2. Pull funds from the smart wallet
//   3. Transfer funds to the final recepient
// While being gas sponsored just as before.

const signerCallsResult = await pollCallStatus(
  signerResult.preparedCallIds[0]!,
);

console.log(
  `Successfully pulled funds from the smart wallet and transferred to the destination address. Explorer link: ${explorerBaseUrl}${signerCallsResult.receipts?.[0]?.transactionHash}`,
);
