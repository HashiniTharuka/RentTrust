import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { getContract, CONTRACT_ADDRESS } from "../lib/contract";

// ─── Constants ───────────────────────────────────────────────────────────────
const STATUS_NAMES  = ["Created", "Funded", "Evidence Submitted", "Disputed", "Settled"];
const STATUS_COLORS = ["badge-created", "badge-funded", "badge-evidence", "badge-disputed", "badge-settled"];
const STATUS_ICONS  = ["🏠", "🔒", "📸", "⚖️", "✅"];

const STEPS = [
  { label: "Create Tenancy", icon: "🏠" },
  { label: "Fund Deposit",   icon: "🔒" },
  { label: "Record Move-In", icon: "📷" },
  { label: "Submit Evidence",icon: "📄" },
  { label: "Vote & Settle",  icon: "⚖️" },
];

const short = (v) => v ? `${v.slice(0, 8)}…${v.slice(-6)}` : "—";
const shortHash = (v) => v && v !== ethers.ZeroHash ? `${v.slice(0, 10)}…${v.slice(-8)}` : null;
const errMsg  = (e) => e?.reason || e?.shortMessage || e?.message || "Transaction failed.";
const nowStr  = () => new Date().toLocaleTimeString();
const hashFile = async (file, fallback) => {
  if (!file) return ethers.keccak256(ethers.toUtf8Bytes(`${fallback}-${Date.now()}`));
  // Hash file contents for real tamper-proof fingerprint
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return "0x" + Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,"0")).join("");
};

// ─── Notice Component ─────────────────────────────────────────────────────────
function Notice({ msg }) {
  if (!msg) return null;
  const isErr = msg.toLowerCase().includes("fail") || msg.toLowerCase().includes("error") || msg.toLowerCase().includes("revert") || msg.toLowerCase().includes("wrong") || msg.toLowerCase().includes("required");
  const isOk  = msg.toLowerCase().includes("success") || msg.toLowerCase().includes("created") || msg.toLowerCase().includes("locked") || msg.toLowerCase().includes("recorded") || msg.toLowerCase().includes("submitted") || msg.toLowerCase().includes("voted");
  const type  = isErr ? "error" : isOk ? "success" : "info";
  const icon  = isErr ? "❌" : isOk ? "✅" : "ℹ️";
  return (
    <div className={`notice ${type}`}>
      <span className="notice-icon">{icon}</span>
      {msg}
    </div>
  );
}

