const hre = require("hardhat");

async function main() {
  const RentEscrow = await hre.ethers.getContractFactory("RentEscrow");
  const contract = await RentEscrow.deploy();
  await contract.waitForDeployment();
  console.log(`RentEscrow deployed to: ${await contract.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
