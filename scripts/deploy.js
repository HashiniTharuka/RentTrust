const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying RentEscrow with account:", deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

  const RentEscrow = await hre.ethers.getContractFactory("RentEscrow");
  const contract   = await RentEscrow.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅  RentEscrow deployed to:", address);

  // ── Auto-update the frontend contract address ──────────────────────────────
  const contractJsPath = path.join(__dirname, "..", "mnt", "user-data", "outputs", "renttrust", "frontend", "lib", "contract.js");
  if (fs.existsSync(contractJsPath)) {
    let src = fs.readFileSync(contractJsPath, "utf8");
    src = src.replace(/export const CONTRACT_ADDRESS = ".*?";/, `export const CONTRACT_ADDRESS = "${address}";`);
    fs.writeFileSync(contractJsPath, src);
    console.log("✅  Frontend contract.js updated with new address.");
  } else {
    console.log("ℹ️   Paste this address into frontend/lib/contract.js manually:", address);
  }

  // ── Also copy ABI to frontend ──────────────────────────────────────────────
  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "RentEscrow.sol", "RentEscrow.json");
  const abiDestPath  = path.join(__dirname, "..", "mnt", "user-data", "outputs", "renttrust", "frontend", "lib", "abi.json");
  if (fs.existsSync(artifactPath) && fs.existsSync(path.dirname(abiDestPath))) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    fs.writeFileSync(abiDestPath, JSON.stringify(artifact.abi, null, 2));
    console.log("✅  ABI copied to frontend/lib/abi.json.");
  }

  console.log("\n─────────────────────────────────────────────────");
  console.log("Next steps:");
  console.log("  1. Open the frontend: cd mnt/user-data/outputs/renttrust/frontend && npm run dev");
  console.log("  2. Add Hardhat network to MetaMask:");
  console.log("       RPC URL : http://127.0.0.1:8545");
  console.log("       Chain ID: 31337");
  console.log("  3. Import private keys from the Hardhat node output.");
  console.log("─────────────────────────────────────────────────\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
