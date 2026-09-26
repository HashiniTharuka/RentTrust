require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  paths: {
    sources: "./contracts",
  },
  networks: {
    hardhat: {},
    // Uncomment and fill in for a public testnet demo:
    // mumbai: {
    //   url: process.env.MUMBAI_RPC_URL || "",
    //   accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    // },
  },
};
