/* MCP Operator workflows UI only. Loaded by /dashboard/mcp — do not use the Agent React bundle path. */
(function () {
  var BASE = typeof window !== 'undefined' && window.location && window.location.origin ? window.location.origin : '';

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(s) {
    return String(s || '')
      .replace(/'/g, '&#39;')
      .replace(/"/g, '&quot;');
  }

  function workflowToast(msg, kind) {
    var t = document.getElementById('mcpToast');
    if (!t) return;
    t.textContent = msg;
    t.style.background = kind === 'error' ? 'var(--danger)' : 'var(--bg-panel)';
    t.classList.add('show');
    setTimeout(function () {
      t.classList.remove('show');
    }, 3500);
  }

  function openWorkflowRunsPanel(title, html) {
    var modal = document.getElementById('workflowRunsModal');
    var backdrop = document.getElementById('workflowRunsBackdrop');
    var body = document.getElementById('workflowRunsBody');
    var tEl = document.getElementById('workflowRunsTitle');
    if (!modal || !body) return;
    if (tEl) tEl.textContent = title || 'Workflow Run History';
    body.innerHTML = html;
    if (backdrop) backdrop.removeAttribute('hidden');
    modal.removeAttribute('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeWorkflowRunsPanel() {
    var modal = document.getElementById('workflowRunsModal');
    var backdrop = document.getElementById('workflowRunsBackdrop');
    if (backdrop) backdrop.setAttribute('hidden', '');
    if (modal) {
      modal.setAttribute('hidden', '');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  window.renderWorkflowList = function (workflows) {
    var container = document.getElementById('workflows-list');
    if (!container) return;
    if (!Array.isArray(workflows) || !workflows.length) {
      container.innerHTML = '<p class="text-secondary">No workflows defined yet.</p>';
      return;
    }
    container.innerHTML = workflows
      .map(function (wf) {
        var cat = wf.category ? '<span>' + escHtml(wf.category) + '</span> · ' : '';
        var active = wf.status === 'active';
        return (
          '<div class="workflow-card surface-card" data-id="' +
          escAttr(wf.id) +
          '">' +
          '<div class="workflow-header">' +
          '<span class="workflow-name">' +
          escHtml(wf.name) +
          '</span>' +
          '<span class="status-badge status-' +
          escAttr(wf.status || '') +
          '">' +
          escHtml(wf.status || '') +
          '</span>' +
          '</div>' +
          '<div class="workflow-meta">' +
          cat +
          '<span>' +
          escHtml(wf.trigger_type || '') +
          '</span> · <span>' +
          Number(wf.run_count || 0) +
          ' runs</span> · <span>' +
          Number(wf.success_count || 0) +
          ' succeeded</span>' +
          '</div>' +
          '<div class="workflow-actions">' +
          '<button type="button" class="btn-run"' +
          (active ? '' : ' disabled') +
          ' data-wf-run="' +
          escAttr(wf.id) +
          '">Run</button>' +
          '<button type="button" class="btn-secondary workflow-btn-history" data-wf-history="' +
          escAttr(wf.id) +
          '">History</button>' +
          '</div></div>'
        );
      })
      .join('');

    container.querySelectorAll('[data-wf-run]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-wf-run');
        if (id) window.triggerWorkflow(id);
      });
    });
    container.querySelectorAll('[data-wf-history]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-wf-history');
        if (id) window.viewWorkflowRuns(id);
      });
    });
  };

  window.loadMcpWorkflows = function () {
    return fetch(BASE + '/api/mcp/workflows', { credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (x) {
        if (!x.res.ok) {
          workflowToast((x.data && x.data.error) || 'Failed to load workflows', 'error');
          window.renderWorkflowList([]);
          return;
        }
        var workflows = Array.isArray(x.data) ? x.data : [];
        window.renderWorkflowList(workflows);
      })
      .catch(function () {
        workflowToast('Failed to load workflows', 'error');
        window.renderWorkflowList([]);
      });
  };

  window.triggerWorkflow = function (workflow_id) {
    var card = document.querySelector('.workflow-card[data-id="' + workflow_id + '"]');
    var btn = card ? card.querySelector('.btn-run') : null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Running...';
    }
    return fetch(BASE + '/api/mcp/workflows/' + encodeURIComponent(workflow_id) + '/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ triggered_by: 'operator_panel' }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (x) {
        if (!x.res.ok) {
          workflowToast((x.data && x.data.error) || 'Run failed', 'error');
          return;
        }
        workflowToast('Run started: ' + (x.data.run_id || ''));
        setTimeout(function () {
          window.viewWorkflowRuns(workflow_id);
        }, 1500);
      })
      .catch(function () {
        workflowToast('Failed to trigger workflow', 'error');
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Run';
        }
      });
  };

  window.viewWorkflowRuns = function (workflow_id) {
    return fetch(BASE + '/api/mcp/workflows/' + encodeURIComponent(workflow_id) + '/runs', {
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (x) {
        if (!x.res.ok) {
          workflowToast((x.data && x.data.error) || 'Failed to load runs', 'error');
          return;
        }
        var runs = x.data;
        if (!Array.isArray(runs)) {
          workflowToast('Invalid response', 'error');
          return;
        }
        var html = runs.length
          ? runs
              .map(function (r) {
                var st = escHtml(r.status || '');
                var started =
                  r.started_at != null
                    ? new Date(Number(r.started_at) * 1000).toLocaleString()
                    : '--';
                var dur = r.duration_ms != null ? String(r.duration_ms) + 'ms' : '--';
                return (
                  '<div class="run-row">' +
                  '<span class="status-badge status-' +
                  escAttr(r.status || '') +
                  '">' +
                  st +
                  '</span>' +
                  '<span>' +
                  escHtml(r.triggered_by || '') +
                  '</span>' +
                  '<span>' +
                  escHtml(dur) +
                  '</span>' +
                  '<span>' +
                  escHtml(started) +
                  '</span>' +
                  '</div>'
                );
              })
              .join('')
          : '<p class="text-secondary">No runs yet.</p>';
        openWorkflowRunsPanel('Workflow Run History', html);
      })
      .catch(function () {
        workflowToast('Failed to load run history', 'error');
      });
  };

  document.addEventListener('DOMContentLoaded', function () {
    var closeBtn = document.getElementById('workflowRunsClose');
    var backdrop = document.getElementById('workflowRunsBackdrop');
    if (closeBtn) closeBtn.addEventListener('click', closeWorkflowRunsPanel);
    if (backdrop) backdrop.addEventListener('click', closeWorkflowRunsPanel);
    var refresh = document.getElementById('mcpWorkflowsRefresh');
    if (refresh) refresh.addEventListener('click', function () { window.loadMcpWorkflows(); });
  });
})();
