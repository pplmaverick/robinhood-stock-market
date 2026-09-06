import AgentDecisionPanel from '../components/AgentDecisionPanel'

export default function AgentActivity() {
  return (
    <main className="max-w-container-max mx-auto px-gutter py-8 min-h-[calc(100vh-128px)]">
      <div className="mb-8">
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1">Agent Activity</h1>
        <p className="text-on-surface-variant font-body-sm">
          Live view of the autonomous agent's TSLA decision pipeline -- the real data it reads,
          the bet it would size, and the AgentBook verification gate that stands between a
          decision and an on-chain bet.
        </p>
      </div>
      <AgentDecisionPanel />
    </main>
  )
}
