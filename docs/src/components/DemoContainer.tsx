import type { defineChain } from 'viem'
import { CHAINS } from '../App'
import type { ChainKey } from '../App'
import SinglePage from './SinglePage'

function DemoContainer({
    walletAddress,
    chainConfig,
    customChain,
}: {
    walletAddress: string
    chainConfig: typeof CHAINS[ChainKey]
    customChain: ReturnType<typeof defineChain>
}) {
    return (
        <div style={{ padding: '2rem' }}>
            <SinglePage
                walletAddress={walletAddress}
                chainConfig={chainConfig}
                customChain={customChain}
            />
        </div>
    )
}

export default DemoContainer
