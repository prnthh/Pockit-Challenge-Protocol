import type { CHAINS, ChainKey } from '../App'
import SinglePage from './SinglePage'

function DemoContainer({
    walletAddress,
    chainConfig,
}: {
    walletAddress: string | null
    chainConfig: typeof CHAINS[ChainKey]
}) {
    return (
        <div style={{ padding: '2rem' }}>
            <SinglePage
                walletAddress={walletAddress}
                chainConfig={chainConfig}
            />
        </div>
    )
}

export default DemoContainer
