const { expect } = require("chai");
const { ethers } = require("hardhat");

// ─── Helpers ────────────────────────────────────────────────────────────────
const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
const ETH = (n) => ethers.parseEther(String(n));
const Status = { Created: 0n, Funded: 1n, EvidenceSubmitted: 2n, Disputed: 3n, Settled: 4n };

async function deploy() {
  const [landlord, tenant, arbitrator, stranger] = await ethers.getSigners();
  const RentEscrow = await ethers.getContractFactory("RentEscrow");
  const escrow = await RentEscrow.deploy();
  await escrow.waitForDeployment();
  return { escrow, landlord, tenant, arbitrator, stranger };
}

async function setupFunded(escrow, landlord, tenant, arbitrator) {
  await escrow.connect(landlord).createTenancy(tenant.address, arbitrator.address);
  await escrow.connect(tenant).fundDeposit(0, { value: ETH(1) });
  return 0; // tenancy id
}

// ─── Test suite ─────────────────────────────────────────────────────────────
describe("RentEscrow", function () {

  // ── Deployment & creation ────────────────────────────────────────────────
  describe("createTenancy", function () {
    it("landlord can create a tenancy and nextId increments", async function () {
      const { escrow, landlord, tenant, arbitrator } = await deploy();
      await expect(escrow.connect(landlord).createTenancy(tenant.address, arbitrator.address))
        .to.emit(escrow, "TenancyCreated").withArgs(0n, landlord.address, tenant.address, arbitrator.address);
      expect(await escrow.nextId()).to.equal(1n);
    });

    it("reverts if tenant equals landlord", async function () {
      const { escrow, landlord, arbitrator } = await deploy();
      await expect(
        escrow.connect(landlord).createTenancy(landlord.address, arbitrator.address)
      ).to.be.revertedWith("RentTrust: landlord and tenant must differ");
    });

    it("reverts if arbitrator equals landlord", async function () {
      const { escrow, landlord, tenant } = await deploy();
      await expect(
        escrow.connect(landlord).createTenancy(tenant.address, landlord.address)
      ).to.be.revertedWith("RentTrust: arbitrator must be independent of landlord");
    });

    it("reverts if arbitrator equals tenant", async function () {
      const { escrow, landlord, tenant } = await deploy();
      await expect(
        escrow.connect(landlord).createTenancy(tenant.address, tenant.address)
      ).to.be.revertedWith("RentTrust: arbitrator must be independent of tenant");
    });
  });

  // ── Funding ───────────────────────────────────────────────────────────────
  describe("fundDeposit", function () {
    it("tenant can fund and status becomes Funded", async function () {
      const { escrow, landlord, tenant, arbitrator } = await deploy();
      await escrow.connect(landlord).createTenancy(tenant.address, arbitrator.address);
      await expect(escrow.connect(tenant).fundDeposit(0, { value: ETH(1) }))
        .to.emit(escrow, "DepositFunded").withArgs(0n, ETH(1));
      const t = await escrow.getTenancy(0);
      expect(t.status).to.equal(Status.Funded);
      expect(t.depositAmount).to.equal(ETH(1));
    });

    it("reverts if caller is not the tenant", async function () {
      const { escrow, landlord, tenant, arbitrator, stranger } = await deploy();
      await escrow.connect(landlord).createTenancy(tenant.address, arbitrator.address);
      await expect(
        escrow.connect(stranger).fundDeposit(0, { value: ETH(1) })
      ).to.be.revertedWith("RentTrust: only the tenant may fund");
    });

    it("reverts on zero deposit", async function () {
      const { escrow, landlord, tenant, arbitrator } = await deploy();
      await escrow.connect(landlord).createTenancy(tenant.address, arbitrator.address);
      await expect(
        escrow.connect(tenant).fundDeposit(0, { value: 0 })
      ).to.be.revertedWith("RentTrust: deposit must be greater than zero");
    });

    it("reverts if tenancy does not exist", async function () {
      const { escrow, tenant } = await deploy();
      await expect(
        escrow.connect(tenant).fundDeposit(99, { value: ETH(1) })
      ).to.be.revertedWith("RentTrust: tenancy does not exist");
    });
  });

  // ── Move-in evidence ─────────────────────────────────────────────────────
  describe("recordMoveIn", function () {
    it("landlord records move-in hash", async function () {
      const { escrow, landlord, tenant, arbitrator } = await deploy();
      await escrow.connect(landlord).createTenancy(tenant.address, arbitrator.address);
      const hash = h("move-in-photo");
      await expect(escrow.connect(landlord).recordMoveIn(0, hash))
        .to.emit(escrow, "MoveInRecorded").withArgs(0n, hash);
      expect((await escrow.getTenancy(0)).moveInHash).to.equal(hash);
    });

    it("reverts if called by non-landlord", async function () {
      const { escrow, landlord, tenant, arbitrator } = await deploy();
      await escrow.connect(landlord).createTenancy(tenant.address, arbitrator.address);
      await expect(
        escrow.connect(tenant).recordMoveIn(0, h("x"))
      ).to.be.revertedWith("RentTrust: only the landlord may record move-in");
    });
  });

  // ── Happy path ────────────────────────────────────────────────────────────
  describe("Happy path — both agree, deposit returned to tenant", function () {
    it("settles and pays tenant when both vote 1", async function () {
      const { escrow, landlord, tenant, arbitrator } = await deploy();
      const id = await setupFunded(escrow, landlord, tenant, arbitrator);
      await escrow.connect(landlord).recordMoveIn(id, h("in"));
      await escrow.connect(tenant).submitEvidence(id, h("out"));

      const before = await ethers.provider.getBalance(tenant.address);
      await escrow.connect(landlord).vote(id, 1);
      const tx = await escrow.connect(tenant).vote(id, 1);
      const receipt = await tx.wait();
      const gas = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(tenant.address);

      // Tenant received ~1 ETH (minus gas)
      expect(after + gas - before).to.be.closeTo(ETH(1), ETH("0.001"));
      expect((await escrow.getTenancy(id)).status).to.equal(Status.Settled);
    });
  });

  // ── Landlord wins ────────────────────────────────────────────────────────
  describe("Happy path — both agree, deposit goes to landlord", function () {
    it("settles and pays landlord when both vote 2", async function () {
      const { escrow, landlord, tenant, arbitrator } = await deploy();
      const id = await setupFunded(escrow, landlord, tenant, arbitrator);
      await escrow.connect(tenant).submitEvidence(id, h("damage-evidence"));

      const before = await ethers.provider.getBalance(landlord.address);
      await escrow.connect(tenant).vote(id, 2);
      const tx = await escrow.connect(landlord).vote(id, 2);
      const receipt = await tx.wait();
      const gas = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(landlord.address);

      expect(after + gas - before).to.be.closeTo(ETH(1), ETH("0.001"));
      expect((await escrow.getTenancy(id)).status).to.equal(Status.Settled);
    });
  });

  // ── Dispute path ─────────────────────────────────────────────────────────
  describe("Dispute path — arbitrator decides", function () {
    it("escalates to Disputed when parties disagree", async function () {
      const { escrow, landlord, tenant, arbitrator } = await deploy();
      const id = await setupFunded(escrow, landlord, tenant, arbitrator);
      await escrow.connect(tenant).submitEvidence(id, h("out"));

      await escrow.connect(tenant).vote(id, 1);
      await expect(escrow.connect(landlord).vote(id, 2))
        .to.emit(escrow, "Disputed").withArgs(0n);

      expect((await escrow.getTenancy(id)).status).to.equal(Status.Disputed);
    });

    it("arbitrator resolves in favour of tenant (choice 1)", async function () {
      const { escrow, landlord, tenant, arbitrator } = await deploy();
      const id = await setupFunded(escrow, landlord, tenant, arbitrator);
      await escrow.connect(tenant).submitEvidence(id, h("out"));
      await escrow.connect(tenant).vote(id, 1);
      await escrow.connect(landlord).vote(id, 2); // -> Disputed

      await expect(escrow.connect(arbitrator).vote(id, 1))
        .to.emit(escrow, "Settled").withArgs(0n, tenant.address, ETH(1));
      expect((await escrow.getTenancy(id)).status).to.equal(Status.Settled);
    });

    it("arbitrator resolves in favour of landlord (choice 2)", async function () {
      const { escrow, landlord, tenant, arbitrator } = await deploy();
      const id = await setupFunded(escrow, landlord, tenant, arbitrator);
      await escrow.connect(tenant).submitEvidence(id, h("out"));
      await escrow.connect(tenant).vote(id, 1);
      await escrow.connect(landlord).vote(id, 2); // -> Disputed

      await expect(escrow.connect(arbitrator).vote(id, 2))
        .to.emit(escrow, "Settled").withArgs(0n, landlord.address, ETH(1));
      expect((await escrow.getTenancy(id)).status).to.equal(Status.Settled);
    });

    it("arbitrator cannot vote before dispute is raised", async function () {
      const { escrow, landlord, tenant, arbitrator } = await deploy();
      const id = await setupFunded(escrow, landlord, tenant, arbitrator);
      await escrow.connect(tenant).submitEvidence(id, h("out"));
      // Neither party has voted yet — no dispute raised
      await expect(
        escrow.connect(arbitrator).vote(id, 1)
      ).to.be.revertedWith("RentTrust: arbitrator may only vote after a dispute");
    });
  });

  // ── Access control ────────────────────────────────────────────────────────
  describe("Access control", function () {
    it("stranger cannot submit evidence", async function () {
      const { escrow, landlord, tenant, arbitrator, stranger } = await deploy();
      const id = await setupFunded(escrow, landlord, tenant, arbitrator);
      await expect(
        escrow.connect(stranger).submitEvidence(id, h("x"))
      ).to.be.revertedWith("RentTrust: caller is not a party");
    });

    it("stranger cannot vote", async function () {
      const { escrow, landlord, tenant, arbitrator, stranger } = await deploy();
      const id = await setupFunded(escrow, landlord, tenant, arbitrator);
      await escrow.connect(tenant).submitEvidence(id, h("x"));
      await expect(
        escrow.connect(stranger).vote(id, 1)
      ).to.be.revertedWith("RentTrust: caller is not a party");
    });

    it("a party cannot vote twice", async function () {
      const { escrow, landlord, tenant, arbitrator } = await deploy();
      const id = await setupFunded(escrow, landlord, tenant, arbitrator);
      await escrow.connect(tenant).submitEvidence(id, h("out"));
      await escrow.connect(tenant).vote(id, 1);
      await expect(
        escrow.connect(tenant).vote(id, 2)
      ).to.be.revertedWith("RentTrust: tenant already voted");
    });
  });

  // ── Multiple tenancies ────────────────────────────────────────────────────
  describe("Multiple tenancies", function () {
    it("tracks independent tenancies correctly", async function () {
      const { escrow, landlord, tenant, arbitrator, stranger } = await deploy();

      // Tenancy 0
      await escrow.connect(landlord).createTenancy(tenant.address, arbitrator.address);
      await escrow.connect(tenant).fundDeposit(0, { value: ETH(1) });

      // Tenancy 1 — landlord is now 'stranger', tenant is arbitrator
      await escrow.connect(stranger).createTenancy(tenant.address, landlord.address);
      await escrow.connect(tenant).fundDeposit(1, { value: ETH(2) });

      const t0 = await escrow.getTenancy(0);
      const t1 = await escrow.getTenancy(1);

      expect(t0.depositAmount).to.equal(ETH(1));
      expect(t1.depositAmount).to.equal(ETH(2));
      expect(await escrow.nextId()).to.equal(2n);
    });
  });
});
