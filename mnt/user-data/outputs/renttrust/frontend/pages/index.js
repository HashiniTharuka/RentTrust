import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContract } from "../lib/contract";

const statusNames = ["Created", "Funded", "Evidence submitted", "Disputed", "Settled"];
const short = (value) => value ? `${value.slice(0, 8)}...${value.slice(-6)}` : "—";
const errorText = (error) => error?.reason || error?.shortMessage || error?.message || "Transaction failed.";

export default function Home() {
  const [id, setId] = useState("0");
  const [tenancyIds, setTenancyIds] = useState([]);
  const [tenant, setTenant] = useState("");
  const [arbitrator, setArbitrator] = useState("");
  const [deposit, setDeposit] = useState("0.1");
  const [moveInFile, setMoveInFile] = useState(null);
  const [moveOutFile, setMoveOutFile] = useState(null);
  const [tenancy, setTenancy] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action, success) => {
    setBusy(true); setMessage("");
    try { const contract = await getContract(); const tx = await action(contract); await tx.wait(); setMessage(success); await refresh(); }
    catch (error) { setMessage(errorText(error)); }
    finally { setBusy(false); }
  };
  const hashFile = async (file, fallback) => {
    if (!file) return ethers.keccak256(ethers.toUtf8Bytes(`${fallback}-${Date.now()}`));
    return ethers.keccak256(ethers.toUtf8Bytes(`${file.name}-${file.size}-${file.lastModified}`));
  };
  const refresh = async () => {
    try {
      const contract = await getContract();
      const count = Number(await contract.nextId());
      setTenancyIds(Array.from({ length: count }, (_, index) => index));
      if (count === 0) {
        setTenancy(null);
        setMessage("No tenancies have been created yet.");
        return;
      }
      const value = await contract.getTenancy(Number(id));
      setTenancy(value);
    } catch (error) { setMessage(errorText(error)); }
  };
  useEffect(() => { if (typeof window !== "undefined" && window.ethereum) window.ethereum.on("chainChanged", () => setTenancy(null)); }, []);

  return <main className="shell">
    <header><div><span className="eyebrow">RENTTRUST</span><h1>Fair deposits, settled on-chain.</h1><p>Three-party escrow for transparent rental handovers.</p></div><span className="badge">Hardhat Local · 31337</span></header>
    <div className="notice">{message || "Connect MetaMask to begin. Use one account for each role."}</div>
    <section className="card"><h2>Tenancy</h2><label>Tenancy ID<select value={id} onChange={(e) => { setId(e.target.value); setTenancy(null); }}>{tenancyIds.length === 0 && <option value="0">0</option>}{tenancyIds.map((tenancyId) => <option key={tenancyId} value={tenancyId}>Tenancy #{tenancyId}</option>)}</select></label><button className="secondary" onClick={refresh} disabled={busy}>Refresh state</button>{tenancy && <div className="state"><strong>{statusNames[Number(tenancy.status)]}</strong><span>Deposit: {ethers.formatEther(tenancy.depositAmount)} ETH</span><span>Landlord: {short(tenancy.landlord)}</span><span>Tenant: {short(tenancy.tenant)}</span><span>Arbitrator: {short(tenancy.arbitrator)}</span><span>Votes: landlord {tenancy.landlordVote.toString() || "—"} · tenant {tenancy.tenantVote.toString() || "—"} · arbitrator {tenancy.arbitratorVote.toString() || "—"}</span><span>Move-in: {short(tenancy.moveInHash)}</span><span>Move-out: {short(tenancy.moveOutHash)}</span></div>}</section>
    <section className="grid">
      <div className="card"><h2>1. Create tenancy <small>landlord</small></h2><label>Tenant address<input value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="0x..." /></label><label>Arbitrator address<input value={arbitrator} onChange={(e) => setArbitrator(e.target.value)} placeholder="0x..." /></label><button disabled={busy || !ethers.isAddress(tenant) || !ethers.isAddress(arbitrator)} onClick={() => run((c) => c.createTenancy(tenant, arbitrator), "Tenancy created.")}>Create tenancy</button></div>
      <div className="card"><h2>2. Fund deposit <small>tenant</small></h2><label>Amount (ETH)<input value={deposit} onChange={(e) => setDeposit(e.target.value)} /></label><button disabled={busy} onClick={() => run((c) => c.fundDeposit(id, { value: ethers.parseEther(deposit || "0") }), "Deposit locked.")}>Lock deposit</button></div>
      <div className="card"><h2>3. Record move-in <small>landlord</small></h2><label>Photo or evidence<input type="file" accept="image/*" onChange={(e) => setMoveInFile(e.target.files?.[0])} /></label><button disabled={busy} onClick={() => run(async (c) => c.recordMoveIn(id, await hashFile(moveInFile, "move-in")), "Move-in evidence recorded.")}>Record condition</button></div>
      <div className="card"><h2>4. Submit move-out <small>party</small></h2><label>Photo or evidence<input type="file" accept="image/*" onChange={(e) => setMoveOutFile(e.target.files?.[0])} /></label><button disabled={busy} onClick={() => run(async (c) => c.submitEvidence(id, await hashFile(moveOutFile, "move-out")), "Move-out evidence submitted.")}>Submit evidence</button></div>
    </section>
    <section className="card"><h2>5. Vote</h2><p className="muted">The connected MetaMask account determines whether the vote is from the landlord, tenant, or arbitrator.</p><button disabled={busy} onClick={() => run((c) => c.vote(id, 1), "Vote recorded: release to tenant.")}>Release to tenant</button><button disabled={busy} className="secondary" onClick={() => run((c) => c.vote(id, 2), "Vote recorded: release to landlord.")}>Release to landlord</button></section>
  </main>;
}
