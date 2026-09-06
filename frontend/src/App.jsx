import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Markets from './pages/Markets'
import MyBets from './pages/MyBets'
import MarketStatus from './pages/MarketStatus'
import AgentActivity from './pages/AgentActivity'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8">
          <div className="bg-error-container text-on-error-container p-6 rounded-lg max-w-3xl w-full">
            <div className="font-headline-md mb-3">Render Error</div>
            <pre className="font-data-sm text-sm whitespace-pre-wrap opacity-90">
              {this.state.error?.message}
            </pre>
            <pre className="font-data-sm text-xs whitespace-pre-wrap opacity-60 mt-2">
              {this.state.error?.stack}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 bg-primary text-on-primary-container font-label-caps px-4 py-2 rounded"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
      <div className="min-h-screen bg-surface-container-lowest text-on-surface">
        <Navbar />
        <Routes>
          <Route path="/"              element={<Markets />} />
          <Route path="/my-bets"       element={<MyBets />} />
          <Route path="/market-status" element={<MarketStatus />} />
          <Route path="/agent-activity" element={<AgentActivity />} />
        </Routes>
        <footer className="mt-auto py-8 px-gutter border-t border-outline-variant">
          <div className="max-w-container-max mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-label-caps text-on-surface-variant uppercase tracking-widest">
              Powered by Robinhood Chain · Chain ID 4663 · Chainlink Price Feeds
            </div>
            <div className="flex gap-6 text-label-caps text-on-surface-variant">
              <a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noreferrer"
                 className="hover:text-primary transition-colors">Explorer</a>
              <a href="https://rpc.mainnet.chain.robinhood.com" target="_blank" rel="noreferrer"
                 className="hover:text-primary transition-colors">RPC</a>
            </div>
          </div>
        </footer>
      </div>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
