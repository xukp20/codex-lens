(() => {
  'use strict';

  // =========================================================================
  // 2. Host Sidecar & REST Helpers
  // =========================================================================
  function apiFetch(path, options) {
    if (window.sidecar && typeof window.sidecar.fetch === 'function') {
      return window.sidecar.fetch(path, options);
    }
    return fetch(path, options);
  }

  async function getJson(path) {
    const res = await apiFetch(path, { method: 'GET' });
    if (!res.ok) {
      let msg = `${res.status}`;
      try {
        const errBody = await res.json();
        if (errBody && errBody.error) msg = errBody.error;
      } catch (_) {}
      throw new Error(`${path}: ${msg}`);
    }
    return res.json();
  }

  async function postJson(path, body) {
    const res = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {})
    });
    if (!res.ok) {
      let msg = `${res.status}`;
      try {
        const errBody = await res.json();
        if (errBody && errBody.error) msg = errBody.error;
      } catch (_) {}
      throw new Error(`${path}: ${msg}`);
    }
    return res.json();
  }

  function resolveConversationId() {
    if (window.sidecar && window.sidecar.conversationId) {
      return String(window.sidecar.conversationId);
    }
    try {
      return new URLSearchParams(window.location.search).get('conversationId') || '';
    } catch (_) {
      return '';
    }
  }

  // =========================================================================
  // 3. Query Param Helpers (Demo / Screenshot Overrides — Never Persisted)
  // =========================================================================
  const ALL_MODULE_IDS = [
    'live-context',
    'cache-diagnostics',
    'io-flow',
    'model-cost',
    'calendar-trends',
    'cache-observatory',
    'quota-budget'
  ];

  function normalizeLang(raw) {
    if (!raw) return null;
    const low = String(raw).trim().toLowerCase();
    if (low === 'en' || low === 'en-us' || low === 'english') return 'en';
    if (low === 'zh' || low === 'zh-cn' || low === 'zh_cn' || low === 'chinese') return 'zh-CN';
    return null;
  }

  function parseQueryOverrides() {
    const out = {
      lang: null,
      expandAll: false,
      expandSet: null,
      onlySet: null,
      openSettings: false,
      hideHeader: false
    };
    try {
      const sp = new URLSearchParams(window.location.search);
      const qLang = normalizeLang(sp.get('lang'));
      if (qLang) out.lang = qLang;

      const qExpand = (sp.get('expand') || '').trim();
      if (qExpand === 'all') {
        out.expandAll = true;
      } else if (qExpand) {
        const parts = qExpand.split(',').map((s) => s.trim()).filter((s) => ALL_MODULE_IDS.includes(s));
        if (parts.length) out.expandSet = new Set(parts);
      }

      const qOnly = (sp.get('only') || '').trim();
      if (qOnly) {
        const parts = qOnly.split(',').map((s) => s.trim()).filter((s) => ALL_MODULE_IDS.includes(s));
        if (parts.length) out.onlySet = new Set(parts);
      }

      const qSet = (sp.get('openSettings') || '').trim().toLowerCase();
      if (qSet === '1' || qSet === 'true') out.openSettings = true;

      const qHide = (sp.get('hideHeader') || '').trim().toLowerCase();
      if (qHide === '1' || qHide === 'true') out.hideHeader = true;
    } catch (_) {}
    return out;
  }

  // =========================================================================
  // 4. Bilingual I18N Dictionary (zh-CN / en)
  // =========================================================================
  const I18N = {
    'zh-CN': {
      common: {
        help: '帮助说明',
        readFailed: '读取失败',
        unknownModel: '未知模型',
        unknownWorkspace: '未知工作区',
        unknownPool: '未知池',
        unknown: '未知',
        turns: '轮',
        justNow: '刚刚',
        secAgo: '{n}s 前',
        minAgo: '{n}m 前',
        hrAgo: '{n}h 前',
        dayAgo: '{n}d 前',
        all: '全部',
        cancel: '取消',
        edit: '编辑',
        delete: '删除',
        close: '收起',
        copied: '已复制！',
        copyFailed: '复制失败'
      },
      header: {
        freshnessTitle: '数据更新状态',
        preparing: '准备中',
        refreshing: '刷新中',
        error: '异常',
        paused: '已暂停',
        manual: '手动',
        pending: '待同步',
        refreshIntervalTitle: '自动刷新间隔（面板不可见时自动暂停）',
        refreshIntervalAria: '自动刷新间隔',
        off: '关',
        refreshNow: '立即刷新',
        settingsTitle: '面板设置',
        rangeGroupAria: '全局时间范围',
        rangeToday: '今日',
        rangeAll: '全部',
        rangeCustom: '自定义',
        fromDateAria: '开始日期',
        toDateAria: '结束日期',
        apply: '应用',
        sourcesBadgeTitle: '点击配置数据源',
        sourcesBoth: '桌面端 + CLI',
        sourcesDesktop: '仅桌面端',
        sourcesCli: '仅 CLI',
        sourcesNone: '未选数据源',
        emptyTitle: '所有模块已关闭',
        emptyDesc: '可在设置中开启实时上下文、缓存诊断、Token 流向、成本分析、热力图、缓存观测台或额度对齐模块。',
        openSettings: '打开设置',
        configLoadErr: '配置加载失败，已使用默认布局: {msg}',
        configSaveErr: '保存设置失败: {msg}',
        refreshFailed: '刷新失败'
      },
      source: {
        desktop: '桌面端',
        cli: 'CLI'
      },
      pricingSrc: {
        default: '默认',
        remote: '远程',
        override: '覆写',
        unpriced: '未定价'
      },
      modules: {
        'live-context': {
          title: '实时上下文',
          desc: '当前会话模型、压缩阈值进度条与上下文构成拆解',
          setHelp: '展示内容：当前活跃会话的模型上下文占用、Auto-Compact 压缩上限及各部分构成。\n何时开启：需要实时盯盘长对话何时接近自动压缩时开启。\n扫描范围：仅读取当前活跃对话的单个 SQLite 库（极低开销）。',
          headHelp: '进度条上限为模型 Auto-Compact 自动压缩阈值（而非原始理论窗口）。\n55% 为中位警戒线，80% 为高压临界线；接近上限时系统将触发自动摘要并重置部分缓存前缀。'
        },
        'cache-diagnostics': {
          title: 'Prompt Cache 诊断',
          desc: '最近轮次缓存命中率、冷启动检测与逐轮走势',
          setHelp: '展示内容：当前会话最近一轮与累计 Prompt Cache 命中率、冷启动/骤降标记与缓存节省。\n何时开启：排查单次对话缓存是否频繁失效时开启。\n扫描范围：仅读取当前活跃对话的单个 SQLite 库。',
          headHelp: '缓存命中率 = cacheRead / (cacheRead + uncachedIn)。\n缓存节省美元 = 命中的 cacheRead tokens × (普通输入单价 - 缓存读取单价)，反映相对全额未缓存输入的节省基线。'
        },
        'io-flow': {
          title: '输入输出与 Token 流向',
          desc: '未缓存输入 / 缓存读 / 思考 / 可见输出占比与 TTFT',
          setHelp: '展示内容：未缓存输入、缓存读、思考过程与可见输出的 Token 比例及 TTFT / 生成耗时。\n何时开启：需要对比推理思考占比或响应延迟时开启。\n扫描范围：「本会话」仅扫单库；「全局」会按时间范围查询本地历史索引。',
          headHelp: '按 4 类 Token 桶拆分：Uncached In（新输入）、Cache Read（前缀命中）、Thinking Out（推理思考）、Visible Out（最终回复）。\nTTFT 为首 Token 延迟，生成耗时为完整流式输出持续时间。'
        },
        'model-cost': {
          title: '模型分布与 API 等价成本',
          desc: '按模型与工作区汇总用量、长上下文计费与缓存节省',
          setHelp: '展示内容：各模型与工作区的用量排名、缓存节省及 >272K 长上下文阶梯计费明细。\n何时开启：需要盘点周期消耗分布或对比不同模型成本时开启。\n扫描范围：查询所选时间范围内本地历史索引（桌面端 / CLI）。',
          headHelp: '「API 等价」按公开 API 标准单价估算算力价值，不代表订阅制实际扣费。\n部分模型在单轮总输入 >272K tokens 时触发长上下文阶梯溢价，面板会自动分段计价并标注轮次。'
        },
        'calendar-trends': {
          title: '使用日历热力图与趋势',
          desc: '活跃连续天数、14 日走势及交互式日历下钻',
          setHelp: '展示内容：连续活跃天数、今日 vs 7 日均值、14 天柱状趋势及交互式日历热力图。\n何时开启：想复盘长期使用节奏或按日期回溯特定对话开销时开启。\n扫描范围：查询本地历史索引中的所有已索引日期。',
          headHelp: '热力图颜色按有记录活跃日（非零天数）的四分位数 Q1 / Q2 / Q3 划分为 4 档强度。\n点击任意日期方块可下钻加载当日全部会话与费用明细。'
        },
        'cache-observatory': {
          title: '全局缓存观测台',
          desc: '跨对话追踪模型 × 空闲间隔命中率衰减、0% 意外断崖与边界截断',
          setHelp: '展示内容：跨会话 Model × Idle-Gap 命中率矩阵、对数散点图、意外 0% Miss / 边界截断异常及一键脱敏 Issue 报告。\n何时开启：排查特定模型随请求间隔衰减、疑似 TTL 失效或上下文边界截断问题时开启（默认关闭）。\n扫描范围：按所选时间范围扫描历史索引中的全部连续轮次对。',
          headHelp: 'Idle Gap = 本轮发起时间 - 上轮完成时间；Start Gap = 本轮发起时间 - 上轮发起时间。\nUnexpected 0% Miss：上轮命中 ≥70% 且未换模/未压缩，本轮却突然 0 命中。\nBoundary Cut：上轮命中 ≥70%，本轮骤降至 <40% 且 cacheRead 落在 5k~28k。\nBounce-Back：异常断崖后的下一轮立刻恢复 ≥70% 命中，指向瞬态路由/缓存抖动而非前缀变化。'
        },
        'quota-budget': {
          title: '订阅额度与总额反推',
          desc: '手动记录剩余 % 对齐点，推算周期隐含总额度与置信区间',
          setHelp: '展示内容：基于手动记录的剩余百分比（支持 2 位小数）与区间花费，反推订阅周期隐含总额度及消耗节奏。\n何时开启：想估算 5h/7d 订阅池的隐含美元总额度与剩余可用量时开启（默认关闭）。\n扫描范围：读取对齐锚点表及锚点时间段内的本地索引花费。',
          headHelp: '输入精度步长（如 94.25% 对应 0.01% 步长，误差半径 ±0.005%）决定每次 Δu 的区间不确定性。\n面板基于多段有效 Δu 消耗加权反推隐含总额度，并给出 95% 置信区间（CI）。'
        }
      },
      ctx: {
        noActive: '无活跃会话',
        noData: '当前会话暂无上下文遥测数据（发送首轮对话后自动出现）。',
        warn55: '55% 警戒线',
        warn80: '80% 高压线',
        turnsDur: '轮次: {turns} · 时长: {dur}',
        nearCompact: '接近压缩阈值',
        markers: '55% / 80% 标线',
        nearWarnBanner: '⚠ 上下文已达压缩阈值附近（≥75%），即将触发自动摘要或前缀重算。',
        uncategorized: '未分类',
        chartAria: '上下文构成堆叠图',
        noBreakdown: '暂无上下文构成明细（仅最新轮次保留构成快照）。'
      },
      cache: {
        noDataBadge: '无会话数据',
        noDataBody: '当前会话暂无 Prompt Cache 统计。',
        coldBadge: 'Cold 启动',
        hitBadge: '命中 {pct}',
        lastTurn: '最近一轮',
        hitSub: '{n} 命中',
        sessionTotal: '会话累计',
        cacheSaved: '缓存节省',
        vsUncached: '相对未缓存',
        noTrajectory: '暂无逐轮缓存轨迹。',
        recentTitle: '近 {n} 轮输入命中构成',
        legendCacheRead: 'Cache Read',
        legendUncached: 'Uncached',
        legendCold: 'Cold',
        legendDrop: '骤降',
        chartAria: '逐轮缓存命中柱状图',
        tipHit: '命中率',
        tipCold: ' [Cold 启动]',
        tipDrop: ' [缓存骤降]'
      },
      io: {
        scopeSession: '本会话',
        scopeGlobal: '全局',
        noSession: '当前会话暂无 Token 流向记录。',
        noGlobal: '所选时间范围内暂无 Token 流向记录。',
        barAria: 'Token 流向比例条',
        uncachedShort: '未缓存',
        cacheReadShort: '缓存读',
        thinkingShort: '思考',
        visibleShort: '输出',
        uncachedFull: '未缓存输入 (Uncached In)',
        cacheReadFull: '缓存读取 (Cache Read)',
        cacheWriteNote: '(写 {n})',
        thinkingFull: '思考输出 (Thinking Out)',
        visibleFull: '可见输出 / 总输出',
        latencyRow: '平均响应延迟 (TTFT / 生成)',
        longCtxPill: '>272K 长上下文 {n} 次',
        unpricedPill: '未定价模型 {n} 轮'
      },
      cost: {
        badge: 'API 等价估算',
        noData: '正在加载或暂无用量统计。',
        savedPill: '缓存已省 {usd}',
        longCtxPill: '>272K {n} 次',
        unpricedPill: '未定价 {n}轮',
        emptyRange: '所选时间范围内无模型消费记录。',
        byModel: '按模型 ({n})',
        byWorkspace: '按工作区 ({n})',
        sortCost: '成本',
        sortTokens: 'Tokens',
        sortTurns: '轮次',
        sortCache: 'Cache%',
        modelSub: '{turns} 轮 · {tok} tok · 缓存 {cache}',
        wsSub: '{turns} 轮 · {tok} tok'
      },
      cal: {
        badge: '趋势',
        noData: '暂无日历趋势数据。',
        streak: '连续 {n} 天',
        no7dBase: '无 7 日基准',
        vs7d: '{delta} vs 7d 均值',
        todayPrefix: '今日',
        avg7dPrefix: '/ 7d均',
        sparkAria: '近 14 天消费迷你柱状图',
        metricCost: '等价 $',
        metricTokens: 'Tokens',
        metricTurns: '轮次',
        less: '少',
        more: '多',
        heatmapAria: '每日使用日历热力图',
        drillHint: '点击任意日期方块可下钻查看当日会话与费用明细。',
        loadingDay: '正在加载 {date} 明细…',
        unnamedSession: '未命名会话',
        noConvsDay: '当日无对话记录。',
        dayLabels: { mon: '一', wed: '三', fri: '五' },
        monthLabel: (m) => `${m + 1}月`,
        tipCost: '成本',
        tipTurns: '轮次'
      },
      obs: {
        badgeOk: '跟随命中 {pct}',
        badgeMiss: '{n} 次 0% 断崖',
        noDataBadge: '等待数据',
        noDataBody: '所选时间范围内暂无多轮对话缓存观测数据。',
        kpiFollowHit: '跟随轮命中率',
        kpiFollowSub: '{n} 个跟随轮次',
        kpiFullMiss: '意外 0% 断崖',
        kpiBounceSub: '{n} 次瞬态回弹',
        kpiBoundaryCut: '边界截断',
        kpiBoundarySub: '换模 {sw} · 压缩 {cmp}',
        kpiPenalty: 'Miss 额外代价',
        kpiWastedSub: '{tok} 浪费',
        matrixTitle: 'Model × Idle-Gap 矩阵',
        matrixSub: '不含 Turn-0 冷启动 · 格内为命中率',
        matrixLegend: '主：{primary}{sub} · 悬停预览 / 点击固定全量',
        matrixLegendSub: ' · 副：{subs}',
        matrixCfgTitle: '矩阵指标设置',
        matrixReset: '恢复默认',
        matrixColMetric: '指标',
        matrixColPrimary: '主(色阶)',
        matrixColSub: '格内小字',
        matrixPrimaryTag: '主',
        matrixSubTag: '副',
        matrixCfgNote: '可自由勾选任意项作为格内小字（每项一行）；切换主指标时原主指标会自动保留为小字；全部指标均在悬浮/点击弹窗中完整展示。',
        metricFull: {
          keepRate: '缓存保活率',
          weightedHit: 'Token 实际命中率',
          avgCost: '轮均花费',
          totalCost: '区间总花费',
          missPenalty: 'Miss 额外罚金',
          turns: '样本轮次数'
        },
        metricShort: {
          keepRate: '保活率',
          weightedHit: '命中率',
          avgCost: '轮均价',
          totalCost: '总花费',
          missPenalty: 'Miss罚金',
          turns: '轮次'
        },
        popTurns: '{n} 轮',
        popKeepRate: '缓存保活率',
        popWeightedHit: 'Token 实际命中率',
        popTurnAvgSub: '轮均 {pct}',
        popAnomalies: '异常事件',
        popAnomNone: '无异常',
        popAnomFullMiss: '{n} 断崖',
        popAnomBoundary: '{n} 截断',
        popAnomBounce: '{n} 回弹',
        popAvgCost: '轮均 API 花费',
        popTotalCost: '区间总花费',
        popMissPenalty: 'Miss 额外罚金',
        popPerTurn: '{usd}/轮',
        popCacheSaved: '缓存已省费用',
        popAvgCtx: '平均输入上下文',
        popCacheVsIn: '缓存读 / 总输入',
        popWastedTok: '浪费 Token',
        popUnbucketed: '注：含 {n} 轮因缺少时间戳未归入空闲区间桶',
        popPinHint: '点击单元格可固定详情卡',
        popClose: '关闭',
        colModel: '模型',
        colTotal: '总计',
        scatterTitle: 'Idle-Gap vs 命中率对数散点图',
        filterAll: '全部',
        legendHit: '正常命中',
        legendFullMiss: '0% 断崖',
        legendBoundary: '边界截断',
        legendLowHit: '低命中',
        kindHit: '正常命中',
        kindFullMiss: '意外 0% 断崖',
        kindBoundary: '边界截断',
        kindLowHit: '低命中',
        bounceYes: '是（下轮恢复）',
        bounceNo: '否',
        bounceBadge: '回弹恢复',
        showAnomalies: '展开 Top 异常 ({n})',
        hideAnomalies: '收起 Top 异常 ({n})',
        copyIssue: '复制脱敏 Issue 报告',
        noAnomalies: '当前时间范围内未检测到 0% 断崖或边界截断异常。',
        noScatterPoints: '当前筛选条件下暂无散点数据。',
        tipHitsTotal: '命中/总轮: {hits}/{total} (Miss {misses})',
        tipAvgHit: '平均命中率: {pct}',
        tipWeighted: '加权命中率: {pct}',
        tipIdleGap: 'Idle Gap',
        tipStartGap: 'Start Gap',
        tipSeq: '前→本→后',
        tipBounce: '瞬态回弹',
        tipPenalty: '浪费 / 代价',
        scatterAria: 'Idle-Gap 与命中率对数散点图'
      },
      quota: {
        remaining: '剩余',
        used: '已用',
        paceFastBad: '超速',
        paceFastWarn: '偏快',
        paceOk: '充裕',
        paceLabel: '节奏 {ratio}x · {lbl}',
        projectedNow: '推算当前: {pct}',
        spentSince: '区间已耗 {usd}',
        emptyDesc: '尚未记录订阅额度对齐点。展开卡片后可记录当前的精确剩余百分比（如 94.25%），自动反推周期隐含总额度。',
        formTitle: '快速记录对齐点',
        poolLabel: '额度池',
        pool3p: 'Third-Party (3P)',
        windowLabel: '统计窗口',
        win5h: '5h 窗口',
        win7d: '7d 周期',
        pctLabel: '当前剩余百分比 (%)',
        pctPlaceholder: '例如 94.25',
        pctHint: '支持最多 2 位小数（如 94.25）；系统会自动识别小数精度以计算置信区间误差。',
        resetLabel: '重置倒计时 / 时间（可选）',
        resetPlaceholder: '如 3h20m 或 18:30',
        resetHint: '支持 3h20m / 45m / HH:MM',
        resetInheritHint: '留空沿用上次重置 ({time})，提前重置请重填',
        resetPreview: '预计重置: {time}',
        resetBad: '无法解析时间格式（支持如 3h20m、45m、14:30 或 ISO 时间）',
        captureTimeLabel: '记录时刻',
        now: '此刻',
        custom: '自定义',
        noteLabel: '备注（可选）',
        notePlaceholder: '例如：IDE 设置面板截图校准',
        submitting: '记录中…',
        submitBtn: '记录时间点',
        impliedTitle: '{pool} · {wt} 隐含总额度',
        statusOk: '高置信',
        statusLow: '低置信',
        statusCal: '校准中',
        calDesc: '已观测有效消耗 Δu = {du}%（{seg} 段），区间累计 {usd}；需继续积累消耗百分比以完成反推校准。',
        effDelta: '有效 Δu: {du}% ({seg} 段) · 窗口花费 {usd}',
        impliedRem: '推算剩余: {usd}',
        mixedWarn: '⚠ 检测到同池内多模型混用方差较大，反推总额仅供参考。',
        historyTitle: '历史对齐记录 ({n})',
        currentHistoryTitle: '本周期对齐记录 ({n})',
        noCurrentAnchors: '当前周期尚无对齐记录。',
        showOlderCycles: '查看历史周期记录 ({m})',
        hideOlderCycles: '收起历史周期记录 ({m})',
        precision: '精度 {step}%',
        resetAt: '重置 {time}',
        invalidPct: '请输入 0 到 100 之间的有效剩余百分比（支持最多 2 位小数，如 94.25）',
        recordFailed: '记录失败: {msg}',
        deleteFailed: '删除失败: {msg}',
        subsetBase: '基准',
        subsetM: '模型 (M)',
        subsetC: '缓存 (C)',
        subsetO: '输出 (O)',
        subsetMC: '模型+缓存',
        subsetMO: '模型+输出',
        subsetCO: '缓存+输出',
        subsetMCO: '全因子 (M+C+O)',
        factorM: '模型倍率 (M)',
        factorC: '缓存倍率 (C)',
        factorO: '输出倍率 (O)',
        calibBadgeHelp: '正交 3 因子校准：模型倍率 (M)、缓存倍率 (C)、输出倍率 (O) 彼此独立，随各自变异度独立解锁。\n系统在全部 8 个子集中用留一交叉验证（LOOCV-MAE）与 χ² 准则自动择优，并对微小滞后/回弹进行保守平滑归并，防止过拟合。',
        mixEqHint: '当前配比等效',
        clamped: '受限',
        maeStrip: 'MAE ±{mae}pp',
        labTitle: '权重校准实验室',
        labSummary: '推荐 {rec} · {n} 段',
        modeAuto: '自动择优',
        modeAutoHelp: '评估全部 8 个正交子集，按 LOOCV-MAE 改善与 χ² 准则自动选择最优模型。',
        modeManual: '手动 {mode}',
        allFactorsUnlocked: '全部 3 个正交因子已就绪，可自由组合或使用自动择优。',
        manualFallbackHint: '组合 {subset} 暂不可用（{reason}），已回退至 {fallback}。',
        subsetIneligible: '样本量或共线性条件未满足',
        smoothSegSummary: '{anchors} 锚点 → {segs} 平滑段 (合并 {merged} 处抖动)',
        smoothHuberTag: 'Huber 降权 {n} 处跳变',
        smoothTipInfo: '保守区间平滑：自动归并微小结算滞后与微幅回弹，保持总花费与 Δu 守恒；Huber 权重自动抑制偶发滞后异常点。',
        baseAnchorLabel: '1.00× 基准锚点',
        anchorSrcDefault: '默认',
        anchorSrcUser: '自定义',
        anchorSrcFallback: '自动回退',
        anchorPoolQ: '锚点口径 Q: ~{usd}',
        anchorPoolQHelp: '「锚点口径 Q」指完全使用所选 1.00× 基准模型时的周期总额度；卡片顶部大号数字为按当前混合配比折算的等效 API 总额度，切换因子组合时平滑不跳变。',
        paramBase: '基准 1.00×',
        paramFitted: '已拟合',
        paramDefault: '默认 1.00×',
        paramCacheName: 'Cache Read (α_cache)',
        paramOutName: 'Output / Thinking (α_out)',
        interpBase: '以该模型 API 单价作为本池 1.00× 基准标尺。',
        interpModelEff: '同 API 花费下，额度消耗约为基准模型的 {v}×（更省额度）。',
        interpModelHeavy: '同 API 花费下，额度消耗约为基准模型的 {v}×（更费额度）。',
        interpModelNeutral: '与基准模型额度消耗速率基本一致（~{v}×）。',
        interpModelUnfit: '沿用 API 标价 1.00×（启用因子 M 后拟合）。',
        interpCacheCheap: '缓存读取按 API 折扣的 {v}× 扣额（命中更划算）。',
        interpCacheExpensive: '缓存读取按 API 折扣的 {v}× 扣额（折扣低于 API）。',
        interpCacheNeutral: '缓存读取扣额与官方 API 定价基本一致（~{v}×）。',
        interpCacheUnfit: '按官方 API 缓存折扣计算（启用因子 C 后拟合）。',
        interpOutExpensive: '输出 / 思考 Token 权重为 API 价的 {v}×（输出更贵）。',
        interpOutCheap: '输出 / 思考 Token 权重仅为 API 价的 {v}×（输出更省）。',
        interpOutNeutral: '输出与输入消耗比基本符合官方 API 定价（~{v}×）。',
        interpOutUnfit: '按官方 API 输出比例计算（启用因子 O 后拟合）。',
        trialNotAdopted: '未采纳 · 试算 {val}{clamped}（{reason}）',
        trialReasonWorse: 'LOOCV ±{trial}pp 差于基准 ±{base}pp',
        trialReasonMarginal: 'LOOCV ±{trial}pp 较基准 ±{base}pp 降幅不足 15%',
        trialReasonChi2: '信息准则 χ² 改善未达门槛',
        promoNoteFollow: '提示：本周期内促销模型尚未跨越调价点，暂无法独立辨识订阅是否跟随促销折扣，当前按「跟随 API 促销价」假设校准。',
        promoNoteList: '提示：本周期内促销模型尚未跨越调价点，暂按「标准原价（不跟随促销）」假设校准。',
        residualTitle: '实测 vs 预测残差 (pp)',
        residualNoData: '当前周期分段拟合数据不足。',
        residualSummary: '{l0} ±{mae0}pp → {cur} ±{mae1}pp ({metric})',
        residualBaseOnly: '{base} ±{mae0}pp ({metric})',
        legendObs: '实测 Observed',
        legendBase: '基准预测',
        legendCur: '{lvl} 预测',
        legendHuber: 'Huber 降权',
        segTipTitle: '区间 #{idx} · 花费 {usd}',
        segTipObs: '实测消耗: {v}pp',
        segTipBase: '基准预测: {v}pp (误差 {err}pp)',
        segTipCur: '{lvl} 预测: {v}pp (误差 {err}pp)',
        segTipMerged: '合并了 {n} 个原始间隔',
        segTipDownweighted: 'Huber 已降权（疑似滞后跳变）'
      },
      settings: {
        title: '面板设置',
        closeTitle: '关闭设置',
        langSection: '界面语言',
        langDesc: '即时切换中英文界面（支持 ?lang=en 临时覆盖）',
        generalSection: '刷新与采集控制',
        autoRefreshName: '自动刷新间隔',
        autoRefreshDesc: '仅在面板可见时按间隔轮询；最小化或切走标签页自动零开销暂停',
        autoRefreshHelp: '控制侧边栏处于可见状态时的自动刷新周期。\n面板隐藏或切到后台时自动暂停轮询，避免无意义 CPU/磁盘占用；选「关」则仅手动刷新。',
        modulesSection: '模块开关与排序',
        moveUp: '上移',
        moveDown: '下移',
        toggleModuleTitle: '启用或关闭此模块',
        sourcesSection: '数据源与本地索引',
        sourcesHelp: '所有数据均以 SQLite 只读模式（mode=ro）扫描本地会话库，不修改原库也不上传任何远程服务器。\n勾选对应数据源后，全局分析模块与索引重建将聚合所选来源。',
        desktopName: 'Antigravity 桌面端',
        desktopDesc: '只读扫描 conversations/*.db（{n} 个库）',
        cliName: 'Antigravity CLI',
        cliDesc: '只读扫描 antigravity-cli/conversations/*.db（{n} 个库）',
        indexedTurns: '已索引轮次: {n}',
        lastIndexed: '上次索引: {time}',
        rebuildHint: '重建索引仅清理缓存，完整保留额度对齐记录。',
        rebuilding: '重建中…',
        rebuildBtn: '重建索引',
        rebuildDone: '重建完成：扫描 {dbs} 个库，耗时 {ms}ms',
        rebuildFail: '重建失败: {msg}',
        pricingSection: '定价表管理',
        promoBadge: '促销价',
        defaultAnchorsNote: '默认基准锚点 (1.00×): {list}',
        defaultsPath: '离线默认配置文件 (pricing_defaults.json)',
        builtinDefaults: '内置默认表',
        overridesPath: '用户覆写配置文件 (pricing_overrides.json)',
        autoSyncName: '自动同步远程公开定价',
        autoSyncDesc: '每 24h 从 LiteLLM / OpenRouter 更新公开参考单价',
        autoSyncHelp: '开启后每 24 小时从公开的 LiteLLM / OpenRouter 定价 JSON 拉取最新参考单价。\n关闭时完全离线运行，仅使用内置默认值与本地 overrides 覆写。',
        lastSynced: '上次同步: {time}',
        neverSynced: '尚未同步',
        syncing: '同步中…',
        syncBtn: '立即手动刷新定价',
        syncOk: '同步成功，已匹配 {n} 个模型',
        syncErr: '同步异常: {msg}',
        syncFail: '同步失败: {msg}',
        collapsePricing: '收起模型单价表',
        expandPricing: '展开模型单价表与自定义覆写',
        loadingPricing: '正在加载定价表…',
        restoreDefault: '恢复默认',
        saveOverride: '保存覆写',
        restoreFail: '恢复默认失败: {msg}',
        saveFail: '保存覆写失败: {msg}',
        thThreshold: '长上下文阈值',
        thThresholdPlaceholder: '留空表示无',
        thInAbove: '超阈值 Input ($/1M)',
        thOutAbove: '超阈值 Output ($/1M)',
        thCacheAbove: '超阈值 Cache Read ($/1M)'
      }
    },
    en: {
      common: {
        help: 'Help',
        readFailed: 'Load failed',
        unknownModel: 'Unknown model',
        unknownWorkspace: 'Unknown workspace',
        unknownPool: 'Unknown pool',
        unknown: 'Unknown',
        turns: 'turns',
        justNow: 'just now',
        secAgo: '{n}s ago',
        minAgo: '{n}m ago',
        hrAgo: '{n}h ago',
        dayAgo: '{n}d ago',
        all: 'All',
        cancel: 'Cancel',
        edit: 'Edit',
        delete: 'Delete',
        close: 'Close',
        copied: 'Copied!',
        copyFailed: 'Copy failed'
      },
      header: {
        freshnessTitle: 'Data freshness status',
        preparing: 'Ready',
        refreshing: 'Syncing',
        error: 'Error',
        paused: 'Paused',
        manual: 'Manual',
        pending: 'Pending',
        refreshIntervalTitle: 'Auto-refresh interval (pauses automatically when pane is hidden)',
        refreshIntervalAria: 'Auto-refresh interval',
        off: 'Off',
        refreshNow: 'Refresh now',
        settingsTitle: 'Panel settings',
        rangeGroupAria: 'Global time range',
        rangeToday: 'Today',
        rangeAll: 'All',
        rangeCustom: 'Custom',
        fromDateAria: 'Start date',
        toDateAria: 'End date',
        apply: 'Apply',
        sourcesBadgeTitle: 'Click to configure data sources',
        sourcesBoth: 'Desktop + CLI',
        sourcesDesktop: 'Desktop only',
        sourcesCli: 'CLI only',
        sourcesNone: 'No sources',
        emptyTitle: 'All modules disabled',
        emptyDesc: 'Enable Live Context, Cache Diagnostics, IO Flow, Model Cost, Calendar Heatmap, Cache Observatory, or Quota Budget in Settings.',
        openSettings: 'Open Settings',
        configLoadErr: 'Failed to load config, using defaults: {msg}',
        configSaveErr: 'Failed to save settings: {msg}',
        refreshFailed: 'Refresh failed'
      },
      source: {
        desktop: 'Desktop',
        cli: 'CLI'
      },
      pricingSrc: {
        default: 'Default',
        remote: 'Remote',
        override: 'Override',
        unpriced: 'Unpriced'
      },
      modules: {
        'live-context': {
          title: 'Live Context',
          desc: 'Active session model, auto-compact ceiling bar & context breakdown',
          setHelp: 'What it shows: Active conversation context usage, Auto-Compact ceiling, and per-category token breakdown.\nWhen to enable: Keep ON to watch when long threads approach auto-compaction.\nScan scope: Single active conversation SQLite DB (read-only, minimal overhead).',
          headHelp: 'Bar ceiling tracks the model Auto-Compact threshold (not the raw max context window).\nMarkers sit at 55% (caution) and 80% (high pressure); nearing the ceiling triggers auto-summarization.'
        },
        'cache-diagnostics': {
          title: 'Prompt Cache Diagnostics',
          desc: 'Latest turn & cumulative cache hit rate, cold starts & turn trajectory',
          setHelp: 'What it shows: Last-turn and session cumulative Prompt Cache hit ratio, cold-start/drop markers, and savings.\nWhen to enable: Enable to monitor prefix cache stability inside the active session.\nScan scope: Single active conversation SQLite DB (read-only).' ,
          headHelp: 'Cache Hit % = cacheRead / (cacheRead + uncachedIn).\nCache Savings USD = cacheRead tokens × (standard input price - cache read price), measured against an uncached baseline.'
        },
        'io-flow': {
          title: 'Input/Output & Token Flow',
          desc: 'Uncached In / Cache Read / Thinking / Visible Output ratio & TTFT',
          setHelp: 'What it shows: Token mix across Uncached In, Cache Read, Thinking, and Visible Output plus TTFT/generation latency.\nWhen to enable: Use to inspect reasoning overhead or response latency.\nScan scope: "Session" reads the single active DB; "Global" queries the local historical index.',
          headHelp: 'Splits tokens into 4 buckets: Uncached In, Cache Read, Thinking Out, and Visible Out.\nTTFT = average Time To First Token; Gen = average streaming generation duration.'
        },
        'model-cost': {
          title: 'Models & API-Eq. Cost',
          desc: 'Usage by model & workspace, >272K long-context tiering & cache savings',
          setHelp: 'What it shows: API-equivalent cost breakdown by model and workspace, cache savings, and >272K long-context turn counts.\nWhen to enable: Use to audit token spend across projects and models.\nScan scope: Local historical SQLite index filtered by the selected range & sources.',
          headHelp: 'API-eq. estimates compute value using public API list prices (not actual subscription billing).\nModels with >272K tiered pricing automatically switch to above-threshold rates on qualifying turns.'
        },
        'calendar-trends': {
          title: 'Calendar Heatmap & Trends',
          desc: 'Active streak, 14-day sparkline & interactive day drill-down',
          setHelp: 'What it shows: Consecutive active days, Today vs 7d average, 14-day sparkbars, and a clickable calendar heatmap.\nWhen to enable: Turn ON to review daily cadence or drill into past sessions by date.\nScan scope: All indexed dates in the local historical SQLite index.',
          headHelp: 'Cell colors map active (non-zero) days into 4 intensity levels via Q1/Q2/Q3 quartiles.\nClick any day cell to drill down into that day’s conversations and API-eq. cost.'
        },
        'cache-observatory': {
          title: 'Global Cache Observatory',
          desc: 'Cross-session Model × Idle-Gap hit decay, unexpected 0% misses & boundary cuts',
          setHelp: 'What it shows: Cross-session Model × Idle-Gap hit matrix, log-scale gap scatter plot, top anomalies, and anonymized issue report.\nWhen to enable: Turn ON when diagnosing TTL decay, model-specific cache drops, or routing misses (OFF by default).\nScan scope: Consecutive turn pairs across the local historical index within the selected range.',
          headHelp: 'Idle Gap = cur.createdAt - prev.completedAt; Start Gap = cur.createdAt - prev.createdAt.\nUnexpected 0% Miss: prev hit ≥70% (same model, uncompacted) drops to 0 cacheRead.\nBoundary Cut: prev hit ≥70% drops to <40% with cacheRead in 5k–28k.\nBounce-Back: next turn immediately recovers ≥70% hit, indicating transient miss rather than prefix drift.'
        },
        'quota-budget': {
          title: 'Quota & Cycle Budget',
          desc: 'Manual 2-decimal remaining % anchors with 95% CI cycle budget inversion',
          setHelp: 'What it shows: Tracks manual remaining % anchors (up to 2 decimals) and inverts implied cycle budget + pace ratio.\nWhen to enable: Turn ON to calibrate 5h/7d subscription pools against API-eq. spend (OFF by default).\nScan scope: Local quota_anchors table + indexed spend between anchor timestamps.',
          headHelp: 'Input precision step (e.g., 94.25% -> 0.01% step, ±0.005% error radius) bounds Δu interval width.\nMultiple Δu segments are weighted to estimate implied total pool USD and its 95% confidence interval.'
        }
      },
      ctx: {
        noActive: 'No active session',
        noData: 'No context telemetry yet for this conversation (appears after first turn).',
        warn55: '55% caution mark',
        warn80: '80% high-pressure mark',
        turnsDur: 'Turns: {turns} · Dur: {dur}',
        nearCompact: 'Near compact ceiling',
        markers: '55% / 80% markers',
        nearWarnBanner: '⚠ Context is nearing the auto-compact ceiling (≥75%); summarization or prefix recompute may trigger soon.',
        uncategorized: 'Uncategorized',
        chartAria: 'Context composition stacked bar',
        noBreakdown: 'No detailed context breakdown available (captured on latest turn only).'
      },
      cache: {
        noDataBadge: 'No data',
        noDataBody: 'No Prompt Cache telemetry for this session yet.',
        coldBadge: 'Cold start',
        hitBadge: 'Hit {pct}',
        lastTurn: 'Last Turn',
        hitSub: '{n} hit',
        sessionTotal: 'Session',
        cacheSaved: 'Saved',
        vsUncached: 'vs uncached',
        noTrajectory: 'No per-turn cache trajectory yet.',
        recentTitle: 'Last {n} turns input composition',
        legendCacheRead: 'Cache Read',
        legendUncached: 'Uncached',
        legendCold: 'Cold',
        legendDrop: 'Drop',
        chartAria: 'Per-turn cache hit bar chart',
        tipHit: 'Hit ratio',
        tipCold: ' [Cold start]',
        tipDrop: ' [Cache drop]'
      },
      io: {
        scopeSession: 'Session',
        scopeGlobal: 'Global',
        noSession: 'No token flow recorded for this session yet.',
        noGlobal: 'No token flow recorded in the selected range.',
        barAria: 'Token flow ratio bar',
        uncachedShort: 'Uncached',
        cacheReadShort: 'Cache Read',
        thinkingShort: 'Thinking',
        visibleShort: 'Visible',
        uncachedFull: 'Uncached Input',
        cacheReadFull: 'Cache Read',
        cacheWriteNote: '(write {n})',
        thinkingFull: 'Thinking Output',
        visibleFull: 'Visible / Total Output',
        latencyRow: 'Avg Latency (TTFT / Gen)',
        longCtxPill: '>272K long ctx {n} requests',
        unpricedPill: 'Unpriced {n} turns'
      },
      cost: {
        badge: 'API-eq.',
        noData: 'Loading or no usage data yet.',
        savedPill: 'Saved {usd}',
        longCtxPill: '>272K {n}t',
        unpricedPill: 'Unpriced {n}t',
        emptyRange: 'No model spend in the selected range.',
        byModel: 'Models ({n})',
        byWorkspace: 'Workspaces ({n})',
        sortCost: 'Cost',
        sortTokens: 'Tokens',
        sortTurns: 'Turns',
        sortCache: 'Cache%',
        modelSub: '{turns} turns · {tok} tok · Cache {cache}',
        wsSub: '{turns} turns · {tok} tok'
      },
      cal: {
        badge: 'Trends',
        noData: 'No calendar trend data yet.',
        streak: '{n}d streak',
        no7dBase: 'No 7d baseline',
        vs7d: '{delta} vs 7d avg',
        todayPrefix: 'Today',
        avg7dPrefix: '/ 7d avg',
        sparkAria: '14-day spend sparkbars',
        metricCost: 'API-eq. $',
        metricTokens: 'Tokens',
        metricTurns: 'Turns',
        less: 'Less',
        more: 'More',
        heatmapAria: 'Daily usage calendar heatmap',
        drillHint: 'Click any day cell to drill down into conversations and cost for that day.',
        loadingDay: 'Loading {date} details…',
        unnamedSession: 'Untitled session',
        noConvsDay: 'No conversations recorded on this date.',
        dayLabels: { mon: 'Mon', wed: 'Wed', fri: 'Fri' },
        monthLabel: (m) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m] || `${m + 1}`,
        tipCost: 'Cost',
        tipTurns: 'Turns'
      },
      obs: {
        badgeOk: 'Follow-up {pct}',
        badgeMiss: '{n} 0%-misses',
        noDataBadge: 'No data',
        noDataBody: 'No multi-turn cache transition data in the selected range.',
        kpiFollowHit: 'Follow-up Hit %',
        kpiFollowSub: '{n} follow-up turns',
        kpiFullMiss: 'Unexpected 0% Misses',
        kpiBounceSub: '{n} bounce-backs',
        kpiBoundaryCut: 'Boundary Cuts',
        kpiBoundarySub: '{sw} switch · {cmp} compact',
        kpiPenalty: 'Miss Penalty',
        kpiWastedSub: '{tok} wasted',
        matrixTitle: 'Model × Idle-Gap Matrix',
        matrixSub: 'Excl. Turn-0 cold starts · cell shows hit %',
        matrixLegend: 'Primary: {primary}{sub} · Hover preview / Click to pin',
        matrixLegendSub: ' · Sub: {subs}',
        matrixCfgTitle: 'Matrix Metrics',
        matrixReset: 'Reset',
        matrixColMetric: 'Metric',
        matrixColPrimary: 'Primary',
        matrixColSub: 'In-Cell',
        matrixPrimaryTag: 'Main',
        matrixSubTag: 'Sub',
        matrixCfgNote: 'Check any metrics to stack as in-cell rows. Switching primary keeps the previous primary as a sub-row. All metrics appear in the detail card.',
        metricFull: {
          keepRate: 'Cache Keep Rate',
          weightedHit: 'Token Hit Ratio',
          avgCost: 'Avg Cost / Turn',
          totalCost: 'Bucket Total Cost',
          missPenalty: 'Miss Penalty',
          turns: 'Follow-up Turns'
        },
        metricShort: {
          keepRate: 'Keep %',
          weightedHit: 'Hit %',
          avgCost: '$/turn',
          totalCost: 'Cost',
          missPenalty: 'Penalty',
          turns: 'Turns'
        },
        popTurns: '{n} turns',
        popKeepRate: 'Cache Keep Rate',
        popWeightedHit: 'Token Hit Ratio',
        popTurnAvgSub: 'turn avg {pct}',
        popAnomalies: 'Anomalies',
        popAnomNone: 'None',
        popAnomFullMiss: '{n} 0%-miss',
        popAnomBoundary: '{n} cut',
        popAnomBounce: '{n} bounce',
        popAvgCost: 'Avg Cost / Turn',
        popTotalCost: 'Bucket Total Cost',
        popMissPenalty: 'Miss Penalty',
        popPerTurn: '{usd}/t',
        popCacheSaved: 'Cache Saved',
        popAvgCtx: 'Avg Input Context',
        popCacheVsIn: 'Cache Read / Input',
        popWastedTok: 'Wasted Tokens',
        popUnbucketed: 'Note: includes {n} turns without timestamps (unbucketed)',
        popPinHint: 'Click cell to pin detail card',
        popClose: 'Close',
        colModel: 'Model',
        colTotal: 'All',
        scatterTitle: 'Idle-Gap vs Hit-Rate (Log Scale)',
        filterAll: 'All',
        legendHit: 'Hit',
        legendFullMiss: '0% Miss',
        legendBoundary: 'Boundary Cut',
        legendLowHit: 'Low Hit',
        kindHit: 'Hit',
        kindFullMiss: 'Unexpected 0% Miss',
        kindBoundary: 'Boundary Cut',
        kindLowHit: 'Low Hit',
        bounceYes: 'Yes (recovered next turn)',
        bounceNo: 'No',
        bounceBadge: 'Bounce-Back',
        showAnomalies: 'Show Top Anomalies ({n})',
        hideAnomalies: 'Hide Top Anomalies ({n})',
        copyIssue: 'Copy Issue Markdown',
        noAnomalies: 'No unexpected 0% misses or boundary cuts detected in this range.',
        noScatterPoints: 'No scatter points match the current model filter.',
        tipHitsTotal: 'Hits/Total: {hits}/{total} (Misses: {misses})',
        tipAvgHit: 'Avg Hit Ratio: {pct}',
        tipWeighted: 'Weighted Hit Ratio: {pct}',
        tipIdleGap: 'Idle Gap',
        tipStartGap: 'Start Gap',
        tipSeq: 'Prev → Cur → Next',
        tipBounce: 'Bounce-Back',
        tipPenalty: 'Wasted / Penalty',
        scatterAria: 'Idle-Gap vs Hit-Rate log scatter plot'
      },
      quota: {
        remaining: 'Left',
        used: 'Used',
        paceFastBad: 'Overpace',
        paceFastWarn: 'Fast',
        paceOk: 'Healthy',
        paceLabel: 'Pace {ratio}x · {lbl}',
        projectedNow: 'Projected now: {pct}',
        spentSince: 'Spent since: {usd}',
        emptyDesc: 'No quota anchors yet. Expand to log your remaining % (e.g. 94.25%) and estimate the implied cycle budget.',
        formTitle: 'Record Alignment Anchor',
        poolLabel: 'Quota Pool',
        pool3p: 'Third-Party (3P)',
        windowLabel: 'Window',
        win5h: '5h Window',
        win7d: '7d Cycle',
        pctLabel: 'Current Remaining (%)',
        pctPlaceholder: 'e.g. 94.25',
        pctHint: 'Supports up to 2 decimal places (e.g. 94.25); precision step is auto-detected for CI bounds.',
        resetLabel: 'Reset Countdown / Time (optional)',
        resetPlaceholder: 'e.g. 3h20m or 18:30',
        resetHint: 'Supports 3h20m / 45m / HH:MM',
        resetInheritHint: 'Leave blank to inherit {time}; enter new value if reset early',
        resetPreview: 'Est. reset: {time}',
        resetBad: 'Invalid format (try 3h20m, 45m, 14:30, or ISO timestamp)',
        captureTimeLabel: 'Captured At',
        now: 'Now',
        custom: 'Custom',
        noteLabel: 'Note (optional)',
        notePlaceholder: 'e.g. IDE settings snapshot',
        submitting: 'Saving…',
        submitBtn: 'Save Anchor',
        impliedTitle: '{pool} · {wt} Implied Budget',
        statusOk: 'High CI',
        statusLow: 'Low CI',
        statusCal: 'Calibrating',
        calDesc: 'Observed Δu = {du}% ({seg} segs), window spend {usd}; log more usage to complete budget inversion.',
        effDelta: 'Effective Δu: {du}% ({seg} segs) · Window {usd}',
        impliedRem: 'Implied left: {usd}',
        mixedWarn: '⚠ High multi-model variance detected in this pool; implied budget is approximate.',
        historyTitle: 'Anchor History ({n})',
        currentHistoryTitle: 'Current Cycle Anchors ({n})',
        noCurrentAnchors: 'No anchors logged in the current cycle yet.',
        showOlderCycles: 'Show Older Cycles ({m})',
        hideOlderCycles: 'Hide Older Cycles ({m})',
        precision: 'Step {step}%',
        resetAt: 'Reset {time}',
        invalidPct: 'Enter a valid percentage between 0 and 100 (up to 2 decimals, e.g. 94.25)',
        recordFailed: 'Failed to save anchor: {msg}',
        deleteFailed: 'Failed to delete anchor: {msg}',
        subsetBase: 'Base',
        subsetM: 'Models (M)',
        subsetC: 'Cache (C)',
        subsetO: 'Output (O)',
        subsetMC: 'M+C',
        subsetMO: 'M+O',
        subsetCO: 'C+O',
        subsetMCO: 'All (M+C+O)',
        factorM: 'Models (M)',
        factorC: 'Cache (C)',
        factorO: 'Output (O)',
        calibBadgeHelp: 'Orthogonal 3-factor calibration: Models (M), Cache (C), and Output (O) unlock independently based on each dimension’s observed variation.\nAuto mode evaluates all 8 subsets using LOOCV-MAE + χ² criteria with conservative lag coalescing to prevent overfitting.',
        mixEqHint: 'Current-mix eq.',
        clamped: 'clamped',
        maeStrip: 'MAE ±{mae}pp',
        labTitle: 'Weight Calibration Lab',
        labSummary: 'Rec {rec} · {n} segs',
        modeAuto: 'Auto',
        modeAutoHelp: 'Evaluates all 8 orthogonal subsets via LOOCV-MAE & χ² criteria to pick the optimal model.',
        modeManual: 'Manual {mode}',
        allFactorsUnlocked: 'All 3 orthogonal factors are eligible.',
        manualFallbackHint: 'Subset {subset} is ineligible ({reason}); showing {fallback}.',
        subsetIneligible: 'insufficient segments or collinearity',
        smoothSegSummary: '{anchors} anchors → {segs} smoothed segs ({merged} merged)',
        smoothHuberTag: 'Huber downweighted {n}',
        smoothTipInfo: 'Conservative smoothing merges tiny settlement-lag & micro-rebound intervals while conserving total spend & Δu; Huber IRLS downweights lag outliers.',
        baseAnchorLabel: '1.00× Base Anchor',
        anchorSrcDefault: 'Default',
        anchorSrcUser: 'Custom',
        anchorSrcFallback: 'Fallback',
        anchorPoolQ: 'Anchor Q: ~{usd}',
        anchorPoolQHelp: 'Anchor Q is the cycle budget measured in 1.00× Base Anchor API USD. The card headline shows your current-mix equivalent API budget so switching factor subsets stays smooth.',
        paramBase: 'Base 1.00×',
        paramFitted: 'Fitted',
        paramDefault: 'Default 1.00×',
        paramCacheName: 'Cache Read (α_cache)',
        paramOutName: 'Output / Thinking (α_out)',
        interpBase: 'Reference 1.00× API price scale for this quota pool.',
        interpModelEff: 'Consumes ~{v}× quota per API $ vs base (more efficient).',
        interpModelHeavy: 'Consumes ~{v}× quota per API $ vs base (heavier drain).',
        interpModelNeutral: 'Drains at nearly 1:1 rate vs base (~{v}×).',
        interpModelUnfit: 'Uses 1.00× API list ratio (enable M to fit).',
        interpCacheCheap: 'Cache reads drain {v}× their API price (extra savings).',
        interpCacheExpensive: 'Cache reads drain {v}× their API price (smaller discount).',
        interpCacheNeutral: 'Cache read discount aligns with API pricing (~{v}×).',
        interpCacheUnfit: 'Follows public API cache discount (enable C to fit).',
        interpOutExpensive: 'Output / thinking weight is {v}× its API price (costlier).',
        interpOutCheap: 'Output / thinking weight is {v}× its API price (cheaper).',
        interpOutNeutral: 'Output-to-input weight aligns with API pricing (~{v}×).',
        interpOutUnfit: 'Follows public API output ratio (enable O to fit).',
        trialNotAdopted: 'Not adopted · Trial {val}{clamped} ({reason})',
        trialReasonWorse: 'LOOCV ±{trial}pp worse than base ±{base}pp',
        trialReasonMarginal: 'LOOCV ±{trial}pp <15% gain vs base ±{base}pp',
        trialReasonChi2: 'χ² + 2·df gain below threshold',
        promoNoteFollow: 'Note: Current segments have not crossed a price transition; promo pass-through is unidentifiable and assumed to follow the API promo price.',
        promoNoteList: 'Note: Current segments have not crossed a price transition; currently assumed to follow standard list price.',
        residualTitle: 'Observed vs Predicted Residuals (pp)',
        residualNoData: 'Not enough segment fits in current cycle.',
        residualSummary: '{l0} ±{mae0}pp → {cur} ±{mae1}pp ({metric})',
        residualBaseOnly: '{base} ±{mae0}pp ({metric})',
        legendObs: 'Observed',
        legendBase: 'Base Pred',
        legendCur: '{lvl} Pred',
        legendHuber: 'Huber downweighted',
        segTipTitle: 'Segment #{idx} · Spend {usd}',
        segTipObs: 'Observed: {v}pp',
        segTipBase: 'Base Pred: {v}pp (err {err}pp)',
        segTipCur: '{lvl} Pred: {v}pp (err {err}pp)',
        segTipMerged: 'Merged {n} raw intervals',
        segTipDownweighted: 'Huber downweighted (lag outlier)'
      },
      settings: {
        title: 'Settings',
        closeTitle: 'Close settings',
        langSection: 'Language',
        langDesc: 'Switch UI language immediately (?lang=en overrides without saving)',
        generalSection: 'Refresh & Polling',
        autoRefreshName: 'Auto-Refresh Interval',
        autoRefreshDesc: 'Polls only while pane is visible; pauses automatically in background',
        autoRefreshHelp: 'Controls automatic polling frequency while the side pane is visible.\nWhen hidden or minimized, polling pauses completely for zero idle overhead.',
        modulesSection: 'Modules & Order',
        moveUp: 'Move up',
        moveDown: 'Move down',
        toggleModuleTitle: 'Enable or disable this module',
        sourcesSection: 'Data Sources & Local Index',
        sourcesHelp: 'All conversation databases are opened strictly read-only (mode=ro) and never modified or uploaded.\nEnabled sources are aggregated into the local SQLite index for analytics modules.',
        desktopName: 'Antigravity Desktop',
        desktopDesc: 'Read-only scan of conversations/*.db ({n} DBs)',
        cliName: 'Antigravity CLI',
        cliDesc: 'Read-only scan of antigravity-cli/conversations/*.db ({n} DBs)',
        indexedTurns: 'Indexed turns: {n}',
        lastIndexed: 'Last indexed: {time}',
        rebuildHint: 'Rebuilding clears only the telemetry cache; quota anchors are preserved.',
        rebuilding: 'Rebuilding…',
        rebuildBtn: 'Rebuild Index',
        rebuildDone: 'Rebuild done: {dbs} DBs scanned in {ms}ms',
        rebuildFail: 'Rebuild failed: {msg}',
        pricingSection: 'Pricing Management',
        promoBadge: 'Promo',
        defaultAnchorsNote: 'Default 1.00× Anchors: {list}',
        defaultsPath: 'Offline defaults (pricing_defaults.json)',
        builtinDefaults: 'Built-in defaults',
        overridesPath: 'User overrides (pricing_overrides.json)',
        autoSyncName: 'Auto-Sync Remote Pricing',
        autoSyncDesc: 'Updates reference rates every 24h from LiteLLM / OpenRouter',
        autoSyncHelp: 'When enabled, refreshes public reference API prices every 24h from LiteLLM / OpenRouter JSON.\nWhen disabled, runs 100% offline using built-in defaults and local overrides.',
        lastSynced: 'Last sync: {time}',
        neverSynced: 'Never synced',
        syncing: 'Syncing…',
        syncBtn: 'Sync Pricing Now',
        syncOk: 'Synced successfully ({n} models matched)',
        syncErr: 'Sync warning: {msg}',
        syncFail: 'Sync failed: {msg}',
        collapsePricing: 'Hide Model Pricing & Overrides',
        expandPricing: 'Show Model Pricing & Custom Overrides',
        loadingPricing: 'Loading pricing table…',
        restoreDefault: 'Reset',
        saveOverride: 'Save Override',
        restoreFail: 'Reset failed: {msg}',
        saveFail: 'Save override failed: {msg}',
        thThreshold: 'Long-Context Threshold',
        thThresholdPlaceholder: 'Empty = none',
        thInAbove: 'Above-Thresh Input ($/1M)',
        thOutAbove: 'Above-Thresh Output ($/1M)',
        thCacheAbove: 'Above-Thresh Cache Read ($/1M)'
      }
    }
  };

  I18N['zh-CN'].codex = {
    selectThread: '选择会话', searchThreads: '搜索近期会话', recentThreads: '近期会话',
    noMatchingThreads: '没有匹配的会话', noRecentThreads: '没有带用量记录的近期会话',
    loadingThreads: '正在读取会话…', threadListUnavailable: '会话列表暂时无法加载',
    clearThread: '清除', providerFilter: '历史统计 Provider', allProviders: '全部来源',
    quotaLoading: '正在读取官方订阅额度…', quotaUnavailable: '官方订阅额度暂不可用',
    quotaStale: '额度更新失败 · 显示上次快照', quotaUpdated: '自动采集 · {time}',
    reset: '重置于 {time}', samples: '本周期已采集 {n} 个快照',
    quotaMethod: '订阅额度倍率正在采样。API 等价成本、公开的 Credits 费率和订阅额度使用率各自独立。',
    apiStandard: 'API Standard 参考价', creditMultiple: 'Credits 费率为 6.2 Sol 的 {n}×', creditRate: '公开 Credits 费率 · 每百万未缓存输入 / 缓存输入 / 输出：{rate}'
  };
  I18N.en.codex = {
    selectThread: 'Select thread', searchThreads: 'Search recent threads', recentThreads: 'Recent threads',
    noMatchingThreads: 'No matching threads', noRecentThreads: 'No recent threads with usage',
    loadingThreads: 'Loading threads…', threadListUnavailable: 'Thread list unavailable',
    clearThread: 'Clear', providerFilter: 'Analytics provider', allProviders: 'All providers',
    quotaLoading: 'Reading subscription quota…', quotaUnavailable: 'Subscription quota unavailable',
    quotaStale: 'Refresh failed · last snapshot', quotaUpdated: 'Collected automatically · {time}',
    reset: 'Resets {time}', samples: '{n} samples in this window',
    quotaMethod: 'Collecting samples for allowance estimates. API cost, published credit rates and subscription allowance are measured separately.',
    apiStandard: 'API Standard reference', creditMultiple: '{n}× the 6.2 Sol credit rate', creditRate: 'Published credits per million uncached input / cached input / output: {rate}'
  };
  const codexModuleCopy = [
    ['live-context', '最近一次请求使用的上下文窗口，百分比按 Codex 状态栏口径。', 'Context used by the latest request. The percentage follows Codex status.'],
    ['cache-diagnostics', '最近一次请求和本机记录中此会话的加权缓存命中率。', 'Latest request and weighted cache hit rate for this thread on this host.'],
    ['io-flow', '区分未缓存输入、缓存输入、推理输出和可见输出。', 'Uncached input, cached input, reasoning output and visible output.'],
    ['model-cost', '本机用量按模型汇总。金额是 OpenAI API Standard 文本等价价。', 'Local usage by model, with OpenAI API Standard text price estimates.'],
    ['calendar-trends', '最近 30 天的本机用量，可按天查看。', 'Local activity for the past 30 days with daily drill-down.'],
    ['quota-budget', '自动采集官方订阅额度、窗口和重置时间。', 'Automatically collects official subscription allowance, windows and reset times.'],
  ];
  for (const [id, zh, en] of codexModuleCopy) {
    Object.assign(I18N['zh-CN'].modules[id], {headHelp: zh, setHelp: zh, desc: zh});
    Object.assign(I18N.en.modules[id], {headHelp: en, setHelp: en, desc: en});
  }
  Object.assign(I18N['zh-CN'].ctx, {markers: '模型有效窗口', nearCompact: '上下文占用较高', nearWarnBanner: '上下文占用较高。', noBreakdown: 'Codex 未提供按内容类别拆分。', noActive: '尚未选定会话', noData: '请选择有用量记录的 Codex 会话。'});
  Object.assign(I18N.en.ctx, {markers: 'Effective model window', nearCompact: 'Context nearly full', nearWarnBanner: 'Context usage is high.', noBreakdown: 'Codex does not report a category breakdown.', noActive: 'No thread selected', noData: 'Select a Codex thread with recorded usage.'});
  I18N['zh-CN'].modules['quota-budget'].title = '订阅额度';
  I18N.en.modules['quota-budget'].title = 'Subscription quota';
  I18N['zh-CN'].common.turns = '请求';
  I18N.en.common.turns = 'requests';
  I18N['zh-CN'].cache.lastTurn = '最近请求';
  I18N.en.cache.lastTurn = 'Last request';
  I18N['zh-CN'].ctx.turnsDur = '{turns} 次请求 · {dur}';
  I18N.en.ctx.turnsDur = '{turns} requests · {dur}';
  I18N['zh-CN'].cost.modelSub = '{turns} 次请求 · {tok} tokens · 缓存 {cache}';
  I18N.en.cost.modelSub = '{turns} requests · {tok} tokens · {cache} cached';

  function getLang() {
    if (state.query.lang) return state.query.lang;
    const cfgLang = normalizeLang(state.config.lang);
    return cfgLang || 'zh-CN';
  }

  function t(path, vars) {
    const lang = getLang();
    const parts = path.split('.');
    let cur = I18N[lang];
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
      else {
        cur = null;
        break;
      }
    }
    if (cur == null && lang !== 'zh-CN') {
      cur = I18N['zh-CN'];
      for (const p of parts) {
        if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
        else {
          cur = path;
          break;
        }
      }
    }
    if (typeof cur === 'function') return cur(vars);
    let str = String(cur ?? path);
    if (vars && typeof vars === 'object') {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replaceAll(`{${k}}`, String(v ?? ''));
      }
    }
    return str;
  }

  // =========================================================================
  // 5. Formatting, Escaping & Defensive Utilities
  // =========================================================================
  function esc(val) {
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function helpTip(tipText) {
    return `<button type="button" class="help-tip" data-tip="${esc(tipText)}" data-stop-card aria-label="${esc(t('common.help'))}">?</button>`;
  }

  function num(val, fallback = 0) {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  function fmtTokens(n) {
    const v = num(n, 0);
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}k`;
    return `${Math.round(v)}`;
  }

  function fmtUsd(n, digits = 2) {
    const v = num(n, 0);
    if (v > 0 && v < 0.01 && digits === 2) return `$${v.toFixed(4)}`;
    return `$${v.toFixed(digits)}`;
  }

  function fmtPct(ratio, digits = 1) {
    return `${(clamp(num(ratio, 0), 0, 1) * 100).toFixed(digits)}%`;
  }

  function fmtPctDirect(pct, precisionStep) {
    const v = clamp(num(pct, 0), 0, 100);
    if (precisionStep != null && precisionStep <= 0.01) return `${v.toFixed(2)}%`;
    if (precisionStep != null && precisionStep <= 0.1) return `${v.toFixed(1)}%`;
    if (Math.abs(v - Math.round(v)) > 0.001) return `${v.toFixed(2)}%`;
    return `${Math.round(v)}%`;
  }

  function fmtDurationMs(ms) {
    if (ms == null) return '—';
    const v = num(ms, -1);
    if (v < 0) return '—';
    if (v === 0) return '0ms';
    if (v < 1000) return `${Math.round(v)}ms`;
    if (v < 60000) return `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}s`;
    const mins = Math.floor(v / 60000);
    if (mins < 60) {
      const remS = Math.round((v % 60000) / 1000);
      return remS > 0 && mins < 10 ? `${mins}m${remS}s` : `${mins}m`;
    }
    const hrs = Math.floor(mins / 60);
    const remM = mins % 60;
    return `${hrs}h${remM ? remM + 'm' : ''}`;
  }

  function fmtRelTime(tsMs) {
    if (!tsMs) return '—';
    const diff = Math.max(0, Date.now() - num(tsMs, 0));
    const sec = Math.floor(diff / 1000);
    if (sec < 5) return t('common.justNow');
    if (sec < 60) return t('common.secAgo', { n: sec });
    const min = Math.floor(sec / 60);
    if (min < 60) return t('common.minAgo', { n: min });
    const hr = Math.floor(min / 60);
    if (hr < 24) return t('common.hrAgo', { n: hr });
    const day = Math.floor(hr / 24);
    return t('common.dayAgo', { n: day });
  }

  function fmtTimeShort(tsMs) {
    if (!tsMs) return '—';
    const d = new Date(num(tsMs));
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (x) => String(x).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtResetClock(tsMs) {
    if (!tsMs) return '—';
    const d = new Date(num(tsMs));
    if (Number.isNaN(d.getTime())) return '—';
    const now = new Date();
    const pad = (x) => String(x).padStart(2, '0');
    const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    ) {
      return hhmm;
    }
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hhmm}`;
  }

  function getInheritableResetAt(pool, windowType) {
    const summaries = Array.isArray(state.quotaData?.summaries) ? state.quotaData.summaries : [];
    const match = summaries.find((s) => s.pool === pool && s.windowType === windowType);
    if (!match) return null;
    const candidate = match.inheritableResetAt ?? match.latestAnchor?.resetAt ?? match.latestAnchor?.reset_at ?? null;
    if (candidate != null && Number.isFinite(Number(candidate)) && Number(candidate) > Date.now()) {
      return Number(candidate);
    }
    return null;
  }

  function fmtLocalDateStr(d) {
    const pad = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function baseName(p) {
    if (!p) return t('common.unknownWorkspace');
    const clean = String(p).replace(/^file:\/\//, '').replace(/\/+$/, '');
    const parts = clean.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : clean;
  }

  function poolLabel(pool) {
    if (pool === 'gemini') return 'Gemini';
    if (pool === 'argon') return 'Argon';
    if (pool === '3p') return 'Third-Party';
    return pool || t('common.unknownPool');
  }

  function sourceLabel(src) {
    if (src === 'desktop') return t('source.desktop');
    if (src === 'cli') return t('source.cli');
    return src || t('common.unknown');
  }

  function pricingSourceLabel(src) {
    if (src === 'default' || src === 'remote' || src === 'override' || src === 'unpriced') {
      return t(`pricingSrc.${src}`);
    }
    return src || t('pricingSrc.default');
  }

  function shortModelName(canonicalId) {
    const id = String(canonicalId || '').trim();
    const map = {
      'gemini-4-neon': 'Neon',
      'gemini-4-hydrogen': 'Hydrogen',
      'gemini-4-carbon': 'Carbon',
      'gemini-4-argon': 'Argon',
      'gemini-3.8-flash': '3.8 Flash',
      'gemini-3.5-flash-lite': '3.5 Lite',
      'claude-opus-5-5': 'Opus 5.5',
      'claude-sonnet-5-5': 'Sonnet 5.5',
      'gpt-oss-120b': 'GPT-OSS'
    };
    if (map[id]) return map[id];
    return id.replace(/^(?:gemini|claude)-/, '');
  }

  function factorsToSubsetKey(factors) {
    const parts = [];
    if (factors?.M) parts.push('M');
    if (factors?.C) parts.push('C');
    if (factors?.O) parts.push('O');
    return parts.length ? parts.join('+') : 'base';
  }

  function subsetKeyToFactors(key) {
    const parts = new Set(String(key || 'base').split('+'));
    return {
      M: parts.has('M'),
      C: parts.has('C'),
      O: parts.has('O')
    };
  }

  function calibSubsetLabel(subsetKey) {
    const map = {
      base: 'quota.subsetBase',
      M: 'quota.subsetM',
      C: 'quota.subsetC',
      O: 'quota.subsetO',
      'M+C': 'quota.subsetMC',
      'M+O': 'quota.subsetMO',
      'C+O': 'quota.subsetCO',
      'M+C+O': 'quota.subsetMCO'
    };
    return t(map[subsetKey] || 'quota.subsetBase');
  }

  function calibSubsetShort(subsetKey) {
    return !subsetKey || subsetKey === 'base' ? t('quota.subsetBase') : String(subsetKey);
  }

  function fmtMultWithSe(p) {
    const v = num(p?.value, 1).toFixed(2);
    if (p?.se != null && Number.isFinite(Number(p.se))) {
      return `${v}±${num(p.se).toFixed(2)}×`;
    }
    return `${v}×`;
  }

  function parseResetInput(raw) {
    const text = String(raw || '').trim();
    if (!text) return { ok: true, ts: null, preview: '' };

    const durRe = /^(?:(\d+(?:\.\d+)?)\s*d)?\s*(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?\s*(?:(\d+(?:\.\d+)?)\s*s)?$/i;
    const m = text.match(durRe);
    if (m && (m[1] || m[2] || m[3] || m[4])) {
      const ms =
        (num(m[1], 0) * 86400 +
          num(m[2], 0) * 3600 +
          num(m[3], 0) * 60 +
          num(m[4], 0)) *
        1000;
      if (ms > 0) {
        const ts = Math.round(Date.now() + ms);
        return { ok: true, ts, preview: t('quota.resetPreview', { time: fmtTimeShort(ts) }) };
      }
    }

    const hm = text.match(/^(\d{1,2}):(\d{2})$/);
    if (hm) {
      const hh = Number(hm[1]);
      const mm = Number(hm[2]);
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        const d = new Date();
        d.setHours(hh, mm, 0, 0);
        if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
        const ts = d.getTime();
        return { ok: true, ts, preview: t('quota.resetPreview', { time: fmtTimeShort(ts) }) };
      }
    }

    const parsed = Date.parse(text);
    if (!Number.isNaN(parsed)) {
      return { ok: true, ts: parsed, preview: t('quota.resetPreview', { time: fmtTimeShort(parsed) }) };
    }

    return { ok: false, ts: null, preview: t('quota.resetBad') };
  }

  // =========================================================================
  // 6. Default Config & Application State
  // =========================================================================
  const OBS_MATRIX_METRIC_IDS = ['weightedHit', 'keepRate', 'avgCost', 'totalCost', 'missPenalty', 'turns'];

  const DEFAULT_CONFIG = {
    lang: 'zh-CN',
    modules: {
      'live-context': true,
      'cache-diagnostics': true,
      'io-flow': true,
      'model-cost': true,
      'calendar-trends': true,
      'cache-observatory': true,
      'quota-budget': true
    },
    moduleOrder: [...ALL_MODULE_IDS],
    expanded: {
      'live-context': true,
      'cache-diagnostics': false,
      'io-flow': false,
      'model-cost': false,
      'calendar-trends': false,
      'cache-observatory': false,
      'quota-budget': false
    },
    sources: { desktop: true, cli: true },
    refreshSec: 30,
    pricingAutoSync: false,
    quotaDisplayMode: 'remaining',
    defaultRange: '7d',
    quotaAnchorsByPool: {},
    quotaCalibMode: 'auto',
    quotaManualFactors: { M: false, C: false, O: false },
    obsMatrixPrimary: 'weightedHit',
    obsMatrixSubMetrics: ['keepRate', 'avgCost']
  };

  const state = {
    booted: false,
    query: parseQueryOverrides(),
    localExpandedOverrides: new Map(), // temporary per-session expand override when ?expand is set
    config: structuredClone(DEFAULT_CONFIG),
    paths: {},
    pricingStatus: {},
    indexStatus: {},

    rangeKey: '7d',
    customFrom: '',
    customTo: '',
    threads: null,
    threadListFailed: false,
    threadMatches: [],
    activeThreadOption: -1,
    lensObs: {view:'matrix',gap:'idle',active:'0',period:'1d',model:'',metric:'weighted',breaks:'',models:[]},
    lensObsData: null,
    lensObsError: null,

    ioScope: 'session', // 'session' | 'analytics'
    modelSort: 'cost', // 'cost' | 'turns' | 'tokens' | 'cache'
    modelView: 'models', // 'models' | 'workspaces'
    calMetric: 'tokens', // 'cost' | 'tokens' | 'turns'
    widePane: window.matchMedia('(min-width: 680px)').matches,

    ctxOpenCategories: new Set(),
    selectedDay: null, // { date, loading, error, data }

    // Cache Observatory UI state
    obsModelFilter: 'all',
    obsAnomaliesOpen: false,
    obsMetricMenuOpen: false,
    obsPinnedCell: null, // { modelIdx, bucketKey } | null
    obsCopyStatus: '', // '' | 'copied' | 'failed'
    obsCopyTimer: null,

    // Quota Calibration Lab & History UI state
    quotaLabOpenByKey: new Map(),
    quotaOlderOpen: false,

    session: null,
    sessionError: null,
    analytics: null,
    analyticsError: null,
    quotaData: null,
    quotaError: null,

    quotaForm: {
      pool: 'gemini',
      windowType: '7d',
      remainingPct: '',
      resetInput: '',
      captureOffsetMin: 0, // 0 = now, -5, -15, or 'custom'
      customCaptureAt: '',
      note: '',
      submitting: false,
      error: ''
    },

    pricing: {
      expanded: false,
      loading: false,
      prefetching: false,
      data: null,
      error: '',
      syncing: false,
      syncMsg: '',
      editingId: null,
      draft: null
    },

    rebuilding: false,
    rebuildMsg: '',

    settingsOpen: false,
    refreshing: false,
    refreshQueued: false,
    lastUpdatedAt: 0,
    globalError: '',
    refreshTimer: null,
    freshnessTimer: null,
    pinnedHelpEl: null
  };

  // =========================================================================
  // 7. DOM References & Logo Fallback
  // =========================================================================
  const $ = (id) => document.getElementById(id);
  const dom = {
    loadingShell: $('loading-shell'),
    app: $('app'),
    stickyHeader: $('sticky-header'),
    brandLogoImg: $('brand-logo-img'),
    brandLogoFallback: $('brand-logo-fallback'),
    appTitle: $('app-title'),
    freshness: $('freshness'),
    freshnessText: $('freshness-text'),
    refreshSelectWrap: $('refresh-select-wrap'),
    refreshSelect: $('refresh-select'),
    btnRefresh: $('btn-refresh'),
    btnSettings: $('btn-settings'),
    rangeBar: $('range-bar'),
    rangePills: $('range-pills'),
    customRangeRow: $('custom-range-row'),
    customFrom: $('custom-from'),
    customTo: $('custom-to'),
    btnApplyCustom: $('btn-apply-custom'),
    threadPicker: $('thread-picker'),
    threadTrigger: $('thread-trigger'),
    threadTitle: $('thread-title'),
    threadProvider: $('thread-provider'),
    threadPopover: $('thread-popover'),
    threadSearch: $('thread-search'),
    threadClear: $('thread-clear'),
    threadOptions: $('thread-options'),
    threadEmpty: $('thread-empty'),
    providerFilter: $('provider-filter'),
    providerSelect: $('provider-select'),
    globalBanner: $('global-banner'),
    modulesGrid: $('modules-grid'),
    emptyModules: $('empty-modules'),
    emptyTitle: $('empty-title'),
    emptyDesc: $('empty-desc'),
    btnOpenSettingsEmpty: $('btn-open-settings-empty'),
    settingsBackdrop: $('settings-backdrop'),
    settingsDrawer: $('settings-drawer'),
    settingsTitle: $('settings-title'),
    btnCloseSettings: $('btn-close-settings'),
    settingsBody: $('settings-body'),
    chartTooltip: $('chart-tooltip'),
    obsCellPopover: $('obs-cell-popover')
  };

  function setupLogoFallback() {
    const img = dom.brandLogoImg;
    const svg = dom.brandLogoFallback;
    if (!img || !svg) return;
    const showFallback = () => {
      img.classList.add('hidden');
      svg.classList.remove('hidden');
    };
    img.addEventListener('error', showFallback);
    if (img.complete && img.naturalWidth === 0) showFallback();
  }
  setupLogoFallback();

  // =========================================================================
  // 8. Effective View Helpers & Data Fetching
  // =========================================================================
  function isModuleActiveForView(id) {
    if (state.query.onlySet) return state.query.onlySet.has(id);
    return Boolean(state.config.modules[id]);
  }

  function isCardExpandedForView(id) {
    if (state.localExpandedOverrides.has(id)) {
      return state.localExpandedOverrides.get(id);
    }
    if (state.query.expandAll) return true;
    if (state.query.expandSet) return state.query.expandSet.has(id);
    return Boolean(state.config.expanded[id]);
  }

  function getActiveSourcesList() {
    const out = [];
    if (state.config.sources?.desktop) out.push('desktop');
    if (state.config.sources?.cli) out.push('cli');
    return out;
  }

  function hasAnyAnalyticsModule() {
    return Boolean(
      isModuleActiveForView('model-cost') ||
        isModuleActiveForView('calendar-trends') ||
        isModuleActiveForView('cache-observatory') ||
        (isModuleActiveForView('io-flow') && state.ioScope === 'analytics')
    );
  }

  function getNeededSessionModules() {
    const list = [];
    if (isModuleActiveForView('live-context')) list.push('live-context');
    if (isModuleActiveForView('cache-diagnostics')) list.push('cache-diagnostics');
    if (isModuleActiveForView('io-flow') && state.ioScope === 'session') list.push('io-flow');
    return list;
  }

  function getNeededAnalyticsModules() {
    const list = [];
    if (isModuleActiveForView('io-flow') && state.ioScope === 'analytics') list.push('io-flow');
    if (isModuleActiveForView('model-cost')) list.push('model-cost');
    if (isModuleActiveForView('calendar-trends')) list.push('calendar-trends');
    if (isModuleActiveForView('cache-observatory')) list.push('cache-observatory');
    return list;
  }

  function normalizeConfigPayload(res) {
    if (!res) return;
    const cfg = res.config || {};
    const rawMf = cfg.quotaManualFactors && typeof cfg.quotaManualFactors === 'object' ? cfg.quotaManualFactors : null;
    let quotaCalibMode = cfg.quotaCalibMode === 'manual' ? 'manual' : 'auto';
    let quotaManualFactors = {
      M: Boolean(rawMf?.M),
      C: Boolean(rawMf?.C),
      O: Boolean(rawMf?.O)
    };
    if (['L0', 'L1', 'L2', 'L3'].includes(cfg.quotaCalibMode)) {
      quotaCalibMode = 'manual';
      if (!rawMf) {
        quotaManualFactors = {
          M: cfg.quotaCalibMode === 'L1' || cfg.quotaCalibMode === 'L2' || cfg.quotaCalibMode === 'L3',
          C: cfg.quotaCalibMode === 'L2' || cfg.quotaCalibMode === 'L3',
          O: cfg.quotaCalibMode === 'L3'
        };
      }
    }
    const obsMatrixPrimary = OBS_MATRIX_METRIC_IDS.includes(cfg.obsMatrixPrimary)
      ? cfg.obsMatrixPrimary
      : DEFAULT_CONFIG.obsMatrixPrimary;
    const rawObsSubs = Array.isArray(cfg.obsMatrixSubMetrics)
      ? cfg.obsMatrixSubMetrics
      : DEFAULT_CONFIG.obsMatrixSubMetrics;
    const obsSubSet = new Set();
    for (const id of rawObsSubs) {
      if (OBS_MATRIX_METRIC_IDS.includes(id) && id !== obsMatrixPrimary) {
        obsSubSet.add(id);
      }
    }
    const obsMatrixSubMetrics = OBS_MATRIX_METRIC_IDS.filter((id) => obsSubSet.has(id));
    state.config = {
      ...DEFAULT_CONFIG,
      ...cfg,
      lang: normalizeLang(cfg.lang) || DEFAULT_CONFIG.lang,
      modules: { ...DEFAULT_CONFIG.modules, ...(cfg.modules || {}) },
      expanded: { ...DEFAULT_CONFIG.expanded, ...(cfg.expanded || {}) },
      sources: { ...DEFAULT_CONFIG.sources, ...(cfg.sources || {}) },
      quotaAnchorsByPool: {
        ...(cfg.quotaAnchorsByPool && typeof cfg.quotaAnchorsByPool === 'object' ? cfg.quotaAnchorsByPool : {})
      },
      quotaCalibMode,
      quotaManualFactors,
      obsMatrixPrimary,
      obsMatrixSubMetrics,
      moduleOrder: Array.isArray(cfg.moduleOrder) && cfg.moduleOrder.length
        ? cfg.moduleOrder.filter((id) => ALL_MODULE_IDS.includes(id))
        : [...DEFAULT_CONFIG.moduleOrder]
    };
    for (const id of DEFAULT_CONFIG.moduleOrder) {
      if (!state.config.moduleOrder.includes(id)) state.config.moduleOrder.push(id);
    }
    state.paths = res.paths || {};
    state.pricingStatus = res.pricingStatus || {};
    state.indexStatus = res.indexStatus || {};
  }

  async function saveConfigPatch(patch) {
    try {
      const res = await postJson('/api/config', patch);
      normalizeConfigPayload(res);
      return true;
    } catch (err) {
      state.globalError = t('header.configSaveErr', { msg: err.message });
      renderHeader();
      return false;
    }
  }

  async function refreshQuotaOnly() {
    try {
      state.quotaData = await getJson('/api/quota');
      state.quotaError = null;
    } catch (err) {
      state.quotaError = err.message;
    }
    renderGrid();
  }

  async function refreshAll(manual = false) {
    if (state.refreshing) {
      if (manual) state.refreshQueued = true;
      return;
    }
    if (!manual && document.visibilityState !== 'visible') return;

    state.refreshing = true;
    state.globalError = '';
    updateFreshnessUI();
    dom.btnRefresh.classList.add('spinning');

    try {
      const sessionMods = getNeededSessionModules();
      const analyticsMods = getNeededAnalyticsModules();
      const needQuota = isModuleActiveForView('quota-budget');
      const tasks = [
        getJson('/api/sessions').then(({threads}) => {
          const changed = JSON.stringify(state.threads) !== JSON.stringify(threads);
          state.threads = threads;
          state.threadListFailed = false;
          if (changed && isThreadPickerOpen()) renderThreadOptions();
        }).catch(() => {
          state.threadListFailed = true;
          if (state.threads === null && isThreadPickerOpen()) renderThreadOptions();
        })
      ];

      if (sessionMods.length > 0) {
        const id = resolveConversationId();
        const cid = encodeURIComponent(id);
        const mods = encodeURIComponent(sessionMods.join(','));
        tasks.push(
          getJson(`/api/session?conversationId=${cid}&modules=${mods}`)
            .then((d) => {
              if (resolveConversationId() !== id) return;
              state.session = d;
              state.sessionError = null;
            })
            .catch((e) => {
              if (resolveConversationId() !== id) return;
              state.sessionError = e.message;
            })
        );
      }

      if (analyticsMods.length > 0) {
        const mods = encodeURIComponent(analyticsMods.join(','));
        let qs = `range=${encodeURIComponent(state.rangeKey)}&provider=${encodeURIComponent(dom.providerSelect.value)}&modules=${mods}`;
        if (state.rangeKey === 'custom' && state.customFrom && state.customTo) {
          qs += `&from=${encodeURIComponent(state.customFrom)}&to=${encodeURIComponent(state.customTo)}`;
        }
        tasks.push(
          getJson(`/api/analytics?${qs}`)
            .then((d) => {
              state.analytics = d;
              state.analyticsError = null;
            })
            .catch((e) => {
              state.analyticsError = e.message;
            })
        );
      }

      if (isModuleActiveForView('cache-observatory')) {
        const opts = state.lensObs;
        const params = new URLSearchParams({
          range: state.rangeKey, provider: dom.providerSelect.value, from: state.customFrom,
          to: state.customTo, gap: opts.gap, active: opts.active, model: opts.model,
          period: opts.period, breaks: opts.breaks
        });
        tasks.push(getJson('/api/observatory?' + params).then((result) => {
          state.lensObsData = result;
          state.lensObsError = null;
          if (!opts.model) opts.models = [...new Set(result.matrix.map(row => row.model))];
        }).catch((err) => { state.lensObsError = err.message; }));
      }

      if (needQuota) {
        tasks.push(
          getJson('/api/quota')
            .then((d) => {
              state.quotaData = d;
              state.quotaError = null;
            })
            .catch((e) => {
              state.quotaError = e.message;
            })
        );
      }

      if (isModuleActiveForView('model-cost') && !state.pricing.data && !state.pricing.prefetching) {
        state.pricing.prefetching = true;
        tasks.push(
          getJson('/api/pricing')
            .then((d) => {
              if (!state.pricing.data) state.pricing.data = d;
            })
            .catch(() => {})
            .finally(() => {
              state.pricing.prefetching = false;
            })
        );
      }

      await Promise.all(tasks);
      state.lastUpdatedAt = Date.now();
    } catch (err) {
      state.globalError = err.message || t('header.refreshFailed');
    } finally {
      state.refreshing = false;
      dom.btnRefresh.classList.remove('spinning');
      renderAll(!manual);
      if (state.refreshQueued) {
        state.refreshQueued = false;
        void refreshAll(true);
      }
    }
  }

  function resetRefreshTimer() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
    if (state.freshnessTimer) {
      clearInterval(state.freshnessTimer);
      state.freshnessTimer = null;
    }

    const sec = num(state.config.refreshSec, 30);
    if (document.visibilityState === 'visible') {
      if (sec > 0) {
        state.refreshTimer = setInterval(() => {
          if (document.visibilityState === 'visible') refreshAll(false);
        }, sec * 1000);
      }
      state.freshnessTimer = setInterval(updateFreshnessUI, 1000);
    }
    updateFreshnessUI();
  }

  function updateFreshnessUI() {
    const el = dom.freshness;
    const txt = dom.freshnessText;
    if (!el || !txt) return;
    el.classList.remove('paused', 'loading', 'error');

    if (state.refreshing) {
      el.classList.add('loading');
      txt.textContent = t('header.refreshing');
      return;
    }
    if (state.globalError) {
      el.classList.add('error');
      txt.textContent = t('header.error');
      return;
    }
    if (document.visibilityState !== 'visible') {
      el.classList.add('paused');
      txt.textContent = t('header.paused');
      return;
    }
    const sec = num(state.config.refreshSec, 30);
    if (sec === 0) {
      el.classList.add('paused');
      txt.textContent = state.lastUpdatedAt ? `${fmtRelTime(state.lastUpdatedAt)} · ${t('header.manual')}` : t('header.manual');
      return;
    }
    txt.textContent = state.lastUpdatedAt ? fmtRelTime(state.lastUpdatedAt) : t('header.pending');
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      resetRefreshTimer();
      refreshAll(false);
    } else {
      resetRefreshTimer();
    }
  });

  // =========================================================================
  // 9. Rendering: Static I18N & Header / Filter Bar
  // =========================================================================
  function applyStaticI18n() {
    const lang = getLang();
    if (document.documentElement.lang !== lang) {
      document.documentElement.lang = lang;
    }
    dom.appTitle.textContent = 'Codex Lens';
    renderThreadTrigger();
    dom.threadSearch.placeholder = t('codex.searchThreads');
    dom.threadSearch.setAttribute('aria-label', t('codex.searchThreads'));
    dom.threadOptions.setAttribute('aria-label', t('codex.recentThreads'));
    dom.threadClear.textContent = t('codex.clearThread');
    dom.providerFilter.title = t('codex.providerFilter');
    dom.providerSelect.setAttribute('aria-label', t('codex.providerFilter'));
    dom.providerSelect.querySelector('[value=""]').textContent = t('codex.allProviders');
    dom.freshness.title = t('header.freshnessTitle');
    dom.refreshSelectWrap.title = t('header.refreshIntervalTitle');
    dom.refreshSelect.setAttribute('aria-label', t('header.refreshIntervalAria'));
    const offOpt = dom.refreshSelect.querySelector('option[value="0"]');
    if (offOpt) offOpt.textContent = t('header.off');
    dom.btnRefresh.title = t('header.refreshNow');
    dom.btnRefresh.setAttribute('aria-label', t('header.refreshNow'));
    dom.btnSettings.title = t('header.settingsTitle');
    dom.btnSettings.setAttribute('aria-label', t('header.settingsTitle'));

    dom.rangePills.setAttribute('aria-label', t('header.rangeGroupAria'));
    const pillLabels = {
      today: t('header.rangeToday'),
      all: t('header.rangeAll'),
      custom: t('header.rangeCustom')
    };
    dom.rangePills.querySelectorAll('.range-pill').forEach((btn) => {
      const r = btn.dataset.range;
      if (pillLabels[r]) btn.textContent = pillLabels[r];
    });
    dom.customFrom.setAttribute('aria-label', t('header.fromDateAria'));
    dom.customTo.setAttribute('aria-label', t('header.toDateAria'));
    dom.btnApplyCustom.textContent = t('header.apply');

    dom.emptyTitle.textContent = t('header.emptyTitle');
    dom.emptyDesc.textContent = t('header.emptyDesc');
    dom.btnOpenSettingsEmpty.textContent = t('header.openSettings');
    dom.settingsTitle.textContent = t('settings.title');
    dom.btnCloseSettings.title = t('settings.closeTitle');
    dom.btnCloseSettings.setAttribute('aria-label', t('settings.closeTitle'));
  }

  function renderHeader() {
    applyStaticI18n();
    dom.stickyHeader.classList.toggle('hidden', Boolean(state.query.hideHeader));

    const sec = String(num(state.config.refreshSec, 30));
    if (dom.refreshSelect.value !== sec) dom.refreshSelect.value = sec;
    updateFreshnessUI();

    const showAnalyticsBar = hasAnyAnalyticsModule();
    dom.rangeBar.classList.toggle('hidden', !showAnalyticsBar);
    dom.customRangeRow.classList.toggle(
      'hidden',
      !showAnalyticsBar || state.rangeKey !== 'custom'
    );

    if (showAnalyticsBar) {
      const pills = dom.rangeBar.querySelectorAll('.range-pill');
      pills.forEach((p) => {
        p.classList.toggle('active', p.dataset.range === state.rangeKey);
      });


    }

    if (state.globalError) {
      dom.globalBanner.textContent = state.globalError;
      dom.globalBanner.classList.remove('hidden');
    } else {
      dom.globalBanner.classList.add('hidden');
    }
  }

  // =========================================================================
  // 10. Rendering: Module 1 — Live Context
  // =========================================================================
  const CTX_COLORS = {
    1: 'var(--ctx-1)',
    2: 'var(--ctx-2)',
    3: 'var(--ctx-3)',
    4: 'var(--ctx-4)',
    5: 'var(--ctx-5)',
    6: 'var(--ctx-7)',
    7: 'var(--ctx-6)'
  };

  function getCtxColor(cat, idx) {
    if (cat && cat.id != null && CTX_COLORS[cat.id]) return CTX_COLORS[cat.id];
    const palette = ['var(--ctx-1)', 'var(--ctx-2)', 'var(--ctx-3)', 'var(--ctx-4)', 'var(--ctx-5)', 'var(--ctx-6)', 'var(--ctx-7)'];
    return palette[idx % palette.length];
  }

  function renderLiveContext(expanded) {
    if (state.sessionError) {
      return {
        badges: `<span class="pill bad">${esc(t('common.readFailed'))}</span>`,
        body: `<div class="banner error">${esc(state.sessionError)}</div>`
      };
    }
    const s = state.session;
    if (!s || !s.found || !s.liveContext) {
      return {
        badges: `<span class="pill outline">${esc(t('ctx.noActive'))}</span>`,
        body: `<div class="muted-note">${esc(t('ctx.noData'))}</div>`
      };
    }

    const lc = s.liveContext;
    const used = num(lc.contextUsed, 0);
    const limit = num(lc.compactLimit, 0);
    const ratio = lc.ratio == null ? null : clamp(lc.ratio, 0, 1);
    const pct = ratio === null ? 0 : Math.round(ratio * 100);
    const barClass = pct >= 80 ? 'bad' : pct >= 55 ? 'warn' : '';

    const badges = `
      <span class="pill accent truncate" title="${esc(lc.modelId || lc.displayName)}">${esc(lc.displayName || lc.modelId || t('common.unknownModel'))}</span>
      ${lc.pool ? `<span class="pill outline">${esc(poolLabel(lc.pool))}</span>` : ''}
    `;

    const titleText = s.title || baseName(s.workspace) || (s.conversationId ? s.conversationId.slice(0, 8) : '');
    let html = `
      <div class="session-meta-row">
        <span class="pill outline">${esc(s.source)}</span>
        <span class="truncate" title="${esc(s.title || s.workspace || s.conversationId)}">${esc(titleText)}</span>
      </div>
      <div class="ctx-progress-wrap">
        <div class="ctx-numbers">
          <span class="ctx-used num mono">${fmtTokens(used)} <span class="muted-note">/ ${limit ? fmtTokens(limit) : '—'}</span></span>
          <span class="num mono ${pct >= 80 ? 'pill bad' : pct >= 55 ? 'pill warn' : 'muted-note'}">${ratio === null ? '—' : pct.toFixed(1) + '%'}</span>
        </div>
        <div class="ctx-track" role="progressbar" aria-valuenow="${pct.toFixed(1)}" aria-valuemin="0" aria-valuemax="100">
          <div class="ctx-fill ${barClass}" style="width:${clamp(pct, 0, 100).toFixed(2)}%"></div>
          <span class="ctx-tick" style="left:55%" title="${esc(t('ctx.warn55'))}"></span>
          <span class="ctx-tick" style="left:80%" title="${esc(t('ctx.warn80'))}"></span>
        </div>
        <div class="chart-caption-row num">
          <span>${esc(t('ctx.turnsDur', { turns: num(lc.turnCount, 0), dur: fmtDurationMs(lc.sessionDurationMs) }))}</span>
          ${pct >= 75 ? `<span class="pill warn">${esc(t('ctx.nearCompact'))}</span>` : `<span>${esc(t('ctx.markers'))}</span>`}
        </div>
      </div>
    `;

    if (expanded) {
      let expHtml = '<div class="card-expanded">';
      if (pct >= 75) {
        expHtml += `<div class="banner warn">${esc(t('ctx.nearWarnBanner'))}</div>`;
      }

      const breakdown = Array.isArray(lc.breakdown) ? lc.breakdown.filter((b) => num(b.tokens, 0) > 0) : [];
      const bdTotal = breakdown.reduce((acc, b) => acc + num(b.tokens, 0), 0) || used;

      if (breakdown.length > 0 && bdTotal > 0) {
        let xAcc = 0;
        const rects = breakdown.map((b, idx) => {
          const w = (num(b.tokens, 0) / bdTotal) * 300;
          const x = xAcc;
          xAcc += w;
          const share = ((num(b.tokens, 0) / bdTotal) * 100).toFixed(1);
          const tip = `${b.name || t('ctx.uncategorized')}: ${fmtTokens(b.tokens)} (${share}%)`;
          return `<rect x="${x.toFixed(2)}" y="0" width="${Math.max(1.5, w).toFixed(2)}" height="12" fill="${getCtxColor(b, idx)}" data-tip="${esc(tip)}" tabindex="0"/>`;
        }).join('');

        expHtml += `
          <svg class="svg-chart" viewBox="0 0 300 12" preserveAspectRatio="none" style="height:12px;border-radius:6px;overflow:hidden" aria-label="${esc(t('ctx.chartAria'))}">
            ${rects}
          </svg>
          <div class="breakdown-list">
        `;

        breakdown.forEach((b, idx) => {
          const key = `${b.id ?? idx}-${b.name}`;
          const items = Array.isArray(b.items) ? b.items : [];
          const isOpen = state.ctxOpenCategories.has(key);
          const share = ((num(b.tokens, 0) / bdTotal) * 100).toFixed(1);
          expHtml += `
            <div class="bd-row">
              <div class="bd-main ${items.length ? 'clickable' : ''}" ${items.length ? `data-action="toggle-ctx-cat" data-cat="${esc(key)}"` : ''}>
                <div class="bd-left">
                  <span class="bd-dot" style="background:${getCtxColor(b, idx)}"></span>
                  <span class="truncate">${esc(b.name || t('ctx.uncategorized'))}</span>
                  ${items.length ? `<span class="muted-note">(${items.length})</span>` : ''}
                </div>
                <div class="bd-right num mono">
                  <span>${fmtTokens(b.tokens)}</span>
                  <span>${share}%</span>
                  ${items.length ? `<span>${isOpen ? '▾' : '▸'}</span>` : ''}
                </div>
              </div>
              ${
                isOpen && items.length
                  ? `<div class="bd-items">${items.slice(0, 12).map((it) => `
                      <div class="bd-item">
                        <span class="truncate" title="${esc(it.name)}">${esc(it.name)}</span>
                        <span class="num mono">${fmtTokens(it.tokens)}</span>
                      </div>`).join('')}</div>`
                  : ''
              }
            </div>
          `;
        });
        expHtml += '</div>';
      } else {
        expHtml += `<div class="muted-note">${esc(t('ctx.noBreakdown'))}</div>`;
      }

      expHtml += '</div>';
      html += expHtml;
    }

    return { badges, body: html };
  }

  // =========================================================================
  // 11. Rendering: Module 2 — Cache Diagnostics
  // =========================================================================
  function renderCacheDiagnostics(expanded) {
    if (state.sessionError) {
      return {
        badges: `<span class="pill bad">${esc(t('common.readFailed'))}</span>`,
        body: `<div class="banner error">${esc(state.sessionError)}</div>`
      };
    }
    const s = state.session;
    if (!s || !s.found || !s.cacheDiagnostics) {
      return {
        badges: `<span class="pill outline">${esc(t('cache.noDataBadge'))}</span>`,
        body: `<div class="muted-note">${esc(t('cache.noDataBody'))}</div>`
      };
    }

    const cd = s.cacheDiagnostics;
    const last = cd.lastTurn || {};
    const sess = cd.session || {};
    const isCold = Boolean(last.cold);
    const lastHitRatio = num(last.hitRatio, 0);
    const sessHitRatio = num(sess.hitRatio, 0);

    const statusBadge = isCold
      ? `<span class="pill warn">${esc(t('cache.coldBadge'))}</span>`
      : lastHitRatio >= 0.75
        ? `<span class="pill ok num">${esc(t('cache.hitBadge', { pct: fmtPct(lastHitRatio, 0) }))}</span>`
        : `<span class="pill warn num">${esc(t('cache.hitBadge', { pct: fmtPct(lastHitRatio, 0) }))}</span>`;

    const html = `
      <div class="kpi-strip">
        <div class="kpi-tile">
          <span class="kpi-label">${esc(t('cache.lastTurn'))}</span>
          <span class="kpi-val num mono">${isCold ? 'Cold' : fmtPct(lastHitRatio, 1)}</span>
          <span class="kpi-sub num">${esc(t('cache.hitSub', { n: fmtTokens(last.cacheRead) }))}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">${esc(t('cache.sessionTotal'))}</span>
          <span class="kpi-val num mono">${fmtPct(sessHitRatio, 1)}</span>
          <span class="kpi-sub num">${fmtTokens(sess.totalCacheRead)} / ${fmtTokens(num(sess.totalCacheRead) + num(sess.totalUncachedIn))}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">${esc(t('cache.cacheSaved'))}</span>
          <span class="kpi-val ok num mono">${sess.cacheSavedUsd == null ? '—' : fmtUsd(sess.cacheSavedUsd)}</span>
          <span class="kpi-sub">${esc(t('cache.vsUncached'))}</span>
        </div>
      </div>
      ${expanded ? renderCacheExpanded(cd) + LensAnalytics.events(cd.anomalies || [], getLang()) : ''}
    `;

    return { badges: statusBadge, body: html };
  }

  function renderCacheExpanded(cd) {
    const turns = Array.isArray(cd.turns) ? cd.turns.slice(-15) : [];
    if (!turns.length) {
      return `<div class="card-expanded"><div class="muted-note">${esc(t('cache.noTrajectory'))}</div></div>`;
    }

    const maxTot = Math.max(
      1,
      ...turns.map((tItem) => num(tItem.cacheRead, 0) + num(tItem.uncachedIn, 0))
    );
    const W = 300;
    const H = 96;
    const padB = 14;
    const chartH = H - padB;
    const slotW = W / Math.max(turns.length, 1);
    const barW = clamp(slotW * 0.66, 6, 20);

    const clipDefs = [];
    const bars = turns.map((tItem, i) => {
      const cr = num(tItem.cacheRead, 0);
      const ui = num(tItem.uncachedIn, 0);
      const tot = cr + ui;
      const x = i * slotW + (slotW - barW) / 2;
      const crH = (cr / maxTot) * (chartH - 8);
      const uiH = (ui / maxTot) * (chartH - 8);
      const totH = crH + uiH;
      const yCr = chartH - crH;
      const yUi = yCr - uiH;
      const yTop = chartH - totH;
      const tag = tItem.cold ? t('cache.tipCold') : tItem.drop ? t('cache.tipDrop') : '';
      const tip = `Step #${tItem.stepIdx ?? i + 1}${tag}\n${t('cache.tipHit')}: ${fmtPct(tItem.hitRatio, 1)}\nCache Read: ${fmtTokens(cr)}\nUncached In: ${fmtTokens(ui)}`;
      const clipId = `cache-bar-clip-${i}`;
      if (totH > 0) {
        clipDefs.push(`<clipPath id="${clipId}"><rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${totH.toFixed(1)}" rx="3" ry="3"/></clipPath>`);
      }

      return `
        <g data-tip="${esc(tip)}" tabindex="0">
          <rect x="${x.toFixed(1)}" y="0" width="${barW.toFixed(1)}" height="${chartH}" fill="transparent"/>
          ${
            totH > 0
              ? `<g clip-path="url(#${clipId})">
                  ${crH > 0 ? `<rect x="${x.toFixed(1)}" y="${yCr.toFixed(1)}" width="${barW.toFixed(1)}" height="${crH.toFixed(1)}" rx="0" ry="0" fill="var(--ch-cache)"/>` : ''}
                  ${uiH > 0 ? `<rect x="${x.toFixed(1)}" y="${yUi.toFixed(1)}" width="${barW.toFixed(1)}" height="${uiH.toFixed(1)}" rx="0" ry="0" fill="${tItem.drop ? 'var(--bad)' : tItem.cold ? 'var(--warn)' : 'var(--ch-uncached)'}"/>` : ''}
                 </g>`
              : ''
          }
          ${(tItem.cold || tItem.drop) && tot > 0 ? `<circle cx="${(x + barW / 2).toFixed(1)}" cy="${Math.max(3, yUi - 4).toFixed(1)}" r="2.2" fill="${tItem.drop ? 'var(--bad)' : 'var(--warn)'}"/>` : ''}
          <text x="${(x + barW / 2).toFixed(1)}" y="${H - 2}" text-anchor="middle" font-size="8" fill="var(--fg-muted)" class="mono">${esc(tItem.stepIdx ?? i + 1)}</text>
        </g>
      `;
    }).join('');

    return `
      <div class="card-expanded">
        <div class="chart-caption-row">
          <span>${esc(t('cache.recentTitle', { n: turns.length }))}</span>
          <div class="legend-inline">
            <span class="legend-item"><span class="legend-swatch" style="background:var(--ch-cache)"></span>${esc(t('cache.legendCacheRead'))}</span>
            <span class="legend-item"><span class="legend-swatch" style="background:var(--ch-uncached)"></span>${esc(t('cache.legendUncached'))}</span>
            <span class="legend-item"><span class="legend-swatch" style="background:var(--warn)"></span>${esc(t('cache.legendCold'))}</span>
            <span class="legend-item"><span class="legend-swatch" style="background:var(--bad)"></span>${esc(t('cache.legendDrop'))}</span>
          </div>
        </div>
        <svg class="svg-chart" viewBox="0 0 ${W} ${H}" aria-label="${esc(t('cache.chartAria'))}">
          <defs>${clipDefs.join('')}</defs>
          <line x1="0" y1="${chartH}" x2="${W}" y2="${chartH}" stroke="var(--line)" stroke-width="1"/>
          ${bars}
        </svg>
      </div>
    `;
  }

  // =========================================================================
  // 12. Rendering: Module 3 — IO Flow
  // =========================================================================
  function renderIoFlow(expanded) {
    const isSess = state.ioScope === 'session';
    const err = isSess ? state.sessionError : state.analyticsError;
    const scopeToggle = `
      <div class="seg" data-stop-card>
        <button type="button" class="${isSess ? 'active' : ''}" data-action="set-io-scope" data-scope="session">${esc(t('io.scopeSession'))}</button>
        <button type="button" class="${!isSess ? 'active' : ''}" data-action="set-io-scope" data-scope="analytics">${esc(t('io.scopeGlobal'))}</button>
      </div>
    `;

    if (err) {
      return { badges: scopeToggle, body: `<div class="banner error">${esc(err)}</div>` };
    }

    const data = isSess ? state.session?.ioFlow : state.analytics?.ioFlow;
    if (!data || (isSess && !state.session?.found)) {
      return {
        badges: scopeToggle,
        body: `<div class="muted-note">${esc(isSess ? t('io.noSession') : t('io.noGlobal'))}</div>`
      };
    }

    const uncached = num(data.uncachedIn, 0);
    const cacheRead = num(data.cacheRead, 0);
    const cacheCreate = num(data.cacheCreate, 0);
    const thinking = num(data.thinkingOut, 0);
    const visible = num(data.visibleOut, 0);
    const totalOut = num(data.totalOut, thinking + visible);
    const total = num(data.totalTokens, uncached + cacheRead + cacheCreate + totalOut);

    const denom = Math.max(1, uncached + cacheRead + thinking + visible);
    const pU = (uncached / denom) * 100;
    const pC = (cacheRead / denom) * 100;
    const pT = (thinking / denom) * 100;
    const pV = (visible / denom) * 100;

    let rateHtml = '';
    if (isSess) {
      const durHr = num(state.session?.liveContext?.sessionDurationMs, 0) / 3600000;
      const burnStr = durHr > 0.01 ? `${fmtTokens(total / durHr)} tok/hr` : '';
      rateHtml = `<span class="io-rate num mono">${burnStr ? `${burnStr} · ` : ''}${data.unpricedTurns === data.turns && data.turns > 0 ? '—' : fmtUsd(data.costUsd)}</span>`;
    } else {
      rateHtml = `<span class="io-rate num mono">${fmtTokens(data.burnTokensPerHr)} tok/hr · ${data.unpricedTurns === data.turns && data.turns > 0 ? '—' : fmtUsd(data.burnUsdPerHr) + '/hr'}</span>`;
    }

    let html = `
      <div class="io-headline">
        <span class="io-big num mono">${fmtTokens(total)} <span class="muted-note" style="font-size:12px;font-weight:400">tokens</span></span>
        ${rateHtml}
      </div>
      <div class="ratio-bar" aria-label="${esc(t('io.barAria'))}">
        ${uncached > 0 ? `<div class="ratio-seg" style="width:${pU.toFixed(2)}%;background:var(--ch-uncached)" data-tip="${esc(`Uncached In: ${fmtTokens(uncached)} (${pU.toFixed(1)}%)`)}"></div>` : ''}
        ${cacheRead > 0 ? `<div class="ratio-seg" style="width:${pC.toFixed(2)}%;background:var(--ch-cache)" data-tip="${esc(`Cache Read: ${fmtTokens(cacheRead)} (${pC.toFixed(1)}%)`)}"></div>` : ''}
        ${thinking > 0 ? `<div class="ratio-seg" style="width:${pT.toFixed(2)}%;background:var(--ch-think)" data-tip="${esc(`Thinking Out: ${fmtTokens(thinking)} (${pT.toFixed(1)}%)`)}"></div>` : ''}
        ${visible > 0 ? `<div class="ratio-seg" style="width:${pV.toFixed(2)}%;background:var(--ch-visible)" data-tip="${esc(`Visible Out: ${fmtTokens(visible)} (${pV.toFixed(1)}%)`)}"></div>` : ''}
      </div>
      <div class="legend-inline num">
        <span class="legend-item"><span class="legend-swatch" style="background:var(--ch-uncached)"></span>${esc(t('io.uncachedShort'))} ${fmtTokens(uncached)}</span>
        <span class="legend-item"><span class="legend-swatch" style="background:var(--ch-cache)"></span>${esc(t('io.cacheReadShort'))} ${fmtTokens(cacheRead)}</span>
        <span class="legend-item"><span class="legend-swatch" style="background:var(--ch-think)"></span>${esc(t('io.thinkingShort'))} ${fmtTokens(thinking)}</span>
        <span class="legend-item"><span class="legend-swatch" style="background:var(--ch-visible)"></span>${esc(t('io.visibleShort'))} ${fmtTokens(visible)}</span>
      </div>
    `;

    if (expanded) {
      html += `
        <div class="card-expanded">
          <div class="metric-grid-5">
            <div class="metric-row">
              <span class="metric-key"><span class="legend-swatch" style="background:var(--ch-uncached)"></span>${esc(t('io.uncachedFull'))}</span>
              <span class="metric-val num mono">${uncached.toLocaleString()}</span>
            </div>
            <div class="metric-row">
              <span class="metric-key"><span class="legend-swatch" style="background:var(--ch-cache)"></span>${esc(t('io.cacheReadFull'))}</span>
              <span class="metric-val num mono">${cacheRead.toLocaleString()}${cacheCreate > 0 ? ` <span class="muted-note">${esc(t('io.cacheWriteNote', { n: fmtTokens(cacheCreate) }))}</span>` : ''}</span>
            </div>
            <div class="metric-row">
              <span class="metric-key"><span class="legend-swatch" style="background:var(--ch-think)"></span>${esc(t('io.thinkingFull'))}</span>
              <span class="metric-val num mono">${thinking.toLocaleString()}</span>
            </div>
            <div class="metric-row">
              <span class="metric-key"><span class="legend-swatch" style="background:var(--ch-visible)"></span>${esc(t('io.visibleFull'))}</span>
              <span class="metric-val num mono">${visible.toLocaleString()} / ${totalOut.toLocaleString()}</span>
            </div>
          </div>
          ${
            num(data.longContextTurns, 0) > 0 || num(data.unpricedTurns, 0) > 0
              ? `<div class="chart-caption-row">
                  ${num(data.longContextTurns, 0) > 0 ? `<span class="pill warn num">${esc(t('io.longCtxPill', { n: data.longContextTurns }))}</span>` : ''}
                  ${num(data.unpricedTurns, 0) > 0 ? `<span class="pill outline num">${esc(t('io.unpricedPill', { n: data.unpricedTurns }))}</span>` : ''}
                 </div>`
              : ''
          }
        </div>
      `;
    }

    return { badges: scopeToggle, body: html };
  }

  // =========================================================================
  // 13. Rendering: Module 4 — Model Cost & Workspaces
  // =========================================================================
  function renderModelCost(expanded) {
    if (state.analyticsError) {
      return {
        badges: `<span class="pill bad">${esc(t('common.readFailed'))}</span>`,
        body: `<div class="banner error">${esc(state.analyticsError)}</div>`
      };
    }

    const mc = state.analytics?.modelCost;
    if (!mc) {
      return {
        badges: `<span class="pill outline">${esc(t('cost.badge'))}</span>`,
        body: `<div class="muted-note">${esc(t('cost.noData'))}</div>`
      };
    }

    const models = Array.isArray(mc.models) ? [...mc.models] : [];
    const workspaces = Array.isArray(mc.workspaces) ? [...mc.workspaces] : [];
    const totalUsd = num(mc.totalCostUsd, 0);
    const savedUsd = num(mc.cacheSavedUsd, 0);

    const top3 = [...models]
      .sort((a, b) => num(b.costUsd, 0) - num(a.costUsd, 0))
      .slice(0, 3);

    let html = `
      <div class="chart-caption-row">
        <span>${fmtTokens(mc.totalTokens)} tok · ${num(mc.turns).toLocaleString()} req · ${num(mc.userTurns).toLocaleString()} turns</span>
        ${mc.credits == null ? '' : `<span class="pill outline num">${num(mc.credits).toFixed(1)} Standard Credits</span>`}
      </div>
      ${mc.unknownTierTurns || mc.unverifiedWriteTurns ? `<div class="muted-note">
        ${getLang() === 'en' ? 'Standard reference where tier is unknown or cache-write pricing is unverified.' : '档位未知或缓存写入费率未确认时，金额按 Standard 参考价展示。'}
      </div>` : ''}
      <div class="cost-headline-row">
        <span class="cost-big num mono">${models.length && models.every(m => m.pricingSource === 'unpriced') ? '—' : fmtUsd(totalUsd)}</span>
        <div class="legend-inline">
          <span class="pill ok num">${esc(t('cost.savedPill', { usd: fmtUsd(savedUsd) }))}</span>
          ${num(mc.longContextTurns, 0) > 0 ? `<span class="pill warn num">${esc(t('cost.longCtxPill', { n: mc.longContextTurns }))}</span>` : ''}
          ${num(mc.unpricedTurns, 0) > 0 ? `<span class="pill outline num">${esc(t('cost.unpricedPill', { n: mc.unpricedTurns }))}</span>` : ''}
        </div>
      </div>
      ${
        top3.length
          ? `<div class="top-models-pills">${top3.map((m) => {
              const share = num(m.share, totalUsd > 0 ? num(m.costUsd, 0) / totalUsd : 0);
              return `<span class="pill num" title="${esc(m.canonicalId)}">${esc(m.displayName || m.canonicalId)} · ${(share * 100).toFixed(0)}%</span>`;
            }).join('')}</div>`
          : `<div class="muted-note">${esc(t('cost.emptyRange'))}</div>`
      }
    `;

    if (expanded && (models.length || workspaces.length)) {
      const sortKey = state.modelSort;
      models.sort((a, b) => {
        if (sortKey === 'turns') return num(b.turns, 0) - num(a.turns, 0);
        if (sortKey === 'tokens') {
          const ta = num(a.uncachedIn) + num(a.cacheRead) + num(a.totalOut);
          const tb = num(b.uncachedIn) + num(b.cacheRead) + num(b.totalOut);
          return tb - ta;
        }
        if (sortKey === 'cache') return num(b.cacheHitRatio, 0) - num(a.cacheHitRatio, 0);
        return num(b.costUsd, 0) - num(a.costUsd, 0);
      });

      workspaces.sort((a, b) => num(b.costUsd, 0) - num(a.costUsd, 0));

      html += `
        <div class="card-expanded">
          <div class="toolbar-inline">
            <div class="seg">
              <button type="button" class="${state.modelView === 'models' ? 'active' : ''}" data-action="set-model-view" data-view="models">${esc(t('cost.byModel', { n: models.length }))}</button>
              <button type="button" class="${state.modelView === 'workspaces' ? 'active' : ''}" data-action="set-model-view" data-view="workspaces">${esc(t('cost.byWorkspace', { n: workspaces.length }))}</button>
            </div>
            ${
              state.modelView === 'models'
                ? `<div class="sort-pills">
                    <button type="button" class="sort-btn ${sortKey === 'cost' ? 'active' : ''}" data-action="set-model-sort" data-sort="cost">${esc(t('cost.sortCost'))}</button>
                    <button type="button" class="sort-btn ${sortKey === 'tokens' ? 'active' : ''}" data-action="set-model-sort" data-sort="tokens">${esc(t('cost.sortTokens'))}</button>
                    <button type="button" class="sort-btn ${sortKey === 'turns' ? 'active' : ''}" data-action="set-model-sort" data-sort="turns">${esc(t('cost.sortTurns'))}</button>
                    <button type="button" class="sort-btn ${sortKey === 'cache' ? 'active' : ''}" data-action="set-model-sort" data-sort="cache">${esc(t('cost.sortCache'))}</button>
                   </div>`
                : ''
            }
          </div>
          <div class="model-list">
            ${
              state.modelView === 'models'
                ? (() => {
                    const pricingById = new Map(
                      (state.pricing.data?.models || []).map((pm) => [pm.canonicalId, pm])
                    );
                    return models.map((m) => {
                      const totTok = num(m.uncachedIn) + num(m.cacheRead) + num(m.totalOut);
                      const isUnpriced = m.pricingSource === 'unpriced';
                      const pricingInfo = pricingById.get(m.canonicalId);
                      const promoLabel = m.promoLabel || pricingInfo?.promoLabel || '';
                      return `
                        <div class="model-item">
                          <div class="model-item-top">
                            <div class="model-item-name">
                              <span class="truncate" title="${esc(m.canonicalId)}">${esc(m.displayName || m.canonicalId)}</span>
                              ${m.longContextTurns > 0 ? '<span class="pill warn">&gt;272K</span>' : ''}
                              ${promoLabel ? `<span class="pill warn promo-pill" data-tip="${esc(promoLabel)}">${esc(t('settings.promoBadge'))}</span>` : ''}
                            </div>
                            <span class="model-item-cost num mono">${isUnpriced ? `<span class="pill warn">${esc(t('pricingSrc.unpriced'))}</span>` : fmtUsd(m.costUsd)}</span>
                          </div>
                          <div class="model-item-sub num">
                            <span>${esc(t('cost.modelSub', { turns: num(m.turns), tok: fmtTokens(totTok), cache: m.cacheHitRatio == null ? '—' : fmtPct(m.cacheHitRatio, 0) }))}</span>
                            <span class="pill outline">${esc(isUnpriced ? t('pricingSrc.unpriced') : t('codex.apiStandard'))}</span>
                          </div>
                          ${m.creditRate ? `<div class="model-item-sub num">${esc(t('codex.creditRate', { rate: m.creditRate.join(' / ') }))}${m.creditMultiple ? ' · ' + esc(t('codex.creditMultiple', {n: m.creditMultiple})) : ''}</div>` : ''}

                        </div>
                      `;
                    }).join('');
                  })()
                : workspaces.map((w) => `
                    <div class="model-item">
                      <div class="model-item-top">
                        <div class="model-item-name"><span class="truncate" title="${esc(w.workspace)}">${esc(baseName(w.workspace))}</span></div>
                        <span class="model-item-cost num mono">${fmtUsd(w.costUsd)}</span>
                      </div>
                      <div class="model-item-sub num">
                        <span>${esc(t('cost.wsSub', { turns: num(w.turns), tok: fmtTokens(w.totalTokens) }))}</span>
                        <span class="truncate muted-note" style="max-width:160px">${esc(w.workspace || '')}</span>
                      </div>
                    </div>
                  `).join('')
            }
          </div>
        </div>
      `;
    }

    return {
      badges: `<span class="pill outline">${esc(t('cost.badge'))}</span>`,
      body: html
    };
  }

  // =========================================================================
  // 14. Rendering: Module 5 — Calendar Trends & Day Drill-down (1:1 .hm-svg)
  // =========================================================================
  function renderCalendarTrends(expanded) {
    if (state.analyticsError) {
      return {
        badges: `<span class="pill bad">${esc(t('common.readFailed'))}</span>`,
        body: `<div class="banner error">${esc(state.analyticsError)}</div>`
      };
    }
    const ct = state.analytics?.calendarTrends;
    if (!ct) {
      return {
        badges: `<span class="pill outline">${esc(t('cal.badge'))}</span>`,
        body: `<div class="muted-note">${esc(t('cal.noData'))}</div>`
      };
    }

    const streak = num(ct.streakDays, 0);
    const todayTokens = num(ct.todayTokens, 0);
    const avg7d = num(ct.avg7dTokens, 0);
    const delta = ct.deltaVs7dPct;

    const deltaHtml =
      delta == null || !Number.isFinite(Number(delta))
        ? `<span class="muted-note">${esc(t('cal.no7dBase'))}</span>`
        : `<span class="pill num ${Number(delta) > 15 ? 'warn' : Number(delta) < 0 ? 'ok' : 'outline'}">${esc(t('cal.vs7d', { delta: `${Number(delta) >= 0 ? '+' : ''}${Number(delta).toFixed(1)}%` }))}</span>`;

    const daysArr = Array.isArray(ct.days) ? ct.days : [];
    const dayMap = new Map(daysArr.map((d) => [d.date, d]));
    const sparkDays = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = fmtLocalDateStr(d);
      sparkDays.push(dayMap.get(key) || { date: key, costUsd: 0, tokens: 0, turns: 0 });
    }
    const maxSpark = Math.max(1, ...sparkDays.map((d) => num(d.totalTokens, 0)));
    const sparkSvg = `
      <svg class="cal-spark svg-chart" viewBox="0 0 132 30" aria-label="${esc(t('cal.sparkAria'))}">
        ${sparkDays
          .map((d, idx) => {
            const val = num(d.totalTokens, 0);
            const h = val > 0 ? Math.max(2.5, (val / maxSpark) * 26) : 1.5;
            const x = idx * 9.5 + 1;
            const y = 28 - h;
            const fill = val > 0 ? 'var(--ch-cache)' : 'var(--hm-0)';
            const tip = `${d.date}: ${fmtTokens(val) + ' tok'} (${num(d.turns)} ${t('common.turns')})`;
            return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="6.5" height="${h.toFixed(1)}" rx="1.5" fill="${fill}" data-tip="${esc(tip)}"/>`;
          })
          .join('')}
      </svg>
    `;

    let html = `
      <div class="cal-compact-row">
        <div class="cal-stats">
          <div class="num mono" style="font-size:15px;font-weight:600">${esc(t('cal.todayPrefix'))} ${fmtTokens(todayTokens) + ' tok'} <span class="muted-note" style="font-size:11px;font-weight:400">${esc(t('cal.avg7dPrefix'))} ${fmtTokens(avg7d) + ' tok'}</span></div>
          <div>${deltaHtml}</div>
        </div>
        ${sparkSvg}
      </div>
    `;

    if (expanded) {
      html += renderCalendarExpanded(dayMap);
    }

    return {
      badges: `<span class="pill ${streak > 0 ? 'ok' : 'outline'} num">${esc(t('cal.streak', { n: streak }))}</span>`,
      body: html
    };
  }

  function renderCalendarExpanded(dayMap) {
    const metric = state.calMetric;
    const totalDays = 112;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayDow = (today.getDay() + 6) % 7;
    const numCols = Math.ceil((totalDays + (6 - todayDow)) / 7);
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (numCols * 7 - 1 - (6 - todayDow)));

    const cells = [];
    const vals = [];
    for (let i = 0; i < numCols * 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const isFuture = d > today;
      const dateStr = fmtLocalDateStr(d);
      const rec = dayMap.get(dateStr) || { date: dateStr, turns: 0, totalTokens: 0, costUsd: 0 };
      const val =
        metric === 'tokens'
          ? num(rec.totalTokens, 0)
          : metric === 'turns'
            ? num(rec.turns, 0)
            : num(rec.costUsd, 0);
      if (!isFuture && val > 0) vals.push(val);
      cells.push({
        col: Math.floor(i / 7),
        row: i % 7,
        date: dateStr,
        isFuture,
        rec,
        val
      });
    }

    vals.sort((a, b) => a - b);
    const q1 = vals[Math.floor(vals.length * 0.25)] || 0;
    const q2 = vals[Math.floor(vals.length * 0.5)] || 0;
    const q3 = vals[Math.floor(vals.length * 0.75)] || 0;

    function levelColor(v) {
      if (v <= 0) return 'var(--hm-0)';
      if (v <= q1) return 'var(--hm-1)';
      if (v <= q2) return 'var(--hm-2)';
      if (v <= q3) return 'var(--hm-3)';
      return 'var(--hm-4)';
    }

    // 1:1 fixed-pixel crisp heatmap (11px cells, 3px gap, 10px labels)
    const cellSz = 11;
    const gap = 3;
    const leftPad = getLang() === 'en' ? 24 : 18;
    const topPad = 16;
    const svgW = leftPad + numCols * (cellSz + gap) - gap + 2;
    const svgH = topPad + 7 * (cellSz + gap) - gap + 2;

    const dayLabels = [
      { row: 0, text: t('cal.dayLabels.mon') },
      { row: 2, text: t('cal.dayLabels.wed') },
      { row: 4, text: t('cal.dayLabels.fri') }
    ];

    const selectedDate = state.selectedDay?.date || '';
    let monthMarks = '';
    let prevMonth = -1;
    let lastMonthX = -999;
    for (let c = 0; c < numCols; c++) {
      const cell = cells[c * 7];
      const dt = new Date(cell.date + 'T00:00:00');
      const m = dt.getMonth();
      const x = leftPad + c * (cellSz + gap);
      if (m !== prevMonth) {
        prevMonth = m;
        if (x - lastMonthX >= 28) {
          lastMonthX = x;
          monthMarks += `<text class="hm-label" x="${x}" y="11">${esc(t('cal.monthLabel', m))}</text>`;
        }
      }
    }

    const rects = cells
      .filter((c) => !c.isFuture)
      .map((c) => {
        const x = leftPad + c.col * (cellSz + gap);
        const y = topPad + c.row * (cellSz + gap);
        const tip = `${c.date}\n${t('cal.tipCost')}: ${fmtUsd(c.rec.costUsd)}\nTokens: ${fmtTokens(c.rec.totalTokens)}\n${t('cal.tipTurns')}: ${num(c.rec.turns)}`;
        const selClass = c.date === selectedDate ? 'selected' : '';
        return `<rect class="hm-cell ${selClass}" x="${x}" y="${y}" width="${cellSz}" height="${cellSz}" rx="2.5" fill="${levelColor(c.val)}" data-action="select-day" data-date="${esc(c.date)}" data-tip="${esc(tip)}" tabindex="0"/>`;
      })
      .join('');

    let drillHtml = '';
    if (state.selectedDay) {
      const sd = state.selectedDay;
      if (sd.loading) {
        drillHtml = `<div class="day-drilldown"><div class="muted-note">${esc(t('cal.loadingDay', { date: sd.date }))}</div></div>`;
      } else if (sd.error) {
        drillHtml = `<div class="day-drilldown"><div class="banner error">${esc(sd.error)}</div></div>`;
      } else if (sd.data) {
        const d = sd.data;
        const tot = d.totals || {};
        const convs = Array.isArray(d.conversations) ? d.conversations : [];
        drillHtml = `
          <div class="day-drilldown">
            <div class="day-drill-head">
              <strong class="num mono" style="font-size:12px">${esc(sd.date)} · ${fmtUsd(tot.costUsd)} · ${fmtTokens(tot.totalTokens)} tok · ${num(tot.turns)} ${esc(t('common.turns'))}</strong>
              <button type="button" class="btn-link" data-action="close-day">${esc(t('common.close'))}</button>
            </div>
            ${
              convs.length
                ? `<div class="day-conv-list">${convs
                    .map(
                      (c) => `
                  <div class="day-conv-row">
                    <div style="min-width:0;flex:1">
                      <div class="truncate" style="font-weight:500" title="${esc(c.title || c.conversationId)}">${esc(c.title || c.conversationId?.slice(0, 8) || t('cal.unnamedSession'))}</div>
                      <div class="muted-note truncate">${esc(sourceLabel(c.source))} · ${esc(baseName(c.workspace))} · ${num(c.turns)} ${esc(t('common.turns'))}</div>
                    </div>
                    <span class="num mono" style="font-weight:600;flex:none">${fmtUsd(c.costUsd)}</span>
                  </div>`
                    )
                    .join('')}</div>`
                : `<div class="muted-note">${esc(t('cal.noConvsDay'))}</div>`
            }
          </div>
        `;
      }
    }

    return `
      <div class="card-expanded">
        <div class="toolbar-inline">
          <div class="seg">
            <button type="button" class="${metric === 'cost' ? 'active' : ''}" data-action="set-cal-metric" data-metric="cost">${esc(t('cal.metricCost'))}</button>
            <button type="button" class="${metric === 'tokens' ? 'active' : ''}" data-action="set-cal-metric" data-metric="tokens">${esc(t('cal.metricTokens'))}</button>
            <button type="button" class="${metric === 'turns' ? 'active' : ''}" data-action="set-cal-metric" data-metric="turns">${esc(t('cal.metricTurns'))}</button>
          </div>
          <div class="hm-legend">
            <span>${esc(t('cal.less'))}</span>
            <span class="hm-swatch" style="background:var(--hm-0)"></span>
            <span class="hm-swatch" style="background:var(--hm-1)"></span>
            <span class="hm-swatch" style="background:var(--hm-2)"></span>
            <span class="hm-swatch" style="background:var(--hm-3)"></span>
            <span class="hm-swatch" style="background:var(--hm-4)"></span>
            <span>${esc(t('cal.more'))}</span>
          </div>
        </div>
        <div class="heatmap-wrap">
          <svg class="hm-svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" aria-label="${esc(t('cal.heatmapAria'))}">
            ${monthMarks}
            ${dayLabels.map((l) => `<text class="hm-label" x="1" y="${topPad + l.row * (cellSz + gap) + 9}">${esc(l.text)}</text>`).join('')}
            ${rects}
          </svg>
        </div>
        <div class="muted-note" style="font-size:11px">${esc(t('cal.drillHint'))}</div>
        ${drillHtml}
      </div>
    `;
  }

  // =========================================================================
  // 15. Rendering: Module 6 — Global Cache Observatory
  // =========================================================================
  function getObsMatrixPrefs() {
    const primary = OBS_MATRIX_METRIC_IDS.includes(state.config.obsMatrixPrimary)
      ? state.config.obsMatrixPrimary
      : DEFAULT_CONFIG.obsMatrixPrimary;
    const rawSubs = Array.isArray(state.config.obsMatrixSubMetrics)
      ? state.config.obsMatrixSubMetrics
      : DEFAULT_CONFIG.obsMatrixSubMetrics;
    const subSet = new Set();
    for (const id of rawSubs) {
      if (OBS_MATRIX_METRIC_IDS.includes(id) && id !== primary) {
        subSet.add(id);
      }
    }
    const subs = OBS_MATRIX_METRIC_IDS.filter((id) => subSet.has(id));
    return { primary, subs };
  }

  function fmtUsdCompact(v) {
    const n = num(v, 0);
    if (n <= 0) return '$0';
    if (n < 0.001) return '<$0.001';
    if (n < 0.01) return `$${n.toFixed(3)}`;
    if (n < 10) return `$${n.toFixed(2)}`;
    if (n < 100) return `$${n.toFixed(1)}`;
    return `$${Math.round(n)}`;
  }

  function fmtTurnsCompact(n) {
    const v = Math.max(0, Math.round(num(n, 0)));
    if (v >= 1000) return `${(v / 1000).toFixed(1)}kt`;
    return `${v}t`;
  }

  function getObsMetricRaw(entry, metricId, isTotal) {
    if (!entry) return null;
    const total = isTotal ? num(entry.followUpTurns, 0) : num(entry.total, 0);
    if (total <= 0) return null;
    switch (metricId) {
      case 'keepRate':
        return entry.hitRate != null ? num(entry.hitRate, 0) : null;
      case 'weightedHit':
        return entry.weightedHitRatio != null ? num(entry.weightedHitRatio, 0) : null;
      case 'avgCost':
        return num(entry.avgCostUsd, 0);
      case 'totalCost':
        return num(entry.costUsd, 0);
      case 'missPenalty':
        return num(entry.missPenaltyUsd, 0);
      case 'turns':
        return total;
      default:
        return null;
    }
  }

  function formatObsMetricCell(entry, metricId, isTotal) {
    const val = getObsMetricRaw(entry, metricId, isTotal);
    if (val === null) return '—';
    switch (metricId) {
      case 'keepRate':
      case 'weightedHit':
        return `${Math.round(val * 100)}%`;
      case 'avgCost':
      case 'totalCost':
      case 'missPenalty':
        return fmtUsdCompact(val);
      case 'turns':
        return fmtTurnsCompact(val);
      default:
        return '—';
    }
  }

  function obsHeatCellClass(primaryMetric, val, maxVal, count) {
    if (!count || count <= 0 || val === null || val === undefined) return 'heat-empty';
    if (primaryMetric === 'keepRate' || primaryMetric === 'weightedHit') {
      if (val >= 0.85) return 'heat-deep';
      if (val >= 0.65) return 'heat-soft';
      if (val >= 0.40) return 'heat-amber';
      return 'heat-coral';
    }
    if (primaryMetric === 'missPenalty') {
      if (val <= 0) return 'heat-ok-soft';
      const ratio = maxVal > 0 ? val / maxVal : 1;
      if (ratio >= 0.65) return 'heat-coral';
      if (ratio >= 0.25) return 'heat-amber';
      return 'heat-warn-soft';
    }
    if (primaryMetric === 'avgCost' || primaryMetric === 'totalCost') {
      if (val <= 0) return 'heat-neutral';
      const ratio = maxVal > 0 ? val / maxVal : 0;
      if (ratio >= 0.72) return 'heat-coral';
      if (ratio >= 0.38) return 'heat-amber';
      return 'heat-cost-lo';
    }
    // turns
    const ratio = maxVal > 0 ? val / maxVal : 0;
    if (ratio >= 0.65) return 'heat-vol-hi';
    if (ratio >= 0.25) return 'heat-vol-mid';
    return 'heat-vol-lo';
  }

  function renderObsCellInner(entry, primary, subs, isTotal) {
    const mainStr = formatObsMetricCell(entry, primary, isTotal);
    const subLines = subs
      .map((id) => formatObsMetricCell(entry, id, isTotal))
      .filter((s) => s && s !== '—')
      .map((s) => `<div class="heat-sub">${esc(s)}</div>`)
      .join('');
    return `
      <div class="heat-main">${esc(mainStr)}</div>
      ${subLines}
    `;
  }

  function renderCacheObservatory(expanded) {
    if (state.analyticsError) {
      return {
        badges: `<span class="pill bad">${esc(t('common.readFailed'))}</span>`,
        body: `<div class="banner error">${esc(state.analyticsError)}</div>`
      };
    }

    const co = state.analytics?.cacheObservatory;
    if (!co || !co.summary || num(co.summary.followUpTurns, 0) === 0) {
      return {
        badges: `<span class="pill outline">${esc(t('obs.noDataBadge'))}</span>`,
        body: `<div class="muted-note">${esc(t('obs.noDataBody'))}</div>`
      };
    }

    const sum = co.summary;
    const misses = num(sum.unexpectedFullMisses, 0);
    const cuts = num(sum.boundaryCuts, 0);
    const hitPct = fmtPct(sum.weightedFollowUpHitRatio, 1);

    const badge = misses > 0
      ? `<span class="pill bad num">${esc(t('obs.badgeMiss', { n: misses }))}</span>`
      : `<span class="pill ok num">${esc(t('obs.badgeOk', { pct: fmtPct(sum.weightedFollowUpHitRatio, 0) }))}</span>`;

    let html = `
      <div class="obs-kpi-grid">
        <div class="kpi-tile">
          <span class="kpi-label">${esc(t('obs.kpiFollowHit'))}</span>
          <span class="kpi-val ${num(sum.weightedFollowUpHitRatio) >= 0.85 ? 'ok' : num(sum.weightedFollowUpHitRatio) >= 0.65 ? 'warn' : 'bad'} num mono">${hitPct}</span>
          <span class="kpi-sub num">${esc(t('obs.kpiFollowSub', { n: num(sum.followUpTurns).toLocaleString() }))}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">${esc(t('obs.kpiFullMiss'))}</span>
          <span class="kpi-val ${misses > 0 ? 'bad' : 'ok'} num mono">${misses}</span>
          <span class="kpi-sub num">${esc(t('obs.kpiBounceSub', { n: num(sum.bounceBackCount) }))}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">${esc(t('obs.kpiBoundaryCut'))}</span>
          <span class="kpi-val ${cuts > 0 ? 'warn' : ''} num mono">${cuts}</span>
          <span class="kpi-sub num">${esc(t('obs.kpiBoundarySub', { sw: num(sum.modelSwitchTurns), cmp: num(sum.compactedTurns) }))}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">${esc(t('obs.kpiPenalty'))}</span>
          <span class="kpi-val ${num(sum.missPenaltyUsd) > 0 ? 'bad' : ''} num mono">${fmtUsd(sum.missPenaltyUsd)}</span>
          <span class="kpi-sub num">${esc(t('obs.kpiWastedSub', { tok: fmtTokens(sum.wastedTokens) }))}</span>
        </div>
      </div>
    `;

    if (expanded) {
      html += renderCacheObservatoryExpanded(co);
    }

    return { badges: badge, body: html };
  }

  function renderCacheObservatoryExpanded(co) {
    const buckets = Array.isArray(co.gapBuckets) && co.gapBuckets.length
      ? co.gapBuckets
      : ['<=2s', '2-5s', '5-10s', '10-20s', '20-60s', '1-5m', '>5m'];
    const matrix = Array.isArray(co.matrix) ? co.matrix : [];
    const scatterAll = Array.isArray(co.scatterPoints) ? co.scatterPoints : [];
    const anomalies = Array.isArray(co.topAnomalies) ? co.topAnomalies : [];
    const { primary, subs } = getObsMatrixPrefs();

    // Viz 1: Model x Idle-Gap Configurable Metric Matrix
    let matrixHtml = '';
    if (matrix.length > 0) {
      const totalColMax = matrix.reduce((mx, m) => {
        const v = getObsMetricRaw(m, primary, true);
        return v !== null && v > mx ? v : mx;
      }, 0);

      const rowsHtml = matrix
        .map((m, mIdx) => {
          const bList = Array.isArray(m.buckets) ? m.buckets : [];
          const bMap = new Map(bList.map((b) => [b.key, b]));
          const rowBucketMax = bList.reduce((mx, b) => {
            const v = getObsMetricRaw(b, primary, false);
            return v !== null && v > mx ? v : mx;
          }, 0);

          const totalCount = num(m.followUpTurns, 0);
          const totalVal = getObsMetricRaw(m, primary, true);
          const totalCls = obsHeatCellClass(primary, totalVal, totalColMax, totalCount);
          const totalPinned =
            state.obsPinnedCell &&
            state.obsPinnedCell.modelIdx === mIdx &&
            state.obsPinnedCell.bucketKey === '__total__';

          const bucketTds = buckets
            .map((bk) => {
              const b = bMap.get(bk);
              const cnt = b ? num(b.total, 0) : 0;
              if (!b || cnt === 0) {
                return `<td class="heat-cell heat-empty">—</td>`;
              }
              const val = getObsMetricRaw(b, primary, false);
              const cls = obsHeatCellClass(primary, val, rowBucketMax, cnt);
              const lowNCls = cnt < 5 ? ' heat-low-n' : '';
              const isPinned =
                state.obsPinnedCell &&
                state.obsPinnedCell.modelIdx === mIdx &&
                state.obsPinnedCell.bucketKey === bk;
              return `<td class="heat-cell ${cls}${lowNCls}${isPinned ? ' is-pinned' : ''}" data-obs-cell="1" data-model-idx="${mIdx}" data-bucket-key="${esc(bk)}" tabindex="0">${renderObsCellInner(b, primary, subs, false)}</td>`;
            })
            .join('');

          const totalLowN = totalCount > 0 && totalCount < 5 ? ' heat-low-n' : '';
          return `
            <tr>
              <td>
                <div class="obs-model-cell" title="${esc(m.canonicalId)}">
                  <span class="obs-model-name truncate">${esc(m.displayName || m.canonicalId)}</span>
                  <span class="obs-model-meta num">${num(m.followUpTurns)}t${num(m.unexpectedFullMisses) > 0 ? ` · ${num(m.unexpectedFullMisses)}m` : ''}</span>
                </div>
              </td>
              <td class="heat-cell heat-total-col ${totalCls}${totalLowN}${totalPinned ? ' is-pinned' : ''}" data-obs-cell="1" data-model-idx="${mIdx}" data-bucket-key="__total__" tabindex="0">${renderObsCellInner(m, primary, subs, true)}</td>
              ${bucketTds}
            </tr>
          `;
        })
        .join('');

      const primaryShort = t(`obs.metricShort.${primary}`);
      const primaryFull = t(`obs.metricFull.${primary}`);
      const subLegend = subs.length > 0
        ? t('obs.matrixLegendSub', { subs: subs.map((id) => t(`obs.metricShort.${id}`)).join(' / ') })
        : '';
      const legendText = t('obs.matrixLegend', { primary: primaryFull, sub: subLegend });
      const triggerLabel = `${primaryShort}${subs.length > 0 ? ` +${subs.length}` : ''}`;

      const menuHtml = state.obsMetricMenuOpen
        ? `
          <div class="obs-metric-popover" data-stop-card role="dialog" aria-label="${esc(t('obs.matrixCfgTitle'))}">
            <div class="obs-mp-head">
              <span class="obs-mp-title">${esc(t('obs.matrixCfgTitle'))}</span>
              <button type="button" class="obs-mp-reset" data-action="reset-obs-metrics">${esc(t('obs.matrixReset'))}</button>
            </div>
            <div class="obs-mp-grid obs-mp-cols-head">
              <span>${esc(t('obs.matrixColMetric'))}</span>
              <span class="obs-mp-c">${esc(t('obs.matrixColPrimary'))}</span>
              <span class="obs-mp-c">${esc(t('obs.matrixColSub'))}</span>
            </div>
            ${OBS_MATRIX_METRIC_IDS.map((id) => {
              const isPrimary = id === primary;
              const isSub = subs.includes(id);
              return `
                <div class="obs-mp-grid obs-mp-row ${isPrimary ? 'is-primary' : ''}">
                  <span class="obs-mp-name">${esc(t(`obs.metricFull.${id}`))}</span>
                  <button type="button" class="obs-mp-radio ${isPrimary ? 'active' : ''}" data-action="set-obs-primary" data-metric="${id}" aria-pressed="${isPrimary ? 'true' : 'false'}" aria-label="${esc(t(`obs.metricFull.${id}`))}">
                    <span class="obs-mp-dot"></span>
                  </button>
                  ${
                    isPrimary
                      ? `<span class="obs-mp-main-tag">${esc(t('obs.matrixPrimaryTag'))}</span>`
                      : `<button type="button" class="obs-mp-check ${isSub ? 'active' : ''}" data-action="toggle-obs-sub" data-metric="${id}" aria-pressed="${isSub ? 'true' : 'false'}" aria-label="${esc(t(`obs.metricFull.${id}`))}">${isSub ? '✓' : ''}</button>`
                  }
                </div>
              `;
            }).join('')}
            <div class="obs-mp-note">${esc(t('obs.matrixCfgNote'))}</div>
          </div>
        `
        : '';

      matrixHtml = `
        <div class="obs-section">
          <div class="obs-section-head">
            <span class="obs-section-title">${esc(t('obs.matrixTitle'))}</span>
            <div class="obs-metric-ctrl" data-stop-card>
              <button type="button" class="obs-metric-trigger ${state.obsMetricMenuOpen ? 'active' : ''}" data-action="toggle-obs-metric-menu" aria-expanded="${state.obsMetricMenuOpen ? 'true' : 'false'}">
                <span>${esc(triggerLabel)}</span>
                <span class="obs-caret" aria-hidden="true">▾</span>
              </button>
              ${menuHtml}
            </div>
          </div>
          <div class="obs-matrix-legend">${esc(legendText)}</div>
          <div class="obs-matrix-wrap">
            <table class="obs-matrix-table${subs.length > 0 ? ' has-sub' : ''}">
              <thead>
                <tr>
                  <th>${esc(t('obs.colModel'))}</th>
                  <th class="obs-th-total">${esc(t('obs.colTotal'))}</th>
                  ${buckets.map((bk) => `<th class="mono">${esc(bk)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    // Viz 2: Idle-Gap vs Hit-Rate Log Scatter Plot
    const filterModels = matrix.slice(0, 6);
    const activeFilter =
      state.obsModelFilter === 'all' || filterModels.some((m) => m.canonicalId === state.obsModelFilter)
        ? state.obsModelFilter
        : 'all';

    const filteredPts = scatterAll.filter(
      (pt) =>
        pt &&
        pt.idleGapMs != null &&
        Number.isFinite(Number(pt.idleGapMs)) &&
        (activeFilter === 'all' || pt.modelId === activeFilter)
    );

    const W = 480;
    const H = 152;
    const padL = 32;
    const padR = 12;
    const padT = 10;
    const padB = 22;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const LOG_MIN = Math.log10(500);     // 0.5s
    const LOG_MAX = Math.log10(600000);  // 10m

    const xForMs = (ms) => {
      const clamped = clamp(num(ms, 500), 500, 600000);
      const frac = (Math.log10(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN);
      return padL + frac * plotW;
    };
    const yForRatio = (r) => padT + (1 - clamp(num(r, 0), 0, 1)) * plotH;

    const xTicks = [
      { ms: 1000, label: '1s' },
      { ms: 5000, label: '5s' },
      { ms: 20000, label: '20s' },
      { ms: 60000, label: '1m' },
      { ms: 300000, label: '5m' }
    ];
    const yTicks = [
      { r: 1, label: '100%' },
      { r: 0.5, label: '50%' },
      { r: 0, label: '0%' }
    ];

    const gridSvg = `
      ${yTicks
        .map((tk) => {
          const y = yForRatio(tk.r);
          return `
            <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
            <text class="obs-axis-label mono" x="${padL - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end">${tk.label}</text>
          `;
        })
        .join('')}
      ${xTicks
        .map((tk) => {
          const x = xForMs(tk.ms);
          return `
            <line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + plotH}" stroke="var(--line)" stroke-width="1" stroke-dasharray="2,2"/>
            <text class="obs-axis-label mono" x="${x.toFixed(1)}" y="${H - 5}" text-anchor="middle">${tk.label}</text>
          `;
        })
        .join('')}
    `;

    // Order points so anomalies always render above normal hits
    const kindOrder = { hit: 0, low_hit: 1, boundary_cut: 2, unexpected_full_miss: 3 };
    const sortedPts = [...filteredPts].sort(
      (a, b) => (kindOrder[a.kind] ?? 0) - (kindOrder[b.kind] ?? 0)
    );

    const kindLabel = (k) => {
      if (k === 'unexpected_full_miss') return t('obs.kindFullMiss');
      if (k === 'boundary_cut') return t('obs.kindBoundary');
      if (k === 'low_hit') return t('obs.kindLowHit');
      return t('obs.kindHit');
    };

    const ptsSvg = sortedPts
      .map((pt) => {
        const cx = xForMs(pt.idleGapMs);
        const cy = yForRatio(pt.hitRatio);
        const prevStr = pt.prevHitRatio != null ? fmtPct(pt.prevHitRatio, 0) : '—';
        const curStr = fmtPct(pt.hitRatio, 0);
        const nextStr = pt.nextHitRatio != null ? fmtPct(pt.nextHitRatio, 0) : '—';
        const tipLines = [
          `${pt.displayName || pt.modelId} · ${kindLabel(pt.kind)}`,
          `${t('obs.tipIdleGap')}: ${fmtDurationMs(pt.idleGapMs)} · ${t('obs.tipStartGap')}: ${fmtDurationMs(pt.startGapMs)}`,
          `${t('obs.tipSeq')}: ${prevStr} → ${curStr} → ${nextStr}`
        ];
        if (pt.kind === 'unexpected_full_miss' || pt.kind === 'boundary_cut') {
          tipLines.push(`${t('obs.tipBounce')}: ${pt.bounceBack ? t('obs.bounceYes') : t('obs.bounceNo')}`);
          tipLines.push(`${t('obs.tipPenalty')}: ${fmtTokens(pt.wastedTokens)} tok / ${fmtUsd(pt.penaltyUsd)}`);
        }
        const tipAttr = esc(tipLines.join('\n'));

        if (pt.kind === 'unexpected_full_miss') {
          return `<circle class="obs-pt" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4" fill="var(--bad)" fill-opacity="0.92" stroke="var(--surface)" stroke-width="0.8" data-tip="${tipAttr}" tabindex="0"/>`;
        }
        if (pt.kind === 'boundary_cut') {
          const s = 4.2;
          const p1 = `${cx.toFixed(1)},${(cy - s).toFixed(1)}`;
          const p2 = `${(cx - s * 0.9).toFixed(1)},${(cy + s * 0.75).toFixed(1)}`;
          const p3 = `${(cx + s * 0.9).toFixed(1)},${(cy + s * 0.75).toFixed(1)}`;
          return `<polygon class="obs-pt" points="${p1} ${p2} ${p3}" fill="var(--warn)" fill-opacity="0.92" stroke="var(--surface)" stroke-width="0.6" data-tip="${tipAttr}" tabindex="0"/>`;
        }
        if (pt.kind === 'low_hit') {
          return `<circle class="obs-pt" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.6" fill="var(--fg-muted)" fill-opacity="0.55" data-tip="${tipAttr}"/>`;
        }
        return `<circle class="obs-pt" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.8" fill="var(--ch-uncached)" fill-opacity="0.55" data-tip="${tipAttr}"/>`;
      })
      .join('');

    const scatterHtml = `
      <div class="obs-section">
        <div class="obs-section-head">
          <span class="obs-section-title">${esc(t('obs.scatterTitle'))}</span>
          <div class="legend-inline">
            <span class="legend-item"><span class="legend-swatch" style="background:var(--ch-uncached);border-radius:50%"></span>${esc(t('obs.legendHit'))}</span>
            <span class="legend-item"><span class="legend-swatch" style="background:var(--bad);border-radius:50%"></span>${esc(t('obs.legendFullMiss'))}</span>
            <span class="legend-item"><span class="legend-swatch" style="background:var(--warn)"></span>${esc(t('obs.legendBoundary'))}</span>
            <span class="legend-item"><span class="legend-swatch" style="background:var(--fg-muted);border-radius:50%"></span>${esc(t('obs.legendLowHit'))}</span>
          </div>
        </div>
        <div class="obs-scatter-box">
          ${
            filterModels.length > 1
              ? `<div class="obs-filter-pills">
                  <button type="button" class="sort-btn ${activeFilter === 'all' ? 'active' : ''}" data-action="set-obs-filter" data-model="all">${esc(t('obs.filterAll'))}</button>
                  ${filterModels
                    .map(
                      (m) =>
                        `<button type="button" class="sort-btn ${activeFilter === m.canonicalId ? 'active' : ''}" data-action="set-obs-filter" data-model="${esc(m.canonicalId)}">${esc(m.displayName || m.canonicalId)}</button>`
                    )
                    .join('')}
                </div>`
              : ''
          }
          ${
            sortedPts.length > 0
              ? `<svg class="obs-scatter-svg" viewBox="0 0 ${W} ${H}" aria-label="${esc(t('obs.scatterAria'))}">
                  ${gridSvg}
                  ${ptsSvg}
                </svg>`
              : `<div class="muted-note">${esc(t('obs.noScatterPoints'))}</div>`
          }
        </div>
      </div>
    `;

    // Collapsible Top Anomalies + One-Click Copy Issue Markdown
    const copyLabel =
      state.obsCopyStatus === 'copied'
        ? t('common.copied')
        : state.obsCopyStatus === 'failed'
          ? t('common.copyFailed')
          : t('obs.copyIssue');
    const copyCls = state.obsCopyStatus === 'copied' ? 'ok' : '';

    let anomaliesHtml = '';
    if (state.obsAnomaliesOpen) {
      if (anomalies.length === 0) {
        anomaliesHtml = `<div class="muted-note">${esc(t('obs.noAnomalies'))}</div>`;
      } else {
        anomaliesHtml = `
          <div class="obs-anomaly-list">
            ${anomalies
              .map((a) => {
                const isMiss = a.kind === 'unexpected_full_miss';
                const kindPill = `<span class="pill ${isMiss ? 'bad' : 'warn'}">${esc(kindLabel(a.kind))}</span>`;
                const bouncePill = a.bounceBack ? `<span class="pill ok">${esc(t('obs.bounceBadge'))}</span>` : '';
                const reqRaw = String(a.providerRequestId || '');
                const reqShort = reqRaw ? `${reqRaw.slice(0, 14)}${reqRaw.length > 14 ? '…' : ''}` : '—';
                const seqStr = `${fmtPct(a.before?.hitRatio, 0)} → ${fmtPct(a.miss?.hitRatio, 0)} → ${a.after ? fmtPct(a.after.hitRatio, 0) : '—'}`;
                return `
                  <div class="obs-anomaly-row">
                    <div class="obs-anomaly-top">
                      <div style="display:flex;align-items:center;gap:5px;min-width:0;flex-wrap:wrap">
                        <strong class="truncate" style="font-size:11.5px">${esc(a.displayName || a.modelId)}</strong>
                        ${kindPill}
                        ${bouncePill}
                      </div>
                      <span class="num mono" style="color:var(--bad);font-weight:600">-${fmtUsd(a.penaltyUsd)} <span class="muted-note" style="font-weight:400">(${fmtTokens(a.wastedTokens)} tok)</span></span>
                    </div>
                    <div class="obs-anomaly-sub num muted-note">
                      <span>Idle ${fmtDurationMs(a.idleGapMs)} / Start ${fmtDurationMs(a.startGapMs)}</span>
                      <span class="mono" style="color:var(--fg-2)">${seqStr}</span>
                      <span class="mono truncate" title="${esc(reqRaw)}">${esc(reqShort)}</span>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        `;
      }
    }

    const actionsHtml = `
      <div class="obs-section">
        <div class="obs-actions-row">
          <button type="button" class="btn-sm" data-action="toggle-obs-anomalies">
            ${esc(state.obsAnomaliesOpen ? t('obs.hideAnomalies', { n: anomalies.length }) : t('obs.showAnomalies', { n: anomalies.length }))}
          </button>
          <button type="button" class="btn-sm ${copyCls}" data-action="copy-obs-issue" ${!co.issueMarkdown ? 'disabled' : ''}>
            ${esc(copyLabel)}
          </button>
        </div>
        ${anomaliesHtml}
      </div>
    `;

    return `
      <div class="card-expanded">
        ${matrixHtml}
        ${scatterHtml}
        ${actionsHtml}
      </div>
    `;
  }

  // =========================================================================
  // 16. Rendering: Module 7 — Quota Alignment & Cycle Budget
  // =========================================================================
  function renderQuotaBudget(expanded) {
    const mode = state.config.quotaDisplayMode === 'used' ? 'used' : 'remaining';
    const modeToggle = `
      <div class="seg" data-stop-card>
        <button type="button" class="${mode === 'remaining' ? 'active' : ''}" data-action="set-quota-mode" data-mode="remaining">${esc(t('quota.remaining'))}</button>
        <button type="button" class="${mode === 'used' ? 'active' : ''}" data-action="set-quota-mode" data-mode="used">${esc(t('quota.used'))}</button>
      </div>
    `;

    if (state.quotaError) {
      return { badges: modeToggle, body: `<div class="banner error">${esc(state.quotaError)}</div>` };
    }

    const data = state.quotaData || {};
    if (!data.windows?.length) {
      return { badges: modeToggle, body: `<div class="muted-note">${esc(t(data.stale ? 'codex.quotaUnavailable' : 'codex.quotaLoading'))}</div>${expanded ? LensAnalytics.quota(data,getLang()) : ''}` };
    }
    const windows = data.windows.map(window => {
      const pct = clamp(num(window.usedPercent), 0, 100);
      const shown = mode === 'used' ? pct : 100 - pct;
      const minutes = window.windowDurationMins;
      const span = minutes ? (minutes % 1440 === 0 ? `${minutes / 1440}d` : minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`) : '';
      const reset = window.resetsAt ? new Date(window.resetsAt * 1000).toLocaleString(getLang(), { hour12: false }) : '—';
      return `
        <div class="quota-pool-card">
          <div class="quota-pool-top">
            <span class="pill accent truncate">${esc([window.name, span].filter(Boolean).join(' · '))}</span>
            <span class="muted-note num">${esc(data.plan || '')}</span>
          </div>
          <div class="quota-pct num mono">${esc(t(mode === 'used' ? 'quota.used' : 'quota.remaining'))} ${shown}%</div>
          <div class="ctx-track" role="progressbar" aria-label="${esc(t(mode === 'used' ? 'quota.used' : 'quota.remaining'))}" aria-valuenow="${shown}" aria-valuemin="0" aria-valuemax="100">
            <div class="ctx-fill ${pct >= 80 ? 'bad' : pct >= 55 ? 'warn' : ''}" style="width:${shown}%"></div>
          </div>
          <div class="quota-sub num">${esc(t('codex.reset', {time: reset}))}</div>
          ${expanded ? `<div class="quota-sub num">${esc(t('codex.samples', {n: window.samples}))}</div>` : ''}
        </div>`;
    }).join('');
    const freshness = data.stale
      ? t('codex.quotaStale')
      : t('codex.quotaUpdated', {time: new Date(data.sampledAt).toLocaleTimeString(getLang(), { hour12: false })});
    return { badges: modeToggle, body: `
      <div class="quota-pool-grid">${windows}</div>
      <div class="chart-caption-row"><span>${esc(freshness)}</span></div>
      ${expanded ? LensAnalytics.quota(data,getLang()) : ''}
    ` };
  }

  function renderQuotaExpanded(summaries, anchors, mode) {
    const f = state.quotaForm;
    const parsedReset = parseResetInput(f.resetInput);
    const inheritableResetAt = getInheritableResetAt(f.pool, f.windowType);
    const resetEmptyHint = inheritableResetAt
      ? t('quota.resetInheritHint', { time: fmtResetClock(inheritableResetAt) })
      : t('quota.resetHint');

    let expHtml = `
      <div class="card-expanded">
        <form id="quota-anchor-form" class="quota-form">
          <h3 class="form-title">${esc(t('quota.formTitle'))}</h3>
          <div class="form-grid">
            <div class="field">
              <label for="qa-pool">${esc(t('quota.poolLabel'))}</label>
              <select id="qa-pool" name="pool">
                <option value="gemini" ${f.pool === 'gemini' ? 'selected' : ''}>Gemini</option>
                <option value="argon" ${f.pool === 'argon' ? 'selected' : ''}>Argon</option>
                <option value="3p" ${f.pool === '3p' ? 'selected' : ''}>${esc(t('quota.pool3p'))}</option>
              </select>
            </div>
            <div class="field">
              <label for="qa-window">${esc(t('quota.windowLabel'))}</label>
              <select id="qa-window" name="windowType">
                <option value="7d" ${f.windowType === '7d' ? 'selected' : ''}>${esc(t('quota.win7d'))}</option>
                <option value="5h" ${f.windowType === '5h' ? 'selected' : ''}>${esc(t('quota.win5h'))}</option>
              </select>
            </div>
            <div class="field full">
              <label for="qa-pct">${esc(t('quota.pctLabel'))}</label>
              <input id="qa-pct" name="remainingPct" type="number" step="0.01" min="0" max="100" placeholder="${esc(t('quota.pctPlaceholder'))}" value="${esc(f.remainingPct)}" required>
              <span class="field-hint">${esc(t('quota.pctHint'))}</span>
            </div>
            <div class="field">
              <label for="qa-reset">${esc(t('quota.resetLabel'))}</label>
              <input id="qa-reset" name="resetInput" type="text" placeholder="${esc(t('quota.resetPlaceholder'))}" value="${esc(f.resetInput)}">
              ${
                f.resetInput
                  ? `<span class="field-hint" style="color:${parsedReset.ok ? 'var(--ok)' : 'var(--bad)'}">${esc(parsedReset.preview)}</span>`
                  : `<span class="field-hint">${esc(resetEmptyHint)}</span>`
              }
            </div>
            <div class="field">
              <label>${esc(t('quota.captureTimeLabel'))}</label>
              <div class="quick-chips">
                <button type="button" class="quick-chip ${f.captureOffsetMin === 0 ? 'active' : ''}" data-action="set-qa-offset" data-offset="0">${esc(t('quota.now'))}</button>
                <button type="button" class="quick-chip ${f.captureOffsetMin === -5 ? 'active' : ''}" data-action="set-qa-offset" data-offset="-5">-5m</button>
                <button type="button" class="quick-chip ${f.captureOffsetMin === -15 ? 'active' : ''}" data-action="set-qa-offset" data-offset="-15">-15m</button>
                <button type="button" class="quick-chip ${f.captureOffsetMin === 'custom' ? 'active' : ''}" data-action="set-qa-offset" data-offset="custom">${esc(t('quota.custom'))}</button>
              </div>
              ${
                f.captureOffsetMin === 'custom'
                  ? `<input id="qa-custom-time" type="datetime-local" value="${esc(f.customCaptureAt)}" style="margin-top:4px">`
                  : ''
              }
            </div>
            <div class="field full">
              <label for="qa-note">${esc(t('quota.noteLabel'))}</label>
              <input id="qa-note" name="note" type="text" placeholder="${esc(t('quota.notePlaceholder'))}" value="${esc(f.note)}">
            </div>
          </div>
          ${f.error ? `<div class="banner error" style="margin:0">${esc(f.error)}</div>` : ''}
          <div style="display:flex;justify-content:flex-end;gap:8px">
            <button type="submit" class="btn-sm primary" ${f.submitting ? 'disabled' : ''}>${esc(f.submitting ? t('quota.submitting') : t('quota.submitBtn'))}</button>
          </div>
        </form>
    `;

    const estList = summaries.filter((s) => s.estimation && s.estimation.status !== 'no_data');
    if (estList.length > 0) {
      expHtml += estList
        .map((s) => {
          const e = s.estimation;
          const cal = e.calibration || null;
          const activeSubset = cal?.activeSubset || 'base';
          const subsets = cal?.subsets || {};
          const activeSubObj = subsets[activeSubset] || subsets.base || null;
          const activeFactors = cal?.activeFactors || subsetKeyToFactors(activeSubset);
          const statusMap = {
            ok: { cls: 'ok', text: t('quota.statusOk') },
            low_confidence: { cls: 'warn', text: t('quota.statusLow') },
            calibrating: { cls: 'outline', text: t('quota.statusCal') }
          };
          const st = statusMap[e.status] || { cls: 'outline', text: e.status };
          const deltaPct = num(e.totalDeltaPct, 0);
          const mix = Array.isArray(e.modelMix) ? e.modelMix : [];

          const calibBadgeHtml = cal
            ? `
              <span class="pill ${activeSubset !== 'base' ? 'accent' : 'outline'}">${esc(calibSubsetLabel(activeSubset))}</span>
              ${helpTip(t('quota.calibBadgeHelp'))}
            `
            : '';

          const weightStripHtml =
            cal && activeSubset !== 'base' && activeSubObj ? renderCalibWeightStrip(activeSubObj) : '';
          const calibLabHtml = cal ? buildCalibrationLabHtml(s, cal) : '';

          return `
            <div class="est-card">
              <div class="est-head">
                <div class="est-head-left">
                  <span style="font-weight:600;font-size:12px">${esc(t('quota.impliedTitle', { pool: poolLabel(s.pool), wt: s.windowType }))}</span>
                  ${calibBadgeHtml}
                </div>
                <span class="pill ${st.cls}">${esc(st.text)}</span>
              </div>
              ${
                e.status === 'calibrating'
                  ? `
                    ${
                      e.estimatedPoolUsd != null
                        ? `<div class="est-total num mono" style="opacity:0.78">~${fmtUsd(e.estimatedPoolUsd)} <span class="muted-note" style="font-size:11px;font-weight:400">(${esc(st.text)})</span></div>`
                        : ''
                    }
                    <div class="muted-note num">${esc(t('quota.calDesc', { du: deltaPct.toFixed(2), seg: num(e.segmentsUsed), usd: fmtUsd(e.windowSpendUsd) }))}</div>
                  `
                  : `
                    <div class="est-total num mono">~${fmtUsd(e.estimatedPoolUsd)} <span class="muted-note" style="font-size:11px;font-weight:400">95% CI [${fmtUsd(e.ciLowUsd)}, ${fmtUsd(e.ciHighUsd)}]${activeSubset !== 'base' ? ` · ${esc(t('quota.mixEqHint'))}` : ''}</span></div>
                    <div class="chart-caption-row num">
                      <span>${esc(t('quota.effDelta', { du: deltaPct.toFixed(2), seg: num(e.segmentsUsed), usd: fmtUsd(e.windowSpendUsd) }))}</span>
                      <span>${esc(t('quota.impliedRem', { usd: e.impliedRemainingUsd != null ? fmtUsd(e.impliedRemainingUsd) : '—' }))}</span>
                    </div>
                  `
              }
              ${weightStripHtml}
              ${
                mix.length
                  ? `<div class="top-models-pills">${mix.map((m) => `<span class="pill outline num">${esc(m.canonicalId)} ${(num(m.share) * 100).toFixed(0)}%</span>`).join('')}</div>`
                  : ''
              }
              ${
                e.mixedModelWarning && !activeFactors.M
                  ? `<div class="banner warn" style="padding:6px 8px">${esc(t('quota.mixedWarn'))}</div>`
                  : ''
              }
              ${calibLabHtml}
            </div>
          `;
        })
        .join('');
    }

    const hasCycleSplit = summaries.some(
      (s) => Array.isArray(s.currentCycleAnchors) || Array.isArray(s.olderCycleAnchors)
    );
    let currentList = [];
    let olderList = [];
    if (hasCycleSplit) {
      const anchorKey = (a) => (a.id != null ? String(a.id) : `${a.pool}:${a.windowType ?? a.window_type}:${a.capturedAt ?? a.captured_at}`);
      const curMap = new Map();
      const oldMap = new Map();
      for (const s of summaries) {
        for (const a of s.currentCycleAnchors || []) curMap.set(anchorKey(a), a);
        for (const a of s.olderCycleAnchors || []) oldMap.set(anchorKey(a), a);
      }
      for (const k of curMap.keys()) oldMap.delete(k);
      const sortDesc = (a, b) => num(b.capturedAt ?? b.captured_at, 0) - num(a.capturedAt ?? a.captured_at, 0);
      currentList = [...curMap.values()].sort(sortDesc);
      olderList = [...oldMap.values()].sort(sortDesc);
    } else {
      currentList = [...anchors].sort(
        (a, b) => num(b.capturedAt ?? b.captured_at, 0) - num(a.capturedAt ?? a.captured_at, 0)
      );
    }

    if (currentList.length > 0 || olderList.length > 0) {
      expHtml += `
        <div style="display:flex;flex-direction:column;gap:6px">
          <span class="form-title">${esc(t('quota.currentHistoryTitle', { n: currentList.length }))}</span>
          ${
            currentList.length > 0
              ? `<div class="anchor-history">${renderAnchorRows(currentList, mode)}</div>`
              : `<div class="muted-note" style="font-size:11px">${esc(t('quota.noCurrentAnchors'))}</div>`
          }
          ${
            olderList.length > 0
              ? `
                <button type="button" class="older-cycles-btn older-anchors-toggle ${state.quotaOlderOpen ? 'open' : ''}" data-action="toggle-older-anchors" aria-expanded="${state.quotaOlderOpen}">
                  <span>${esc(state.quotaOlderOpen ? t('quota.hideOlderCycles', { m: olderList.length }) : t('quota.showOlderCycles', { m: olderList.length }))}</span>
                  <svg class="icon chevron" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>
                </button>
                ${
                  state.quotaOlderOpen
                    ? `<div class="anchor-history">${renderAnchorRows(olderList, mode)}</div>`
                    : ''
                }
              `
              : ''
          }
        </div>
      `;
    }

    expHtml += '</div>';
    return expHtml;
  }

  function renderAnchorRows(list, mode) {
    return list
      .map((a) => {
        const pool = a.pool;
        const wt = a.windowType ?? a.window_type;
        const rem = num(a.remainingPct ?? a.remaining_pct, 0);
        const step = num(a.precisionStep ?? a.precision_step, 1);
        const cap = num(a.capturedAt ?? a.captured_at, 0);
        const reset = a.resetAt ?? a.reset_at;
        const shown = mode === 'used' ? 100 - rem : rem;
        return `
          <div class="anchor-row">
            <div class="anchor-info">
              <div class="anchor-top num">
                <span class="pill accent">${esc(poolLabel(pool))} ${esc(wt)}</span>
                <strong class="mono">${esc(mode === 'used' ? t('quota.used') : t('quota.remaining'))} ${fmtPctDirect(shown, step)}</strong>
                <span class="pill outline">${esc(t('quota.precision', { step }))}</span>
                <span class="muted-note">${fmtTimeShort(cap)}</span>
              </div>
              ${
                reset || a.note
                  ? `<div class="muted-note truncate">${reset ? esc(t('quota.resetAt', { time: fmtTimeShort(reset) })) : ''}${reset && a.note ? ' · ' : ''}${a.note ? esc(a.note) : ''}</div>`
                  : ''
              }
            </div>
            <button type="button" class="btn-sm danger" data-action="delete-anchor" data-id="${esc(a.id)}">${esc(t('common.delete'))}</button>
          </div>
        `;
      })
      .join('');
  }

  function renderCalibWeightStrip(subsetObj) {
    const models = Array.isArray(subsetObj?.params?.models) ? subsetObj.params.models : [];
    const cache = subsetObj?.params?.cache;
    const output = subsetObj?.params?.output;
    const items = [];

    for (const m of models) {
      const name = shortModelName(m.canonicalId);
      if (m.isAnchor) {
        items.push(`<span class="calib-weight-item num"><strong>${esc(name)}</strong> 1.00× (Base)</span>`);
      } else if (m.fitted) {
        items.push(
          `<span class="calib-weight-item num"><strong>${esc(name)}</strong> ${esc(fmtMultWithSe(m))}${m.clamped ? `<span class="calib-clamp-tag">${esc(t('quota.clamped'))}</span>` : ''}</span>`
        );
      }
    }
    if (cache?.fitted) {
      items.push(
        `<span class="calib-weight-item num"><strong>Cache</strong> ${esc(fmtMultWithSe(cache))}${cache.clamped ? `<span class="calib-clamp-tag">${esc(t('quota.clamped'))}</span>` : ''}</span>`
      );
    }
    if (output?.fitted) {
      items.push(
        `<span class="calib-weight-item num"><strong>Output</strong> ${esc(fmtMultWithSe(output))}${output.clamped ? `<span class="calib-clamp-tag">${esc(t('quota.clamped'))}</span>` : ''}</span>`
      );
    }

    const maeText =
      subsetObj?.maePp != null && Number.isFinite(Number(subsetObj.maePp))
        ? `<span class="calib-mae-chip num">${esc(t('quota.maeStrip', { mae: num(subsetObj.maePp).toFixed(2) }))}</span>`
        : '';

    if (!items.length && !maeText) return '';
    return `
      <div class="calib-weight-strip">
        ${items.join('<span class="calib-weight-sep">·</span>')}
        ${maeText}
      </div>
    `;
  }

  function renderCalibSmoothingPill(summary, cal) {
    const rawN = num(cal.rawSegmentsCount, num(cal.segmentsCount, 0));
    const segN = num(cal.segmentsCount, 0);
    const mergedN = Math.max(num(cal.coalescedCount, 0), rawN - segN);
    const huberN = num(cal.huberDownweightedCount, 0);
    if (mergedN <= 0 && huberN <= 0) return '';

    const anchorsN =
      Array.isArray(summary?.currentCycleAnchors) && summary.currentCycleAnchors.length
        ? summary.currentCycleAnchors.length
        : rawN + 1;
    const parts = [];
    if (mergedN > 0) {
      parts.push(t('quota.smoothSegSummary', { anchors: anchorsN, segs: segN, merged: mergedN }));
    }
    if (huberN > 0) {
      parts.push(t('quota.smoothHuberTag', { n: huberN }));
    }
    return `
      <span class="calib-smooth-pill num ${huberN > 0 ? 'has-huber' : ''}" data-tip="${esc(t('quota.smoothTipInfo'))}">
        ${huberN > 0 ? '<span class="calib-huber-dot" aria-hidden="true"></span>' : ''}
        <span>${esc(parts.join(' · '))}</span>
      </span>
    `;
  }

  function buildCalibrationLabHtml(summary, cal) {
    const labKey = `${summary.pool}:${summary.windowType}`;
    const activeSubset = cal.activeSubset || 'base';
    const recSubset = cal.recommendedSubset || 'base';
    const subsets = cal.subsets || {};
    const activeSubObj = subsets[activeSubset] || subsets.base || null;
    const isOpen = state.quotaLabOpenByKey.has(labKey)
      ? Boolean(state.quotaLabOpenByKey.get(labKey))
      : activeSubset !== 'base';

    const calibMode = cal.mode || state.config.quotaCalibMode || 'auto';
    const manualTag =
      calibMode === 'manual' ? ` · ${t('quota.modeManual', { mode: calibSubsetShort(activeSubset) })}` : '';

    return `
      <div class="calib-lab-wrap">
        <button type="button" class="calib-lab-toggle ${isOpen ? 'open' : ''}" data-action="toggle-calib-lab" data-key="${esc(labKey)}" aria-expanded="${isOpen}">
          <span class="calib-lab-toggle-left">
            <span>${esc(t('quota.labTitle'))}</span>
            <span class="pill outline num">${esc(t('quota.labSummary', { rec: calibSubsetShort(recSubset), n: num(cal.segmentsCount, 0) }))}${esc(manualTag)}</span>
            ${renderCalibSmoothingPill(summary, cal)}
          </span>
          <svg class="icon chevron" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>
        </button>
        ${
          isOpen
            ? `<div class="calib-lab-body">
                ${renderCalibControls(summary, cal)}
                ${renderCalibAnchorSelector(summary, cal, activeSubObj)}
                ${renderCalibParamTable(cal, activeSubObj)}
                ${renderCalibResidualSvg(summary, cal, activeSubObj)}
              </div>`
            : ''
        }
      </div>
    `;
  }

  function renderCalibControls(summary, cal) {
    const calibMode = cal.mode || state.config.quotaCalibMode || 'auto';
    const activeSubset = cal.activeSubset || 'base';
    const recSubset = cal.recommendedSubset || 'base';
    const activeFactors = cal.activeFactors || subsetKeyToFactors(activeSubset);
    const recFactors = subsetKeyToFactors(recSubset);
    const factorsMeta = cal.factors || {};
    const subsets = cal.subsets || {};

    const factorDefs = [
      { key: 'M', label: t('quota.factorM') },
      { key: 'C', label: t('quota.factorC') },
      { key: 'O', label: t('quota.factorO') }
    ];

    const chipsHtml = factorDefs
      .map((fd) => {
        const fMeta = factorsMeta[fd.key] || {};
        const eligible = Boolean(fMeta.eligible);
        const isActive = Boolean(activeFactors[fd.key]);
        const isRec = Boolean(recFactors[fd.key]);
        const subObj = subsets[fd.key] || {};
        const cls = [
          'calib-factor-chip',
          isActive ? 'active' : '',
          isRec ? 'recommended' : '',
          !eligible ? 'dimmed' : ''
        ]
          .filter(Boolean)
          .join(' ');

        const tipLines = [fd.label];
        if (!eligible && fMeta.reason) {
          tipLines.push(fMeta.reason);
        } else if (subObj.loocvMaePp != null) {
          tipLines.push(`LOOCV MAE: ±${num(subObj.loocvMaePp).toFixed(2)}pp`);
        } else if (subObj.maePp != null) {
          tipLines.push(`MAE: ±${num(subObj.maePp).toFixed(2)}pp`);
        }

        return `
          <button type="button" class="${cls}" data-action="toggle-calib-factor" data-factor="${fd.key}" data-pool="${esc(summary.pool)}" data-wt="${esc(summary.windowType)}" data-tip="${esc(tipLines.join('\n'))}" aria-pressed="${isActive}" ${!eligible ? 'aria-disabled="true"' : ''}>
            ${isRec ? '<span class="calib-rec-dot" aria-hidden="true"></span>' : ''}
            <span>${esc(fd.label)}</span>
          </button>
        `;
      })
      .join('');

    const manualFactors = state.config.quotaManualFactors || {};
    const requestedSubset = factorsToSubsetKey(manualFactors);
    const reqSubObj = subsets[requestedSubset];
    const fallbackWarn =
      calibMode === 'manual' && requestedSubset !== activeSubset && reqSubObj && !reqSubObj.eligible
        ? `<div class="calib-subset-warn">${esc(
            t('quota.manualFallbackHint', {
              subset: calibSubsetShort(requestedSubset),
              reason: reqSubObj.reason || t('quota.subsetIneligible'),
              fallback: calibSubsetShort(activeSubset)
            })
          )}</div>`
        : '';

    const lockedReasons = factorDefs
      .map((fd) => ({ key: fd.key, obj: factorsMeta[fd.key] }))
      .filter((x) => x.obj && !x.obj.eligible && x.obj.reason);

    const unlockHint = lockedReasons.length
      ? lockedReasons.map((x) => `${x.key}: ${x.obj.reason}`).join(' · ')
      : t('quota.allFactorsUnlocked');

    return `
      <div class="calib-controls-wrap">
        <div class="calib-controls-row">
          <button type="button" class="calib-auto-btn ${calibMode === 'auto' ? 'active' : ''}" data-action="set-calib-auto" data-tip="${esc(t('quota.modeAutoHelp'))}" aria-pressed="${calibMode === 'auto'}">
            <span>${esc(t('quota.modeAuto'))} (${esc(calibSubsetShort(recSubset))})</span>
          </button>
          <div class="calib-factors-group">${chipsHtml}</div>
        </div>
        ${fallbackWarn}
        <div class="calib-unlock-hint">${esc(unlockHint)}</div>
      </div>
    `;
  }

  function renderCalibAnchorSelector(summary, cal, activeSubObj) {
    const avail =
      Array.isArray(cal.availableAnchorModels) && cal.availableAnchorModels.length
        ? cal.availableAnchorModels
        : cal.anchorModel
          ? [{ canonicalId: cal.anchorModel, share: 1 }]
          : [];
    const selId = `calib-anchor-${summary.pool}-${summary.windowType}`;
    const srcMap = {
      default: { cls: 'outline', text: t('quota.anchorSrcDefault') },
      user: { cls: 'accent', text: t('quota.anchorSrcUser') },
      fallback: { cls: 'warn', text: t('quota.anchorSrcFallback') }
    };
    const srcInfo = srcMap[cal.anchorSource] || srcMap.default;
    const anchorUsd =
      activeSubObj?.anchorPoolUsd != null ? fmtUsd(activeSubObj.anchorPoolUsd) : '—';

    return `
      <div class="calib-anchor-row">
        <div class="calib-anchor-ctrl">
          <label for="${esc(selId)}">${esc(t('quota.baseAnchorLabel'))}</label>
          <select id="${esc(selId)}" class="calib-anchor-select mono" data-action="set-pool-anchor" data-pool="${esc(summary.pool)}">
            ${avail
              .map(
                (m) => `<option value="${esc(m.canonicalId)}" ${m.canonicalId === cal.anchorModel ? 'selected' : ''}>${esc(m.canonicalId)} (${Math.round(num(m.share) * 100)}%)</option>`
              )
              .join('')}
          </select>
          <span class="pill ${srcInfo.cls}">${esc(srcInfo.text)}</span>
        </div>
        <div class="calib-q-anchor num mono">
          <span>${esc(t('quota.anchorPoolQ', { usd: anchorUsd }))}</span>
          ${helpTip(t('quota.anchorPoolQHelp'))}
        </div>
      </div>
    `;
  }

  function renderCalibParamTable(cal, activeSubObj) {
    const models = Array.isArray(activeSubObj?.params?.models) ? activeSubObj.params.models : [];
    const cache = activeSubObj?.params?.cache;
    const output = activeSubObj?.params?.output;
    const baseSub = cal?.subsets?.base || null;
    const trialM = cal?.subsets?.M || null;
    const trialC = cal?.subsets?.C || null;
    const trialO = cal?.subsets?.O || null;

    function buildTrialHint(trialSub, paramObj) {
      if (!trialSub || !trialSub.eligible || !paramObj || !paramObj.fitted) return '';
      const baseLoocv = baseSub?.loocvMaePp;
      const triLoocv = trialSub.loocvMaePp;
      let reason = t('quota.trialReasonChi2');
      if (baseLoocv != null && triLoocv != null) {
        const bStr = num(baseLoocv).toFixed(2);
        const tStr = num(triLoocv).toFixed(2);
        if (triLoocv >= baseLoocv) {
          reason = t('quota.trialReasonWorse', { trial: tStr, base: bStr });
        } else if (triLoocv > baseLoocv * 0.85) {
          reason = t('quota.trialReasonMarginal', { trial: tStr, base: bStr });
        }
      }
      const clampedStr = paramObj.clamped ? ` (${t('quota.clamped')})` : '';
      return t('quota.trialNotAdopted', {
        val: fmtMultWithSe(paramObj),
        clamped: clampedStr,
        reason
      });
    }

    const rows = [];

    for (const m of models) {
      const val = num(m.value, 1);
      let statusPill = `<span class="pill outline">${esc(t('quota.paramDefault'))}</span>`;
      let interp = t('quota.interpModelUnfit');
      let trialNote = '';
      if (m.isAnchor) {
        statusPill = `<span class="pill accent">${esc(t('quota.paramBase'))}</span>`;
        interp = t('quota.interpBase');
      } else if (m.fitted) {
        statusPill = `<span class="pill ok">${esc(t('quota.paramFitted'))}</span>`;
        if (val < 0.95) interp = t('quota.interpModelEff', { v: val.toFixed(2) });
        else if (val > 1.05) interp = t('quota.interpModelHeavy', { v: val.toFixed(2) });
        else interp = t('quota.interpModelNeutral', { v: val.toFixed(2) });
      } else if (trialM?.eligible) {
        const tm = (trialM.params?.models || []).find((x) => x.canonicalId === m.canonicalId);
        trialNote = buildTrialHint(trialM, tm);
      }
      rows.push({
        name: `${m.canonicalId} (${Math.round(num(m.share) * 100)}%)`,
        statusPill,
        valText: m.isAnchor || !m.fitted ? '1.00×' : fmtMultWithSe(m),
        clamped: Boolean(m.clamped),
        interp,
        trialNote
      });
    }

    if (cache) {
      const val = num(cache.value, 1);
      const fitted = Boolean(cache.fitted);
      const statusPill = fitted
        ? `<span class="pill ok">${esc(t('quota.paramFitted'))}</span>`
        : `<span class="pill outline">${esc(t('quota.paramDefault'))}</span>`;
      let interp = t('quota.interpCacheUnfit');
      let trialNote = '';
      if (fitted) {
        if (val < 0.85) interp = t('quota.interpCacheCheap', { v: val.toFixed(2) });
        else if (val > 1.15) interp = t('quota.interpCacheExpensive', { v: val.toFixed(2) });
        else interp = t('quota.interpCacheNeutral', { v: val.toFixed(2) });
      } else if (trialC?.eligible) {
        trialNote = buildTrialHint(trialC, trialC.params?.cache);
      }
      rows.push({
        name: t('quota.paramCacheName'),
        statusPill,
        valText: fitted ? fmtMultWithSe(cache) : '1.00×',
        clamped: Boolean(cache.clamped),
        interp,
        trialNote
      });
    }

    if (output) {
      const val = num(output.value, 1);
      const fitted = Boolean(output.fitted);
      const statusPill = fitted
        ? `<span class="pill ok">${esc(t('quota.paramFitted'))}</span>`
        : `<span class="pill outline">${esc(t('quota.paramDefault'))}</span>`;
      let interp = t('quota.interpOutUnfit');
      let trialNote = '';
      if (fitted) {
        if (val > 1.15) interp = t('quota.interpOutExpensive', { v: val.toFixed(2) });
        else if (val < 0.85) interp = t('quota.interpOutCheap', { v: val.toFixed(2) });
        else interp = t('quota.interpOutNeutral', { v: val.toFixed(2) });
      } else if (trialO?.eligible) {
        trialNote = buildTrialHint(trialO, trialO.params?.output);
      }
      rows.push({
        name: t('quota.paramOutName'),
        statusPill,
        valText: fitted ? fmtMultWithSe(output) : '1.00×',
        clamped: Boolean(output.clamped),
        interp,
        trialNote
      });
    }

    const promoNote =
      cal.promoIdentifiable === false && cal.promoAssumption && cal.promoAssumption !== 'none'
        ? `<div class="banner info" style="padding:6px 8px;font-size:11px">${esc(
            t(cal.promoAssumption === 'list_price' ? 'quota.promoNoteList' : 'quota.promoNoteFollow')
          )}</div>`
        : '';

    return `
      <div class="calib-param-list">
        ${rows
          .map(
            (r) => `
            <div class="calib-param-row">
              <div class="calib-param-top">
                <span class="calib-param-left">
                  <span class="mono" style="font-weight:500">${esc(r.name)}</span>
                  ${r.statusPill}
                </span>
                <span class="calib-param-val num mono">
                  <span>${esc(r.valText)}</span>
                  ${r.clamped ? `<span class="calib-clamp-tag">${esc(t('quota.clamped'))}</span>` : ''}
                </span>
              </div>
              <div class="calib-param-desc">${esc(r.interp)}</div>
              ${r.trialNote ? `<div class="calib-param-desc num mono" style="opacity:0.82">${esc(r.trialNote)}</div>` : ''}
            </div>
          `
          )
          .join('')}
      </div>
      ${promoNote}
    `;
  }

  function renderCalibResidualSvg(summary, cal, activeSubObj) {
    const activeSubset = cal.activeSubset || 'base';
    const baseObj = cal.subsets?.base || null;
    const fits = Array.isArray(activeSubObj?.segmentFits) ? activeSubObj.segmentFits : [];
    const smoothPillHtml = renderCalibSmoothingPill(summary, cal);

    const hasLoocv =
      baseObj?.loocvMaePp != null &&
      activeSubObj?.loocvMaePp != null &&
      Number.isFinite(Number(baseObj.loocvMaePp)) &&
      Number.isFinite(Number(activeSubObj.loocvMaePp));
    const baseErr = hasLoocv ? num(baseObj.loocvMaePp, 0) : num(baseObj?.maePp, 0);
    const curErr = hasLoocv ? num(activeSubObj.loocvMaePp, 0) : num(activeSubObj?.maePp, 0);
    const metricLbl = hasLoocv ? 'LOOCV' : 'MAE';
    const summaryLine =
      baseObj && activeSubObj
        ? activeSubset === 'base'
          ? t('quota.residualBaseOnly', {
              base: calibSubsetShort('base'),
              mae0: baseErr.toFixed(2),
              metric: metricLbl
            })
          : t('quota.residualSummary', {
              l0: calibSubsetShort('base'),
              mae0: baseErr.toFixed(2),
              cur: calibSubsetShort(activeSubset),
              mae1: curErr.toFixed(2),
              metric: metricLbl
            })
        : '';

    if (fits.length === 0) {
      return `
        <div class="calib-chart-box">
          <div class="calib-chart-head">
            <span style="font-weight:600">${esc(t('quota.residualTitle'))}</span>
            ${smoothPillHtml}
            ${summaryLine ? `<span class="muted-note num">${esc(summaryLine)}</span>` : ''}
          </div>
          <div class="muted-note" style="font-size:11px">${esc(t('quota.residualNoData'))}</div>
        </div>
      `;
    }

    const W = 360;
    const H = 100;
    const padL = 28;
    const padR = 8;
    const padT = 11;
    const padB = 16;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    let maxPp = 1;
    for (const s of fits) {
      maxPp = Math.max(maxPp, num(s.observedPp, 0), num(s.predBasePp ?? s.predL0Pp, 0), num(s.predPp, 0));
    }
    maxPp *= 1.15;

    const showCur = activeSubset !== 'base';
    const barsPerSeg = showCur ? 3 : 2;
    const slotW = plotW / fits.length;
    const groupW = Math.min(34, slotW * 0.78);
    const gap = 1.5;
    const barW = Math.max(2, (groupW - gap * (barsPerSeg - 1)) / barsPerSeg);

    const gridYs = [0, 0.5, 1].map((r) => {
      const val = maxPp * r;
      const y = padT + plotH - r * plotH;
      return `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
        <text x="${padL - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8.5" fill="var(--fg-muted)" class="num">${val.toFixed(val >= 10 ? 0 : 1)}</text>
      `;
    }).join('');

    let hasDownweighted = false;
    const groupsHtml = fits
      .map((s, idx) => {
        const obs = Math.max(0, num(s.observedPp, 0));
        const pBase = Math.max(0, num(s.predBasePp ?? s.predL0Pp, 0));
        const p1 = Math.max(0, num(s.predPp, 0));
        const xCenter = padL + (idx + 0.5) * slotW;
        const x0 = xCenter - groupW / 2;

        const hObs = Math.max(1, (obs / maxPp) * plotH);
        const hBase = Math.max(1, (pBase / maxPp) * plotH);
        const hCur = Math.max(1, (p1 / maxPp) * plotH);

        const yObs = padT + plotH - hObs;
        const yBase = padT + plotH - hBase;
        const yCur = padT + plotH - hCur;

        const errBase = pBase - obs;
        const errCur = p1 - obs;
        const fmtSigned = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
        const mergedCnt = num(s.mergedCount, 1);
        const isDownweighted = Boolean(s.downweighted);
        if (isDownweighted) hasDownweighted = true;

        const tipLines = [
          t('quota.segTipTitle', { idx: s.idx ?? idx + 1, usd: fmtUsd(s.spendUsd) }),
          t('quota.segTipObs', { v: obs.toFixed(2) }),
          t('quota.segTipBase', { v: pBase.toFixed(2), err: fmtSigned(errBase) })
        ];
        if (showCur) {
          tipLines.push(t('quota.segTipCur', { lvl: calibSubsetShort(activeSubset), v: p1.toFixed(2), err: fmtSigned(errCur) }));
        }
        if (mergedCnt > 1) {
          tipLines.push(t('quota.segTipMerged', { n: mergedCnt }));
        }
        if (isDownweighted) {
          tipLines.push(t('quota.segTipDownweighted'));
        }

        const bx0 = x0;
        const bx1 = x0 + barW + gap;
        const bx2 = x0 + (barW + gap) * 2;
        const topBarY = Math.min(yObs, yBase, showCur ? yCur : yBase);
        const dotY = Math.max(4, topBarY - 4.5);

        return `
          <g class="calib-seg-group" data-tip="${esc(tipLines.join('\n'))}">
            <rect class="calib-seg-bg" x="${(xCenter - slotW / 2).toFixed(1)}" y="${padT}" width="${slotW.toFixed(1)}" height="${plotH}" rx="2"/>
            <rect x="${bx0.toFixed(1)}" y="${yObs.toFixed(1)}" width="${barW.toFixed(1)}" height="${hObs.toFixed(1)}" rx="1.5" fill="var(--accent)"/>
            <rect x="${bx1.toFixed(1)}" y="${yBase.toFixed(1)}" width="${barW.toFixed(1)}" height="${hBase.toFixed(1)}" rx="1.5" fill="var(--fg-muted)" opacity="0.55"/>
            ${showCur ? `<rect x="${bx2.toFixed(1)}" y="${yCur.toFixed(1)}" width="${barW.toFixed(1)}" height="${hCur.toFixed(1)}" rx="1.5" fill="var(--ok)"/>` : ''}
            ${isDownweighted ? `<circle cx="${xCenter.toFixed(1)}" cy="${dotY.toFixed(1)}" r="2.3" fill="var(--warn)" stroke="var(--surface)" stroke-width="0.6"/>` : ''}
            <text x="${xCenter.toFixed(1)}" y="${H - 3}" text-anchor="middle" font-size="8.5" fill="var(--fg-muted)" class="num">#${esc(s.idx ?? idx + 1)}</text>
          </g>
        `;
      })
      .join('');

    return `
      <div class="calib-chart-box">
        <div class="calib-chart-head">
          <span style="font-weight:600">${esc(t('quota.residualTitle'))}</span>
          ${smoothPillHtml}
          ${summaryLine ? `<span class="muted-note num">${esc(summaryLine)}</span>` : ''}
        </div>
        <svg class="calib-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('quota.residualTitle'))}">
          ${gridYs}
          ${groupsHtml}
        </svg>
        <div class="legend-inline">
          <span class="legend-item"><span class="legend-dot" style="background:var(--accent)"></span>${esc(t('quota.legendObs'))}</span>
          <span class="legend-item"><span class="legend-dot" style="background:var(--fg-muted);opacity:0.55"></span>${esc(t('quota.legendBase'))}</span>
          ${showCur ? `<span class="legend-item"><span class="legend-dot" style="background:var(--ok)"></span>${esc(t('quota.legendCur', { lvl: calibSubsetShort(activeSubset) }))}</span>` : ''}
          ${hasDownweighted ? `<span class="legend-item"><span class="legend-dot" style="background:var(--warn)"></span>${esc(t('quota.legendHuber'))}</span>` : ''}
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 17. Rendering: Main Modules Grid
  // =========================================================================
  function renderGrid() {
    const order = state.config.moduleOrder || DEFAULT_CONFIG.moduleOrder;
    const enabledIds = order.filter((id) => ALL_MODULE_IDS.includes(id) && isModuleActiveForView(id));

    if (enabledIds.length === 0) {
      dom.modulesGrid.innerHTML = '';
      dom.emptyModules.classList.remove('hidden');
      return;
    }
    dom.emptyModules.classList.add('hidden');

    const renderers = {
      'live-context': renderLiveContext,
      'cache-diagnostics': renderCacheDiagnostics,
      'io-flow': renderIoFlow,
      'model-cost': renderModelCost,
      'calendar-trends': renderCalendarTrends,
      'cache-observatory': (expanded) => state.lensObsError
        ? {badges:'', body:'<div class="banner error">' + esc(state.lensObsError) + '</div>'}
        : LensAnalytics.cache(state.lensObsData, state.lensObs, expanded, getLang()),
      'quota-budget': renderQuotaBudget
    };

    const cardsHtml = enabledIds
      .map((id) => {
        const expanded = isCardExpandedForView(id);
        const wideClass =
          expanded && (id === 'calendar-trends' || id === 'model-cost' || id === 'cache-observatory' || id === 'quota-budget')
            ? 'span-wide'
            : '';
        const res = renderers[id](expanded);
        return `
          <section class="card ${expanded ? 'expanded' : ''} ${wideClass}" data-module="${esc(id)}">
            <div class="card-head" data-action="toggle-card" data-module="${esc(id)}" role="button" tabindex="0" aria-expanded="${expanded}">
              <div class="card-head-left">
                <h2 class="card-title">${esc(t(`modules.${id}.title`))}</h2>
                ${helpTip(t(`modules.${id}.headHelp`))}
                ${res.badges || ''}
              </div>
              <div class="card-head-right">
                <svg class="icon chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>
              </div>
            </div>
            <div class="card-body">${res.body}</div>
          </section>
        `;
      })
      .join('');

    dom.modulesGrid.innerHTML = cardsHtml;
    syncPinnedObsPopover();
  }

  // =========================================================================
  // 18. Rendering: Settings Drawer
  // =========================================================================
  function renderSettings() {
    if (!state.settingsOpen) return;

    const lang = getLang();
    const order = state.config.moduleOrder || DEFAULT_CONFIG.moduleOrder;
    const modRows = order
      .filter((id) => ALL_MODULE_IDS.includes(id))
      .map((id, idx, arr) => {
        const on = Boolean(state.config.modules[id]);
        return `
          <div class="set-mod-row">
            <div class="set-mod-meta">
              <span class="set-mod-name">
                <span>${esc(t(`modules.${id}.title`))}</span>
                ${helpTip(t(`modules.${id}.setHelp`))}
              </span>
              <span class="set-mod-desc">${esc(t(`modules.${id}.desc`))}</span>
            </div>
            <div class="set-mod-actions">
              <button type="button" class="icon-btn" data-action="move-module" data-module="${esc(id)}" data-dir="-1" title="${esc(t('settings.moveUp'))}" aria-label="${esc(t('settings.moveUp'))}" ${idx === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="icon-btn" data-action="move-module" data-module="${esc(id)}" data-dir="1" title="${esc(t('settings.moveDown'))}" aria-label="${esc(t('settings.moveDown'))}" ${idx === arr.length - 1 ? 'disabled' : ''}>↓</button>
              <label class="switch" title="${esc(t('settings.toggleModuleTitle'))}">
                <input type="checkbox" data-action="toggle-module" data-module="${esc(id)}" ${on ? 'checked' : ''}>
                <span class="switch-track"></span>
              </label>
            </div>
          </div>
        `;
      })
      .join('');

    const refreshVal = String(num(state.config.refreshSec, 30));

    dom.settingsBody.innerHTML = `
      <section class="set-section">
        <div class="set-title-row">
          <h3 class="set-title">${esc(t('settings.langSection'))}</h3>
        </div>
        <div class="set-card">
          <div class="set-mod-row">
            <div class="set-mod-meta">
              <span class="set-mod-name">中文 / English</span>
              <span class="set-mod-desc">${esc(t('settings.langDesc'))}</span>
            </div>
            <div class="seg">
              <button type="button" class="${lang === 'zh-CN' ? 'active' : ''}" data-action="set-lang" data-lang="zh-CN">中文</button>
              <button type="button" class="${lang === 'en' ? 'active' : ''}" data-action="set-lang" data-lang="en">English</button>
            </div>
          </div>
          <div class="set-mod-row">
            <div class="set-mod-meta">
              <span class="set-mod-name">
                <span>${esc(t('settings.autoRefreshName'))}</span>
                ${helpTip(t('settings.autoRefreshHelp'))}
              </span>
              <span class="set-mod-desc">${esc(t('settings.autoRefreshDesc'))}</span>
            </div>
            <label class="select sm" style="border:1px solid var(--border-c);border-radius:var(--r-md)">
              <select data-action="set-refresh-sec" aria-label="${esc(t('header.refreshIntervalAria'))}">
                <option value="0" ${refreshVal === '0' ? 'selected' : ''}>${esc(t('header.off'))}</option>
                <option value="15" ${refreshVal === '15' ? 'selected' : ''}>15s</option>
                <option value="30" ${refreshVal === '30' ? 'selected' : ''}>30s</option>
                <option value="60" ${refreshVal === '60' ? 'selected' : ''}>60s</option>
                <option value="300" ${refreshVal === '300' ? 'selected' : ''}>5m</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section class="set-section">
        <div class="set-title-row">
          <h3 class="set-title">${esc(t('settings.modulesSection'))}</h3>
        </div>
        <div class="set-card">${modRows}</div>
      </section>


    `;
  }

  function renderAll(isBackground = false) {
    renderHeader();
    const active = document.activeElement;
    const editingQuotaForm = Boolean(
      isBackground &&
        active &&
        active.closest &&
        (active.closest('#quota-anchor-form') || active.closest('.calib-anchor-select'))
    );
    const editingSettingsInput = Boolean(
      isBackground && active && active.closest && active.closest('#settings-body input, #settings-body select')
    );
    if (!editingQuotaForm) renderGrid();
    if (!editingSettingsInput) renderSettings();
  }

  // =========================================================================
  // 19. Interactive Event Handlers & Clipboard
  // =========================================================================
  function openSettings() {
    dismissHelpPin();
    state.settingsOpen = true;
    dom.btnSettings.setAttribute('aria-expanded', 'true');
    dom.settingsBackdrop.classList.remove('hidden');
    dom.settingsDrawer.classList.remove('hidden');
    renderSettings();
    dom.settingsDrawer.focus();
    if (!state.pricing.data && !state.pricing.loading && !state.pricing.prefetching) {
      state.pricing.prefetching = true;
      getJson('/api/pricing')
        .then((d) => {
          if (!state.pricing.data) {
            state.pricing.data = d;
            if (state.settingsOpen) renderSettings();
          }
        })
        .catch(() => {})
        .finally(() => {
          state.pricing.prefetching = false;
        });
    }
  }

  function closeSettings() {
    dismissHelpPin();
    state.settingsOpen = false;
    dom.btnSettings.setAttribute('aria-expanded', 'false');
    dom.settingsBackdrop.classList.add('hidden');
    dom.settingsDrawer.classList.add('hidden');
  }

  async function loadPricingList() {
    state.pricing.loading = true;
    state.pricing.error = '';
    renderSettings();
    try {
      state.pricing.data = await getJson('/api/pricing');
    } catch (err) {
      state.pricing.error = err.message;
    } finally {
      state.pricing.loading = false;
      renderSettings();
    }
  }

  async function copyTextWithFallback(text) {
    if (!text) return false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {}
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return Boolean(ok);
    } catch (_) {
      return false;
    }
  }

  // Codex thread picker
  function threadProviderName(provider) {
    if (provider === 'openai') return 'OpenAI';
    if (provider === 'krill-code') return 'Krill';
    return provider || '';
  }

  function isThreadPickerOpen() {
    return !dom.threadPopover.classList.contains('hidden');
  }

  function renderThreadTrigger() {
    const id = resolveConversationId();
    const thread = state.threads?.find((item) => item.id === id);
    const selectedSession = state.session?.conversationId === id ? state.session : null;
    const title = thread?.title || selectedSession?.title || id.slice(0, 8) || t('codex.selectThread');
    const provider = threadProviderName(thread?.provider || selectedSession?.source);
    dom.threadTitle.textContent = title;
    dom.threadTitle.title = id ? title : '';
    dom.threadProvider.textContent = provider;
    dom.threadProvider.classList.toggle('hidden', !provider);
    dom.threadClear.classList.toggle('hidden', !id);
  }

  function setActiveThreadOption(index, scroll = false) {
    state.activeThreadOption = index;
    const id = index < 0 ? '' : `thread-option-${index}`;
    for (const option of dom.threadOptions.children) {
      option.classList.toggle('is-active', option.id === id);
    }
    if (id) {
      dom.threadSearch.setAttribute('aria-activedescendant', id);
      if (scroll) $(id).scrollIntoView({block: 'nearest'});
    } else {
      dom.threadSearch.removeAttribute('aria-activedescendant');
    }
  }

  function renderThreadOptions(reset = false) {
    const activeId = reset ? null : state.threadMatches[state.activeThreadOption]?.id;
    const selectedId = resolveConversationId();
    const query = dom.threadSearch.value.trim().toLocaleLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    state.threadMatches = (state.threads || []).filter((thread) => {
      const text = [thread.title, thread.id, thread.provider, threadProviderName(thread.provider)]
        .join(' ').toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    });
    dom.threadOptions.innerHTML = state.threadMatches.map((thread, index) => `
      <div id="thread-option-${index}" class="thread-option" role="option" aria-selected="${thread.id === selectedId}" data-index="${index}">
        <span class="truncate" title="${esc(thread.title)}">${esc(thread.title)}</span>
        <span class="pill outline truncate">${esc(threadProviderName(thread.provider))}</span>
      </div>`).join('');

    const empty = !state.threadMatches.length;
    dom.threadOptions.classList.toggle('hidden', empty);
    dom.threadEmpty.classList.toggle('hidden', !empty);
    if (empty) {
      const message = state.threads === null
        ? (state.threadListFailed ? 'threadListUnavailable' : 'loadingThreads')
        : (query ? 'noMatchingThreads' : 'noRecentThreads');
      dom.threadEmpty.textContent = t(`codex.${message}`);
    }
    const index = state.threadMatches.findIndex((thread) => thread.id === (activeId || selectedId));
    setActiveThreadOption(empty ? -1 : Math.max(0, index), reset);
  }

  function setThreadPickerOpen(open, restoreFocus = false) {
    dom.threadPopover.classList.toggle('hidden', !open);
    dom.threadTrigger.setAttribute('aria-expanded', String(open));
    dom.threadSearch.setAttribute('aria-expanded', String(open));
    if (open) {
      dom.threadSearch.value = '';
      renderThreadOptions(true);
      dom.threadSearch.focus({preventScroll: true});
    } else {
      dom.threadSearch.removeAttribute('aria-activedescendant');
      if (restoreFocus) dom.threadTrigger.focus({preventScroll: true});
    }
  }

  function selectThread(id) {
    const url = new URL(location.href);
    if (id) url.searchParams.set('conversationId', id);
    else url.searchParams.delete('conversationId');
    history.replaceState(null, '', url);
    state.session = null;
    state.sessionError = null;
    renderThreadTrigger();
    renderGrid();
    setThreadPickerOpen(false, true);
    refreshAll(true);
  }

  dom.threadTrigger.addEventListener('click', () => setThreadPickerOpen(!isThreadPickerOpen()));
  dom.threadSearch.addEventListener('input', () => renderThreadOptions(true));
  dom.threadSearch.addEventListener('keydown', (event) => {
    if (event.isComposing || !state.threadMatches.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveThreadOption(clamp(state.activeThreadOption + delta, 0, state.threadMatches.length - 1), true);
    } else if (event.key === 'Enter' && state.activeThreadOption >= 0) {
      event.preventDefault();
      selectThread(state.threadMatches[state.activeThreadOption].id);
    }
  });
  dom.threadOptions.addEventListener('click', (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) selectThread(state.threadMatches[Number(option.dataset.index)].id);
  });
  dom.threadClear.addEventListener('click', () => selectThread(''));
  dom.threadPicker.addEventListener('focusout', (event) => {
    if (isThreadPickerOpen() && event.relatedTarget && !dom.threadPicker.contains(event.relatedTarget)) {
      setThreadPickerOpen(false);
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (isThreadPickerOpen() && !dom.threadPicker.contains(event.target)) setThreadPickerOpen(false);
  });

  // Header Controls
  dom.refreshSelect.addEventListener('change', async (e) => {
    const val = Number(e.target.value);
    state.config.refreshSec = Number.isFinite(val) ? val : 30;
    resetRefreshTimer();
    if (state.settingsOpen) renderSettings();
    await saveConfigPatch({ refreshSec: state.config.refreshSec });
  });

  dom.btnRefresh.addEventListener('click', () => refreshAll(true));
  dom.btnSettings.addEventListener('click', openSettings);
  dom.btnOpenSettingsEmpty.addEventListener('click', openSettings);
  dom.btnCloseSettings.addEventListener('click', closeSettings);
  dom.settingsBackdrop.addEventListener('click', closeSettings);
  dom.providerSelect.addEventListener('change', () => {
    state.selectedDay = null;
    refreshAll(true);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isThreadPickerOpen() && !e.isComposing) {
        e.preventDefault();
        setThreadPickerOpen(false, true);
        return;
      }
      if (state.pinnedHelpEl || !dom.chartTooltip.classList.contains('hidden')) {
        dismissHelpPin();
        return;
      }
      if (state.settingsOpen) closeSettings();
    }
  });

  // Range Pills
  dom.rangeBar.addEventListener('click', async (e) => {
    const btn = e.target.closest('.range-pill');
    if (!btn) return;
    const r = btn.dataset.range;
    if (!r) return;
    state.rangeKey = r;
    if (r === 'custom') {
      if (!state.customTo) state.customTo = fmtLocalDateStr(new Date());
      if (!state.customFrom) {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        state.customFrom = fmtLocalDateStr(d);
      }
      dom.customFrom.value = state.customFrom;
      dom.customTo.value = state.customTo;
      renderHeader();
      return;
    }
    renderHeader();
    await saveConfigPatch({ defaultRange: r });
    refreshAll(true);
  });

  dom.btnApplyCustom.addEventListener('click', () => {
    state.customFrom = dom.customFrom.value;
    state.customTo = dom.customTo.value;
    if (state.customFrom && state.customTo) refreshAll(true);
  });

  dom.modulesGrid.addEventListener('change', (event) => {
    const field = event.target.dataset.obsField;
    if (!field || field === 'fit-choice') return;
    state.lensObs[field] = event.target.value;
    if (field === 'metric') renderGrid();
    else refreshAll(true);
  });
  dom.modulesGrid.addEventListener('click', (event) => {
    const view = event.target.closest('[data-obs-view]');
    if (view) {
      state.lensObs.view = view.dataset.obsView;
      renderGrid();
    } else if (event.target.closest('[data-obs-copy]')) {
      void copyTextWithFallback(LensAnalytics.report(state.lensObsData,state.lensObs,getLang()));
    }
  });

  // Modules Grid Click Delegation
  dom.modulesGrid.addEventListener('click', async (e) => {
    if (e.target.closest('.help-tip')) return;
    const stopEl = e.target.closest('[data-stop-card]');
    const actionEl = e.target.closest('[data-action]');

    if (actionEl) {
      const action = actionEl.dataset.action;

      if (action === 'toggle-card') {
        if (stopEl) return;
        const mod = actionEl.dataset.module;
        const next = !isCardExpandedForView(mod);
        if (state.query.expandAll || state.query.expandSet) {
          state.localExpandedOverrides.set(mod, next);
          renderGrid();
          return;
        }
        state.config.expanded[mod] = next;
        renderGrid();
        await saveConfigPatch({ expanded: { [mod]: next } });
        return;
      }

      if (action === 'toggle-ctx-cat') {
        const key = actionEl.dataset.cat;
        if (state.ctxOpenCategories.has(key)) state.ctxOpenCategories.delete(key);
        else state.ctxOpenCategories.add(key);
        renderGrid();
        return;
      }

      if (action === 'set-io-scope') {
        e.stopPropagation();
        const sc = actionEl.dataset.scope;
        if (sc && sc !== state.ioScope) {
          state.ioScope = sc;
          renderHeader();
          renderGrid();
          refreshAll(true);
        }
        return;
      }

      if (action === 'set-model-view') {
        state.modelView = actionEl.dataset.view;
        renderGrid();
        return;
      }

      if (action === 'set-model-sort') {
        state.modelSort = actionEl.dataset.sort;
        renderGrid();
        return;
      }

      if (action === 'set-cal-metric') {
        state.calMetric = actionEl.dataset.metric;
        renderGrid();
        return;
      }

      if (action === 'select-day') {
        const date = actionEl.dataset.date;
        if (!date) return;
        state.selectedDay = { date, loading: true, error: '', data: null };
        renderGrid();
        try {
            const data = await getJson(`/api/day?date=${encodeURIComponent(date)}&provider=${encodeURIComponent(dom.providerSelect.value)}`);
          if (state.selectedDay && state.selectedDay.date === date) {
            state.selectedDay = { date, loading: false, error: '', data };
            renderGrid();
          }
        } catch (err) {
          if (state.selectedDay && state.selectedDay.date === date) {
            state.selectedDay = { date, loading: false, error: err.message, data: null };
            renderGrid();
          }
        }
        return;
      }

      if (action === 'close-day') {
        state.selectedDay = null;
        renderGrid();
        return;
      }

      if (action === 'toggle-obs-metric-menu') {
        e.stopPropagation();
        if (!state.obsMetricMenuOpen) dismissObsCellPopover();
        state.obsMetricMenuOpen = !state.obsMetricMenuOpen;
        renderGrid();
        return;
      }

      if (action === 'set-obs-primary') {
        e.stopPropagation();
        const metric = actionEl.dataset.metric;
        if (!OBS_MATRIX_METRIC_IDS.includes(metric)) return;
        const { primary: prevPrimary, subs: prevSubs } = getObsMatrixPrefs();
        if (metric === prevPrimary) return;
        const nextSubSet = new Set(prevSubs.filter((id) => id !== metric));
        nextSubSet.add(prevPrimary);
        const nextSubs = OBS_MATRIX_METRIC_IDS.filter((id) => nextSubSet.has(id));
        state.config.obsMatrixPrimary = metric;
        state.config.obsMatrixSubMetrics = nextSubs;
        renderGrid();
        await saveConfigPatch({
          obsMatrixPrimary: metric,
          obsMatrixSubMetrics: nextSubs
        });
        return;
      }

      if (action === 'toggle-obs-sub') {
        e.stopPropagation();
        const metric = actionEl.dataset.metric;
        if (!OBS_MATRIX_METRIC_IDS.includes(metric)) return;
        const { primary, subs } = getObsMatrixPrefs();
        if (metric === primary) return;
        const nextSubSet = new Set(subs);
        if (nextSubSet.has(metric)) {
          nextSubSet.delete(metric);
        } else {
          nextSubSet.add(metric);
        }
        const nextSubs = OBS_MATRIX_METRIC_IDS.filter((id) => nextSubSet.has(id));
        state.config.obsMatrixSubMetrics = nextSubs;
        renderGrid();
        await saveConfigPatch({ obsMatrixSubMetrics: nextSubs });
        return;
      }

      if (action === 'reset-obs-metrics') {
        e.stopPropagation();
        const nextPrimary = DEFAULT_CONFIG.obsMatrixPrimary;
        const nextSubs = [...DEFAULT_CONFIG.obsMatrixSubMetrics];
        state.config.obsMatrixPrimary = nextPrimary;
        state.config.obsMatrixSubMetrics = nextSubs;
        renderGrid();
        await saveConfigPatch({
          obsMatrixPrimary: nextPrimary,
          obsMatrixSubMetrics: nextSubs
        });
        return;
      }

      if (action === 'set-obs-filter') {
        state.obsModelFilter = actionEl.dataset.model || 'all';
        renderGrid();
        return;
      }

      if (action === 'toggle-obs-anomalies') {
        state.obsAnomaliesOpen = !state.obsAnomaliesOpen;
        renderGrid();
        return;
      }

      if (action === 'copy-obs-issue') {
        const md = state.analytics?.cacheObservatory?.issueMarkdown || '';
        const ok = await copyTextWithFallback(md);
        state.obsCopyStatus = ok ? 'copied' : 'failed';
        if (state.obsCopyTimer) clearTimeout(state.obsCopyTimer);
        renderGrid();
        state.obsCopyTimer = setTimeout(() => {
          state.obsCopyStatus = '';
          renderGrid();
        }, 2000);
        return;
      }

      if (action === 'set-quota-mode') {
        e.stopPropagation();
        const mode = actionEl.dataset.mode === 'used' ? 'used' : 'remaining';
        state.config.quotaDisplayMode = mode;
        renderGrid();
        await saveConfigPatch({ quotaDisplayMode: mode });
        return;
      }

      if (action === 'set-qa-offset') {
        const off = actionEl.dataset.offset;
        state.quotaForm.captureOffsetMin = off === 'custom' ? 'custom' : Number(off);
        if (off === 'custom' && !state.quotaForm.customCaptureAt) {
          const now = new Date();
          now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
          state.quotaForm.customCaptureAt = now.toISOString().slice(0, 16);
        }
        renderGrid();
        return;
      }

      if (action === 'toggle-calib-lab') {
        const key = actionEl.dataset.key;
        if (!key) return;
        const currentlyOpen = actionEl.classList.contains('open');
        state.quotaLabOpenByKey.set(key, !currentlyOpen);
        renderGrid();
        return;
      }

      if (action === 'set-calib-auto') {
        state.config.quotaCalibMode = 'auto';
        renderGrid();
        await saveConfigPatch({ quotaCalibMode: 'auto' });
        await refreshQuotaOnly();
        return;
      }

      if (action === 'toggle-calib-factor') {
        if (actionEl.getAttribute('aria-disabled') === 'true') return;
        const factor = actionEl.dataset.factor;
        if (!['M', 'C', 'O'].includes(factor)) return;
        const pool = actionEl.dataset.pool;
        const wt = actionEl.dataset.wt;
        const matchedSum = (state.quotaData?.summaries || []).find(
          (s) => s.pool === pool && s.windowType === wt
        );
        const curActive = matchedSum?.estimation?.calibration?.activeFactors;
        const base = curActive
          ? { M: Boolean(curActive.M), C: Boolean(curActive.C), O: Boolean(curActive.O) }
          : { ...(state.config.quotaManualFactors || { M: false, C: false, O: false }) };
        const nextFactors = { ...base, [factor]: !base[factor] };
        state.config.quotaCalibMode = 'manual';
        state.config.quotaManualFactors = nextFactors;
        renderGrid();
        await saveConfigPatch({ quotaCalibMode: 'manual', quotaManualFactors: nextFactors });
        await refreshQuotaOnly();
        return;
      }

      if (action === 'toggle-older-anchors') {
        state.quotaOlderOpen = !state.quotaOlderOpen;
        renderGrid();
        return;
      }

      if (action === 'delete-anchor') {
        const id = Number(actionEl.dataset.id);
        if (!Number.isFinite(id)) return;
        try {
          state.quotaData = await postJson('/api/quota/anchors/delete', { id });
          renderGrid();
        } catch (err) {
          state.quotaForm.error = t('quota.deleteFailed', { msg: err.message });
          renderGrid();
        }
        return;
      }
    }
  });

  // Preserve Quota Form input values across light edits & handle submit
  dom.modulesGrid.addEventListener('input', (e) => {
    const tgt = e.target;
    if (tgt.id === 'qa-pool') state.quotaForm.pool = tgt.value;
    else if (tgt.id === 'qa-window') state.quotaForm.windowType = tgt.value;
    else if (tgt.id === 'qa-pct') state.quotaForm.remainingPct = tgt.value;
    else if (tgt.id === 'qa-reset') {
      state.quotaForm.resetInput = tgt.value;
      const hint = tgt.parentElement?.querySelector('.field-hint');
      if (hint) {
        const p = parseResetInput(tgt.value);
        const inheritable = getInheritableResetAt(state.quotaForm.pool, state.quotaForm.windowType);
        const emptyHint = inheritable
          ? t('quota.resetInheritHint', { time: fmtResetClock(inheritable) })
          : t('quota.resetHint');
        hint.textContent = tgt.value ? p.preview : emptyHint;
        hint.style.color = tgt.value ? (p.ok ? 'var(--ok)' : 'var(--bad)') : '';
      }
    } else if (tgt.id === 'qa-custom-time') state.quotaForm.customCaptureAt = tgt.value;
    else if (tgt.id === 'qa-note') state.quotaForm.note = tgt.value;
  });

  dom.modulesGrid.addEventListener('change', async (e) => {
    const tgt = e.target;
    if (tgt.id === 'qa-pool') {
      state.quotaForm.pool = tgt.value;
      renderGrid();
    } else if (tgt.id === 'qa-window') {
      state.quotaForm.windowType = tgt.value;
      renderGrid();
    } else if (tgt.dataset?.action === 'set-pool-anchor') {
      const pool = tgt.dataset.pool;
      const modelId = tgt.value;
      if (!pool || !modelId) return;
      const nextAnchors = { ...(state.config.quotaAnchorsByPool || {}), [pool]: modelId };
      state.config.quotaAnchorsByPool = nextAnchors;
      await saveConfigPatch({ quotaAnchorsByPool: nextAnchors });
      await refreshQuotaOnly();
    }
  });

  dom.modulesGrid.addEventListener('submit', async (e) => {
    if (e.target.id !== 'quota-anchor-form') return;
    e.preventDefault();
    const f = state.quotaForm;
    const rawStr = String(f.remainingPct ?? '').trim();
    const pctVal = Number(rawStr);
    if (!rawStr || !Number.isFinite(pctVal) || pctVal < 0 || pctVal > 100) {
      f.error = t('quota.invalidPct');
      renderGrid();
      return;
    }

    const parsedReset = parseResetInput(f.resetInput);
    if (!parsedReset.ok) {
      f.error = parsedReset.preview;
      renderGrid();
      return;
    }

    let capturedAt = Date.now();
    if (f.captureOffsetMin === 'custom' && f.customCaptureAt) {
      const ts = Date.parse(f.customCaptureAt);
      if (!Number.isNaN(ts)) capturedAt = ts;
    } else if (typeof f.captureOffsetMin === 'number' && f.captureOffsetMin < 0) {
      capturedAt = Date.now() + f.captureOffsetMin * 60000;
    }

    f.submitting = true;
    f.error = '';
    renderGrid();

    try {
      const res = await postJson('/api/quota/anchors', {
        pool: f.pool,
        windowType: f.windowType,
        remainingPct: Math.round(pctVal * 100) / 100,
        rawInput: rawStr,
        capturedAt,
        resetAt: parsedReset.ts,
        note: f.note.trim() || null
      });
      state.quotaData = res;
      f.remainingPct = '';
      f.note = '';
      f.resetInput = '';
      f.captureOffsetMin = 0;
    } catch (err) {
      f.error = t('quota.recordFailed', { msg: err.message });
    } finally {
      f.submitting = false;
      renderGrid();
    }
  });

  // Keyboard toggle on card headers
  dom.modulesGrid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const head = e.target.closest('.card-head[data-action="toggle-card"]');
    if (head && e.target === head) {
      e.preventDefault();
      head.click();
    }
  });

  // Settings Drawer Delegation
  dom.settingsBody.addEventListener('click', async (e) => {
    if (e.target.closest('.help-tip')) return;
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === 'set-lang') {
      const nextLang = normalizeLang(actionEl.dataset.lang) || 'zh-CN';
      state.query.lang = null; // explicit user choice overrides query param in current view
      state.config.lang = nextLang;
      renderAll();
      await saveConfigPatch({ lang: nextLang });
      return;
    }

    if (action === 'move-module') {
      const mod = actionEl.dataset.module;
      const dir = Number(actionEl.dataset.dir);
      const arr = [...state.config.moduleOrder];
      const idx = arr.indexOf(mod);
      const nextIdx = idx + dir;
      if (idx < 0 || nextIdx < 0 || nextIdx >= arr.length) return;
      [arr[idx], arr[nextIdx]] = [arr[nextIdx], arr[idx]];
      state.config.moduleOrder = arr;
      renderAll();
      await saveConfigPatch({ moduleOrder: arr });
      return;
    }

    if (action === 'rebuild-index') {
      state.rebuilding = true;
      state.rebuildMsg = '';
      renderSettings();
      try {
        const res = await postJson('/api/index/rebuild', {});
        if (res.indexStatus) state.indexStatus = res.indexStatus;
        state.rebuildMsg = t('settings.rebuildDone', {
          dbs: num(res.scannedDbs ?? res.indexStats?.scannedDbs, 0),
          ms: num(res.elapsedMs ?? res.indexStats?.elapsedMs, 0)
        });
        await refreshAll(true);
      } catch (err) {
        state.rebuildMsg = t('settings.rebuildFail', { msg: err.message });
      } finally {
        state.rebuilding = false;
        renderSettings();
      }
      return;
    }

    if (action === 'sync-pricing') {
      state.pricing.syncing = true;
      state.pricing.syncMsg = '';
      renderSettings();
      try {
        const res = await postJson('/api/pricing/sync', {});
        if (res.pricing) state.pricing.data = res.pricing;
        if (res.syncedAt) state.pricingStatus.lastSyncedAt = res.syncedAt;
        state.pricing.syncMsg = res.ok
          ? t('settings.syncOk', { n: num(res.matchedCount, 0) })
          : t('settings.syncErr', { msg: res.error || t('common.unknown') });
      } catch (err) {
        state.pricing.syncMsg = t('settings.syncFail', { msg: err.message });
      } finally {
        state.pricing.syncing = false;
        renderSettings();
      }
      return;
    }

    if (action === 'toggle-pricing-list') {
      state.pricing.expanded = !state.pricing.expanded;
      if (state.pricing.expanded && !state.pricing.data) {
        await loadPricingList();
      } else {
        renderSettings();
      }
      return;
    }

    if (action === 'toggle-edit-price') {
      const id = actionEl.dataset.id;
      if (state.pricing.editingId === id) {
        state.pricing.editingId = null;
        state.pricing.draft = null;
      } else {
        const found = state.pricing.data?.models?.find((m) => m.canonicalId === id);
        state.pricing.editingId = id;
        state.pricing.draft = found ? { ...found } : null;
      }
      renderSettings();
      return;
    }

    if (action === 'reset-price-override') {
      const id = actionEl.dataset.id;
      try {
        state.pricing.data = await postJson('/api/pricing/overrides', {
          canonicalId: id,
          override: null
        });
        state.pricing.editingId = null;
        renderSettings();
        refreshAll(true);
      } catch (err) {
        state.pricing.syncMsg = t('settings.restoreFail', { msg: err.message });
        renderSettings();
      }
      return;
    }
  });

  dom.settingsBody.addEventListener('change', async (e) => {
    const tgt = e.target;
    const action = tgt.dataset?.action;
    if (!action) return;

    if (action === 'set-refresh-sec') {
      const val = Number(tgt.value);
      state.config.refreshSec = Number.isFinite(val) ? val : 30;
      resetRefreshTimer();
      renderHeader();
      await saveConfigPatch({ refreshSec: state.config.refreshSec });
      return;
    }

    if (action === 'toggle-module') {
      const mod = tgt.dataset.module;
      state.config.modules[mod] = tgt.checked;
      renderAll();
      await saveConfigPatch({ modules: { [mod]: tgt.checked } });
      refreshAll(true);
      return;
    }

    if (action === 'toggle-source') {
      const src = tgt.dataset.source;
      state.config.sources[src] = tgt.checked;
      renderHeader();
      await saveConfigPatch({ sources: { [src]: tgt.checked } });
      refreshAll(true);
      return;
    }

    if (action === 'toggle-auto-sync') {
      state.config.pricingAutoSync = tgt.checked;
      await saveConfigPatch({ pricingAutoSync: tgt.checked });
      return;
    }
  });

  dom.settingsBody.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-action="save-price-override"]');
    if (!form) return;
    e.preventDefault();
    const id = form.dataset.id;
    const fd = new FormData(form);
    const toNumOrNull = (v) => {
      const s = String(v ?? '').trim();
      if (!s) return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };
    const override = {
      inputPer1m: toNumOrNull(fd.get('inputPer1m')),
      outputPer1m: toNumOrNull(fd.get('outputPer1m')),
      cacheReadPer1m: toNumOrNull(fd.get('cacheReadPer1m')),
      longContextThreshold: toNumOrNull(fd.get('longContextThreshold')),
      inputAbovePer1m: toNumOrNull(fd.get('inputAbovePer1m')),
      outputAbovePer1m: toNumOrNull(fd.get('outputAbovePer1m')),
      cacheReadAbovePer1m: toNumOrNull(fd.get('cacheReadAbovePer1m'))
    };
    try {
      state.pricing.data = await postJson('/api/pricing/overrides', {
        canonicalId: id,
        override
      });
      state.pricing.editingId = null;
      state.pricing.draft = null;
      renderSettings();
      refreshAll(true);
    } catch (err) {
      state.pricing.syncMsg = t('settings.saveFail', { msg: err.message });
      renderSettings();
    }
  });

  // =========================================================================
  // 20. XSS-Safe Tooltip, Rich Matrix Popover, .help-tip & Resize Listeners
  // =========================================================================
  function resolveObsCellData(modelIdx, bucketKey) {
    const matrix = state.analytics?.cacheObservatory?.matrix;
    if (!Array.isArray(matrix)) return null;
    const row = matrix[Number(modelIdx)];
    if (!row) return null;
    if (bucketKey === '__total__') {
      return { row, entry: row, isTotal: true, bucketKey: '__total__' };
    }
    const b = (Array.isArray(row.buckets) ? row.buckets : []).find((x) => x.key === bucketKey);
    if (!b || num(b.total, 0) <= 0) return null;
    return { row, entry: b, isTotal: false, bucketKey };
  }

  function buildObsPopoverHtml(info, pinned) {
    const { row, entry, isTotal, bucketKey } = info;
    const { primary, subs } = getObsMatrixPrefs();
    const tagFor = (metricId) => {
      if (metricId === primary) {
        return `<span class="obs-pop-tag primary">${esc(t('obs.matrixPrimaryTag'))}</span>`;
      }
      if (subs.includes(metricId)) {
        return `<span class="obs-pop-tag sub">${esc(t('obs.matrixSubTag'))}</span>`;
      }
      return '';
    };

    const totalTurns = isTotal ? num(entry.followUpTurns, 0) : num(entry.total, 0);
    const hits = num(entry.hits, 0);
    const keepStr = entry.hitRate != null ? `${fmtPct(entry.hitRate, 1)} (${hits}/${totalTurns})` : '—';
    const weightedStr = entry.weightedHitRatio != null ? fmtPct(entry.weightedHitRatio, 1) : '—';
    const turnAvgSub = entry.avgHitRatio != null
      ? ` <span class="obs-pop-muted">(${esc(t('obs.popTurnAvgSub', { pct: fmtPct(entry.avgHitRatio, 1) }))})</span>`
      : '';

    const fullMiss = num(entry.unexpectedFullMisses, 0);
    const cuts = num(entry.boundaryCuts, 0);
    const bounces = num(entry.bounceBacks, 0);
    const anomParts = [];
    if (fullMiss > 0) anomParts.push(t('obs.popAnomFullMiss', { n: fullMiss }));
    if (cuts > 0) anomParts.push(t('obs.popAnomBoundary', { n: cuts }));
    if (bounces > 0) anomParts.push(t('obs.popAnomBounce', { n: bounces }));
    const anomHtml = anomParts.length > 0
      ? `<span class="obs-pop-val ${fullMiss > 0 ? 'bad' : 'warn'}">${esc(anomParts.join(' · '))}</span>`
      : `<span class="obs-pop-val ok">${esc(t('obs.popAnomNone'))}</span>`;

    const avgCostStr = fmtUsd(entry.avgCostUsd);
    const totalCostStr = fmtUsd(entry.costUsd);
    const penTotal = num(entry.missPenaltyUsd, 0);
    const penAvg = num(entry.avgMissPenaltyUsd, 0);
    const penStr = penTotal > 0
      ? `${fmtUsd(penTotal)} <span class="obs-pop-muted">(${esc(t('obs.popPerTurn', { usd: fmtUsd(penAvg) }))})</span>`
      : '$0.00';
    const savedStr = fmtUsd(entry.cacheSavedUsd);
    const avgCtxStr = fmtTokens(entry.avgContextTokens);
    const crVsInStr = `${fmtTokens(entry.cacheReadSum)} / ${fmtTokens(entry.totalInSum)}`;
    const wastedTok = num(entry.wastedTokens, 0);
    const unbucketed = isTotal ? num(row.unbucketedTurns, 0) : 0;
    const scopeLabel = isTotal ? t('obs.colTotal') : bucketKey;

    return `
      <div class="obs-pop-head">
        <div class="obs-pop-title-wrap">
          <span class="obs-pop-model truncate">${esc(row.displayName || row.canonicalId)}</span>
          <span class="obs-pop-sep">·</span>
          <span class="obs-pop-bucket mono">${esc(scopeLabel)}</span>
        </div>
        <div class="obs-pop-head-right">
          <span class="obs-pop-turns num">${esc(t('obs.popTurns', { n: totalTurns }))}${tagFor('turns')}</span>
          ${pinned ? `<button type="button" class="obs-pop-close" data-obs-pop-close="1" aria-label="${esc(t('obs.popClose'))}">×</button>` : ''}
        </div>
      </div>
      <div class="obs-pop-group">
        <div class="obs-pop-row">
          <span class="obs-pop-lbl">${esc(t('obs.popWeightedHit'))}${tagFor('weightedHit')}</span>
          <span class="obs-pop-val mono">${esc(weightedStr)}${turnAvgSub}</span>
        </div>
        <div class="obs-pop-row">
          <span class="obs-pop-lbl">${esc(t('obs.popKeepRate'))}${tagFor('keepRate')}</span>
          <span class="obs-pop-val mono">${esc(keepStr)}</span>
        </div>
        <div class="obs-pop-row">
          <span class="obs-pop-lbl">${esc(t('obs.popAnomalies'))}</span>
          ${anomHtml}
        </div>
      </div>
      <div class="obs-pop-group">
        <div class="obs-pop-row">
          <span class="obs-pop-lbl">${esc(t('obs.popAvgCost'))}${tagFor('avgCost')}</span>
          <span class="obs-pop-val mono">${esc(avgCostStr)}</span>
        </div>
        <div class="obs-pop-row">
          <span class="obs-pop-lbl">${esc(t('obs.popTotalCost'))}${tagFor('totalCost')}</span>
          <span class="obs-pop-val mono">${esc(totalCostStr)}</span>
        </div>
        <div class="obs-pop-row">
          <span class="obs-pop-lbl">${esc(t('obs.popMissPenalty'))}${tagFor('missPenalty')}</span>
          <span class="obs-pop-val mono ${penTotal > 0 ? 'bad' : ''}">${penStr}</span>
        </div>
        <div class="obs-pop-row">
          <span class="obs-pop-lbl">${esc(t('obs.popCacheSaved'))}</span>
          <span class="obs-pop-val mono ok">${esc(savedStr)}</span>
        </div>
      </div>
      <div class="obs-pop-group">
        <div class="obs-pop-row">
          <span class="obs-pop-lbl">${esc(t('obs.popAvgCtx'))}</span>
          <span class="obs-pop-val mono">${esc(avgCtxStr)}</span>
        </div>
        <div class="obs-pop-row">
          <span class="obs-pop-lbl">${esc(t('obs.popCacheVsIn'))}</span>
          <span class="obs-pop-val mono">${esc(crVsInStr)}</span>
        </div>
        ${
          wastedTok > 0
            ? `<div class="obs-pop-row">
                <span class="obs-pop-lbl">${esc(t('obs.popWastedTok'))}</span>
                <span class="obs-pop-val mono bad">${esc(fmtTokens(wastedTok))}</span>
              </div>`
            : ''
        }
      </div>
      ${unbucketed > 0 ? `<div class="obs-pop-foot">${esc(t('obs.popUnbucketed', { n: unbucketed }))}</div>` : ''}
      ${!pinned ? `<div class="obs-pop-foot">${esc(t('obs.popPinHint'))}</div>` : ''}
    `;
  }

  function positionObsPopover(anchorEl) {
    if (!anchorEl || !dom.obsCellPopover) return;
    const pad = 10;
    const aRect = anchorEl.getBoundingClientRect();
    const pRect = dom.obsCellPopover.getBoundingClientRect();
    let x = aRect.left + aRect.width / 2 - pRect.width / 2;
    let y = aRect.top - pRect.height - 8;
    if (y < pad) {
      y = aRect.bottom + 8;
    }
    if (y + pRect.height > window.innerHeight - pad) {
      y = Math.max(pad, window.innerHeight - pRect.height - pad);
    }
    if (x + pRect.width > window.innerWidth - pad) {
      x = window.innerWidth - pRect.width - pad;
    }
    if (x < pad) x = pad;
    dom.obsCellPopover.style.left = `${Math.round(x)}px`;
    dom.obsCellPopover.style.top = `${Math.round(y)}px`;
  }

  function showObsCellPopover(cellEl, pinned) {
    if (!cellEl || !dom.obsCellPopover) return;
    const modelIdx = Number(cellEl.dataset.modelIdx);
    const bucketKey = cellEl.dataset.bucketKey;
    const info = resolveObsCellData(modelIdx, bucketKey);
    if (!info) return;
    dom.obsCellPopover.innerHTML = buildObsPopoverHtml(info, pinned);
    dom.obsCellPopover.classList.toggle('is-pinned', Boolean(pinned));
    dom.obsCellPopover.classList.remove('hidden');
    positionObsPopover(cellEl);
  }

  function hideObsCellPopover() {
    if (!dom.obsCellPopover) return;
    dom.obsCellPopover.classList.add('hidden');
    dom.obsCellPopover.classList.remove('is-pinned');
  }

  function dismissObsCellPopover() {
    if (state.obsPinnedCell) {
      const prev = dom.modulesGrid.querySelector('.heat-cell.is-pinned');
      if (prev) prev.classList.remove('is-pinned');
      state.obsPinnedCell = null;
    }
    hideObsCellPopover();
  }

  function syncPinnedObsPopover() {
    if (!state.obsPinnedCell) {
      hideObsCellPopover();
      return;
    }
    const { modelIdx, bucketKey } = state.obsPinnedCell;
    const cellEl = dom.modulesGrid.querySelector(
      `[data-obs-cell="1"][data-model-idx="${modelIdx}"][data-bucket-key="${CSS.escape(bucketKey)}"]`
    );
    if (!cellEl) {
      state.obsPinnedCell = null;
      hideObsCellPopover();
      return;
    }
    showObsCellPopover(cellEl, true);
  }

  function positionTooltip(clientX, clientY) {
    const pad = 10;
    const rect = dom.chartTooltip.getBoundingClientRect();
    let x = clientX + 12;
    let y = clientY - rect.height - 10;
    if (x + rect.width > window.innerWidth - pad) x = window.innerWidth - rect.width - pad;
    if (x < pad) x = pad;
    if (y < pad) y = Math.min(window.innerHeight - rect.height - pad, clientY + 16);
    if (y < pad) y = pad;
    dom.chartTooltip.style.left = `${Math.round(x)}px`;
    dom.chartTooltip.style.top = `${Math.round(y)}px`;
  }

  function showTooltip(target, clientX, clientY) {
    const raw = target?.dataset?.tip;
    if (!raw) return;
    dom.chartTooltip.innerHTML = esc(raw).replace(/\n/g, '<br>');
    dom.chartTooltip.classList.remove('hidden');
    positionTooltip(clientX, clientY);
  }

  function showTooltipAtElement(target) {
    const raw = target?.dataset?.tip;
    if (!raw || !target.getBoundingClientRect) return;
    const r = target.getBoundingClientRect();
    showTooltip(target, r.left + r.width / 2, r.top);
  }

  function hideTooltip() {
    dom.chartTooltip.classList.add('hidden');
  }

  function dismissHelpPin() {
    if (state.pinnedHelpEl) {
      state.pinnedHelpEl.classList.remove('active');
      state.pinnedHelpEl = null;
    }
    hideTooltip();
  }

  document.addEventListener('pointerover', (e) => {
    const obsCell = e.target.closest?.('[data-obs-cell="1"]');
    if (obsCell) {
      if (!state.obsPinnedCell && !state.obsMetricMenuOpen) {
        showObsCellPopover(obsCell, false);
      }
      return;
    }
    const tipEl = e.target.closest?.('[data-tip]');
    if (!tipEl) return;
    if (tipEl.classList.contains('help-tip')) {
      showTooltipAtElement(tipEl);
    } else {
      showTooltip(tipEl, e.clientX, e.clientY);
    }
  });

  document.addEventListener('pointermove', (e) => {
    const tipEl = e.target.closest?.('[data-tip]');
    if (!tipEl) {
      if (!state.pinnedHelpEl) hideTooltip();
      return;
    }
    if (!tipEl.classList.contains('help-tip')) {
      showTooltip(tipEl, e.clientX, e.clientY);
    }
  });

  document.addEventListener('pointerout', (e) => {
    const fromObs = e.target.closest?.('[data-obs-cell="1"]');
    if (fromObs) {
      const toObs = e.relatedTarget?.closest?.('[data-obs-cell="1"]');
      if (!toObs && !state.obsPinnedCell) {
        hideObsCellPopover();
      }
    }
    const fromTip = e.target.closest?.('[data-tip]');
    if (!fromTip) return;
    const toTip = e.relatedTarget?.closest?.('[data-tip]');
    if (!toTip) {
      if (state.pinnedHelpEl && document.contains(state.pinnedHelpEl)) {
        showTooltipAtElement(state.pinnedHelpEl);
      } else {
        dismissHelpPin();
      }
    }
  });

  document.addEventListener('focusin', (e) => {
    const tipEl = e.target.closest?.('.help-tip[data-tip]');
    if (tipEl) showTooltipAtElement(tipEl);
  });

  document.addEventListener('focusout', (e) => {
    const tipEl = e.target.closest?.('.help-tip[data-tip]');
    if (tipEl && state.pinnedHelpEl !== tipEl) {
      if (state.pinnedHelpEl && document.contains(state.pinnedHelpEl)) {
        showTooltipAtElement(state.pinnedHelpEl);
      } else {
        hideTooltip();
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-obs-pop-close="1"]')) {
      e.preventDefault();
      e.stopPropagation();
      dismissObsCellPopover();
      return;
    }

    const obsCell = e.target.closest?.('[data-obs-cell="1"]');
    if (obsCell) {
      e.preventDefault();
      e.stopPropagation();
      if (state.obsMetricMenuOpen) {
        state.obsMetricMenuOpen = false;
        renderGrid();
      }
      const mIdx = Number(obsCell.dataset.modelIdx);
      const bk = obsCell.dataset.bucketKey;
      const same =
        state.obsPinnedCell &&
        state.obsPinnedCell.modelIdx === mIdx &&
        state.obsPinnedCell.bucketKey === bk;
      if (same) {
        dismissObsCellPopover();
      } else {
        const prev = dom.modulesGrid.querySelector('.heat-cell.is-pinned');
        if (prev) prev.classList.remove('is-pinned');
        state.obsPinnedCell = { modelIdx: mIdx, bucketKey: bk };
        const freshCell = dom.modulesGrid.querySelector(
          `[data-obs-cell="1"][data-model-idx="${mIdx}"][data-bucket-key="${CSS.escape(bk)}"]`
        );
        if (freshCell) {
          freshCell.classList.add('is-pinned');
          showObsCellPopover(freshCell, true);
        }
      }
      return;
    }

    if (state.obsPinnedCell && !e.target.closest?.('#obs-cell-popover')) {
      dismissObsCellPopover();
    }

    if (state.obsMetricMenuOpen && !e.target.closest?.('.obs-metric-ctrl')) {
      state.obsMetricMenuOpen = false;
      renderGrid();
    }

    const helpBtn = e.target.closest?.('.help-tip[data-tip]');
    if (helpBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (state.pinnedHelpEl === helpBtn) {
        dismissHelpPin();
      } else {
        if (state.pinnedHelpEl) state.pinnedHelpEl.classList.remove('active');
        state.pinnedHelpEl = helpBtn;
        helpBtn.classList.add('active');
        showTooltipAtElement(helpBtn);
      }
      return;
    }
    if (state.pinnedHelpEl) {
      dismissHelpPin();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.obsPinnedCell) dismissObsCellPopover();
      if (state.obsMetricMenuOpen) {
        state.obsMetricMenuOpen = false;
        renderGrid();
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      const obsCell = e.target.closest?.('[data-obs-cell="1"]');
      if (obsCell) {
        e.preventDefault();
        obsCell.click();
      }
    }
  });

  window.addEventListener('resize', () => {
    if (state.obsPinnedCell) syncPinnedObsPopover();
  });
  window.addEventListener('scroll', () => {
    if (state.obsPinnedCell) syncPinnedObsPopover();
  }, true);

  const mqWide = window.matchMedia('(min-width: 680px)');
  mqWide.addEventListener('change', (ev) => {
    if (state.widePane !== ev.matches) {
      state.widePane = ev.matches;
      renderGrid();
    }
  });

  if (window.sidecar && typeof window.sidecar.onWorkspaceChange === 'function') {
    try {
      window.sidecar.onWorkspaceChange(() => {
        if (document.visibilityState === 'visible') refreshAll(true);
      });
    } catch (_) {}
  }

  // =========================================================================
  // 21. Bootstrap
  // =========================================================================
  async function boot() {
    try {
      const cfgRes = await getJson('/api/config');
      normalizeConfigPayload(cfgRes);
      state.rangeKey = state.config.defaultRange || '7d';
    } catch (err) {
      state.globalError = t('header.configLoadErr', { msg: err.message });
    }

    dom.loadingShell.classList.add('hidden');
    dom.app.classList.remove('hidden');
    state.booted = true;
    renderAll();
    if (state.query.openSettings) openSettings();
    resetRefreshTimer();
    await refreshAll(true);
  }

  boot();
})();
