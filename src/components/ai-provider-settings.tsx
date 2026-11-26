'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Key,
  Cpu,
  RefreshCw,
  Eye,
  EyeOff,
  Server,
  Laptop,
} from 'lucide-react';
import { toast } from 'sonner';

export type AiMode = 'server' | 'portal_byok' | 'extension_byok' | 'local';

export type AiProvider =
  | 'server'
  | 'openai'
  | 'openrouter'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'ollama'
  | 'lm_studio'
  | 'custom';

export const PROVIDER_PRESETS: Record<
  string,
  { label: string; defaultBaseUrl: string; defaultModel: string }
> = {
  server: {
    label: 'NextKinHR Managed (Default)',
    defaultBaseUrl: '',
    defaultModel: '',
  },
  openrouter: {
    label: 'OpenRouter (BYOK)',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-chat',
  },
  deepseek: {
    label: 'DeepSeek (BYOK)',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  openai: {
    label: 'OpenAI (BYOK)',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  groq: {
    label: 'Groq (BYOK)',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  mistral: {
    label: 'Mistral AI (BYOK)',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
  },
  ollama: {
    label: 'Ollama (Local Offline)',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2:latest',
  },
  lm_studio: {
    label: 'LM Studio (Local Offline)',
    defaultBaseUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
  },
  custom: {
    label: 'Custom OpenAI-Compatible',
    defaultBaseUrl: '',
    defaultModel: '',
  },
};

export interface AiProviderSettingsProps {
  candidateId?: string;
}

export function AiProviderSettings({ candidateId }: AiProviderSettingsProps) {
  const [mode, setMode] = React.useState<AiMode>('server');
  const [provider, setProvider] = React.useState<AiProvider>('server');
  const [baseUrl, setBaseUrl] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [modelId, setModelId] = React.useState('');
  const [configVersion, setConfigVersion] = React.useState(1);
  const [hasApiKey, setHasApiKey] = React.useState(false);
  const [maskedApiKey, setMaskedApiKey] = React.useState<string | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [showKey, setShowKey] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{
    ok: boolean;
    message?: string;
    error?: string;
    latencyMs?: number;
  } | null>(null);

  const fetchSettings = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/extension/ai/settings');
      if (res.ok) {
        const data = await res.json();
        setMode(data.mode || 'server');
        setProvider(data.provider || 'server');
        setBaseUrl(data.baseUrl || '');
        setModelId(data.modelId || '');
        setConfigVersion(data.configVersion || 1);
        setHasApiKey(Boolean(data.hasApiKey));
        setMaskedApiKey(data.maskedApiKey || null);
      }
    } catch {
      toast.error('Failed to load AI provider settings');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleProviderChange = (newProvider: AiProvider) => {
    setProvider(newProvider);
    const preset = PROVIDER_PRESETS[newProvider];
    if (preset) {
      if (preset.defaultBaseUrl) setBaseUrl(preset.defaultBaseUrl);
      if (preset.defaultModel) setModelId(preset.defaultModel);
      if (newProvider === 'ollama' || newProvider === 'lm_studio') {
        setMode('local');
      } else if (newProvider === 'server') {
        setMode('server');
      } else {
        if (mode === 'server' || mode === 'local') {
          setMode('portal_byok');
        }
      }
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setTestResult(null);

      const payload: Record<string, any> = {
        mode,
        provider,
        baseUrl: baseUrl.trim() || null,
        modelId: modelId.trim() || null,
        configVersion,
      };

      if (apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }

      const res = await fetch('/api/extension/ai/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 409) {
        toast.error('Configuration conflict. Reloading latest settings...');
        await fetchSettings();
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save settings');
      }

      const updated = await res.json();
      setConfigVersion(updated.configVersion);
      setHasApiKey(Boolean(updated.hasApiKey));
      setApiKey(''); // Clear plaintext input after successful save
      toast.success('AI provider settings saved');
      await fetchSettings();
    } catch (err: any) {
      toast.error(err.message || 'Error saving AI settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!baseUrl && mode !== 'server') {
      toast.error('Please specify a Base URL first');
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);

      const payload = mode === 'server'
        ? { mode }
        : { mode, provider, baseUrl, modelId, apiKey: apiKey.trim() || undefined };

      const res = await fetch('/api/extension/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setTestResult({
          ok: true,
          message: data.message || 'Connected successfully',
          latencyMs: data.latencyMs,
        });
        toast.success(`Connection verified (${data.latencyMs ?? 0}ms)`);
      } else {
        const errMsg = data.error || `HTTP ${res.status}`;
        setTestResult({
          ok: false,
          error: errMsg,
        });
        toast.error(`Connection failed: ${errMsg}`);
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        error: err.message,
      });
      toast.error(`Connection error: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-6 shadow-sm animate-pulse space-y-4">
        <div className="h-6 w-48 bg-muted rounded"></div>
        <div className="h-10 w-full bg-muted rounded"></div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold tracking-tight">AI Provider & Planning Settings</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure how NextKinHR and Recruiting Copilot resolve screening questions and career portal dropdowns.
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border border-border/50">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          <span>AES-256-GCM + AAD Isolated</span>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Execution Mode</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMode('server')}
            className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-colors ${
              mode === 'server'
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border/60 hover:bg-muted/50 text-muted-foreground'
            }`}
          >
            <Server className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div>
              <div className="text-sm font-semibold text-foreground">Server Managed (Default)</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Built-in NextKinHR intelligence powered by cloud server gateway.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('portal_byok')}
            className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-colors ${
              mode === 'portal_byok'
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border/60 hover:bg-muted/50 text-muted-foreground'
            }`}
          >
            <ShieldCheck className="h-5 w-5 mt-0.5 text-emerald-500 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-foreground">Portal Encrypted BYOK</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Encrypted in private database with AAD; proxied via socket-bound SSRF guard.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('extension_byok')}
            className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-colors ${
              mode === 'extension_byok'
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border/60 hover:bg-muted/50 text-muted-foreground'
            }`}
          >
            <Key className="h-5 w-5 mt-0.5 text-amber-500 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-foreground">Extension Direct BYOK</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Stored in browser session storage; queries upstream models directly from extension.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('local')}
            className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-colors ${
              mode === 'local'
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border/60 hover:bg-muted/50 text-muted-foreground'
            }`}
          >
            <Laptop className="h-5 w-5 mt-0.5 text-blue-500 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-foreground">Local Offline Model</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Direct connection to Ollama (localhost:11434) or LM Studio with zero cloud contact.
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Provider Selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Provider</label>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="server">NextKinHR Gateway</option>
            <option value="openrouter">OpenRouter (Recommended BYOK)</option>
            <option value="deepseek">DeepSeek API</option>
            <option value="openai">OpenAI (Official)</option>
            <option value="groq">Groq High-Speed</option>
            <option value="mistral">Mistral AI</option>
            <option value="ollama">Ollama (Local Offline)</option>
            <option value="lm_studio">LM Studio (Local Offline)</option>
            <option value="custom">Custom Endpoint</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Model ID</label>
          <Input
            type="text"
            placeholder="e.g. deepseek/deepseek-chat or gpt-4o-mini"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
          />
        </div>
      </div>

      {/* Base URL Input */}
      {mode !== 'server' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Base URL</label>
            <span className="text-xs text-muted-foreground">Socket-bound SSRF & SNI verified</span>
          </div>
          <Input
            type="url"
            placeholder="https://api.openai.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>
      )}

      {/* API Key Input */}
      {mode !== 'server' && mode !== 'local' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              API Key {hasApiKey && !apiKey && <span className="text-emerald-500 font-normal">(Configured)</span>}
            </label>
            {maskedApiKey && (
              <span className="text-xs text-muted-foreground font-mono">
                Active: {maskedApiKey}
              </span>
            )}
          </div>
          <div className="relative">
            <Input
              type={showKey ? 'text' : 'password'}
              placeholder={hasApiKey ? '•••••••••••••••• (Leave blank to keep current key)' : 'sk-...'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="pr-10 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Keys are encrypted using AES-256-GCM with your User ID and endpoint origin bound as authenticated data (AAD).
          </p>
        </div>
      )}

      {/* Test Result Display */}
      {testResult && (
        <div
          className={`p-3.5 rounded-lg border text-sm flex items-start gap-2.5 ${
            testResult.ok
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-destructive/10 border-destructive/20 text-destructive'
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
          )}
          <div>
            <div className="font-semibold">
              {testResult.ok ? 'Connection Verified' : 'Connection Test Failed'}
            </div>
            <div className="text-xs mt-0.5">
              {testResult.ok
                ? `${testResult.message} (${testResult.latencyMs}ms)`
                : testResult.error}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTestConnection}
          disabled={testing || saving}
        >
          {testing ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Testing...
            </>
          ) : (
            'Test Connection'
          )}
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={saving || testing}
        >
          {saving ? 'Saving...' : 'Save AI Settings'}
        </Button>
      </div>
    </div>
  );
}

export default AiProviderSettings;
