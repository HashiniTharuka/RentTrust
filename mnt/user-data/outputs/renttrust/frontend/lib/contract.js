import { ethers } from "ethers";
import abi from "./abi.json";

export const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
export const LOCAL_CHAIN_ID = 31337n;

export async function getContract() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask is required. Install it and reload the page.");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const network = await provider.getNetwork();
  if (network.chainId !== LOCAL_CHAIN_ID) {
    throw new Error("Wrong network. Select Hardhat Local (chain ID 31337) in MetaMask.");
  }
  if (!ethers.isAddress(CONTRACT_ADDRESS) || CONTRACT_ADDRESS.includes("PASTE")) {
    throw new Error("The contract address has not been configured yet.");
  }
  return new ethers.Contract(CONTRACT_ADDRESS, abi, await provider.getSigner());
}

