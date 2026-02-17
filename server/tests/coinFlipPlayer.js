// server/tests/coinFlipPlayer.js
import { ethers } from "ethers";
import dotenv from "dotenv";
import contractABI from "../../contracts/abi.js";

dotenv.config();

const provider = new ethers.JsonRpcProvider("https://rpc.sepolia.org");

async function player1MakeGame(stakeAmount) {
  const playerWallet = new ethers.Wallet(process.env.playerpkey, provider);
  const balance = await provider.getBalance(playerWallet.address);
  console.log(`Player Address: ${playerWallet.address} Balance: ${ethers.formatEther(balance).toString()}`);

  const contract = new ethers.Contract(process.env.matchmakingContractAddress, contractABI, playerWallet);

  const createTx = await contract.createGame(
    "0xdBec3DC802a817EEE74a7077f734654384857E9d",
    stakeAmount,
    2,   // maxPlayers
    [],  // whitelist
    { value: stakeAmount }
  );
  const receipt = await createTx.wait();
  const gameId = receipt.logs[0].topics[1];
  return gameId;
}

const stakeAmount = ethers.parseEther("0.01");
player1MakeGame(stakeAmount).catch(console.error);