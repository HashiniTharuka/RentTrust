import { useState } from "react";
import { ethers } from "ethers";
import { getContract } from "../lib/contract";

export default function Home() {
  const [tenancyId, setTenancyId] = useState("0");
  const [tenant, setTenant] = useState("");
  const [arbitrator, setArbitrator] = useState("");
  const [deposit, setDeposit] = useState("0.1");
  const [status, setStatus] = useState("");

  async function createTenancy() {
    const contract = await getContract();
    const tx = await contract.createTenancy(tenant, arbitrator);
    await tx.wait();
    setStatus("Tenancy created.");
  }

  async function fundDeposit() {
    const contract = await getContract();
    const tx = await contract.fundDeposit(tenancyId, {
      value: ethers.parseEther(deposit),
    });
    await tx.wait();
    setStatus("Deposit locked in escrow.");
  }

  async function submitEvidence() {
    const contract = await getContract();
    const hash = ethers.keccak256(ethers.toUtf8Bytes("move-out-photo-" + Date.now()));
    const tx = await contract.submitEvidence(tenancyId, hash);
    await tx.wait();
    setStatus("Evidence submitted.");
  }

  async function castVote(choice) {
    const contract = await getContract();
    const tx = await contract.vote(tenancyId, choice);
    await tx.wait();
    setStatus(`Vote (${choice === 1 ? "release to tenant" : "release to landlord"}) recorded.`);
  }

  return (
    <main style={{ maxWidth: 600, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>RentTrust — Demo Console</h1>

      <section style={{ marginBottom: 24 }}>
        <h3>1. Create tenancy</h3>
        <input placeholder="Tenant address" value={tenant} onChange={(e) => setTenant(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
        <input placeholder="Arbitrator address" value={arbitrator} onChange={(e) => setArbitrator(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
        <button onClick={createTenancy}>Create Tenancy</button>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3>2. Fund deposit (as tenant)</h3>
        <input placeholder="Tenancy ID" value={tenancyId} onChange={(e) => setTenancyId(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
        <input placeholder="Deposit (ETH)" value={deposit} onChange={(e) => setDeposit(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
        <button onClick={fundDeposit}>Lock Deposit</button>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3>3. Submit move-out evidence</h3>
        <button onClick={submitEvidence}>Submit Evidence</button>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3>4. Vote (tenant / landlord / arbitrator)</h3>
        <button onClick={() => castVote(1)} style={{ marginRight: 8 }}>Vote: Release to Tenant</button>
        <button onClick={() => castVote(2)}>Vote: Release to Landlord</button>
      </section>

      <p><b>Status:</b> {status}</p>
    </main>
  );
}
