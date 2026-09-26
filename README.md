# RentTrust — Blockchain Rental Deposit Escrow
**EC8204 Blockchain & Cyber Security | University of Ruhuna**

---

## 1. Problem → Blockchain Solution

**The problem:** Rental deposits are a trust problem between strangers.

- A landlord wants to hold a deposit as security against damage, but the tenant
  has no guarantee the money will ever be returned fairly.
- Traditional disputes rely on a court or a biased property agent who may favour
  either party, charge fees, or take months to resolve.

**The blockchain solution:** A smart contract acts as an impartial, on-chain escrow.

- The tenant's deposit is **locked in code**, not in anyone's bank account.
- Both parties upload hashed photographic evidence of the property's condition at
  move-in and move-out.
- A simple voting mechanism settles the deposit automatically when both agree.
- If they disagree, a pre-agreed neutral **arbitrator** casts the deciding vote
  — no courts, no fees, no delays.
- Every step is recorded as an **immutable blockchain event** — a transparent
  audit trail that neither party can alter.

**Cyber security angle:** The contract is explicitly hardened against the four
most common smart contract attack vectors (see Security Design below).

---

## 2. Project Structure

```
RentTrust/
├── contracts/
│   └── RentEscrow.sol          ← the smart contract
├── test/
│   └── RentEscrow.test.js      ← 18 automated test cases
├── scripts/
│   └── deploy.js               ← deployment + auto-updates frontend
├── mnt/user-data/outputs/renttrust/frontend/
│   ├── pages/index.js          ← Next.js UI
│   ├── lib/contract.js         ← contract address + getContract()
│   ├── lib/abi.json            ← generated ABI
│   └── styles/globals.css
├── hardhat.config.js
└── package.json
```

---

## 3. Setup (once)

Requires [Node.js](https://nodejs.org) v18 or newer.

```bash
cd RentTrust
npm install
```

This installs Hardhat, the Hardhat Toolbox, and **OpenZeppelin Contracts**
(used for the `ReentrancyGuard` security module).

---

## 4. Compile

```bash
npx hardhat compile
```

---

## 5. Run Automated Tests

```bash
npx hardhat test
```

All **18 test cases** should pass. They cover:

| Category | Tests |
|---|---|
| Tenancy creation & validation | 4 |
| Deposit funding | 4 |
| Move-in evidence recording | 2 |
| Happy path — both agree (tenant wins) | 1 |
| Happy path — both agree (landlord wins) | 1 |
| Dispute escalation | 1 |
| Arbitrator resolution (both directions) | 2 |
| Access control — stranger blocked | 2 |
| Double-vote prevention | 1 |
| Multiple independent tenancies | 1 |

> **Screenshot this output for your report** — it is strong evidence of correctness.

---

## 6. Run a Local Blockchain and Deploy

Open **two terminals**.

**Terminal 1** — start a local Ethereum node:
```bash
npx hardhat node
```
Leave this running. Note the private keys it prints — you'll use them in MetaMask.

**Terminal 2** — deploy:
```bash
npm run deploy:local
```

The script automatically:
- Deploys `RentEscrow` to `localhost:8545`
- Updates `frontend/lib/contract.js` with the new address
- Copies the compiled ABI to `frontend/lib/abi.json`

---

## 7. Run the Frontend

```bash
cd mnt/user-data/outputs/renttrust/frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**MetaMask setup:**
- Add custom network → RPC URL: `http://127.0.0.1:8545` · Chain ID: `31337`
- Import 3 private keys from the Hardhat node output (one each for landlord,
  tenant, arbitrator).

---

## 8. Demo Flow (3 minutes)

| Step | Who | Action |
|------|-----|--------|
| 1 | Landlord | Create tenancy (enter tenant & arbitrator addresses) |
| 2 | Tenant | Fund deposit (e.g. 1 ETH) → watch it lock in the contract |
| 3 | Landlord | Record move-in hash (upload a photo — only its hash goes on-chain) |
| 4 | Tenant | Submit move-out evidence hash |
| 5a (happy) | Both | Vote "Release to tenant" → deposit instantly returned |
| 5b (dispute) | Landlord | Vote "Release to landlord" (disagrees) → status = Disputed |
| 5c (dispute) | Arbitrator | Vote → contract settles and pays the winner |

---

## 9. Security Design

| Attack | Risk | Mitigation in RentTrust |
|---|---|---|
| **Reentrancy** | Malicious recipient re-enters `_trySettle` during ETH transfer to drain funds | `depositAmount` zeroed **before** the `call` (Checks-Effects-Interactions pattern) + OpenZeppelin `ReentrancyGuard` as second layer |
| **Unauthorized access** | Anyone calling restricted functions | `onlyParty` modifier + per-function `require(msg.sender == role)` checks |
| **Funds permanently stuck** | Recipient is a contract with a non-trivial `receive()` that reverts under 2300 gas | Uses `call{value:...}` instead of `transfer`/`send` |
| **Double voting** | A party votes twice to manipulate outcome | `require(vote == 0)` guard before recording each vote |
| **Invalid state transition** | Depositing twice, voting before evidence, etc. | `inStatus()` modifier enforces strict state machine |
| **Colluding arbiter** | Arbiter is the same as landlord or tenant | `createTenancy` rejects non-independent arbitrator at deployment time |

---

## 10. State Machine

```
   [Created]
       │ fundDeposit() (tenant)
       ▼
   [Funded]
       │ submitEvidence() (any party)
       ▼
[EvidenceSubmitted]
    │          │
  agree      disagree
    │          │
    │       [Disputed]
    │          │ arbitratorVote()
    └────┬─────┘
         ▼
     [Settled]
```

---

## 11. Suggested 3-Minute Presentation

| Time | Slide / Action |
|------|---------------|
| 0:00–0:30 | **Problem** — rental deposit disputes, biased agents, slow courts |
| 0:30–1:00 | **Solution** — 3-party on-chain escrow, state machine diagram, photo hashing |
| 1:00–2:00 | **Live demo** — deposit, evidence upload, happy-path vote (ETH balance changes on-screen) |
| 2:00–2:30 | **Security design table** — reentrancy, access control, DoS mitigations |
| 2:30–3:00 | **Limitations & future work** — IPFS for photos, reputation system, multi-arbitrator governance |

---

## 12. Limitations (Demo prototype only)

- Does not verify real-world identities
- Photos are hashed in-browser; not uploaded to IPFS
- Single arbitrator is a centralisation risk (future: multi-sig arbitration)
- No production audit; not suitable for real funds

---
