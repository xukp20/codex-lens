/* Codex analysis panels using the AGY Lens card, segment and table styles. */
window.LensAnalytics = (() => {
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const pct = (v) => v == null ? '—' : (100 * v).toFixed(1) + '%';
  const usd = (v) => v == null ? '—' : '$' + Number(v).toFixed(2);
  const date = (v, lang) => new Date(v).toLocaleString(lang, {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
  const action = (id, label, on) => '<button type="button" data-obs-view="' + id +
    '" class="' + (on ? 'active' : '') + '" aria-pressed="' + on + '">' + escape(label) + '</button>';
  const select = (field, label, current, entries) => '<label class="select"><select data-obs-field="' + field +
    '" aria-label="' + escape(label) + '">' + entries.map(([id, name]) => '<option value="' + escape(id) +
      '"' + (id === current ? ' selected' : '') + '>' + escape(name) + '</option>').join('') + '</select></label>';
  const kpi = (label, value) => '<div class="kpi-tile"><span class="kpi-label">' + escape(label) +
    '</span><span class="kpi-val num mono">' + escape(value) + '</span></div>';

  function gapLabels(breaks) {
    const label = (s) => s % 3600 === 0 ? s / 3600 + 'h' : s % 60 === 0 ? s / 60 + 'm' : s + 's';
    return breaks.map((v, i) => i ? label(breaks[i - 1]) + '–' + label(v) : '≤' + label(v))
      .concat('>' + label(breaks.at(-1)));
  }

  function chart(series, label, bars = false) {
    const tones = ['var(--ch-cache)', 'var(--accent)', 'var(--warn)', 'var(--ch-think)'];
    return '<svg class="lens-series" viewBox="0 0 300 90" role="img" aria-label="' + escape(label) + '">' +
      '<path d="M8 10H292M8 45H292M8 80H292" stroke="var(--line)" fill="none"/>' +
      series.map((points, row) => {
        const xy = points.map(({v}, i) => [8 + i * 284 / Math.max(points.length - 1, 1), 80 - v * 70]);
        const color = tones[row % tones.length];
        const max = Math.max(1, ...points.map(p => p.n));
        return points.map((point, i) => {
          const [x,y] = xy[i];
          const prior = points[i - 1];
          const weak = point.n < 10;
          const bar = bars && point.n ? '<rect x="' + (x-2) + '" y="' + (80 - point.n / max * 22) +
            '" width="4" height="' + (point.n / max * 22) + '" fill="var(--fill)"/>' : '';
          const line = i && point.v != null && prior.v != null ? '<line x1="' + xy[i-1][0] + '" y1="' +
            xy[i-1][1] + '" x2="' + x + '" y2="' + y + '" stroke="' + color + '"' +
            (weak || prior.n < 10 ? ' stroke-dasharray="4 2"' : '') + '/>' : '';
          return bar + line + (point.v == null ? '' : '<circle cx="' + x + '" cy="' + y +
            '" r="2.4" fill="' + (weak ? 'var(--surface)' : color) + '" stroke="' + color + '"><title>' +
            escape(point.label + ' · ' + pct(point.v) + ' · n=' + point.n) + '</title></circle>');
        }).join('');
      }).join('') + '</svg>';
  }

  function events(rows, lang) {
    const zh = lang !== 'en';
    if (!rows.length) return '';
    return '<div class="card-expanded lens-anomalies">' + rows.slice(0, 12).map((e) => {
      const kind = e.kind === 'full' ? (zh ? '缓存全失' : 'Full miss') : (zh ? '部分下降' : 'Partial drop');
      const gap = e.idleMs == null ? e.recordedMs : e.idleMs;
      return '<div class="model-item"><div class="model-item-top"><span class="truncate">' +
        escape(e.model + ' · ' + date(e.time, lang)) + '</span><span class="pill warn">' + kind + '</span></div>' +
        '<div class="model-item-sub num"><span>' + [pct(e.previous), pct(e.hit), pct(e.next)].join(' → ') +
        '</span><span>' + (gap / 1000).toFixed(1) + 's · ' + (e.idleMs == null ? (zh ? '记录间隔' : 'observed interval') :
          (zh ? '轮间空闲' : 'idle')) + (e.recovered ? (zh ? ' · 已恢复' : ' · recovered') : '') + '</span></div></div>';
    }).join('') + '</div>';
  }

  function cache(data, options, expanded, lang) {
    const zh = lang !== 'en';
    if (!data) return {badges:'',body:'<div class="muted-note">' +
      (zh ? '等待用量数据' : 'Waiting for usage data') + '</div>'};
    const s = data.summary;
    const strip = '<div class="kpi-strip">' + kpi(zh ? '加权命中率' : 'Weighted hit', pct(s.weighted)) +
      kpi(zh ? '全失 / 部分下降' : 'Full / partial', s.full+' / '+s.partial) +
      kpi(zh ? '下一次恢复' : 'Recovered next', s.recovered) + '</div>';
    const badge = '<span class="pill outline num">n=' + s.n + '</span>';
    if (!expanded) return {badges:badge, body:strip};
    const buttons = [['matrix',zh ? '矩阵' : 'Matrix'],['timeline',zh ? '趋势' : 'Timeline'],
      ['compare',zh ? '对比' : 'Compare']].map(([id,label]) => action(id,label,options.view===id)).join('');
    const labels = gapLabels(data.breaks);
    const modelChoices = Array.from(new Set([options.model, ...options.models, ...data.matrix.map(row => row.model)]))
      .filter(Boolean).sort().map(name => [name,name]);
    const config = '<div class="toolbar-inline"><div class="seg">' + buttons + '</div>' +
      select('model', zh ? '模型' : 'Model', options.model, [['',zh ? '全部模型' : 'All models'],...modelChoices]) +
      '</div><div class="toolbar-inline">' +
      select('gap',zh ? '间隔类型' : 'Gap type',options.gap,[['idle',zh ? '轮间空闲' : 'Turn idle'],['recorded',zh ? '请求记录间隔' : 'Request interval']]) +
      select('active',zh ? '间隔范围' : 'Scope',options.active,[['0',zh ? '全部间隔' : 'All gaps'],['1','≤5m']]) +
      select('period',zh ? '时间粒度' : 'Period',options.period,['1h','5h','1d','7d'].map(x => [x,x])) +
      select('metric',zh ? '指标' : 'Metric',options.metric,[['weighted',zh ? '命中率' : 'Token hit'],['keep',zh ? '保活率' : 'Keep rate']]) +
      '<input class="lens-breaks" data-obs-field="breaks" aria-label="' + (zh ? '分桶秒数' : 'Bucket edges in seconds') +
      '" placeholder="10,60,300,600,3600" value="' + escape(options.breaks) + '">' +
      '<button type="button" class="btn-sm" data-obs-copy>' + (zh ? '复制摘要' : 'Copy summary') + '</button></div>';
    let content;
    if (options.view === 'matrix') {
      const cell = (item) => '<td><b>' + pct(item[options.metric]) + '</b><small>n=' + item.n + '</small></td>';
      content = '<div class="lens-table-wrap"><table class="lens-table"><thead><tr><th>Model</th><th>All</th>' +
        labels.map(x => '<th>' + escape(x) + '</th>').join('') + '</tr></thead><tbody>' +
        data.matrix.map(row => '<tr><th>' + escape(row.model + ' · ' + row.provider) + '</th>' +
          cell(row.total) + row.buckets.map(cell).join('') + '</tr>').join('') + '</tbody></table></div>';
    } else if (options.view === 'timeline') {
      const points = (metric) => data.timeline.map(row => ({
        v: metric === 'full' ? (row.n ? row.full / row.n : null) : row[metric],
        n:row.n, label:date(row.start, lang)
      }));
      content = '<div class="muted-note">' + (zh ? '加权命中率 / 全失率 · 空心点 n < 10' : 'Weighted hit / full miss rate · hollow when n < 10') +
        '</div>' + chart([points(options.metric)], 'Cache trend', true) +
        chart([points('full')], 'Full miss rate');
    } else {
      const available = data.compare.filter(period => period.summary.n);
      content = chart(available.map(row => row.buckets.map((cell, i) => ({
        v:cell[options.metric], n:cell.n, label:date(row.start, lang) + ' · ' + labels[i]
      }))), 'Period comparison') + '<div class="lens-periods">' + available.map((row, i) =>
        '<div class="metric-row"><span>' + escape(date(row.start, lang)) + '</span><span class="num mono">' +
        pct(row.summary[options.metric]) + ' · n=' + row.summary.n +
        (i ? ' · Δ ' + (((available[0].summary[options.metric] || 0) - (row.summary[options.metric] || 0))*100).toFixed(1) + ' pp' : '') +
        '</span></div>').join('') + '</div>';
    }
    const foot = '<div class="muted-note">' + (zh ? '参考丢失 token' : 'Reference lost tokens') + ' ' +
      s.lost.toLocaleString(lang) + ' · ' + usd(s.referenceCost) + '</div>';
    return {badges:badge, body:strip + '<div class="card-expanded">' + config +
      (s.n ? content + foot : '<div class="muted-note">' + (zh ? '此范围没有可比较样本' : 'No comparable samples in this range') + '</div>') +
      events(data.events, lang) + '</div>'};
  }

  function report(data, options, lang) {
    if (!data) return '';
    const clean = (s) => String(s).replace(/[|\r\n]/g, ' ');
    const s = data.summary;
    const lines = ['## Codex Lens cache observations', '',
      'Scope: ' + options.gap + ', ' + (options.active === '1' ? '≤5m' : 'all gaps'),
      'Comparable: ' + s.n + '; full misses: ' + s.full + '; partial drops: ' + s.partial + '; recovered: ' + s.recovered, ''];
    if (options.view === 'compare') {
      lines.push('| Period | Selected metric | Samples |', '|---|---:|---:|');
      for (const row of data.compare) if (row.summary.n) lines.push('| ' + date(row.start,lang) + ' | ' +
        pct(row.summary[options.metric]) + ' | ' + row.summary.n + ' |');
    } else {
      lines.push('| Provider / Model | Previous | Observed | Next |', '|---|---:|---:|---:|');
      for (const row of data.events) lines.push('| ' + clean(row.provider + ' / ' + row.model) + ' | ' +
        pct(row.previous) + ' | ' + pct(row.hit) + ' | ' + pct(row.next) + ' |');
    }
    return lines.join('\n');
  }

  const fits = new Map();
  function labKey(c) {
    return new URLSearchParams({account:c.account,bucket:c.id,reset:c.reset}).toString();
  }

  function fitResult(data, selected, lang) {
    const zh = lang !== 'en';
    if (!data) return '';
    if (data.error) return '<div class="banner error">' + escape(data.error) + '</div>';
    const names = data.candidates.map(row => [row.name,row.name]);
    const current = data.candidates.find(row => row.name === selected) || data.candidates[0];
    const labels = {
      candidate:zh ? '可比较' : 'Validated', exploratory:zh ? '仅探索' : 'Exploratory',
      insufficient:zh ? '样本不足' : 'Too few samples'
    };
    const maximum = Math.max(1, ...(current.observed || []), ...(current.predicted || []));
    const line = (items) => items?.map((v,i) => ({v:v/maximum,n:10,label:'#'+(i+1)+' · '+v.toFixed(2)+' pp'})) || [];
    return '<div class="muted-note">' + (zh ? '推荐 ' : 'Preferred ') + escape(data.recommended) +
      ' · n=' + data.samples + (zh ? ' · 排除 ' : ' · Excluded ') + data.excluded + '</div>' +
      '<div class="lens-table-wrap"><table class="lens-table"><thead><tr><th>Model</th><th>Holdout MAE (pp)</th><th>Status</th></tr></thead><tbody>' +
      data.candidates.map(row => '<tr><th>' + escape(row.name) + '</th><td>' +
        (row.holdoutMae == null ? '—' : row.holdoutMae.toFixed(2)) + '</td><td>' +
        labels[row.status] + '</td></tr>').join('') + '</tbody></table></div>' +
      select('fit-choice', zh ? '拟合组合' : 'Fit subset', current.name, names) +
      (current.params ? '<div class="lens-periods">' + Object.entries(current.params).map(([name,val]) =>
        '<div class="metric-row"><span>' + escape(name) + '</span><span class="num mono">' +
        val.value.toFixed(2) + ' [' + val.low.toFixed(2) + '–' + val.high.toFixed(2) + ']</span></div>').join('') +
        '<div class="muted-note">' + (zh ? '观测与预测 · 近似 95% 区间' : 'Observed and predicted · approximate 95% intervals') + '</div>' +
        chart([line(current.observed),line(current.predicted)], 'Observed / predicted') + '</div>' : '');
  }

  function extraQuota(cycle, lang) {
    const key = labKey(cycle);
    const state = fits.get(key);
    const zh = lang !== 'en';
    const label = zh ? '拟合实验室' : 'Calibration lab';
    return '<div class="lens-lab" data-fit-key="' + escape(key) + '">' +
      '<button type="button" class="btn-sm" data-fit-run>' + label + '</button>' +
      '<div class="lens-fit-result">' + fitResult(state?.data, state?.selected, lang) + '</div></div>';
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-fit-run]');
    if (!button) return;
    const lab = button.closest('.lens-lab');
    const key = lab.dataset.fitKey;
    const result = lab.querySelector('.lens-fit-result');
    const lang = document.documentElement.lang;
    button.disabled = true;
    result.textContent = lang === 'en' ? 'Fitting…' : '拟合中…';
    let data;
    try {
      const request = window.sidecar?.fetch || fetch;
      const reply = await request('/api/calibration?' + key,{method:'GET'});
      if (!reply.ok) throw new Error(reply.status);
      data = await reply.json();
    } catch (err) {
      data = {error:(lang === 'en' ? 'Fit unavailable: ' : '暂时无法拟合：') + err.message};
    }
    fits.set(key, {data,selected:data.recommended});
    const current = [...document.querySelectorAll('.lens-lab')].find(item => item.dataset.fitKey === key);
    if (current) {
      current.querySelector('[data-fit-run]').disabled = false;
      current.querySelector('.lens-fit-result').innerHTML = fitResult(data,data.recommended,lang);
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.dataset.obsField !== 'fit-choice') return;
    const lab = event.target.closest('.lens-lab');
    const state = fits.get(lab.dataset.fitKey);
    state.selected = event.target.value;
    lab.querySelector('.lens-fit-result').innerHTML = fitResult(state.data,state.selected,document.documentElement.lang);
  });

  function quota(data, lang) {
    const zh = lang !== 'en';
    const cycles = data.cycles || [];
    const days = data.dailyComparison || [];
    const num = x => x == null ? '—' : x.toLocaleString(lang);
    const coverage = days.length ? '<details class="lens-cycle"><summary>' +
      (zh ? '账户日用量与本机记录' : 'Account and locally attributed daily usage') +
      '</summary><div class="lens-table-wrap"><table class="lens-table"><thead><tr><th>' +
      (zh ? '日期 UTC' : 'Date UTC') + '</th><th>' + (zh ? '账户 tokens' : 'Account tokens') +
      '</th><th>' + (zh ? '本机 tokens' : 'Local tokens') + '</th></tr></thead><tbody>' +
      days.map(d => '<tr><th>' + escape(d.date) + '</th><td>' + num(d.accountTokens) +
        '</td><td>' + num(d.localTokens) + '</td></tr>').join('') + '</tbody></table></div></details>' : '';
    return '<div class="card-expanded">' + coverage + cycles.slice(0, 8).map(c => {
      const points = c.anchors.map(a => ({v:a.used/100,n:10,label:date(a.time,lang)}));
      const title = c.id + ' · ' + c.minutes/60 + 'h · ' + date(c.reset,lang);
      const est = c.estimate;
      const desc = est ? (zh ? '可观测 API 等价周期' : 'Observed API-equivalent budget') + ' ' +
        usd(est.equivalentUsd) + ' [' + usd(est.low) + '–' + usd(est.high) + '] · n=' + est.segments :
        (zh ? '可归因区间不足' : 'Insufficient attributable intervals');
      return '<details class="lens-cycle" ' + (c.active && cycles[0] === c ? 'open' : '') + '><summary>' +
        escape(title) + ' · ' + c.usedPercent + '%</summary>' + chart([points],title) +
        '<div class="muted-note">' + desc + '</div>' + extraQuota(c, lang) + '</details>';
    }).join('') + '</div>';
  }

  function performance(data,lang) {
    if (!data) return '';
    const zh = lang !== 'en';
    const sample = metrics => metrics.n ? metrics.p50.toFixed(0) + ' / ' + metrics.p90.toFixed(0) + ' · n=' + metrics.n : '—';
    return '<div class="card-expanded"><div class="muted-note">' +
      (zh ? '按用户轮统计（p50 / p90）。输出速率包含等待和工具时间。' :
        'Per-turn p50 / p90. Output rate includes waiting and tool time.') + '</div>' +
      '<div class="legend-inline"><span class="pill outline">' + (zh ? '主会话 ' : 'Primary ') +
      data.attribution.primary.toLocaleString(lang) + '</span><span class="pill outline">' +
      (zh ? '子代理 ' : 'Workers ') + data.attribution.worker.toLocaleString(lang) + '</span></div>' +
      '<div class="lens-table-wrap"><table class="lens-table"><thead><tr><th>Model / effort</th><th>TTFT (ms)</th>' +
      '<th>Turn (ms)</th><th>Output / s</th></tr></thead><tbody>' + data.models.map(row =>
        '<tr><th>' + escape([row.model,row.effort,row.provider,row.worker?'worker':''].filter(Boolean).join(' · ')) +
        '</th><td>' + sample(row.ttftMs) + '</td><td>' + sample(row.durationMs) +
        '</td><td>' + sample(row.tokensPerTurnSecond) + '</td></tr>').join('') + '</tbody></table></div></div>';
  }

  return {cache,events,quota,report,performance};
})();
