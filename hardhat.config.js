"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
const config = {
    solidity: {
        compilers: [
            {
                version: "0.8.29",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
        ],
    },
    networks: {
        hardhat: {
            chainId: 1337,
        },
        "vic-mainnet": {
            url: "https://rpc.viction.xyz",
            accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
        },
    },
    typechain: {
        outDir: "typechain",
        target: "ethers-v6",
    },
    etherscan: {
        apiKey: {
            "vic-mainnet": "tomoscan2023",
            "vic-testnet": "tomoscan2023",
        },
        customChains: [
            {
                network: "vic-mainnet",
                chainId: 88, // for mainnet
                urls: {
                    apiURL: "https://www.vicscan.xyz/api/contract/hardhat/verify", // for mainnet
                    browserURL: "https://vicscan.xyz", // for mainnet
                },
            },
            {
                network: "vic-testnet",
                chainId: 89, // for testnet
                urls: {
                    apiURL: "https://scan-api-testnet.viction.xyz/api/contract/hardhat/verify", // for testnet
                    browserURL: "https://testnet.vicscan.xyz", // for testnet
                },
            },
        ],
    },
};
exports.default = config;
