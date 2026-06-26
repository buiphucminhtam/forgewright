'use client';

import { useState, useEffect } from 'react';
import {
  Bot,
  Cpu,
  Database,
  Globe,
  FolderGit2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  ExternalLink,
  Loader2,
  Sparkles,
  Settings,
  RefreshCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ProjectStatus {
  name: string;
  path: string;
  hasMCP: boolean;
  mcpStatus: 'online' | 'offline' | 'warning';
  hasForgewright: boolean;
  hasGit: boolean;
  setupProgress?: 'idle' | 'loading' | 'success' | 'error';
  setupMessage?: string;
}

interface SetupAction {
  id: string;
  label: string;
  description: string;
}

function StatusBadge({ status }: { status: 'online' | 'offline' | 'warning' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        status === 'online' && 'bg-status-online/10 text-status-online',
        status === 'offline' && 'bg-status-error/10 text-status-error',
        status === 'warning' && 'bg-status-busy/10 text-status-busy'
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'online' && 'bg-status-online',
          status === 'offline' && 'bg-status-error',
          status === 'warning' && 'bg-status-busy'
        )}
      />
      {status === 'online' && 'Ready'}
      {status === 'offline' && 'Offline'}
      {status === 'warning' && 'Setup Needed'}
    </span>
  );
}

function SetupButton({ 
  project, 
  onAction 
}: { 
  project: ProjectStatus; 
  onAction: (path: string, action: string) => void;
}) {
  const needsFullSetup = !project.hasForgewright;
  const needsMCPOnly = project.hasForgewright && !project.hasMCP;
  const isLoading = project.setupProgress === 'loading';

  if (project.setupProgress === 'success') {
    return (
      <div className="flex items-center gap-2 text-sm text-status-online">
        <CheckCircle2 className="h-4 w-4" />
        <span>{project.setupMessage || 'Done!'}</span>
      </div>
    );
  }

  if (project.setupProgress === 'error') {
    return (
      <div className="flex items-center gap-2">
        <div className="text-sm text-status-error">
          <XCircle className="h-4 w-4 inline mr-1" />
          {project.setupMessage || 'Failed'}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAction(project.path, needsFullSetup ? 'init-forgewright' : 'setup-mcp')}
          disabled={isLoading}
        >
          <RefreshCcw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      </div>
    );
  }

  if (needsFullSetup) {
    return (
      <Button
        size="sm"
        onClick={() => onAction(project.path, 'init-forgewright')}
        disabled={isLoading}
        className="gap-1"
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
        Init + Setup
      </Button>
    );
  }

  if (needsMCPOnly) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => onAction(project.path, 'setup-mcp')}
        disabled={isLoading}
        className="gap-1"
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Settings className="h-3 w-3" />
        )}
        Setup MCP
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => onAction(project.path, 'check-status')}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <RefreshCw className="h-3 w-3" />
      )}
    </Button>
  );
}