// ─── Step Progress Bar ────────────────────────────────────────────────────────
function Stepper({ status }) {
  const active = status === undefined ? -1 : Math.min(Number(status), 4);
  // Map contract status to stepper step
  const stepMap = [0, 1, 2, 3, 4]; // Created→0, Funded→1, Evidence→2, Disputed→3, Settled→4
  const currentStep = active < 0 ? -1 : stepMap[active];

  return (
    <div className="stepper">
      {STEPS.map((s, i) => {
        const done   = i < currentStep;
        const act    = i === currentStep;
        return (
          <div key={i} className={`step ${done ? "done" : act ? "active" : ""}`}>
            <span className="step-num">{done ? "✓" : i + 1}</span>
            <span>{s.icon} {s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [account, setAccount]       = useState("");
  const [balance, setBalance]       = useState("");
  const [tenancyIds, setTenancyIds] = useState([]);
  const [tenancyId, setTenancyId]   = useState("0");
  const [tenancy, setTenancy]       = useState(null);
  const [tenant, setTenant]         = useState("");
  const [arbitrator, setArbitrator] = useState("");
  const [deposit, setDeposit]       = useState("0.1");
  const [moveInFile, setMoveInFile] = useState(null);
  const [moveOutFile, setMoveOutFile] = useState(null);
  const [msg, setMsg]               = useState("");
  const [busy, setBusy]             = useState(false);
  const [events, setEvents]         = useState([]);
  const moveInRef  = useRef();
  const moveOutRef = useRef();

  // ── Wallet Connection ──────────────────────────────────────────────────────
  const connectWallet = async () => {
    if (!window.ethereum) { setMsg("MetaMask not found. Please install it."); return; }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const addr   = await signer.getAddress();
      const bal    = await provider.getBalance(addr);
      setAccount(addr);
      setBalance(parseFloat(ethers.formatEther(bal)).toFixed(3));
      setMsg("Wallet connected!");
      addEvent("Wallet connected", "blue");
      refresh(addr);
    } catch(e) { setMsg(errMsg(e)); }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum.on("accountsChanged", () => { setAccount(""); setTenancy(null); setBalance(""); });
      window.ethereum.on("chainChanged", () => { setTenancy(null); });
    }
  }, []);

  // ── Event Log ──────────────────────────────────────────────────────────────
  const addEvent = (text, color = "blue") => {
    setEvents(prev => [{ text, color, time: nowStr() }, ...prev].slice(0, 20));
  };

  // ── Fetch Tenancy ──────────────────────────────────────────────────────────
  const refresh = useCallback(async (acc) => {
    try {
      const contract = await getContract();
      const count = Number(await contract.nextId());
      const ids = Array.from({ length: count }, (_, i) => i);
      setTenancyIds(ids);
      if (count === 0) { setTenancy(null); return; }
      const id = Math.min(Number(tenancyId), count - 1);
      const t  = await contract.getTenancy(id);
      setTenancy(t);
      // Update balance
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const a = acc || account;
        if (a) {
          const bal = await provider.getBalance(a);
          setBalance(parseFloat(ethers.formatEther(bal)).toFixed(3));
        }
      }
    } catch(e) { setMsg(errMsg(e)); }
  }, [tenancyId, account]);

  // ── Run Transaction ────────────────────────────────────────────────────────
  const run = async (action, successMsg, eventText, eventColor = "blue") => {
    setBusy(true); setMsg("");
    try {
      const contract = await getContract();
      const tx = await action(contract);
      addEvent("⏳ Transaction sent…", "amber");
      await tx.wait();
      setMsg(successMsg);
      addEvent(eventText, eventColor);
      await refresh();
    } catch(e) {
      setMsg(errMsg(e));
      addEvent("❌ " + errMsg(e), "red");
    } finally { setBusy(false); }
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const status   = tenancy ? Number(tenancy.status) : -1;
  const isLandlord  = tenancy && account.toLowerCase() === tenancy.landlord.toLowerCase();
  const isTenant    = tenancy && account.toLowerCase() === tenancy.tenant.toLowerCase();
  const isArbitrator= tenancy && account.toLowerCase() === tenancy.arbitrator.toLowerCase();

  const roleLabel = isLandlord ? "Landlord" : isTenant ? "Tenant" : isArbitrator ? "Arbitrator" : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="shell">

      {/* ── Header ── */}
      <header className="header">
        <div className="logo">
          <div className="logo-icon">🏠</div>
          <div className="logo-text">
            <div className="logo-name">RentTrust</div>
            <div className="logo-sub">Trustless Rental Deposits · Ethereum</div>
          </div>
        </div>
        {account ? (
          <div className="wallet-pill">
            <span className="wallet-dot" />
            <span className="wallet-addr">{short(account)}</span>
            {roleLabel && <span className="you-tag">{roleLabel}</span>}
            <span className="wallet-bal">⟠ {balance} ETH</span>
          </div>
        ) : (
          <button className="connect-btn" onClick={connectWallet}>🦊 Connect MetaMask</button>
        )}
      </header>

      {/* ── Stepper ── */}
      <Stepper status={status} />

      {/* ── Notice ── */}
      <Notice msg={msg} />

      {/* ── Tenancy Selector ── */}
      {(tenancyIds.length > 0 || account) && (
        <div className="tenancy-bar">
          <select
            className="tenancy-select"
            value={tenancyId}
            onChange={e => { setTenancyId(e.target.value); setTenancy(null); }}
          >
            {tenancyIds.length === 0
              ? <option value="0">No tenancies yet</option>
              : tenancyIds.map(i => <option key={i} value={i}>Tenancy #{i}</option>)
            }
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => refresh()} disabled={busy}>
            {busy ? <><span className="spinner"/> Updating…</> : "↻ Refresh"}
          </button>
        </div>
      )}

      {/* ── Settled Banner ── */}
      {status === 4 && (
        <div className="settled-banner" style={{ marginBottom: 20 }}>
          <span className="settled-icon">🎉</span>
          <div className="settled-title">Deposit Settled!</div>
          <div className="settled-sub">
            {Number(tenancy.landlordVote) === 1 && Number(tenancy.tenantVote) === 1
              ? `Deposit returned to tenant ${short(tenancy.tenant)}`
              : `Deposit released to landlord ${short(tenancy.landlord)}`}
          </div>
        </div>
      )}

      {/* ── Main Layout ── */}
      <div className="layout">

        {/* LEFT — Tenancy Status */}
        <div className="card">
          <div className="card-title">Tenancy Overview</div>

          {tenancy ? (
            <>
              {/* Status + Amount */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span className={`status-badge ${STATUS_COLORS[status]}`}>
                  {STATUS_ICONS[status]} {STATUS_NAMES[status]}
                </span>
              </div>
              <div className="deposit-label">Locked Deposit</div>
              <div className="deposit-amount">
                {parseFloat(ethers.formatEther(tenancy.depositAmount)).toFixed(3)} ETH
              </div>

              <hr className="divider" />

              {/* Parties */}
              <div className="party-list">
                {[
                  { role: "Landlord",   addr: tenancy.landlord },
                  { role: "Tenant",     addr: tenancy.tenant },
                  { role: "Arbitrator", addr: tenancy.arbitrator },
                ].map(p => (
                  <div className="party-row" key={p.role}>
                    <span className="party-role">{p.role}</span>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span className="party-addr">{short(p.addr)}</span>
                      {account.toLowerCase() === p.addr.toLowerCase() && <span className="you-tag">You</span>}
                    </div>
                  </div>
                ))}
              </div>

              <hr className="divider" />

              {/* Evidence Hashes */}
              <div style={{ marginBottom: 4, fontSize: ".72rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em" }}>Evidence Hashes</div>
              {[
                { label: "Move-In", hash: tenancy.moveInHash },
                { label: "Move-Out", hash: tenancy.moveOutHash },
              ].map(({ label, hash }) => (
                <div className="hash-row" key={label}>
                  <span className="hash-label">{label}</span>
                  {shortHash(hash)
                    ? <span className="hash-val">{shortHash(hash)}</span>
                    : <span className="hash-empty">Not recorded</span>
                  }
                </div>
              ))}
            </>
          ) : (
            <div style={{ color: "var(--muted)", fontSize: ".85rem", marginTop: 12 }}>
              {account
                ? "No tenancy loaded. Create one or refresh."
                : "Connect MetaMask to view tenancy details."}
            </div>
          )}
        </div>

        {/* RIGHT — Action Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Step 1: Create Tenancy ── */}
          {(!tenancy || status === 0) && (
            <div className="card">
              <div className="card-heading">🏠 Create Tenancy <span style={{fontSize:".72rem",color:"var(--muted)",fontWeight:600}}>Landlord</span></div>
              <div className="action-panel">
                <label className="field">
                  <span className="field-label">Tenant Wallet Address</span>
                  <input
                    className="field-input" placeholder="0x..."
                    value={tenant} onChange={e => setTenant(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Arbitrator Wallet Address</span>
                  <input
                    className="field-input" placeholder="0x..."
                    value={arbitrator} onChange={e => setArbitrator(e.target.value)}
                  />
                </label>
                <button
                  className="btn btn-primary"
                  disabled={busy || !ethers.isAddress(tenant) || !ethers.isAddress(arbitrator) || !account}
                  onClick={() => run(
                    c => c.createTenancy(tenant, arbitrator),
                    "✅ Tenancy created successfully!",
                    `🏠 Tenancy created — tenant ${short(tenant)}`, "blue"
                  )}
                >
                  {busy ? <><span className="spinner"/>Creating…</> : "🏠 Create Tenancy"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Fund Deposit ── */}
          {tenancy && status === 0 && (
            <div className="card">
              <div className="card-heading">🔒 Fund Deposit <span style={{fontSize:".72rem",color:"var(--muted)",fontWeight:600}}>Tenant</span></div>
              <div className="action-panel">
                <label className="field">
                  <span className="field-label">Deposit Amount (ETH)</span>
                  <input
                    type="number" step="0.01" min="0.001"
                    className="field-input"
                    value={deposit} onChange={e => setDeposit(e.target.value)}
                  />
                </label>
                <button
                  className="btn btn-primary"
                  disabled={busy || !account || !tenancy}
                  onClick={() => run(
                    c => c.fundDeposit(tenancyId, { value: ethers.parseEther(deposit || "0") }),
                    `✅ ${deposit} ETH locked in escrow!`,
                    `🔒 Deposit of ${deposit} ETH locked`, "blue"
                  )}
                >
                  {busy ? <><span className="spinner"/>Locking…</> : `🔒 Lock ${deposit} ETH`}
                </button>
                <div style={{ fontSize:".75rem", color:"var(--muted)", textAlign:"center" }}>
                  🛡️ Funds are secured in the smart contract
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3 & 4: Evidence ── */}
          {tenancy && (status === 1 || status === 2) && (
            <div className="card">
              <div className="card-heading">📸 Evidence & Move-In</div>
              <div className="action-grid">
                {/* Record Move-In */}
                <div className="action-panel">
                  <span className="field-label">Move-In Photo (Landlord)</span>
                  <div
                    className={`file-drop ${moveInFile ? "has-file" : ""}`}
                    onClick={() => moveInRef.current?.click()}
                  >
                    <span className="file-icon">{moveInFile ? "✅" : "📷"}</span>
                    {moveInFile
                      ? <span className="file-name">{moveInFile.name}</span>
                      : <span className="file-hint">Click to upload photo<br/><small>Only hash stored on-chain</small></span>
                    }
                    <input ref={moveInRef} type="file" accept="image/*" style={{display:"none"}}
                      onChange={e => setMoveInFile(e.target.files?.[0])} />
                  </div>
                  <button
                    className="btn btn-ghost" style={{marginTop:8}}
                    disabled={busy || !account}
                    onClick={async () => {
                      const hash = await hashFile(moveInFile, "move-in");
                      run(c => c.recordMoveIn(tenancyId, hash),
                        "✅ Move-in condition recorded!", `📷 Move-in hash stored on-chain`, "cyan");
                    }}
                  >
                    {busy ? <><span className="spinner"/>Recording…</> : "📷 Record Move-In"}
                  </button>
                </div>

                {/* Submit Evidence */}
                {status === 1 && (
                  <div className="action-panel">
                    <span className="field-label">Move-Out Evidence (Any Party)</span>
                    <div
                      className={`file-drop ${moveOutFile ? "has-file" : ""}`}
                      onClick={() => moveOutRef.current?.click()}
                    >
                      <span className="file-icon">{moveOutFile ? "✅" : "📄"}</span>
                      {moveOutFile
                        ? <span className="file-name">{moveOutFile.name}</span>
                        : <span className="file-hint">Click to upload evidence<br/><small>Only hash stored on-chain</small></span>
                      }
                      <input ref={moveOutRef} type="file" accept="image/*,application/pdf" style={{display:"none"}}
                        onChange={e => setMoveOutFile(e.target.files?.[0])} />
                    </div>
                    <button
                      className="btn btn-primary" style={{marginTop:8}}
                      disabled={busy || !account}
                      onClick={async () => {
                        const hash = await hashFile(moveOutFile, "move-out");
                        run(c => c.submitEvidence(tenancyId, hash),
                          "✅ Move-out evidence submitted!", `📄 Move-out evidence hash on-chain`, "amber");
                      }}
                    >
                      {busy ? <><span className="spinner"/>Submitting…</> : "📄 Submit Evidence"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 5: Vote ── */}
          {tenancy && (status === 2 || status === 3) && (
            <div className="card">
              <div className="card-heading">⚖️ Vote on Deposit Outcome</div>
              <p style={{fontSize:".82rem", color:"var(--muted)", marginBottom:14}}>
                {status === 3
                  ? "⚠️ Dispute raised! Arbitrator must cast the deciding vote."
                  : "Both parties vote. If they agree, deposit settles instantly. A disagreement escalates to the arbitrator."}
              </p>

              {/* Vote Buttons */}
              <div className="vote-grid">
                <div
                  className="vote-card tenant-win"
                  onClick={() => !busy && run(
                    c => c.vote(tenancyId, 1),
                    "✅ Vote recorded: Release to tenant!",
                    `⚖️ Vote cast: Release to tenant`, "green"
                  )}
                >
                  <span className="vote-emoji">🙋</span>
                  <div className="vote-label" style={{color:"var(--green)"}}>Release to Tenant</div>
                  <div className="vote-desc">No damage — full deposit returned</div>
                </div>
                <div
                  className="vote-card landlord-win"
                  onClick={() => !busy && run(
                    c => c.vote(tenancyId, 2),
                    "✅ Vote recorded: Release to landlord!",
                    `⚖️ Vote cast: Release to landlord`, "red"
                  )}
                >
                  <span className="vote-emoji">🏚️</span>
                  <div className="vote-label" style={{color:"var(--red)"}}>Release to Landlord</div>
                  <div className="vote-desc">Damage confirmed — keep deposit</div>
                </div>
              </div>

              {/* Vote Status */}
              <div className="vote-status">
                {[
                  { who: "🏠 Landlord",   vote: tenancy.landlordVote },
                  { who: "🙋 Tenant",     vote: tenancy.tenantVote },
                  { who: "⚖️ Arbitrator", vote: tenancy.arbitratorVote },
                ].map(({ who, vote }) => {
                  const v = Number(vote);
                  return (
                    <div className="vote-row" key={who}>
                      <span className="vote-who">{who}</span>
                      <span className={`vote-val ${v === 1 ? "vote-tenant" : v === 2 ? "vote-landlord" : "vote-pending"}`}>
                        {v === 0 ? "Pending…" : v === 1 ? "✓ Tenant" : "✓ Landlord"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Event Log ── */}
      {events.length > 0 && (
        <div className="card">
          <div className="card-title">📡 Transaction Log</div>
          <div className="event-log">
            {events.map((e, i) => (
              <div className="event-item" key={i}>
                <span className={`event-dot ${e.color}`} />
                <span className="event-text">{e.text}</span>
                <span className="event-time">{e.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{textAlign:"center", marginTop:40, color:"var(--muted)", fontSize:".75rem"}}>
        RentTrust · EC8204 Blockchain & Cyber Security · University of Ruhuna
        <br/>Contract: <span style={{fontFamily:"monospace", color:"var(--cyan)"}}>{short(CONTRACT_ADDRESS)}</span>
      </div>

    </div>
  );
}
