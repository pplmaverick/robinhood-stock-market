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

  const navCls = ({ isActive }) =>
    isActive
      ? 'text-tertiary-fixed-dim font-bold font-label-caps uppercase tracking-widest transition-colors'
      : 'text-on-surface-variant font-label-caps hover:text-primary transition-colors uppercase tracking-widest'

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-outline-variant bg-surface-container-low">
        <div className="flex justify-between items-center w-full px-gutter max-w-container-max mx-auto h-16">
          {/* Logo */}
          <div className="font-headline-md text-headline-md font-semibold text-on-surface flex items-center gap-1">
            Robinhood Stock Prediction Market
            <span className="w-1.5 h-1.5 bg-primary rounded-full inline-block" />
          </div>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <NavLink to="/"              className={navCls}>Markets</NavLink>
            <NavLink to="/my-bets"       className={navCls}>My Bets</NavLink>
            <NavLink to="/market-status" className={navCls}>Market Status</NavLink>
            <NavLink to="/agent-activity" className={navCls}>Agent Activity</NavLink>
          </nav>

          {/* Wallet */}
          <div className="flex items-center gap-3">
            {isConnected && address && !isWrongNetwork && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-surface-container border border-outline-variant rounded-lg">
                <span className="font-data-sm text-on-surface-variant">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
                {bal && (
                  <span className="font-data-sm text-primary">
                    {Number(bal.formatted).toFixed(4)} ETH
                  </span>
                )}
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
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
                className="bg-surface-container-high text-on-surface font-label-caps px-4 py-2 rounded-lg border border-outline-variant hover:border-secondary transition-all"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => connect({ connector: injected() })}
                className="bg-primary text-on-primary-container font-label-caps px-4 py-2 rounded-lg hover:brightness-110 active:scale-95 transition-all"
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
