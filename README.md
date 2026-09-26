# RentTrust — Setup

## Contracts

```bash
npm install
npx hardhat compile
npx hardhat test
npx hardhat node
```

Keep the Hardhat node running in one terminal. Then, in a second terminal:

```bash
npm run deploy:local
```

Copy the deployed contract address printed by the deployment script.

The contract source is located in `contracts/RentEscrow.sol` and the deployment script is located in `scripts/deploy.js`. The root `RentEscrow.sol` and `deploy.js` files are retained as the original submission copies. Hardhat is configured to use the structured directories above.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

The ABI in `frontend/lib/abi.json` is generated from the compiled contract artifact, and the deployed local contract address is recorded in `frontend/lib/contract.js`.

Add the local Hardhat network to MetaMask using:

* RPC URL: `http://127.0.0.1:8545`
* Chain ID: `31337`

Import 2–3 of the private keys displayed when the Hardhat node starts. These accounts can be used as the landlord, tenant, and arbitrator.

The UI validates wallet addresses, checks that the connected network uses chain ID 31337, handles rejected and reverted transactions, and displays the tenancy state and voting status.

The application also supports move-in and move-out photo hashing. Photos are not uploaded to a server. Instead, the browser processes the photo and stores only its `bytes32` hash on-chain.

## Demo Limitations

RentTrust is an educational prototype designed to run on a local blockchain network.

The current implementation does not:

* Verify real-world identities
* Provide a reputation system
* Store photos on IPFS
* Prevent parties from colluding against the arbitrator
* Provide production-level privacy or account recovery

A production version would require audited smart contracts, authenticated off-chain evidence storage, access recovery mechanisms, privacy controls, and a robust dispute and arbitrator governance model.
