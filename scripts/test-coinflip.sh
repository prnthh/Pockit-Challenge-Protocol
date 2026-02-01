#!/bin/bash

set -e

RPC_PORT=${RPC_PORT:-8545}

echo "🧪 PCP Local Dev - CoinFlip Test"
echo ""

# Start Anvil if not running
if ! nc -z 127.0.0.1 $RPC_PORT 2>/dev/null; then
    echo "📍 Starting Anvil on http://127.0.0.1:$RPC_PORT"
    anvil --port $RPC_PORT &
    ANVIL_PID=$!
    sleep 2
else
    echo "✅ Anvil already running"
fi

# Deploy contract
echo "📦 Deploying contract..."

# Anvil first account (deterministic)
PRIVKEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb476c6b8d6c1f02960247590a053"

# Use cast to deploy with proper args
CONTRACT=$(cast send \
    --rpc-url http://127.0.0.1:$RPC_PORT \
    --private-key $PRIVKEY \
    --create "$(cat contracts/contract.sol.bytecode)" \
    0x0a \
    2>&1 | grep "transactionHash" | head -1)

echo "Deploy output: $CONTRACT"

# Get deployment receipt to extract contract address
# For now, let's use a simpler method - just create and grep logs
echo ""
echo "✨ Setup complete!"