function ProjectCard({ 
  project, 
  expanded, 
  onToggle,
  onAction,
}: { 
  project: ProjectStatus; 
  expanded: boolean;
  onToggle: () => void;
  onAction: (path: string, action: string) => void;
}) {
  const isReady = project.hasForgewright && project.hasMCP;
  const needsAttention = !isReady;

  return (
    <div className={cn(
      'border rounded-lg overflow-hidden transition-colors',
      needsAttention ? 'border-status-busy/30' : 'border-border'
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 bg-bg-secondary hover:bg-bg-hover transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <FolderGit2 className={cn(
            'h-5 w-5',
            isReady ? 'text-status-online' : 'text-accent-primary'
          )} />
          <div>
            <p className="text-sm font-medium text-text-primary">{project.name}</p>
            <p className="text-xs text-text-muted truncate max-w-[200px]">{project.path}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {project.hasForgewright && (
            <span className="text-xs px-2 py-0.5 bg-accent-primary/10 text-accent-primary rounded">
              Forgewright
            </span>
          )}
          {project.hasMCP && (
            <span className="text-xs px-2 py-0.5 bg-status-online/10 text-status-online rounded">
              MCP ✓
            </span>
          )}
          <StatusBadge status={project.mcpStatus} />
          <ChevronRight className={cn('h-4 w-4 text-text-muted transition-transform ml-2', expanded && 'rotate-90')} />
        </div>
      </button>
      
      {expanded && (
        <div className="p-3 bg-bg-card border-t border-border space-y-3">
          {/* Status checks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary flex items-center gap-2">
                <FolderGit2 className="h-3 w-3" /> Git Repository
              </span>
              {project.hasGit ? (
                <span className="text-status-online flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Present
                </span>
              ) : (
                <span className="text-status-error flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> Missing
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Forgewright</span>
              {project.hasForgewright ? (
                <span className="text-status-online flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Present
                </span>
              ) : (
                <span className="text-status-error flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> Not installed
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">MCP Config</span>
              {project.hasMCP ? (
                <span className="text-status-online flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Configured
                </span>
              ) : (
                <span className="text-status-busy flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Not configured
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">
                {isReady ? 'Setup complete' : 'Action required'}
              </span>
              <SetupButton project={project} onAction={onAction} />
            </div>
          </div>

          {/* Open in VSCode */}
          <a 
            href={`vscode://file/${project.path}`}
            className="flex items-center gap-1 text-xs text-accent-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Open in VSCode
          </a>
        </div>
      )}
    </div>
  );
}

function ServiceCard({ name, icon, status, detail, port }: {
  name: string;
  icon: React.ReactNode;
  status: 'online' | 'offline' | 'warning';
  detail?: string;
  port?: number;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg border border-border">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'h-8 w-8 rounded-lg flex items-center justify-center',
            status === 'online' && 'bg-status-online/10 text-status-online',
            status === 'offline' && 'bg-status-error/10 text-status-error',
            status === 'warning' && 'bg-status-busy/10 text-status-busy'
          )}
        >
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary">{name}</p>
          {detail && (
            <p className="text-xs text-text-muted">{detail}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {port && (
          <span className="text-xs text-text-muted font-mono">:{port}</span>
        )}
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

export function EnvironmentStatus() {
  const [projects, setProjects] = useState<ProjectStatus[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, withForgewright: 0, withMCP: 0 });
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [view, setView] = useState<'projects' | 'services'>('projects');
  const [lastScanned, setLastScanned] = useState<Date | null>(null);

  const refreshProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      
      if (data.projects) {
        setProjects(data.projects.map((p: any) => ({
          ...p,
          mcpStatus: (p.hasForgewright && p.hasMCP) ? 'online' as const : (p.hasForgewright ? 'warning' as const : 'offline' as const),
          setupProgress: 'idle' as const,
        })));
        setStats({
          total: data.total || 0,
          withForgewright: data.withForgewright || 0,
          withMCP: data.withMCP || 0,
        });
        setLastScanned(new Date());
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const handleProjectAction = async (projectPath: string, action: string) => {
    // Update project to loading state
    setProjects(prev => prev.map(p => 
      p.path === projectPath 
        ? { ...p, setupProgress: 'loading' as const }
        : p
    ));

    try {
      const res = await fetch('/api/projects/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, action }),
      });

      const result = await res.json();

      // Update project with result
      setProjects(prev => prev.map(p => {
        if (p.path === projectPath) {
          const hasForgewright = result.hasForgewright ?? p.hasForgewright;
          const hasMCP = result.hasMCP ?? p.hasMCP;
          return {
            ...p,
            hasForgewright,
            hasMCP,
            mcpStatus: (hasForgewright && hasMCP) ? 'online' as const : (hasForgewright ? 'warning' as const : 'offline' as const),
            setupProgress: result.success ? 'success' as const : 'error' as const,
            setupMessage: result.message,
          };
        }
        return p;
      }));

      // Refresh full list after short delay
      if (result.success) {
        setTimeout(() => refreshProjects(), 2000);
      }
    } catch (error) {
      setProjects(prev => prev.map(p => 
        p.path === projectPath 
          ? { ...p, setupProgress: 'error' as const, setupMessage: 'Network error' }
          : p
      ));
    }
  };

  const checkServices = async () => {
    const checks = [
      {
        name: 'ForgeNexus',
        icon: <Cpu className="h-4 w-4" />,
        status: 'offline' as const,
        detail: 'Code intelligence',
      },
      {
        name: 'Multica Hub',
        icon: <Globe className="h-4 w-4" />,
        status: 'offline' as const,
        detail: 'Orchestration dashboard',
        port: 4000,
      },
      {
        name: 'mmx-cli',
        icon: <Bot className="h-4 w-4" />,
        status: 'offline' as const,
        detail: 'Antigravity CLI',
      },
    ];

    for (const service of checks) {
      if (service.port) {
        try {
          const res = await fetch(`http://localhost:${service.port}`, {
            method: 'HEAD',
            signal: AbortSignal.timeout(2000),
          });
          service.status = res.ok ? 'online' as const : 'offline' as const;
        } catch {
          service.status = 'offline';
        }
      }
    }

    // Check ForgeNexus
    try {
      const res = await fetch('http://localhost:3000/api/health', {
        method: 'HEAD',
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok || res.status < 500) {
        const nexus = checks.find((s) => s.name === 'ForgeNexus');
        if (nexus) nexus.status = 'online';
      }
    } catch {}

    setServices(checks);
  };

  const checkAll = async () => {
    setIsRefreshing(true);
    await refreshProjects();
    await checkServices();
    setIsRefreshing(false);
  };

  useEffect(() => {
    checkAll();
    const interval = setInterval(checkAll, 60000);
    return () => clearInterval(interval);
  }, []);

  const forgewrightProjects = projects.filter((p) => p.hasForgewright);
  const readyProjects = projects.filter((p) => p.hasForgewright && p.hasMCP);
  const needsSetup = projects.filter((p) => !p.hasMCP || !p.hasForgewright);

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-accent-primary" />
          <h3 className="font-medium text-text-primary">Environment Status</h3>
        </div>
        <button
          onClick={checkAll}
          disabled={isRefreshing}
          className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 bg-bg-secondary rounded-lg mb-4">
        <button
          onClick={() => setView('projects')}
          className={cn(
            'flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            view === 'projects'
              ? 'bg-bg-card text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          )}
        >
          Projects ({readyProjects.length}/{projects.length} ready)
        </button>
        <button
          onClick={() => setView('services')}
          className={cn(
            'flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            view === 'services'
              ? 'bg-bg-card text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          )}
        >
          Services
        </button>
      </div>

      {/* Projects View */}
      {view === 'projects' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="p-3 bg-bg-secondary rounded-lg border border-border text-center">
              <div className="text-xl font-semibold text-status-online">
                {readyProjects.length}
              </div>
              <div className="text-xs text-text-muted">Ready</div>
            </div>
            <div className="p-3 bg-bg-secondary rounded-lg border border-border text-center">
              <div className="text-xl font-semibold text-accent-primary">
                {forgewrightProjects.length}
              </div>
              <div className="text-xs text-text-muted">Forgewright</div>
            </div>
            <div className="p-3 bg-bg-secondary rounded-lg border border-border text-center">
              <div className="text-xl font-semibold text-text-primary">
                {needsSetup.length}
              </div>
              <div className="text-xs text-text-muted">Need Setup</div>
            </div>
            <div className="p-3 bg-bg-secondary rounded-lg border border-border text-center">
              <div className="text-xl font-semibold text-text-primary">
                {stats.total}
              </div>
              <div className="text-xs text-text-muted">Total</div>
            </div>
          </div>

          {/* Filter: Needs Attention First */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setProjects([...needsSetup, ...readyProjects])}
              className="px-3 py-1 text-xs rounded-full bg-status-busy/10 text-status-busy hover:bg-status-busy/20"
            >
              Needs Setup ({needsSetup.length})
            </button>
            <button
              onClick={() => setProjects([...readyProjects, ...needsSetup])}
              className="px-3 py-1 text-xs rounded-full bg-status-online/10 text-status-online hover:bg-status-online/20"
            >
              Ready ({readyProjects.length})
            </button>
            <button
              onClick={() => refreshProjects()}
              className="px-3 py-1 text-xs rounded-full bg-bg-secondary text-text-muted hover:bg-bg-hover"
            >
              All ({stats.total})
            </button>
          </div>

          {/* Project List */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {[...needsSetup, ...readyProjects].map((project) => (
              <ProjectCard
                key={project.name}
                project={project}
                expanded={expandedProject === project.name}
                onToggle={() => setExpandedProject(
                  expandedProject === project.name ? null : project.name
                )}
                onAction={handleProjectAction}
              />
            ))}
          </div>

          {lastScanned && (
            <div className="mt-3 text-xs text-text-muted text-center">
              Last scanned: {lastScanned.toLocaleTimeString()}
            </div>
          )}
        </>
      )}

      {/* Services View */}
      {view === 'services' && (
        <div className="space-y-2">
          {services.map((service) => (
            <ServiceCard key={service.name} {...service} />
          ))}
        </div>
      )}

      {/* Summary Banner */}
      {needsSetup.length > 0 && (
        <div className="mt-4 p-3 bg-status-busy/5 rounded-lg border border-status-busy/20">
          <div className="flex items-center gap-2 text-sm text-status-busy">
            <AlertCircle className="h-4 w-4" />
            <span>
              {needsSetup.length} project{needsSetup.length > 1 ? 's' : ''} need setup
            </span>
          </div>
        </div>
      )}

      {readyProjects.length === projects.length && projects.length > 0 && (
        <div className="mt-4 p-3 bg-status-online/5 rounded-lg border border-status-online/20">
          <div className="flex items-center gap-2 text-sm text-status-online">
            <CheckCircle2 className="h-4 w-4" />
            <span>All projects configured!</span>
          </div>
        </div>
      )}
    </div>
  );
}
