const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RentEscrow", function () {
  async function deploy() {
    const [landlord, tenant, arbitrator] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("RentEscrow");
    const escrow = await Factory.deploy();
    await escrow.waitForDeployment();
    return { escrow, landlord, tenant, arbitrator };
  }

  async function prepareEscrow() {
    const actors = await deploy();
    const { escrow, landlord, tenant, arbitrator } = actors;
    await escrow.connect(landlord).createTenancy(tenant.address, arbitrator.address);
    await escrow.connect(tenant).fundDeposit(0, { value: ethers.parseEther("1") });
    await escrow.connect(landlord).recordMoveIn(0, ethers.keccak256(ethers.toUtf8Bytes("move-in")));
    await escrow.connect(tenant).submitEvidence(0, ethers.keccak256(ethers.toUtf8Bytes("move-out")));
    return actors;
  }

  it("settles automatically when both parties agree", async function () {
    const { escrow, landlord, tenant } = await prepareEscrow();
    await escrow.connect(landlord).vote(0, 1);
    await escrow.connect(tenant).vote(0, 1);
    expect((await escrow.getTenancy(0)).status).to.equal(4n);
    expect((await ethers.provider.getBalance(escrow.target))).to.equal(0n);
  });

  it("escalates to the arbitrator on disagreement", async function () {
    const { escrow, landlord, tenant, arbitrator } = await prepareEscrow();
    await escrow.connect(tenant).vote(0, 1);
    await escrow.connect(landlord).vote(0, 2);
    expect((await escrow.getTenancy(0)).status).to.equal(3n);
    await escrow.connect(arbitrator).vote(0, 2);
    expect((await escrow.getTenancy(0)).status).to.equal(4n);
  });
});
