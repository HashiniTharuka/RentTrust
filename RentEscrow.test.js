const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RentEscrow", function () {
  async function deploy() {
    const [landlord, tenant, arbitrator] = await ethers.getSigners();
    const RentEscrow = await ethers.getContractFactory("RentEscrow");
    const escrow = await RentEscrow.deploy();
    await escrow.waitForDeployment();
    return { escrow, landlord, tenant, arbitrator };
  }

  it("settles automatically when both parties agree", async function () {
    const { escrow, landlord, tenant, arbitrator } = await deploy();

    await escrow.connect(landlord).createTenancy(tenant.address, arbitrator.address);
    const deposit = ethers.parseEther("1");
    await escrow.connect(tenant).fundDeposit(0, { value: deposit });

    const moveInHash = ethers.keccak256(ethers.toUtf8Bytes("move-in-photo"));
    await escrow.connect(landlord).recordMoveIn(0, moveInHash);

    const moveOutHash = ethers.keccak256(ethers.toUtf8Bytes("move-out-photo"));
    await escrow.connect(tenant).submitEvidence(0, moveOutHash);

    const before = await ethers.provider.getBalance(tenant.address);
    await escrow.connect(landlord).vote(0, 1); // release to tenant
    const tx = await escrow.connect(tenant).vote(0, 1);
    await tx.wait();

    const tenancy = await escrow.getTenancy(0);
    expect(tenancy.status).to.equal(4n); // Settled
  });

  it("escalates to arbitrator on disagreement", async function () {
    const { escrow, landlord, tenant, arbitrator } = await deploy();

    await escrow.connect(landlord).createTenancy(tenant.address, arbitrator.address);
    await escrow.connect(tenant).fundDeposit(0, { value: ethers.parseEther("1") });
    await escrow.connect(tenant).submitEvidence(0, ethers.keccak256(ethers.toUtf8Bytes("evidence")));

    await escrow.connect(tenant).vote(0, 1);   // tenant wants funds
    await escrow.connect(landlord).vote(0, 2); // landlord disagrees

    let tenancy = await escrow.getTenancy(0);
    expect(tenancy.status).to.equal(3n); // Disputed

    await escrow.connect(arbitrator).vote(0, 2); // arbitrator sides with landlord
    tenancy = await escrow.getTenancy(0);
    expect(tenancy.status).to.equal(4n); // Settled
  });
});
