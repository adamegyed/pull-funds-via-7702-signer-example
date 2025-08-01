# pull-funds-via-7702-signer-example

An example of pulling funds from a smart contract account to its signer's address, using EIP-7702 and wallet APIs.

Full script here: [index.ts](./index.ts)

To install dependencies:

```bash
bun install
```

To set up env vars, copy `.env.example` to `.env` and add a policy ID and API key.

To run:

```bash
bun run index.ts
```

Sample output:
```
Signer address: 0x4AA1121821494a400841b6727B82115ebD5c3770
Smart wallet address: 0xd4877A15F0764CdcC961Db6C1c193d23513ef0C7
Submitted prepared calls, got call id: 0x0000000000000000000000000000000000000000000000000000000000014a34a420884178fa88380dc1971a1f08788418dd4d61e4f75fb9945758ba1b9039cd
Polling call status...
Status: 100 - Still pending, waiting for transaction to complete...
Transaction completed successfully!
Successfully minted ERC-20 token and deployed smart wallet. Explorer link: https://sepolia.basescan.org/tx/0xf809db9ff319d11909482ea926d644ac707b8ec4f6fb3fe8ed9415b4465a980e
Submitted signer calls, got call id: 0x0000000000000000000000000000000000000000000000000000000000014a3439797980ff3bacee05031cb4c29e61c68251a2f4daf3621b1fef80332459b4a7
Polling call status...
Status: 100 - Still pending, waiting for transaction to complete...
Transaction completed successfully!
Successfully pulled funds from the smart wallet and transferred to the destination address. Explorer link: https://sepolia.basescan.org/tx/0x8cb675169eddd59134c3f942a9c911321f265ba4462338b6bac8b7c923e5cf99
```


