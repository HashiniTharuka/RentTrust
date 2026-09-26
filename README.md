# RentTrust — Setup

## Contracts
```
npm install
npx hardhat compile
npx hardhat test
npx hardhat node                 # keep running in one terminal
npm run deploy:local             # in a second terminal, copy the printed address
```

The contract source is in `contracts/RentEscrow.sol` and the deployment script is
in `scripts/deploy.js`. The root `RentEscrow.sol` and `deploy.js` files are kept
as the original submission copies; Hardhat is configured to use the structured
directories above.

## Frontend
```
cd frontend
npm install
npm run dev
```

The ABI in `frontend/lib/abi.json` is generated from the compiled artifact and the
deployed local address is recorded in `frontend/lib/contract.js`.

Add the local Hardhat network to MetaMask (RPC `http://127.0.0.1:8545`, chain id `31337`)
and import 2–3 of the private keys Hardhat prints on `hardhat node` startup, to act as
landlord, tenant, and arbitrator.

```
The UI validates addresses, checks chain ID 31337, handles rejected/reverted
transactions, supports move-in and move-out photo hashing, and displays the
complete tenancy state and votes. Photos are not uploaded to a server: the
browser hashes the file metadata and stores only the bytes32 hash on-chain.

## Demo limitations

This is an educational local-network prototype. It does not verify real-world
identity, provide a reputation system, store photos on IPFS, or prevent parties
from colluding against the arbitrator. A production version would need audited
contracts, authenticated off-chain evidence storage, access recovery, privacy
controls, and a dispute/arbitrator governance model.

## Three-minute pitch run-through

**0:00–0:30 — Problem:** Rental deposits are held by one party and disputes are
slow, opaque, and difficult to prove.

**0:30–1:10 — Solution:** RentTrust creates a three-party escrow. The tenant
locks the deposit, the landlord records the move-in condition, and either party
submits move-out evidence. Evidence is represented by tamper-evident hashes.

**1:10–2:20 — Live demo:** Create a tenancy with three MetaMask accounts; fund
the deposit; record move-in; submit move-out evidence; have both parties vote
the same way to show automatic settlement. Repeat with conflicting votes and
let the arbitrator settle the dispute.

**2:20–2:50 — Why blockchain:** The rules and settlement are deterministic,
visible, and do not require either party to trust the other with the deposit.

**2:50–3:00 — Close:** RentTrust makes the deposit workflow auditable today,
with identity, evidence storage, and governance as the next production steps.

Presentation filename: `GP_XX_RentTrust.ppt` (replace `XX` with the assigned
group number before submission). Confirm the lecturer's sheet and final
deadline with the lecturer; the repository intentionally does not invent either.

## Demo script (3 minutes)
1. As landlord: create tenancy (paste tenant + arbitrator addresses).
2. As tenant: lock deposit.
3. As tenant: submit move-out evidence.
4. Both vote the same way → show instant auto-release.
5. Repeat with conflicting votes → show status becomes Disputed → arbitrator votes → funds release.
