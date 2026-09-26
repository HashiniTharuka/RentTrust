import { ethers } from "ethers";

// After `npx hardhat run scripts/deploy.js --network localhost`, paste the
// printed address here, and copy artifacts/contracts/RentEscrow.sol/RentEscrow.json's
// "abi" array into abi.json in this same folder.
export const CONTRACT_ADDRESS = "0xPASTE_DEPLOYED_ADDRESS_HERE";

import abi from "./abi.json";

export async function getContract() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
}
