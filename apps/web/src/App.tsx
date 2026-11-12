import ThemeToggle from "./ThemeToggle";
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Coins,
  Database,
  Download,
  Eye,
  GitBranch,
  Home,
  KeyRound,
  LayoutDashboard,
  ListTree,
  LogOut,
  Menu,
  MoreVertical,
  Network,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  Timer,
  Trash2,
  TriangleAlert,
  User,
  Users,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { io } from 'socket.io-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import ReactFlow, { Background, Controls, MiniMap, Node, Edge, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const AGENT = import.meta.env.VITE_AGENT_URL || 'http://localhost:3002';

const fmt = (n: number) => new Intl.NumberFormat().format(Number(n || 0));
const money = (n: number) => `$${Number(n || 0).toFixed(4)}`;
const shortId = (id: string) => id ? `${id.slice(0, 8)}…${id.slice(-4)}` : '—';

const fetchJson = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

type Exec = {
  id: string;
  agent_id: string;
  agent_name: string;
  prompt: string;
  status: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  error?: string;
};

type Event = {
  id: string;
  execution_id: string;
  agent_id: string;
  type: string;
  timestamp: string;
  sequence: number;
  name: string;
  status?: string;
  duration_ms?: number;
  input: any;
  output: any;
  metadata: any;
  tokens_input?: number;
  tokens_output?: number;
  estimated_cost_usd?: number;
  error?: string;
};

type Detail = Exec & { events: Event[] };
type Page = 'dashboard' | 'agents' | 'agent-detail' | 'events' | 'analytics' | 'mcp' | 'users' | 'settings' | 'simulator';

const useSelected = create<{ id: string | null; set: (id: string | null) => void }>((set) => ({ id: null, set: (id) => set({ id }) }));

