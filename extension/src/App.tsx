import React, { useEffect, useState, useRef } from 'react';
import { RunnerState, SidebarResponse, SidebarRequest, StepStatus, HistoryItem, ReplayTimelineItem } from '@flowly/shared';

function App() {
  const [runnerState, setRunnerState] = useState<RunnerState>({
    goal: '',
    status: 'idle',
    plan: null,
    currentStepIndex: null,
    stepStatuses: [],
    logs: [],
    pageTitle: '',
    pageUrl: '',
    startedAt: null,
    finishedAt: null,
    history: []
  });

  const [inputGoal, setInputGoal] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [inspectorStepIndex, setInspectorStepIndex] = useState<number>(0);

  const portRef = useRef<chrome.runtime.Port | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Connect to Background service worker port
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'flowly-sidebar' });
    portRef.current = port;

    port.onMessage.addListener((message: SidebarResponse) => {
      console.log('[Flowly Sidebar] Received message:', message);
      if (message.type === 'STATE_SYNC') {
        setRunnerState(message.state);
        // Pre-fill input if there's an ongoing goal and input is empty
        if (message.state.goal && !inputGoal) {
          setInputGoal(message.state.goal);
        }
      }
    });

    // Request initial state synchronization
    port.postMessage({ type: 'GET_STATE' } as SidebarRequest);

    return () => {
      port.disconnect();
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [runnerState.logs]);

  // Handle actions
  const handleGeneratePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputGoal.trim()) return;
    portRef.current?.postMessage({ type: 'GENERATE_PLAN', goal: inputGoal } as SidebarRequest);
  };

  const handleApprove = () => {
    portRef.current?.postMessage({ type: 'APPROVE_RUN' } as SidebarRequest);
  };

  const handleCancel = () => {
    portRef.current?.postMessage({ type: 'CANCEL_RUN' } as SidebarRequest);
  };

  const handleClearHistory = () => {
    if (window.confirm('Are you sure you want to clear all execution history?')) {
      portRef.current?.postMessage({ type: 'CLEAR_HISTORY' } as SidebarRequest);
      setSelectedRunId(null);
    }
  };

  const { status, plan, stepStatuses, stepResults, currentStepIndex, logs, pageTitle, pageUrl, startedAt, finishedAt } = runnerState;

  const isPlanning = status === 'parsing' || status === 'planning';
  const isExecuting = status === 'executing';
  const hasPlan = plan && plan.steps.length > 0;

  // Determine confidence color details
  const confidence = plan?.confidence ?? 0;
  const confidenceColor = 
    confidence >= 0.8 ? 'var(--success)' : 
    confidence >= 0.5 ? 'var(--warning)' : 
    'var(--error)';

  const selectedRun = (runnerState.history || []).find(h => h.id === selectedRunId);

  const renderHistoryList = () => {
    const historyList = runnerState.history || [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', animation: 'fadeIn 0.2s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>Past Runs</span>
          {historyList.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="interactive-btn"
              style={{
                background: 'rgba(244, 63, 94, 0.1)',
                color: 'var(--error)',
                border: '1px solid rgba(244, 63, 94, 0.2)',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Clear All
            </button>
          )}
        </div>

        {historyList.length === 0 ? (
          <div className="glass-panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5, marginBottom: '8px' }}>
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
            </svg>
            <div style={{ fontSize: '13px' }}>No execution history recorded yet.</div>
            <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.8 }}>Completed runs will appear here.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
            {historyList.map((item) => {
              const date = new Date(item.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              const time = new Date(item.startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
              const isSuccess = item.status === 'success';
              const isAborted = item.status === 'aborted';
              
              const statusColor = isSuccess ? 'var(--success)' : isAborted ? 'var(--warning)' : 'var(--error)';
              const statusSymbol = isSuccess ? '✓' : isAborted ? '⊘' : '✗';
              
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedRunId(item.id);
                    setInspectorStepIndex(0);
                  }}
                  className="glass-panel interactive-btn"
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    transition: 'all 0.2s',
                    border: '1px solid var(--border)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, overflow: 'hidden' }}>
                      <span style={{
                        color: statusColor,
                        fontWeight: 700,
                        fontSize: '14px',
                        width: '16px',
                        display: 'inline-block'
                      }}>{statusSymbol}</span>
                      <span style={{
                        fontWeight: 500,
                        fontSize: '12px',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        color: 'var(--text-main)'
                      }}>
                        {item.goal}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {(item.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                      {item.pageTitle || 'Active Page'}
                    </span>
                    <span>{date} {time}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderRunDetail = (run: HistoryItem) => {
    const isSuccess = run.status === 'success';
    const isAborted = run.status === 'aborted';
    const statusColor = isSuccess ? 'var(--success)' : isAborted ? 'var(--warning)' : 'var(--error)';
    const statusText = run.status.toUpperCase();

    const activeStep = run.timeline[inspectorStepIndex];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', animation: 'fadeIn 0.2s' }}>
        {/* Back header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => setSelectedRunId(null)}
            className="interactive-btn"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-blue)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: 0
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
            Back to History
          </button>
          
          <button
            onClick={() => {
              const trace = {
                version: 1,
                id: run.id,
                goal: run.goal,
                status: run.status,
                startedAt: run.startedAt,
                finishedAt: run.finishedAt,
                durationMs: run.durationMs,
                pageUrl: run.pageUrl,
                pageTitle: run.pageTitle,
                plan: run.plan,
                stepResults: run.stepResults,
                timeline: run.timeline
              };
              const blob = new Blob([JSON.stringify(trace, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `flowly-trace-${run.id.substring(0, 8)}-${Date.now()}.json`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            }}
            className="interactive-btn"
            style={{
              background: 'rgba(99, 102, 241, 0.1)',
              color: '#fff',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            Export Trace
          </button>
        </div>

        {/* Run Summary Card */}
        <div className="glass-panel" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Goal</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px', lineHeight: '1.3' }}>
              {run.goal}
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
            <div>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</span>
              <div style={{ fontSize: '11px', fontWeight: 700, color: statusColor }}>{statusText}</div>
            </div>
            <div>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Duration</span>
              <div style={{ fontSize: '11px', fontWeight: 600 }}>{(run.durationMs / 1000).toFixed(1)}s</div>
            </div>
            <div>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Actions</span>
              <div style={{ fontSize: '11px', fontWeight: 600 }}>{run.timeline.length} steps</div>
            </div>
            <div>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Page</span>
              <div
                style={{ fontSize: '11px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}
                title={run.pageUrl}
              >
                {run.pageUrl ? new URL(run.pageUrl).hostname : 'N/A'}
              </div>
            </div>
          </div>
        </div>

        {/* Timeline Inspector Step Viewer */}
        <div className="glass-panel" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Timeline Inspector</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              Step {inspectorStepIndex + 1} of {run.timeline.length}
            </span>
          </div>

          {/* Navigation Controls */}
          {run.timeline.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Step Details Box */}
              {activeStep ? (
                <div style={{
                  padding: '10px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  {/* Action Summary */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600, fontSize: '12px', textTransform: 'capitalize', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: activeStep.executed ? (activeStep.success ? 'var(--success)' : 'var(--error)') : 'var(--text-muted)'
                        }} />
                        {activeStep.type}
                        {activeStep.elementId && (
                          <code style={{ fontSize: '10px', color: 'var(--accent-blue)', background: 'rgba(14, 165, 233, 0.1)', padding: '1px 4px', borderRadius: '3px' }}>
                            {activeStep.elementId}
                          </code>
                        )}
                      </div>
                      
                      {activeStep.executed && activeStep.durationMs !== undefined && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {activeStep.durationMs >= 1000 ? `${(activeStep.durationMs / 1000).toFixed(1)}s` : `${activeStep.durationMs}ms`}
                        </span>
                      )}
                    </div>
                    {activeStep.value && (
                      <div style={{ fontSize: '11px', color: 'var(--text-main)', fontFamily: 'monospace', opacity: 0.9, marginTop: '4px', wordBreak: 'break-all', padding: '4px 6px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                        Value: "{activeStep.value}"
                      </div>
                    )}
                  </div>

                  {/* Reasoning */}
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: '1.4' }}>
                    <strong>Reasoning:</strong> {activeStep.reasoning}
                  </div>

                  {/* Node details */}
                  {(activeStep.nodeRole || activeStep.nodeText) && (
                    <div style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      borderTop: '1px dashed var(--border)',
                      paddingTop: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px'
                    }}>
                      <div style={{ fontWeight: 600 }}>Scraped Target Info:</div>
                      {activeStep.nodeRole && <div>Role: <strong style={{ color: 'var(--text-main)' }}>{activeStep.nodeRole}</strong></div>}
                      {activeStep.nodeText && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Text: <span style={{ fontStyle: 'italic', color: 'var(--text-main)' }}>"{activeStep.nodeText}"</span></div>}
                    </div>
                  )}

                  {/* URL change inline indicator */}
                  {activeStep.executed && activeStep.beforeUrl !== activeStep.afterUrl && (
                    <div style={{
                      padding: '6px',
                      borderRadius: '4px',
                      background: 'rgba(14, 165, 233, 0.05)',
                      border: '1px solid rgba(14, 165, 233, 0.1)',
                      fontSize: '10px',
                      color: 'var(--accent-blue)'
                    }}>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                        </svg>
                        Navigation Detected:
                      </div>
                      <div style={{ wordBreak: 'break-all', opacity: 0.8, fontFamily: 'monospace', fontSize: '9px' }}>
                        {activeStep.beforeUrl} <span style={{ color: '#fff' }}>→</span> {activeStep.afterUrl}
                      </div>
                    </div>
                  )}

                  {/* Errors */}
                  {!activeStep.success && activeStep.error && (
                    <div style={{
                      padding: '6px 8px',
                      borderRadius: '4px',
                      background: 'rgba(244, 63, 94, 0.05)',
                      border: '1px solid rgba(244, 63, 94, 0.15)',
                      fontSize: '10px',
                      color: 'var(--error)',
                      wordBreak: 'break-word',
                      lineHeight: '1.4'
                    }}>
                      <strong>Error:</strong> {activeStep.error}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Sequential inspection buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  disabled={inspectorStepIndex === 0}
                  onClick={() => setInspectorStepIndex(prev => Math.max(0, prev - 1))}
                  className="interactive-btn"
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '8px',
                    color: 'var(--text-main)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: inspectorStepIndex === 0 ? 'not-allowed' : 'pointer',
                    opacity: inspectorStepIndex === 0 ? 0.4 : 1
                  }}
                >
                  Previous Step
                </button>
                <button
                  disabled={inspectorStepIndex === run.timeline.length - 1}
                  onClick={() => setInspectorStepIndex(prev => Math.min(run.timeline.length - 1, prev + 1))}
                  className="interactive-btn"
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '8px',
                    color: 'var(--text-main)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: inspectorStepIndex === run.timeline.length - 1 ? 'not-allowed' : 'pointer',
                    opacity: inspectorStepIndex === run.timeline.length - 1 ? 0.4 : 1
                  }}
                >
                  Next Step
                </button>
              </div>

              {/* Horizontal mini timeline step indicators */}
              <div style={{
                display: 'flex',
                gap: '4px',
                justifyContent: 'center',
                alignItems: 'center',
                overflowX: 'auto',
                padding: '4px 0'
              }}>
                {run.timeline.map((step, idx) => {
                  const isCurrent = idx === inspectorStepIndex;
                  const stepSuccess = step.executed ? step.success : undefined;
                  
                  let dotColor = 'var(--text-muted)';
                  if (stepSuccess === true) dotColor = 'var(--success)';
                  if (stepSuccess === false) dotColor = 'var(--error)';
                  
                  return (
                    <button
                      key={idx}
                      onClick={() => setInspectorStepIndex(idx)}
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        border: isCurrent ? '2px solid #fff' : '1px solid var(--border)',
                        background: dotColor,
                        padding: 0,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        fontWeight: 'bold',
                        color: '#000',
                        opacity: isCurrent ? 1 : 0.7
                      }}
                      title={`Step ${idx + 1}: ${step.type}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '12px', textAlign: 'center', padding: '12px' }}>
              No steps in this run.
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      width: '360px',
      minHeight: '600px',
      padding: '16px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      background: 'var(--bg-dark)',
      fontSize: '14px'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 12px var(--primary-glow)'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 700, letterSpacing: '0.5px' }}>Flowly</h1>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Browser Control Agent</span>
          </div>
        </div>

        {/* Status Badge */}
        <div style={{
          padding: '4px 8px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: 600,
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: 
              status === 'idle' ? 'var(--text-muted)' :
              status === 'success' ? 'var(--success)' :
              status === 'failed' ? 'var(--error)' :
              'var(--accent-blue)',
            boxShadow: isPlanning || isExecuting ? '0 0 8px var(--accent-blue)' : 'none'
          }} />
          <span style={{ textTransform: 'capitalize' }}>
            {status === 'waiting_approval' ? 'Waiting Approval' : status}
          </span>
        </div>
      </div>

      {/* Tab Selector */}
      <div style={{
        display: 'flex',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: '8px',
        padding: '2px',
        border: '1px solid var(--border)',
        marginTop: '-4px'
      }}>
        <button
          onClick={() => setActiveTab('active')}
          className="interactive-btn"
          style={{
            flex: 1,
            background: activeTab === 'active' ? 'var(--bg-card)' : 'none',
            border: 'none',
            color: activeTab === 'active' ? 'var(--text-main)' : 'var(--text-muted)',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Active Run
        </button>
        <button
          onClick={() => {
            setActiveTab('history');
            setSelectedRunId(null); // Reset detail view when clicking history tab directly
          }}
          className="interactive-btn"
          style={{
            flex: 1,
            background: activeTab === 'history' ? 'var(--bg-card)' : 'none',
            border: 'none',
            color: activeTab === 'history' ? 'var(--text-main)' : 'var(--text-muted)',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          History ({runnerState.history?.length || 0})
        </button>
      </div>

      {activeTab === 'active' ? (
        <>
          {/* Target Tab Grounding */}
          {(pageTitle || pageUrl) && (
            <div className="glass-panel" style={{ padding: '8px 12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
              </svg>
              <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: '11px', flex: 1 }}>
                <div style={{ color: 'var(--text-main)', fontWeight: 500 }}>{pageTitle || 'Active Page'}</div>
                <div style={{ color: 'var(--text-muted)' }}>{pageUrl}</div>
              </div>
            </div>
          )}

          {/* Goal Form */}
          <form onSubmit={handleGeneratePlan} className="glass-panel" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Define Agent Goal
            </div>
            <textarea
              placeholder="e.g. Search for 'react design pattern' on Reddit..."
              value={inputGoal}
              onChange={(e) => setInputGoal(e.target.value)}
              disabled={isPlanning || isExecuting || status === 'waiting_approval'}
              style={{
                width: '100%',
                height: '60px',
                background: 'rgba(0, 0, 0, 0.2)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '8px',
                color: 'var(--text-main)',
                fontSize: '13px',
                fontFamily: 'inherit',
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--border-focus)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
            />
            
            {status === 'idle' || status === 'success' || status === 'failed' ? (
              <button
                type="submit"
                disabled={!inputGoal.trim()}
                className="interactive-btn"
                style={{
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
                  color: '#fff',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px var(--primary-glow)'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                Generate Plan
              </button>
            ) : (
              (isPlanning || status === 'waiting_approval') && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="interactive-btn"
                  style={{
                    background: 'rgba(244, 63, 94, 0.1)',
                    color: 'var(--error)',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    padding: '10px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  </svg>
                  Cancel Goal
                </button>
              )
            )}
          </form>

          {/* Planning Spinner Indicator */}
          {isPlanning && (
            <div className="glass-panel fade-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <div style={{
                width: '28px',
                height: '28px',
                border: '3px solid rgba(255, 255, 255, 0.05)',
                borderTopColor: 'var(--accent-blue)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }} />
              <style>{`
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
              `}</style>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 500 }}>
                  {status === 'parsing' ? 'Scanning Web Page...' : 'Formulating Actions...'}
                </span>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Executing DOM perception analysis
                </p>
              </div>
            </div>
          )}

          {/* Plan Visualization */}
          {hasPlan && (status === 'waiting_approval' || isExecuting || status === 'success' || status === 'failed') && (
            <div className="glass-panel fade-in" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              {/* Plan Header & Confidence */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2"/>
                  </svg>
                  <span style={{ fontWeight: 600 }}>Proposed Action Plan</span>
                </div>
                
                {/* Confidence Display */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: `${confidenceColor}15`,
                  border: `1px solid ${confidenceColor}30`,
                  fontSize: '11px',
                  fontWeight: 500,
                  color: confidenceColor
                }}>
                  <span>{Math.round(confidence * 100)}% Confident</span>
                </div>
              </div>

              {/* Reasoning */}
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4', background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <strong>Reasoning:</strong> {plan.reasoning}
              </div>

              {/* Sequential Steps List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {plan.steps.map((step, idx) => {
                  const stepStatus = stepStatuses[idx] || 'pending';
                  const isCurrent = idx === currentStepIndex;

                  return (
                    <div key={idx} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '8px',
                      borderRadius: '6px',
                      background: isCurrent ? 'rgba(99, 102, 241, 0.06)' : 'rgba(255,255,255,0.01)',
                      border: `1px solid ${isCurrent ? 'var(--primary-glow)' : 'var(--border)'}`,
                      transition: 'all 0.2s'
                    }}>
                      {/* Status Indicator Icon */}
                      <div style={{ marginTop: '2px' }}>
                        {stepStatus === 'pending' && (
                          <span style={{ display: 'block', width: '12px', height: '12px', borderRadius: '50%', border: '2px solid var(--text-muted)' }} />
                        )}
                        {stepStatus === 'running' && (
                          <div style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            border: '2px solid var(--accent-blue)',
                            borderTopColor: 'transparent',
                            animation: 'spin 0.8s linear infinite'
                          }} />
                        )}
                        {stepStatus === 'success' && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                        {stepStatus === 'failed' && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        )}
                      </div>

                      {/* Step Description */}
                      <div style={{ flex: 1, fontSize: '12px' }}>
                        <div style={{ fontWeight: 600, textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>Step {idx + 1}: {step.type}</span>
                          {step.elementId && <code style={{ fontSize: '10px', color: 'var(--accent-blue)', background: 'rgba(14, 165, 233, 0.1)', padding: '1px 4px', borderRadius: '3px' }}>{step.elementId}</code>}
                          {stepResults && stepResults[idx] && (
                            <span style={{
                              fontSize: '10px',
                              color: 'var(--text-muted)',
                              marginLeft: 'auto',
                              background: 'rgba(255,255,255,0.05)',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              fontFamily: "'JetBrains Mono', monospace"
                            }}>
                              {stepResults[idx].durationMs >= 1000 
                                ? `${(stepResults[idx].durationMs / 1000).toFixed(1)}s` 
                                : `${stepResults[idx].durationMs}ms`}
                            </span>
                          )}
                        </div>
                        {step.value && <div style={{ color: 'var(--text-main)', opacity: 0.9, marginTop: '2px', fontFamily: 'monospace', wordBreak: 'break-all' }}>Value: "{step.value}"</div>}
                        <div style={{ color: 'var(--text-muted)', marginTop: '2px', fontSize: '11px', fontStyle: 'italic' }}>{step.reasoning}</div>
                        
                        {/* Show element details if validated */}
                        {stepResults && stepResults[idx] && (stepResults[idx].nodeRole || stepResults[idx].nodeText) && (
                          <div style={{
                            marginTop: '4px',
                            fontSize: '10px',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            gap: '6px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            border: '1px solid var(--border)'
                          }}>
                            {stepResults[idx].nodeRole && (
                              <span>Role: <strong>{stepResults[idx].nodeRole}</strong></span>
                            )}
                            {stepResults[idx].nodeText && (
                              <span style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '180px'
                              }}>
                                Text: "<em>{stepResults[idx].nodeText}</em>"
                              </span>
                            )}
                          </div>
                        )}

                        {/* Show navigation details inline if detected */}
                        {stepResults && stepResults[idx] && stepResults[idx].beforeUrl !== stepResults[idx].afterUrl && (
                          <div style={{
                            marginTop: '4px',
                            padding: '4px 6px',
                            borderRadius: '4px',
                            background: 'rgba(14, 165, 233, 0.04)',
                            border: '1px solid rgba(14, 165, 233, 0.1)',
                            fontSize: '10px',
                            color: 'var(--accent-blue)',
                            lineHeight: '1.3'
                          }}>
                            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                              </svg>
                              Navigation Detected:
                            </div>
                            <div style={{ wordBreak: 'break-all', opacity: 0.8, marginTop: '2px', fontFamily: "'JetBrains Mono', monospace" }}>
                              {stepResults[idx].beforeUrl} → {stepResults[idx].afterUrl}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Execution approval controls */}
              {status === 'waiting_approval' && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    onClick={handleApprove}
                    className="interactive-btn"
                    style={{
                      flex: 1,
                      background: 'var(--success)',
                      color: '#fff',
                      border: 'none',
                      padding: '10px',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 12px var(--success-glow)'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Approve & Run
                  </button>
                  <button
                    onClick={handleCancel}
                    className="interactive-btn"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border)',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      fontWeight: 500,
                      cursor: 'pointer'
                    }}
                  >
                    Reject
                  </button>
                </div>
              )}

              {isExecuting && (
                <button
                  onClick={handleCancel}
                  className="interactive-btn glow-active"
                  style={{
                    width: '100%',
                    background: 'var(--error)',
                    color: '#fff',
                    border: 'none',
                    padding: '10px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px var(--error-glow)'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  </svg>
                  Cancel Run
                </button>
              )}

              {/* Total execution duration summary */}
              {(status === 'success' || status === 'failed') && startedAt && finishedAt && (
                <div style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: '1px solid var(--border)',
                  paddingTop: '8px',
                  marginTop: '4px'
                }}>
                  <span>Execution Summary:</span>
                  <span style={{ fontWeight: 600, color: status === 'success' ? 'var(--success)' : 'var(--error)' }}>
                    {status === 'success' ? 'Completed' : 'Failed'} in {((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000).toFixed(1)}s
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Live Logs console */}
          <div className="glass-panel" style={{
            flex: 1,
            minHeight: '180px',
            maxHeight: '260px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '6px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2.5">
                  <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
                </svg>
                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Live Logs</span>
              </div>
              {logs.length > 0 && (
                <button
                  onClick={() => setRunnerState(prev => ({ ...prev, logs: [] }))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '10px',
                    cursor: 'pointer',
                    padding: '2px 4px'
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Console Viewer */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '6px',
              padding: '8px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              lineHeight: '1.5',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '24px' }}>
                  No execution events recorded yet.
                </div>
              ) : (
                logs.map((log, idx) => {
                  const logColor = 
                    log.level === 'error' ? 'var(--error)' :
                    log.level === 'warn' ? 'var(--warning)' :
                    'var(--text-main)';
                  
                  return (
                    <div key={idx} style={{ wordBreak: 'break-word', display: 'flex', gap: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>[{log.timestamp}]</span>
                      <span style={{ color: logColor }}>{log.message}</span>
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </>
      ) : (
        selectedRunId && selectedRun ? renderRunDetail(selectedRun) : renderHistoryList()
      )}
    </div>
  );
}

export default App;
