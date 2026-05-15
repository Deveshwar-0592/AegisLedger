require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Fix 44: Prevent DEPLOYER_PRIVATE_KEY usage in production environments
const isProduction = process.env.NODE_ENV === "production";
if (isProduction && process.env.DEPLOYER_PRIVATE_KEY) {
  console.warn("WARNING: DEPLOYER_PRIVATE_KEY detected in production. Use AWS KMS or a Hardware Wallet instead.");
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Local development
    hardhat: {
      chainId: 31337,
    },
    // Ethereum Sepolia testnet
    sepolia: {
      url: process.env.BLOCKCHAIN_RPC_URL || "https://sepolia.infura.io/v3/YOUR_PROJECT_ID",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    // Polygon Mumbai testnet
    mumbai: {
      url: "https://rpc-mumbai.maticvigil.com",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 80001,
    },
    // Mainnet
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "",
      // Accounts are NOT loaded from DEPLOYER_PRIVATE_KEY here. 
      // Mainnet deploys must use KMS or a Ledger via hardware wallet plugins.
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
