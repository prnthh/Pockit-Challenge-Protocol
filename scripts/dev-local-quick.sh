#!/bin/bash

# Quick local testnet setup for PCP demos
# Usage: ./scripts/dev-local-quick.sh

set -e

RPC_PORT=${RPC_PORT:-8545}
DOCS_PORT=${DOCS_PORT:-5173}

echo "🧪 PCP Local Dev Setup"
echo ""

# Check Anvil
if ! command -v anvil &> /dev/null; then
    echo "❌ Anvil not found. Install: curl -L https://foundry.paradigm.xyz | bash"
    exit 1
fi

# Check if already running
if nc -z 127.0.0.1 $RPC_PORT 2>/dev/null; then
    echo "⚠️  Anvil already running on port $RPC_PORT"
    read -p "Continue with existing instance? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "📍 Starting Anvil on http://127.0.0.1:$RPC_PORT"
    anvil --port $RPC_PORT &
    ANVIL_PID=$!
    sleep 2
    
    if ! kill -0 $ANVIL_PID 2>/dev/null; then
        echo "❌ Anvil failed to start"
        exit 1
    fi
    echo "✅ Anvil running (PID: $ANVIL_PID)"
fi

# Deploy contract
echo ""
echo "📦 Deploying contract to local chain..."

# Use first Anvil account (deterministic)
PRIVKEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb476c6b8d6c1f02960247590a053"

RESULT=$(forge create contracts/contract.sol:GameEscrow \
    --rpc-url http://127.0.0.1:$RPC_PORT \
    --private-key $PRIVKEY \
    --constructor-args 10 \
    2>&1)

CONTRACT=$(echo "$RESULT" | grep "Deployed to:" | awk '{print $NF}')

if [ -z "$CONTRACT" ]; then
    echo "❌ Deployment failed"
    echo "$RESULT"
    exit 1
fi

echo "✅ Deployed: $CONTRACT"

# Create .env for docs
cat > docs/.env.local <<EOF
VITE_LOCAL_RPC_URL=http://127.0.0.1:$RPC_PORT
VITE_LOCAL_CONTRACT_ADDRESS=$CONTRACT
EOF

echo ""
echo "✨ Setup complete!"
echo ""
echo "Chain:    Localhost"
echo "RPC:      http://127.0.0.1:$RPC_PORT"
echo "Contract: $CONTRACT"
echo ""
echo "To start the UI:"
echo "  npm run dev --prefix docs"
echo ""
echo "⚡ Connect MetaMask to http://127.0.0.1:$RPC_PORT (chain ID: 31337)"
echo ""
