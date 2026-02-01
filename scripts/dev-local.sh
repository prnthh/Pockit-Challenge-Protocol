#!/bin/bash

# PCP Local Dev Environment Setup
# Starts a local Ethereum node and deploys the contract for testing

set -e

echo "🧪 Starting local Ethereum node with Foundry Anvil..."

# Check if anvil is installed
if ! command -v anvil &> /dev/null; then
    echo "❌ Anvil not found. Install Foundry:"
    echo "   curl -L https://foundry.paradigm.xyz | bash"
    exit 1
fi

# Start anvil on port 8545
ANVIL_PORT=8545
echo "📍 Starting Anvil on http://127.0.0.1:${ANVIL_PORT}"
anvil --port $ANVIL_PORT &
ANVIL_PID=$!

# Wait for Anvil to start
sleep 2

# Check if running
if ! kill -0 $ANVIL_PID 2>/dev/null; then
    echo "❌ Anvil failed to start"
    exit 1
fi

echo "✅ Anvil running (PID: $ANVIL_PID)"

# Deploy contract
echo ""
echo "📦 Deploying contract..."

# Get the first test account (comes with Anvil by default)
DEPLOYER="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
GOVERNOR="0x70997970C51812e339D9B73b0245ad59419F688A"

# Deploy using forge
forge create contracts/contract.sol:GameEscrow \
    --rpc-url http://127.0.0.1:${ANVIL_PORT} \
    --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb476c6b8d6c1f02960247590a053 \
    --constructor-args 10 \
    | tee deployment.log

# Extract contract address
CONTRACT_ADDRESS=$(grep "Deployed to:" deployment.log | awk '{print $NF}')
echo ""
echo "✅ Contract deployed at: $CONTRACT_ADDRESS"

# Create local config
cat > .env.local <<EOF
VITE_LOCAL_RPC_URL=http://127.0.0.1:${ANVIL_PORT}
VITE_LOCAL_CONTRACT_ADDRESS=${CONTRACT_ADDRESS}
VITE_LOCAL_DEPLOYER=${DEPLOYER}
VITE_LOCAL_GOVERNOR=${GOVERNOR}
EOF

echo ""
echo "📝 Local config saved to .env.local"
echo ""
echo "=== LOCAL TESTNET READY ==="
echo "RPC: http://127.0.0.1:${ANVIL_PORT}"
echo "Contract: ${CONTRACT_ADDRESS}"
echo "Deployer: ${DEPLOYER}"
echo "Governor: ${GOVERNOR}"
echo ""
echo "💡 To stop Anvil, run: kill $ANVIL_PID"
echo ""
echo "Next: npm run dev (docs/) to connect UI to local chain"