const navGroups = [
  {
    label: 'MONITORING',
    items: [
      { id: 'dashboard' as Page, label: 'Dashboard', icon: LayoutDashboard },
      { id: 'agents' as Page, label: 'Agents', icon: Bot },
      { id: 'events' as Page, label: 'Events', icon: ListTree },
      { id: 'analytics' as Page, label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'PLATFORM',
    items: [
      { id: 'mcp' as Page, label: 'MCP Servers', icon: Network },
      { id: 'users' as Page, label: 'Users & Roles', icon: Users },
      { id: 'simulator' as Page, label: 'Telemetry Simulator', icon: TerminalSquare },
    ],
  },
  {
    label: 'SYSTEM',
    items: [{ id: 'settings' as Page, label: 'Settings', icon: Settings }],
  },
];

function StatCard({ icon: Icon, label, value, trend, tone = 'blue' }: { icon: any; label: string; value: string; trend?: string; tone?: string }) {
  return (
    <div className="statCard">
      <div className={`statIcon ${tone}`}><Icon size={18} /></div>
      <div className="statCopy"><span>{label}</span><strong>{value}</strong>{trend && <small>{trend}</small>}</div>
    </div>
  );
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function App() {
  const qc = useQueryClient();
  const selected = useSelected((s) => s.id);
  const setSelected = useSelected((s) => s.set);
  const [page, setPage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [login, setLogin] = useState(false);
  const [prompt, setPrompt] = useState('Explain how Sentinel observability works and use the project knowledge tool if useful.');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState('');

  const executions = useQuery<Exec[]>({ queryKey: ['executions'], queryFn: () => fetchJson(`${API}/api/executions`), refetchInterval: 3000 });
  const stats = useQuery<any>({ queryKey: ['stats'], queryFn: () => fetchJson(`${API}/api/stats`), refetchInterval: 3000 });
  const detail = useQuery<Detail>({ queryKey: ['execution', selected], queryFn: () => fetchJson(`${API}/api/executions/${selected}`), enabled: !!selected, refetchInterval: selected ? 1500 : false });

  useEffect(() => {
    const socket = io(API);
    socket.on('telemetry', () => {
      qc.invalidateQueries({ queryKey: ['executions'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      if (selected) qc.invalidateQueries({ queryKey: ['execution', selected] });
    });
    return () => { socket.disconnect(); };
  }, [qc, selected]);

  async function runAgent(customPrompt = prompt) {
    if (!customPrompt.trim() || running) return;
    setRunning(true); setResult('');
    try {
      const r = await fetch(`${AGENT}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: customPrompt }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || data.error || 'Agent failed');
      setResult(data.output || 'Agent completed without text output.');
      setSelected(data.executionId);
      setPage('agent-detail');
      qc.invalidateQueries({ queryKey: ['executions'] }); qc.invalidateQueries({ queryKey: ['stats'] });
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    } finally { setRunning(false); }
  }

  function go(next: Page) { setPage(next); setSidebarOpen(false); }

  if (login) return <LoginScreen onLogin={() => setLogin(false)} />;

  return (
    <div className="appShell">
      <Sidebar page={page} go={go} open={sidebarOpen} />
      {sidebarOpen && <div className="mobileOverlay" onClick={() => setSidebarOpen(false)} />}
      <div className="appMain">
        <Topbar search={search} setSearch={setSearch} onMenu={() => setSidebarOpen(true)} onRefresh={() => qc.invalidateQueries()} />
        <main className="pageWrap">
          {page === 'dashboard' && <Dashboard stats={stats.data} executions={executions.data || []} selected={selected} setSelected={(id: string) => { setSelected(id); go('agent-detail'); }} runAgent={runAgent} running={running} prompt={prompt} setPrompt={setPrompt} result={result} />}
          {page === 'agents' && <AgentsPage executions={executions.data || []} go={go} setSelected={setSelected} runAgent={runAgent} />}
          {page === 'agent-detail' && <AgentDetailPage detail={detail.data} executions={executions.data || []} selected={selected} setSelected={setSelected} go={go} result={result} />}
          {page === 'events' && <EventsPage executions={executions.data || []} setSelected={(id) => { setSelected(id); go('agent-detail'); }} search={search} />}
          {page === 'analytics' && <AnalyticsPage executions={executions.data || []} stats={stats.data} />}
          {page === 'mcp' && <McpPage />}
          {page === 'users' && <UsersPage />}
          {page === 'simulator' && <SimulatorPage />}
          {page === 'settings' && <SettingsPage onLogin={() => setLogin(true)} />}
        </main>
      </div>
    </div>
  );
}

function Sidebar({ page, go, open }: { page: Page; go: (p: Page) => void; open: boolean }) {
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brandRow"><div className="shieldLogo"><Shield size={18} /></div><div><b>Sentinel</b><span>AI observability platform</span></div></div>
      <div className="workspace"><div className="workspaceIcon">A</div><div><strong>Admin Workspace</strong><small>Local environment</small></div><ChevronRight size={14} /></div>
      <nav>
        {navGroups.map((group) => <div className="navGroup" key={group.label}><span className="navLabel">{group.label}</span>{group.items.map(({ id, label, icon: Icon }) => <button key={id} className={page === id || (id === 'agents' && page === 'agent-detail') ? 'navItem active' : 'navItem'} onClick={() => go(id)}><Icon size={17} /><span>{label}</span></button>)}</div>)}
      </nav>
      <div className="sidebarBottom"><div className="connection"><span className="pulse" /><div><b>System online</b><small>API · Agent · WebSocket</small></div></div><div className="profile"><div className="avatar">A</div><div><b>Admin</b><small>Administrator</small></div><MoreVertical size={15} /></div></div>
    </aside>
  );
}

function Topbar({
  search,
  setSearch,
  onMenu,
  onRefresh,
}: {
  search: string;
  setSearch: (s: string) => void;
  onMenu: () => void;
  onRefresh: () => void;
}) {
  const [dark, setDark] = useState(() => localStorage.getItem('sentinel-theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', dark);
    localStorage.setItem('sentinel-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <header className="topbar">
      <button className="mobileMenu" onClick={onMenu} aria-label="Open menu">
        <Menu size={20} />
      </button>

      <div className="globalSearch">
        <Search size={16} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents, events, executions…"
        />
      </div>

      <div className="topActions">
        <button
          type="button"
          className="themeToggle"
          onClick={() => setDark((value) => !value)}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {dark ? '☀️' : '🌙'}
        </button>

        <button className="roundBtn" onClick={onRefresh} aria-label="Refresh">
          <RefreshCw size={16} />
        </button>

        <button className="roundBtn" aria-label="Notifications">
          <Bell size={16} />
          <i className="notificationDot" />
        </button>

        <div className="topUser">
          <div className="avatar small">A</div>
          <span>Admin</span>
          <ChevronRight size={14} />
        </div>
      </div>
    </header>
  );
}

function PageTitle({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="pageTitle"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="titleActions">{actions}</div>}</div>;
}

function Dashboard({ stats, executions, selected, setSelected, runAgent, running, prompt, setPrompt, result }: any) {
  const success = stats?.total ? Math.round((Number(stats.completed) / Number(stats.total)) * 100) : 0;
  const eventData = executions.slice(0, 12).slice().reverse().map((e: Exec, i: number) => ({ name: new Date(e.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), events: i + 1, latency: Math.round((e.duration_ms || 0) / 1000 * 10) / 10 }));
  const modelData = [{ name: 'gpt-6-luna', value: Number(stats?.tokens || 0) || 1 }];
  return <>
    <PageTitle eyebrow="OVERVIEW" title="Dashboard" description="Live overview of your AI-agent executions and performance." actions={<><Badge tone="live"><CircleDot size={10} /> LIVE</Badge><button className="selectBtn">Last 24 hours <ChevronRight size={14} /></button></>} />
    <div className="statGrid"><StatCard icon={Activity} label="Total Events" value={fmt(executions.length)} trend="Live database records" /><StatCard icon={Bot} label="Active Agents" value={fmt(new Set(executions.map((e: Exec) => e.agent_id)).size || 1)} trend="Observed agents" tone="purple" /><StatCard icon={Zap} label="Total Tokens" value={fmt(stats?.tokens || 0)} trend="Input + output" tone="cyan" /><StatCard icon={Coins} label="Total Cost (USD)" value={money(stats?.cost || 0)} trend="Estimated usage" tone="amber" /><StatCard icon={Timer} label="Avg Latency" value={`${executions.length ? ((executions.reduce((s: number, e: Exec) => s + (e.duration_ms || 0), 0) / executions.length) / 1000).toFixed(2) : '0.00'}s`} trend="Across executions" tone="rose" /><StatCard icon={TriangleAlert} label="Errors" value={fmt(stats?.failed || 0)} trend="Failed executions" tone="red" /><StatCard icon={CheckCircle2} label="Successful Runs" value={`${success}%`} trend={`${stats?.completed || 0} completed`} tone="green" /><StatCard icon={Server} label="MCP Servers" value="3" trend="2 online · demo inventory" tone="violet" /></div>
    <section className="card runCard"><div className="sectionHead"><div><div className="sectionKicker"><Sparkles size={13} /> REAL AGENT</div><h2>Run an agent</h2><p>Send a real prompt to the server-side agent and watch telemetry appear live.</p></div><Badge tone="connected"><Wifi size={11} /> Connected</Badge></div><div className="runComposer"><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Give the agent a task…" /><button className="primaryBtn" disabled={running} onClick={() => runAgent()}>{running ? <RefreshCw className="spin" size={16} /> : <Play size={16} />}{running ? 'Running…' : 'Run Agent'}</button></div>{result && <div className="resultBox"><div><CheckCircle2 size={15} /> Agent response</div><p>{result}</p></div>}</section>
    <div className="dashboardGrid"><section className="card chartCard"><div className="sectionHead"><div><h2>Event Volume</h2><p>Recent executions observed by Sentinel</p></div><Badge>LIVE</Badge></div><div className="chartWrap"><ResponsiveContainer width="100%" height={250}><AreaChart data={eventData}><defs><linearGradient id="eventFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6d5dfc" stopOpacity={0.28} /><stop offset="100%" stopColor="#6d5dfc" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#202a38" vertical={false} /><XAxis dataKey="name" tick={{ fill: '#687589', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#687589', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#101722', border: '1px solid #273448', borderRadius: 10, color: '#fff' }} /><Area type="monotone" dataKey="events" stroke="#7d6cff" strokeWidth={2.5} fill="url(#eventFill)" /></AreaChart></ResponsiveContainer></div></section><section className="card chartCard"><div className="sectionHead"><div><h2>Token Usage</h2><p>Observed token volume by current model</p></div><Badge tone="purple">gpt-6-luna</Badge></div><div className="donutArea"><ResponsiveContainer width="58%" height={220}><PieChart><Pie data={modelData} dataKey="value" innerRadius={65} outerRadius={86} paddingAngle={4}><Cell fill="#6d5dfc" /></Pie><text className="tokenCenterValue" x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fontSize="24" fontWeight="700">{fmt(stats?.tokens || 0)}</text><text className="tokenCenterLabel" x="50%" y="59%" textAnchor="middle" dominantBaseline="middle" fontSize="10">TOKENS</text></PieChart></ResponsiveContainer><div className="legend"><div><i className="dot purple" />gpt-6-luna <b>100%</b></div><small>Based on observed executions</small></div></div></section></div>
    <section className="card tableCard"><div className="sectionHead"><div><h2>Recent Runs</h2><p>Click any run to inspect its event trace.</p></div><button className="ghostBtn" onClick={() => setSelected(executions[0]?.id)}><Eye size={15} /> Inspect latest</button></div><ExecutionTable executions={executions.slice(0, 7)} onSelect={setSelected} /></section>
  </>;
}

function ExecutionTable({ executions, onSelect }: { executions: Exec[]; onSelect: (id: string) => void }) {
  return <div className="tableScroll"><table><thead><tr><th>Run ID</th><th>Agent</th><th>Status</th><th>Start time</th><th>Duration</th><th>Tokens</th><th>Cost</th><th /></tr></thead><tbody>{executions.map((e) => <tr key={e.id} onClick={() => onSelect(e.id)}><td><code>{shortId(e.id)}</code></td><td><b>{e.agent_name}</b></td><td><Badge tone={e.status === 'completed' ? 'success' : e.status === 'failed' ? 'error' : 'warning'}>{e.status}</Badge></td><td>{new Date(e.started_at).toLocaleString()}</td><td>{e.duration_ms ? `${(e.duration_ms / 1000).toFixed(2)}s` : '—'}</td><td>{fmt((e.input_tokens || 0) + (e.output_tokens || 0))}</td><td>{money(e.estimated_cost_usd)}</td><td><ChevronRight size={15} /></td></tr>)}</tbody></table>{executions.length === 0 && <div className="empty">No executions yet. Run the agent to create telemetry.</div>}</div>;
}

function AgentsPage({ executions, go, setSelected, runAgent }: { executions: Exec[]; go: (p: Page) => void; setSelected: (id: string) => void; runAgent: (p: string) => void }) {
  const agents = useMemo(() => Array.from(new Map(executions.map((e) => [e.agent_id, e])).values()), [executions]);
  return <><PageTitle eyebrow="MONITORING" title="Agents" description="Manage and inspect agents observed by Sentinel." actions={<button className="primaryBtn" onClick={() => runAgent('Give me a concise status report of the Sentinel project.') }><Plus size={16} /> Run Agent</button>} /><div className="miniStatGrid"><StatCard icon={Bot} label="Total Agents" value={String(Math.max(agents.length, executions.length ? 1 : 0))} /><StatCard icon={CheckCircle2} label="Active" value={String(agents.length || 0)} trend="Based on telemetry" tone="green" /><StatCard icon={AlertTriangle} label="Inactive" value="0" tone="amber" /><StatCard icon={TriangleAlert} label="Error" value={String(executions.filter((e) => e.status === 'failed').length)} tone="red" /></div><section className="card tableCard"><div className="sectionHead"><div><h2>Agent inventory</h2><p>Agents are derived from real execution telemetry in the current backend.</p></div><button className="ghostBtn"><Download size={15} /> Export</button></div><div className="agentGrid">{agents.length ? agents.map((e) => { const count = executions.filter((x) => x.agent_id === e.agent_id).length; const success = executions.filter((x) => x.agent_id === e.agent_id && x.status === 'completed').length; return <button className="agentCard" key={e.agent_id} onClick={() => { setSelected(e.id); go('agent-detail'); }}><div className="agentAvatar"><Bot size={21} /></div><div className="agentCardBody"><div className="agentNameRow"><h3>{e.agent_name}</h3><Badge tone="success">Active</Badge></div><p>Observed AI agent · {e.agent_id}</p><div className="agentStats"><span><b>{count}</b> runs</span><span><b>{count ? Math.round(success / count * 100) : 0}%</b> success</span><span><b>{fmt(executions.filter((x) => x.agent_id === e.agent_id).reduce((s, x) => s + x.input_tokens + x.output_tokens, 0))}</b> tokens</span></div></div><ChevronRight size={17} /></button>; }) : <div className="empty">No agents have emitted telemetry yet.</div>}</div></section></>;
}

function AgentDetailPage({ detail, executions, selected, setSelected, go, result }: { detail?: Detail; executions: Exec[]; selected: string | null; setSelected: (id: string | null) => void; go: (p: Page) => void; result: string }) {
  const current = detail || executions.find((e) => e.id === selected);
  return <><PageTitle eyebrow="AGENT DETAILS" title={current?.agent_name || 'Agent details'} description={current ? `Detailed activity for ${current.agent_id}.` : 'Select a run from the Agents or Events page.'} actions={<button className="ghostBtn" onClick={() => go('events')}><ListTree size={15} /> All events</button>} />{!current ? <div className="card empty bigEmpty"><Bot size={30} /><span>Select an execution to inspect its agent.</span></div> : <><div className="detailHero card"><div className="agentHeroIcon"><Bot size={27} /></div><div><div className="agentNameRow"><h2>{current.agent_name}</h2><Badge tone={current.status === 'failed' ? 'error' : 'success'}>{current.status}</Badge></div><p>{current.agent_id}</p></div><div className="heroMetrics"><span><small>Total runs</small><b>{executions.filter((e) => e.agent_id === current.agent_id).length}</b></span><span><small>Total tokens</small><b>{fmt(executions.filter((e) => e.agent_id === current.agent_id).reduce((s, e) => s + e.input_tokens + e.output_tokens, 0))}</b></span><span><small>Total cost</small><b>{money(executions.filter((e) => e.agent_id === current.agent_id).reduce((s, e) => s + e.estimated_cost_usd, 0))}</b></span></div></div><div className="detailGrid"><section className="card"><div className="sectionHead"><div><h2>Event Trace</h2><p>Detailed execution path for run {shortId(current.id)}</p></div><Badge tone="connected"><Wifi size={11} /> Live</Badge></div><ExecutionTrace detail={detail} result={result} /></section><section className="card sideDetail"><div className="sectionHead"><div><h2>Recent runs</h2><p>Same agent</p></div></div>{executions.filter((e) => e.agent_id === current.agent_id).slice(0, 8).map((e) => <button className={`sideRun ${e.id === selected ? 'selected' : ''}`} key={e.id} onClick={() => setSelected(e.id)}><div className={`runStatus ${e.status}`} /><div><b>{shortId(e.id)}</b><small>{new Date(e.started_at).toLocaleString()}</small></div><span>{e.duration_ms ? `${(e.duration_ms / 1000).toFixed(1)}s` : '—'}</span></button>)}</section></div></>}</>;
}

function ExecutionTrace({ detail, result }: { detail?: Detail; result: string }) {
  const events = detail?.events || [];
  const nodes: Node[] = events.map((e, i) => ({ id: e.id, data: { label: <div className="flowNode"><div>{e.type.includes('llm') ? <Bot size={13} /> : e.type.includes('tool') ? <Zap size={13} /> : e.type === 'error' ? <TriangleAlert size={13} /> : <CircleDot size={13} />}<b>{e.name}</b></div><small>{e.duration_ms ? `${e.duration_ms} ms` : e.status || 'recorded'}</small></div> }, position: { x: (i % 3) * 210, y: Math.floor(i / 3) * 105 }}));
  const edges: Edge[] = nodes.slice(1).map((n, i) => ({ id: `edge-${i}`, source: nodes[i].id, target: n.id, animated: true, markerEnd: { type: MarkerType.ArrowClosed } }));
  return !detail ? <div className="empty bigEmpty">Waiting for telemetry…</div> : <><div className="traceMetrics"><div><small>STATUS</small><b className={detail.status}>{detail.status}</b></div><div><small>DURATION</small><b>{detail.duration_ms ? `${(detail.duration_ms / 1000).toFixed(2)}s` : '—'}</b></div><div><small>TOKENS</small><b>{fmt(detail.input_tokens + detail.output_tokens)}</b></div><div><small>COST</small><b>{money(detail.estimated_cost_usd)}</b></div></div><div className="flowCanvas"><ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.5}><Background color="#283347" gap={20} /><Controls /><MiniMap /></ReactFlow></div><div className="timeline">{events.map((e) => <div className="timelineItem" key={e.id}><div className={`timelineIcon ${e.type}`}><Zap size={13} /></div><div className="timelineBody"><div><b>{e.name}</b><Badge tone={e.type === 'error' ? 'error' : 'neutral'}>{e.type}</Badge></div><p>{e.error || eventDescription(e)}</p>{e.output && e.type === 'llm.completed' && <pre>{typeof e.output === 'string' ? e.output : JSON.stringify(e.output, null, 2)}</pre>}</div><span>{e.duration_ms ? `${e.duration_ms} ms` : new Date(e.timestamp).toLocaleTimeString()}</span></div>)}{result && !events.some((e) => e.type === 'llm.completed') && <div className="resultBox"><div><CheckCircle2 size={15} /> Latest response</div><p>{result}</p></div>}</div></>;
}

function eventDescription(e: Event) {
  if (e.type === 'execution.started') return 'Agent execution started.';
  if (e.type === 'llm.started') return `Model call started${e.metadata?.model ? ` using ${e.metadata.model}` : ''}.`;
  if (e.type === 'llm.completed') return `Model call completed${e.tokens_input ? ` with ${e.tokens_input} input tokens` : ''}.`;
  if (e.type === 'tool.started') return 'Tool execution started.';
  if (e.type === 'tool.completed') return 'Tool execution completed.';
  if (e.type === 'execution.completed') return 'Execution completed successfully.';
  return 'Telemetry event recorded.';
}

function EventsPage({ executions, setSelected, search }: { executions: Exec[]; setSelected: (id: string) => void; search: string }) {
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const rows = executions.filter((e) => !search || `${e.agent_name} ${e.prompt} ${e.id}`.toLowerCase().includes(search.toLowerCase())).filter((e) => status === 'all' || e.status === status).map((e) => ({ e, type: e.status === 'failed' ? 'error' : 'execution.completed' }));
  return <><PageTitle eyebrow="MONITORING" title="Events" description="Browse executions and open their complete telemetry traces." actions={<div className="filterRow"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All status</option><option value="completed">Completed</option><option value="failed">Failed</option></select><select value={type} onChange={(e) => setType(e.target.value)}><option value="all">All event types</option><option value="execution.completed">Execution completed</option><option value="error">Errors</option></select></div>} /><section className="card tableCard"><div className="sectionHead"><div><h2>Event stream</h2><p>{rows.length} execution records currently available.</p></div><Badge tone="live"><CircleDot size={10} /> Live</Badge></div><ExecutionTable executions={rows.map((x) => x.e)} onSelect={setSelected} /></section></>;
}

function AnalyticsPage({ executions, stats }: { executions: Exec[]; stats: any }) {
  const daily = executions.slice().reverse().map((e, i) => ({ name: new Date(e.started_at).toLocaleDateString([], { month: 'short', day: 'numeric' }), tokens: e.input_tokens + e.output_tokens, latency: Number(((e.duration_ms || 0) / 1000).toFixed(2)), cost: Number(e.estimated_cost_usd || 0) }));
  const failed = executions.filter((e) => e.status === 'failed').length;
  const errorRate = executions.length ? ((failed / executions.length) * 100).toFixed(1) : '0.0';
  return <><PageTitle eyebrow="ANALYTICS" title="Analytics" description="Performance, usage and cost analytics from the Sentinel database." actions={<button className="selectBtn">Last 7 days <ChevronRight size={14} /></button>} /><div className="miniStatGrid"><StatCard icon={Zap} label="Total Tokens" value={fmt(stats?.tokens || 0)} trend="Current database" tone="cyan" /><StatCard icon={Timer} label="Avg Latency" value={`${executions.length ? (executions.reduce((s, e) => s + (e.duration_ms || 0), 0) / executions.length / 1000).toFixed(2) : '0.00'}s`} trend="Execution average" tone="amber" /><StatCard icon={Coins} label="Total Cost" value={money(stats?.cost || 0)} trend="Estimated USD" tone="rose" /><StatCard icon={AlertTriangle} label="Error Rate" value={`${errorRate}%`} trend={`${failed} failed runs`} tone="red" /></div><div className="analyticsGrid"><section className="card chartCard"><div className="sectionHead"><div><h2>Latency Trend</h2><p>Execution duration over recent runs</p></div></div><ResponsiveContainer width="100%" height={300}><LineChart data={daily}><CartesianGrid stroke="#202a38" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fill: '#687589', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#687589', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#101722', border: '1px solid #273448', borderRadius: 10 }} /><Line type="monotone" dataKey="latency" stroke="#7d6cff" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></section><section className="card chartCard"><div className="sectionHead"><div><h2>Token Usage</h2><p>Input + output tokens per run</p></div></div><ResponsiveContainer width="100%" height={300}><BarChart data={daily}><CartesianGrid stroke="#202a38" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fill: '#687589', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#687589', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#101722', border: '1px solid #273448', borderRadius: 10 }} /><Bar dataKey="tokens" fill="#2ec5ce" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></section><section className="card chartCard full"><div className="sectionHead"><div><h2>Cost Trend</h2><p>Estimated cost from recorded executions</p></div></div><ResponsiveContainer width="100%" height={280}><AreaChart data={daily}><defs><linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f1b65c" stopOpacity={0.25} /><stop offset="100%" stopColor="#f1b65c" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="#202a38" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fill: '#687589', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#687589', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#101722', border: '1px solid #273448', borderRadius: 10 }} /><Area type="monotone" dataKey="cost" stroke="#f1b65c" fill="url(#costFill)" strokeWidth={2.5} /></AreaChart></ResponsiveContainer></section></div></>;
}

function McpPage() {
  const servers = [{ name: 'Knowledge Server', url: 'http://localhost:8001', status: 'Online', tools: 2, last: 'Just now' }, { name: 'Browser Server', url: 'http://localhost:8002', status: 'Online', tools: 3, last: '2 min ago' }, { name: 'Database Server', url: 'http://localhost:8003', status: 'Offline', tools: 4, last: '10 min ago' }];
  return <><PageTitle eyebrow="PLATFORM" title="MCP Servers" description="Manage external MCP server connections and tool endpoints." actions={<button className="primaryBtn"><Plus size={16} /> Add MCP Server</button>} /><div className="miniStatGrid"><StatCard icon={Server} label="Total Servers" value="3" /><StatCard icon={Wifi} label="Online" value="2" tone="green" /><StatCard icon={AlertTriangle} label="Offline" value="1" tone="red" /></div><section className="card tableCard"><div className="sectionHead"><div><h2>Server connections</h2><p>UI inventory for MCP integrations. Connection management is not exposed by the current API.</p></div><Badge>UI ONLY</Badge></div><div className="tableScroll"><table><thead><tr><th>Name</th><th>URL</th><th>Status</th><th>Tools</th><th>Last check</th><th /></tr></thead><tbody>{servers.map((s) => <tr key={s.name}><td><div className="serverName"><div><Server size={16} /></div><b>{s.name}</b></div></td><td><code>{s.url}</code></td><td><Badge tone={s.status === 'Online' ? 'success' : 'error'}>{s.status}</Badge></td><td>{s.tools}</td><td>{s.last}</td><td><MoreVertical size={16} /></td></tr>)}</tbody></table></div></section></>;
}

function UsersPage() {
  const users = [{ name: 'Admin User', email: 'admin@sentinel.local', role: 'Admin', status: 'Active' }, { name: 'Dev User', email: 'dev@sentinel.local', role: 'Developer', status: 'Active' }, { name: 'Analyst User', email: 'analyst@sentinel.local', role: 'Viewer', status: 'Active' }, { name: 'Test User', email: 'test@sentinel.local', role: 'Developer', status: 'Inactive' }];
  return <><PageTitle eyebrow="PLATFORM" title="Users & Roles" description="Manage dashboard access and workspace roles." actions={<button className="primaryBtn"><Plus size={16} /> Add User</button>} /><div className="miniStatGrid"><StatCard icon={Users} label="Total Users" value="4" /><StatCard icon={Shield} label="Admins" value="1" tone="purple" /><StatCard icon={KeyRound} label="Developers" value="2" tone="cyan" /><StatCard icon={Eye} label="Viewers" value="1" tone="amber" /></div><section className="card tableCard"><div className="sectionHead"><div><h2>Workspace members</h2><p>Example role inventory for the current frontend.</p></div><Badge>UI ONLY</Badge></div><div className="tableScroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.map((u) => <tr key={u.email}><td><div className="userCell"><div className="avatar">{u.name[0]}</div><b>{u.name}</b></div></td><td>{u.email}</td><td><Badge tone={u.role === 'Admin' ? 'purple' : 'neutral'}>{u.role}</Badge></td><td><Badge tone={u.status === 'Active' ? 'success' : 'error'}>{u.status}</Badge></td><td><MoreVertical size={16} /></td></tr>)}</tbody></table></div></section></>;
}

function SimulatorPage() {
  const [agents, setAgents] = useState(5); const [events, setEvents] = useState(50); const [interval, setIntervalMs] = useState(2); const [running, setRunning] = useState(false); const [log, setLog] = useState<string[]>([]);
  useEffect(() => { if (!running) return; const timer = window.setInterval(() => setLog((l) => [`[${new Date().toLocaleTimeString()}] Sent synthetic telemetry batch (${agents} agents × ${events} events)`, ...l].slice(0, 8)), interval * 1000); return () => window.clearInterval(timer); }, [running, agents, events, interval]);
  return <><PageTitle eyebrow="PLATFORM" title="Telemetry Simulator" description="Generate synthetic UI activity for demos. This simulator does not write to the Sentinel backend." actions={<Badge tone={running ? 'live' : 'neutral'}>{running ? 'Running' : 'Stopped'}</Badge>} /><div className="simGrid"><section className="card simulator"><div className="sectionHead"><div><h2>Automation Simulator</h2><p>Use this page for a presentation/demo while real telemetry is unavailable.</p></div><Sparkles size={20} /></div><div className="formGrid"><label>Number of agents<input type="number" min="1" value={agents} onChange={(e) => setAgents(Number(e.target.value))} /></label><label>Events per agent<input type="number" min="1" value={events} onChange={(e) => setEvents(Number(e.target.value))} /></label><label>Interval (seconds)<input type="number" min="1" value={interval} onChange={(e) => setIntervalMs(Number(e.target.value))} /></label></div><div className="buttonRow"><button className="primaryBtn" onClick={() => setRunning(!running)}>{running ? <><X size={16} /> Stop</> : <><Play size={16} /> Start Simulation</>}</button><button className="ghostBtn" onClick={() => setLog([])}><RefreshCw size={15} /> Reset</button></div></section><section className="card logCard"><div className="logHeader"><TerminalSquare size={17} /> Live logs <span>{running ? 'CONNECTED' : 'IDLE'}</span></div><div className="terminal">{log.length ? log.map((x, i) => <div key={i}>{x}</div>) : <div className="mutedText">Simulation logs will appear here.</div>}</div></section></div></>;
}

function SettingsPage({ onLogin }: { onLogin: () => void }) {
  return <><PageTitle eyebrow="SYSTEM" title="Settings" description="Local Sentinel frontend configuration and account controls." /><div className="settingsGrid"><section className="card settingsCard"><div className="sectionHead"><div><h2>Connection</h2><p>Current API endpoints used by this frontend.</p></div><Wifi size={18} /></div><label>API URL<input readOnly value={API} /></label><label>Agent URL<input readOnly value={AGENT} /></label><div className="settingRow"><div><b>Live telemetry</b><small>Refresh dashboard and execution views from WebSocket events.</small></div><span className="switch on" /></div></section><section className="card settingsCard"><div className="sectionHead"><div><h2>Account</h2><p>Demo controls for the local dashboard.</p></div><User size={18} /></div><div className="accountBox"><div className="avatar large">A</div><div><h3>Admin</h3><p>admin@sentinel.local</p></div></div><button className="dangerBtn" onClick={onLogin}><LogOut size={15} /> Return to Login Screen</button></section></div></>;
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('admin@sentinel.local'); const [password, setPassword] = useState('sentinel');
  return <div className="loginScreen"><div className="loginGlow" /><div className="loginBrand"><div className="shieldLogo big"><Shield size={28} /></div><h1>Sentinel</h1><p>AI Agent Observability Platform</p></div><div className="loginCard"><div className="loginTitle"><h2>Sign in to your account</h2><p>Access your agent observability dashboard.</p></div><label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Password<div className="passwordInput"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /><Eye size={16} /></div></label><div className="loginOptions"><label className="check"><input type="checkbox" /> Remember me</label><button>Forgot password?</button></div><button className="loginBtn" onClick={onLogin}>Sign In</button><small className="version">Sentinel v1.0.0 · Local</small></div></div>;
}

export default App;
