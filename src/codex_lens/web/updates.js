/* Update status for the optional release supervisor. */
window.LensUpdates = (() => {
  const badge = document.getElementById('lens-update-pill');
  const panel = document.getElementById('lens-update-popover');
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
  let current = {};
  let open = false;
  let busy = '';
  let failure = '';
  const zh = () => document.documentElement.lang !== 'en';
  const action = (id,label) => '<button type="button" class="btn-sm" data-lens-update="' + id + '"' +
    (busy ? ' disabled' : '') + '>' + escape(label) + '</button>';

  function settings() {
    if (!current.managed) return '';
    const labels = zh() ? {off:'关闭',notify:'仅提醒',auto:'自动更新'} :
      {off:'Off',notify:'Notify',auto:'Automatic'};
    return '<section class="set-section"><div class="set-title-row"><h3 class="set-title">' +
      (zh() ? '版本与更新' : 'Version and updates') +
      '</h3></div><div class="set-card"><div class="set-mod-row"><span class="pill outline">v' +
      escape(current.version) + '</span><label class="select"><select data-lens-update-mode aria-label="' +
      (zh() ? '更新策略' : 'Update mode') + '">' +
      Object.entries(labels).map(([key,value]) => '<option value="' + key + '"' +
        (key===current.mode?' selected':'') + '>' + value + '</option>').join('') +
      '</select></label>' + action('check',zh()?'检查更新':'Check for update') +
      (current.previous ? action('rollback',zh()?'回滚':'Roll back') : '') + '</div></div></section>';
  }

  function render() {
    const visible = current.managed && current.latest;
    badge.classList.toggle('hidden', !visible && !open);
    badge.textContent = visible ? '↑ ' + current.latest : 'v' + (current.version || '');
    badge.classList.toggle('ready', Boolean(current.staged));
    badge.setAttribute('aria-expanded',String(open));
    panel.classList.toggle('hidden', !open);
    if (!open) return;
    panel.innerHTML = '<div class="model-item-top"><strong>Codex Lens v' + escape(current.version) +
      '</strong><button class="btn-link" data-lens-update="close">' + (zh()?'关闭':'Close') + '</button></div>' +
      (current.latest ? '<div class="pill accent">' + escape(current.latest) +
        (current.staged ? (zh()?' · 已验证':' · Verified') : '') + '</div>' :
        '<div class="muted-note">' + (zh()?'当前暂无新版本':'No newer stable release') + '</div>') +
      (current.latest && current.notes ? '<pre class="lens-release-notes">' + escape(current.notes) + '</pre>' : '') +
      (failure ? '<div class="banner error">' + escape(failure) + '</div>' : '') +
      (busy ? '<div class="muted-note">' + (zh()?'正在处理…':'Working…') + '</div>' : '') +
      '<div class="toolbar-inline">' + action('check',zh()?'检查更新':'Check') +
      (current.latest && !current.staged ? action('stage',zh()?'下载并验证':'Download and verify') : '') +
      (current.staged ? action('apply',zh()?'重启看板应用':'Restart Lens to apply') : '') +
      (current.previous ? action('rollback',zh()?'回滚':'Roll back') : '') + '</div>';
  }

  async function getStatus() {
    try {
      const response = await fetch('/api/update/status',{cache:'no-store'});
      if (!response.ok) return;
      current = await response.json();
      render();
    } catch (_) {}
  }

  async function waitForActivation(oldVersion) {
    for (let i=0; i<35; i++) {
      await new Promise(resolve=>setTimeout(resolve,750));
      try {
        const response = await fetch('/api/health',{cache:'no-store'});
        if (response.ok && (await response.json()).version !== oldVersion) {
          location.reload();
          return;
        }
      } catch (_) {}
    }
    await getStatus();
    failure = zh() ? '启动未切到目标版本。请查看当前版本与回滚状态。' :
      'Lens did not switch to the requested version. Check the current version and rollback status.';
  }

  badge.addEventListener('click',()=>{open=!open; render();});
  document.addEventListener('keydown',event=>{
    if (event.key==='Escape' && open) {open=false; render();}
  });
  document.addEventListener('click',async (event)=>{
    const button = event.target.closest('[data-lens-update]');
    if (!button) return;
    const task = button.dataset.lensUpdate;
    if (task==='close') {open=false; render(); return;}
    if (busy) return;
    if ((task==='apply' || task==='rollback') && !window.confirm(zh() ?
      '重启 Codex Lens 以切换版本？' : 'Restart Codex Lens to switch releases?')) return;
    const before = current.version;
    failure = '';
    busy = task;
    open = true;
    render();
    try {
      const response = await fetch('/api/update/'+task,{method:'POST'});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || response.status);
      if (result.pending) await waitForActivation(before);
      else await getStatus();
    } catch (err) { failure = err.message; }
    finally { busy=''; render(); }
  });
  document.addEventListener('change', async (event)=>{
    if (!event.target.matches('[data-lens-update-mode]')) return;
    try {
      const response = await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({updateMode:event.target.value})});
      if (!response.ok) throw new Error(String(response.status));
      await getStatus();
    } catch (error) {
      failure = error.message;
      open = true;
      render();
    }
  });
  void getStatus();
  setInterval(()=>{ if(document.visibilityState==='visible') void getStatus(); },30000);
  return {settings};
})();
