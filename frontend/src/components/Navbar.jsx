import { NavLink } from 'react-router-dom'
import { useAccount, useConnect, useDisconnect, useBalance, useChainId, useSwitchChain } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { robinhoodMainnet } from '../wagmiConfig'

export default function Navbar() {
  const { address, isConnected } = useAccount()
  const { connect }    = useConnect()
  const { disconnect } = useDisconnect()
  const { data: bal }  = useBalance({ address })
  const chainId        = useChainId()
  const { switchChain } = useSwitchChain()

  const isWrongNetwork = isConnected && chainId !== robinhoodMainnet.id

  const handleSwitchChain = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x1237' }], // 4663 in hex
      })
    } catch (switchError) {
      // 4902 = chain not added yet
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x1237',
              chainName: 'Robinhood Chain',
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
              blockExplorerUrls: ['https://robinhoodchain.blockscout.com'],
            }],
          })
        } catch (addError) {
          console.error('Failed to add chain:', addError)
        }
      } else {
        console.error('Failed to switch chain:', switchError)
      }
    }
  }

  const TABS = [
    { to: '/',              label: 'Markets' },
    { to: '/my-bets',       label: 'My Bets' },
    { to: '/market-status', label: 'Market Status' },
    { to: '/agent-activity', label: 'Agent Activity' },
  ]

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-outline-variant bg-surface-container-low">
        <div className="flex items-center w-full px-gutter max-w-container-max mx-auto h-16">
          {/* Logo */}
          <div className="font-headline-md text-headline-md font-semibold text-on-surface flex items-center gap-1">
            Robinhood Stock Prediction Market
            <span className="w-1.5 h-1.5 bg-signal rounded-full inline-block" />
          </div>

          {/* Nav — grouped with the logo, underline marks the active tab */}
          <nav className="hidden md:flex items-stretch h-16 gap-8 ml-10">
            {TABS.map(tab => (
              <NavLink key={tab.to} to={tab.to} className="relative flex items-center font-label-caps uppercase tracking-widest">
                {({ isActive }) => (
                  <>
                    <span className={isActive ? 'text-on-surface font-bold' : 'text-on-surface-variant hover:text-signal-dim transition-colors'}>
                      {tab.label}
                    </span>
                    {isActive && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-signal" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Wallet */}
          <div className="flex items-center gap-3 ml-auto">
            {isConnected && address && !isWrongNetwork && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-surface-container border border-outline-variant rounded-lg">
                <span className="font-data-sm text-on-surface-variant">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
                {bal && (
                  <span className="font-data-sm text-bull">
                    {Number(bal.formatted).toFixed(4)} ETH
                  </span>
                )}
                <div className="w-2 h-2 rounded-full bg-bull animate-pulse" />
              </div>
            )}

            {isWrongNetwork ? (
              <button
                onClick={handleSwitchChain}
                className="bg-secondary text-on-secondary-container font-label-caps px-4 py-2 rounded-lg border border-secondary hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                Switch to Robinhood Chain
              </button>
            ) : isConnected ? (
              <button
                onClick={() => disconnect()}
                className="bg-surface-container-high text-on-surface font-label-caps px-4 py-2 rounded-lg border border-outline-variant hover:border-signal transition-all"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => connect({ connector: injected() })}
                className="bg-signal text-on-signal font-label-caps px-4 py-2 rounded-lg hover:brightness-110 active:scale-95 transition-all"
              >
                Connect
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 錯誤網路警告橫幅 */}
      {isWrongNetwork && (
        <div className="bg-secondary/20 border-b border-secondary/40 px-gutter py-2 text-center">
          <span className="font-label-caps text-secondary text-sm">
            ⚠ Wrong network detected. Please switch to Robinhood Chain (Chain ID 4663).
          </span>
        </div>
      )}
    </>
  )
}
