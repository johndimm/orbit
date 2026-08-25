'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Share2, Check, BookOpen, Loader2, Search, Brain, ImageIcon, Home as HomeIcon, Info } from 'lucide-react';
import Link from 'next/link';
import Graph, { GraphNode, GraphLink } from '@/components/Graph';
import SearchBar from '@/components/SearchBar';
import SettingsPanel from '@/components/SettingsPanel';
import NodeDetail from '@/components/NodeDetail';
import EdgeDetail from '@/components/EdgeDetail';
import LoadingSpinner from '@/components/LoadingSpinner';
import * as store from '@/lib/store';
import { normalize } from '@/lib/parsers';

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface ProgressStep {
  step: string;
  phase: string;
  done?: boolean;
}

async function fetchSSE(
  endpoint: string,
  body: Record<string, unknown>,
  onProgress: (step: ProgressStep) => void,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok || !res.body) return null;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: Record<string, unknown> | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // keep incomplete last line

    let eventType = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7);
      } else if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        if (eventType === 'progress') {
          onProgress(data as ProgressStep);
        } else if (eventType === 'result') {
          result = data;
        } else if (eventType === 'error') {
          console.error('SSE error:', data);
        }
        eventType = '';
      }
    }
  }

  return result;
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<GraphLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingTitle, setLoadingTitle] = useState('');
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [nodeProgress, setNodeProgress] = useState<Record<string, { name: string; steps: ProgressStep[] }>>({});
  const loadingNodesRef = useRef<Set<string>>(new Set());
  const lastSearchRef = useRef<{ query: string; type: 'person' | 'company' } | null>(null);
  const triedPhotosRef = useRef<Map<string, Set<string>>>(new Map());

  const rebuildGraph = useCallback(() => {
    const data = store.buildGraph();
    // Stamp isLoading onto nodes that are currently being fetched
    const loading = loadingNodesRef.current;
    if (loading.size > 0) {
      data.nodes = data.nodes.map(n => loading.has(n.id) ? { ...n, isLoading: true } : n);
    }
    setGraphData(data);
  }, []);

  // Load existing graph from localStorage on mount
  useEffect(() => {
    rebuildGraph();
  }, [rebuildGraph]);

  const handleSearch = useCallback(async (query: string, type: 'person' | 'company') => {
    setLoading(true);
    setLoadingTitle(type === 'person' ? `Researching ${query}` : `Looking up ${query}`);
    setProgressSteps([]);
    lastSearchRef.current = { query, type };

    try {
      const endpoint = type === 'person' ? '/api/person' : '/api/company';
      const body: Record<string, unknown> = { name: query, provider: store.getActiveProvider() };
      if (type === 'person') {
        const resumeUrl = store.getResumeUrl();
        const resumeName = store.getResumeName();
        if (resumeUrl && resumeName) {
          // Only send resume if the searched name matches the resume owner
          const qNorm = normalize(query);
          const rNorm = normalize(resumeName);
          if (qNorm === rNorm || qNorm.includes(rNorm) || rNorm.includes(qNorm)) {
            body.resumeUrl = resumeUrl;
          }
        }
      }
      const data = await fetchSSE(
        endpoint,
        body,
        (step) => setProgressSteps(prev => [...prev, step]),
      );

      if (data && type === 'person' && data.person) {
        store.mergePersonData(data.person as Parameters<typeof store.mergePersonData>[0]);
      } else if (data && type === 'company' && data.company) {
        store.mergeCompanyData(data.company as Parameters<typeof store.mergeCompanyData>[0]);
      }

      rebuildGraph();
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setLoading(false);
    }
  }, [rebuildGraph]);

  // Handle URL query parameters (?graph=ID, ?person=Name, or ?company=Name)
  const searchParams = useSearchParams();
  const urlSearchDone = useRef(false);
  useEffect(() => {
    if (urlSearchDone.current) return;
    const graphId = searchParams.get('graph');
    const person = searchParams.get('person');
    const company = searchParams.get('company');

    if (graphId) {
      urlSearchDone.current = true;
      fetch(`/api/graph?id=${encodeURIComponent(graphId)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            store.importGraph(data.persons, data.companies);
            rebuildGraph();
          }
        })
        .catch(e => console.error('Failed to load shared graph:', e));
    } else if (person) {
      urlSearchDone.current = true;
      store.clearGraph();
      setGraphData({ nodes: [], links: [] });
      handleSearch(person, 'person');
    } else if (company) {
      urlSearchDone.current = true;
      store.clearGraph();
      setGraphData({ nodes: [], links: [] });
      handleSearch(company, 'company');
    }
  }, [searchParams, handleSearch, rebuildGraph]);

  const handleNodeClick = useCallback(async (node: GraphNode) => {
    // Clear link selection when clicking a node
    setSelectedLink(null);

    // If the node has no id (background click), deselect
    if (!node.id) {
      setSelectedNode(null);
      return;
    }

    const norm = store.normFromNodeId(node.id);

    const nodeId = node.id;
    const nodeName = node.name;

    const onNodeProgress = (step: ProgressStep) => {
      setNodeProgress(prev => {
        const entry = prev[nodeId] || { name: nodeName, steps: [] };
        return { ...prev, [nodeId]: { name: nodeName, steps: [...entry.steps, step] } };
      });
    };

    const clearNodeProgress = () => {
      setNodeProgress(prev => {
        const next = { ...prev };
        delete next[nodeId];
        return next;
      });
    };

    if (node.type === 'company') {
      const excludeNames = store.getCompanyPeopleNames(norm);
      // Find the person who led us to this company (connected person node)
      const connectedPersonLink = graphData.links.find(l => {
        const sid = typeof l.source === 'string' ? l.source : l.source.id;
        const tid = typeof l.target === 'string' ? l.target : l.target.id;
        return tid === nodeId && sid.startsWith('person:');
      });
      const referringPersonId = connectedPersonLink
        ? (typeof connectedPersonLink.source === 'string' ? connectedPersonLink.source : connectedPersonLink.source.id)
        : null;
      const referringPerson = referringPersonId
        ? graphData.nodes.find(n => n.id === referringPersonId)?.name
        : undefined;
      loadingNodesRef.current.add(nodeId);
      setNodeProgress(prev => ({ ...prev, [nodeId]: { name: nodeName, steps: [] } }));
      rebuildGraph();
      fetchSSE('/api/company', { name: nodeName, provider: store.getActiveProvider(), excludeNames, ...(referringPerson ? { referringPerson } : {}) }, onNodeProgress)
        .then(data => {
          if (data?.company) store.mergeCompanyData(data.company as Parameters<typeof store.mergeCompanyData>[0]);
        })
        .catch(e => console.error('Company expand error:', e))
        .finally(() => {
          loadingNodesRef.current.delete(nodeId);
          clearNodeProgress();
          rebuildGraph();
          setSelectedNode(null);
        });
    } else if (node.type === 'person') {
      const excludeCompanies = store.getPersonCompanyNames(norm);
      // Check per-person stored URL first, then fall back to settings if name matches
      let resumeUrl = store.getPersonResumeUrl(norm);
      if (!resumeUrl) {
        const settingsUrl = store.getResumeUrl();
        const settingsName = store.getResumeName();
        if (settingsUrl && settingsName) {
          const rNorm = normalize(settingsName);
          if (norm === rNorm || norm.includes(rNorm) || rNorm.includes(norm)) {
            resumeUrl = settingsUrl;
          }
        }
      }
      loadingNodesRef.current.add(nodeId);
      setNodeProgress(prev => ({ ...prev, [nodeId]: { name: nodeName, steps: [] } }));
      rebuildGraph();
      fetchSSE('/api/person', { name: nodeName, provider: store.getActiveProvider(), excludeCompanies, ...(resumeUrl ? { resumeUrl } : {}) }, onNodeProgress)
        .then(data => {
          if (data?.person) store.mergePersonData(data.person as Parameters<typeof store.mergePersonData>[0]);
        })
        .catch(e => console.error('Person expand error:', e))
        .finally(() => {
          loadingNodesRef.current.delete(nodeId);
          clearNodeProgress();
          rebuildGraph();
          setSelectedNode(null);
        });
    }

    // Toggle node selection immediately
    setSelectedNode(prev => {
      const currentGraph = store.buildGraph();
      const freshNode = currentGraph.nodes.find(n => n.id === node.id);
      if (prev?.id === node.id) return null;
      return freshNode || node;
    });
  }, [rebuildGraph]);

  const handleLinkClick = useCallback((link: GraphLink) => {
    setSelectedNode(null);
    setSelectedLink(prev => {
      const prevSource = prev ? (typeof prev.source === 'string' ? prev.source : prev.source.id) : null;
      const prevTarget = prev ? (typeof prev.target === 'string' ? prev.target : prev.target.id) : null;
      const newSource = typeof link.source === 'string' ? link.source : link.source.id;
      const newTarget = typeof link.target === 'string' ? link.target : link.target.id;
      return (prevSource === newSource && prevTarget === newTarget) ? null : link;
    });
  }, []);

  const handleDetailNodeClick = useCallback((nodeId: string) => {
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (node) {
      handleNodeClick(node);
    }
  }, [graphData.nodes, handleNodeClick]);

  const handleShare = useCallback(async () => {
    if (graphData.nodes.length === 0) return;

    try {
      const { persons, companies } = store.exportGraph();
      const res = await fetch('/api/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persons, companies }),
      });

      if (!res.ok) return;

      const { id } = await res.json();
      const url = new URL(window.location.href.split('?')[0]);
      url.searchParams.set('graph', id);
      const shareLink = url.toString();
      await navigator.clipboard.writeText(shareLink);
      setShareUrl(shareLink);
      setTimeout(() => setShareUrl(null), 8000);
    } catch (e) {
      console.error('Share error:', e);
    }
  }, [graphData.nodes]);

  const handleRetryPhoto = useCallback(async (nodeId: string, currentImageUrl: string | null) => {
    const norm = store.normFromNodeId(nodeId);
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Accumulate all tried URLs for this node
    if (!triedPhotosRef.current.has(nodeId)) {
      triedPhotosRef.current.set(nodeId, new Set());
    }
    const tried = triedPhotosRef.current.get(nodeId)!;
    if (currentImageUrl) tried.add(currentImageUrl);

    try {
      const res = await fetch('/api/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: node.name, exclude: Array.from(tried) }),
      });
      if (!res.ok) return;
      const { photoUrl } = await res.json();
      if (photoUrl) {
        tried.add(photoUrl);
        store.updatePersonPhoto(norm, photoUrl);
        rebuildGraph();
        setSelectedNode(prev => prev?.id === nodeId ? { ...prev, imageUrl: photoUrl } : prev);
      }
    } catch (e) {
      console.error('Retry photo error:', e);
    }
  }, [graphData.nodes, rebuildGraph]);

  const handleClear = useCallback(() => {
    store.clearGraph();
    setGraphData({ nodes: [], links: [] });
    setSelectedNode(null);
    setSelectedLink(null);
  }, []);

  const handleMerge = useCallback((sourceId: string, targetId: string) => {
    const sourceNorm = store.normFromNodeId(sourceId);
    const targetNorm = store.normFromNodeId(targetId);
    store.mergeCompanies(sourceNorm, targetNorm);
    rebuildGraph();
    // Update selectedNode to the merged target
    const freshGraph = store.buildGraph();
    const targetNode = freshGraph.nodes.find(n => n.id === targetId);
    setSelectedNode(targetNode || null);
  }, [rebuildGraph]);

  // Build edge info for selected node
  const selectedEdges = selectedNode
    ? graphData.links
        .filter(l => {
          const sid = typeof l.source === 'string' ? l.source : l.source.id;
          const tid = typeof l.target === 'string' ? l.target : l.target.id;
          return sid === selectedNode.id || tid === selectedNode.id;
        })
        .map(l => {
          const sid = typeof l.source === 'string' ? l.source : l.source.id;
          const tid = typeof l.target === 'string' ? l.target : l.target.id;
          const connectedId = sid === selectedNode.id ? tid : sid;
          const connectedNode = graphData.nodes.find(n => n.id === connectedId);
          return {
            position: l.position,
            startYear: l.startYear,
            endYear: l.endYear,
            projects: l.projects,
            coworkers: l.coworkers,
            reportsTo: l.reportsTo,
            performanceComments: l.performanceComments,
            connectedNode: connectedNode || { id: connectedId, name: 'Unknown', type: 'person' as const },
          };
        })
    : [];

  // Resolve link node names for EdgeDetail
  const linkSourceNode = selectedLink
    ? graphData.nodes.find(n => n.id === (typeof selectedLink.source === 'string' ? selectedLink.source : selectedLink.source.id))
    : null;
  const linkTargetNode = selectedLink
    ? graphData.nodes.find(n => n.id === (typeof selectedLink.target === 'string' ? selectedLink.target : selectedLink.target.id))
    : null;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-sm z-30">
        <div className="flex items-center gap-2">
          <a
            href="https://johndimm.vercel.app"
            aria-label="All apps"
            title="All apps — John Dimm"
            className="flex items-center justify-center rounded-lg border border-slate-700/50 bg-slate-800/50 p-2 text-slate-400 transition-colors hover:text-slate-200 hover:border-slate-600"
          >
            <HomeIcon className="h-4 w-4" />
          </a>
          <h1 className="text-lg font-semibold text-slate-100 tracking-tight">
            Orbit
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <SearchBar onSearch={handleSearch} disabled={loading} />
          {graphData.nodes.length > 0 && (
            <>
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-xs text-slate-400 transition-colors hover:text-blue-400 hover:border-blue-700/50"
                title="Copy shareable link"
              >
                {shareUrl ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Share2 className="h-3.5 w-3.5" />}
                {shareUrl ? 'Copied!' : 'Share'}
              </button>
              <button
                onClick={handleClear}
                className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-xs text-slate-400 transition-colors hover:text-red-400 hover:border-red-700/50"
              >
                Clear
              </button>
            </>
          )}
          <Link
            href="/services"
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-xs text-slate-400 transition-colors hover:text-slate-200 hover:border-slate-600"
            title="Services documentation"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Services
          </Link>
          <Link
            href="/about"
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-xs text-slate-400 transition-colors hover:text-slate-200 hover:border-slate-600"
            title="About Orbit"
          >
            <Info className="h-3.5 w-3.5" />
            About
          </Link>
          <SettingsPanel />
        </div>
      </header>

      {/* Share URL toast */}
      {shareUrl && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-lg border border-green-700/50 bg-green-900/90 px-4 py-2 shadow-lg backdrop-blur-sm">
          <Check className="h-4 w-4 text-green-400 shrink-0" />
          <span className="text-xs text-green-200">Link copied to clipboard:</span>
          <a href={shareUrl} className="text-xs text-green-400 underline underline-offset-2 max-w-[400px] truncate" title={shareUrl}>{shareUrl}</a>
        </div>
      )}

      {/* Graph canvas */}
      <main className="flex-1 relative">
        <Graph
          nodes={graphData.nodes}
          links={graphData.links}
          selectedNodeId={selectedNode?.id || null}
          onNodeClick={handleNodeClick}
          onLinkClick={handleLinkClick}
        />

        {graphData.nodes.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-slate-500 text-lg font-light">Search for a person or company to begin</p>
              <p className="text-slate-600 text-sm mt-1">Try &quot;John Dimm&quot; or &quot;Websense&quot;</p>
            </div>
          </div>
        )}
      </main>

      {/* Node detail sidebar */}
      {selectedNode && (
        <NodeDetail
          node={selectedNode}
          edges={selectedEdges}
          onClose={() => setSelectedNode(null)}
          onNodeClick={handleDetailNodeClick}
          onRetryPhoto={handleRetryPhoto}
          onMerge={handleMerge}
          companyNodes={graphData.nodes
            .filter(n => n.type === 'company' && n.id !== selectedNode.id)
            .map(n => ({ id: n.id, name: n.name }))}
        />
      )}

      {/* Edge detail panel */}
      {selectedLink && linkSourceNode && linkTargetNode && (
        <EdgeDetail
          link={selectedLink}
          sourceNode={linkSourceNode}
          targetNode={linkTargetNode}
          onClose={() => setSelectedLink(null)}
          onNodeClick={handleDetailNodeClick}
        />
      )}

      {/* Loading overlay for search bar searches */}
      {loading && <LoadingSpinner title={loadingTitle} steps={progressSteps} />}

      {/* Node expansion progress — bottom-left, non-modal */}
      {Object.keys(nodeProgress).length > 0 && (
        <div className="fixed bottom-4 left-4 z-40 space-y-2 w-[420px]">
          {Object.entries(nodeProgress).map(([id, { name, steps }]) => (
            <div key={id} className="rounded-xl bg-slate-900/95 border border-slate-700/50 backdrop-blur-xl px-4 py-3 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500 shrink-0" />
                <span className="text-xs font-medium text-slate-200">{name}</span>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 ml-1">
                    {step.done
                      ? <Check className="h-3 w-3 text-green-400 shrink-0 mt-0.5" />
                      : <Loader2 className="h-3 w-3 animate-spin text-amber-500/70 shrink-0 mt-0.5" />
                    }
                    <span className={`text-[11px] leading-relaxed ${step.done ? 'text-slate-500' : 'text-slate-400'}`}>
                      {step.phase === 'search' && <Search className="h-2.5 w-2.5 inline mr-1" />}
                      {step.phase === 'llm' && <Brain className="h-2.5 w-2.5 inline mr-1" />}
                      {step.phase === 'images' && <ImageIcon className="h-2.5 w-2.5 inline mr-1" />}
                      {step.step}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
