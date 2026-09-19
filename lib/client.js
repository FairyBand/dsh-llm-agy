// AntiGravity 插件客户端扩展:
// 1. 设置面板卡片 (settings.plugin.item, 与官方 WebSearch 卡片外观统一)
// 2. 输入框底栏模型选择器旁紧凑徽标 (conversation.input.right):
//    只在**当前对话**的模型 provider 为 Antigravity(AGY) 时显示,切到其它
//    provider 的对话自动隐藏;点击弹出 AGY 配额详情浮层
// 3. 全局响应式共享配额状态 (页面加载自动静默获取, 一处刷新处处同步)
window.__ModuleLoader__.load({
  id: 'dsh-llm-agy',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const react = require('react')
    const slots = require('@deepseek-ai/dsh-client-ui-slots')
    const P = require('@deepseek-ai/dsh-client-ui-primitives')

    const {
      Button, Input, Modal, IconLoadingOutline16, IconCheckOutline16, IconRefreshOutline16,
      IconCopyOutline16, IconChevronDownOutline14, writeClipboard,
    } = P

    // ── 官方 PluginCard CSS + 配额与用量专属样式 ──
    const CSS = {
      card: '.dshAgy_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}',
      cardHover: '.dshAgy_card:hover{border-color:var(--dsw-alias-label-dimmed)}',
      cardOpen: '.dshAgy_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
      header: '.dshAgy_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}',
      headerFocus: '.dshAgy_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      headText: '.dshAgy_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}',
      name: '.dshAgy_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}',
      description: '.dshAgy_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}',
      chevron: '.dshAgy_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}',
      chevronOpen: '.dshAgy_chevronOpen{transform:rotate(180deg)}',
      body: '.dshAgy_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}',
      field: '.dshAgy_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}',
      fieldTop: '.dshAgy_field+.dshAgy_field{border-top:1px solid var(--dsw-alias-border-l2)}',
      fieldHead: '.dshAgy_fieldHead{align-items:center;gap:8px;display:flex}',
      label: '.dshAgy_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}',
      hint: '.dshAgy_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}',
      badge: '.dshAgy_badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}',
      code: '.dshAgy_code{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:8px;padding:6px 10px;font-size:12px}',
      pre: '.dshAgy_pre{margin:8px 0 0;white-space:pre-wrap;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-3);border-radius:8px;padding:8px 10px}',
      row: '.dshAgy_row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 0}',
      // 模型输入框:铺满卡片宽度;min-width:0 避免 flex 项被内容撑爆导致超出卡片
      modelField: '.dshAgy_modelField{display:flex;width:100%;min-width:0;box-sizing:border-box}.dshAgy_modelField input{flex:1;min-width:0;width:100%;box-sizing:border-box}',
      // 获取模型弹窗列表:抄 Menu.module.css 的菜单卡片 + 行样式
      pickerList: '.dshAgy_pickerList{box-sizing:border-box;padding:4px;display:flex;flex-direction:column;gap:0;border:1px solid var(--dsw-alias-border-inverted);border-radius:12px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3);max-height:60vh;overflow-y:auto}',
      pickerItem: '.dshAgy_pickerItem{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:8px 10px;border:none;border-radius:10px;background:transparent;cursor:pointer;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);text-align:left}.dshAgy_pickerItem:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      pickerLabel: '.dshAgy_pickerLabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      pickerCheck: '.dshAgy_pickerCheck{flex:none;color:var(--dsw-alias-label-primary)}',
      // 配额进度与用量卡片样式
      quotaBox: '.dshAgy_quotaBox{display:flex;flex-direction:column;gap:12px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-3);margin:8px 0 4px}',
      quotaGroup: '.dshAgy_quotaGroup{display:flex;flex-direction:column;gap:8px}',
      quotaGroupName: '.dshAgy_quotaGroupName{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px}',
      quotaBarWrap: '.dshAgy_quotaBarWrap{display:flex;flex-direction:column;gap:6px;padding:8px 10px;background:var(--dsw-alias-bg-layer-2);border-radius:8px;border:1px solid var(--dsw-alias-border-l1)}',
      quotaBarHead: '.dshAgy_quotaBarHead{display:flex;justify-content:space-between;align-items:center;font-size:12px}',
      quotaBarTrack: '.dshAgy_quotaBarTrack{width:100%;height:6px;background:var(--dsw-alias-border-l2);border-radius:3px;overflow:hidden}',
      quotaBarFill: '.dshAgy_quotaBarFill{height:100%;border-radius:3px;transition:width .3s ease}',
      quotaBarDesc: '.dshAgy_quotaBarDesc{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.4}',
      quotaCredits: '.dshAgy_quotaCredits{display:flex;align-items:center;justify-content:space-between;font-size:12px;padding:8px 10px;background:var(--dsw-alias-bg-layer-2);border-radius:8px;border:1px solid var(--dsw-alias-border-l1)}',
      // 输入框内右下角模型选择器旁紧凑徽标
      inputBadge: '.dshAgy_inputBadge{box-sizing:border-box;display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 8px;border-radius:6px;font-size:12px;font-weight:500;font-family:inherit;font-variant-numeric:tabular-nums;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);cursor:pointer;transition:all .16s ease;user-select:none;margin-right:6px}.dshAgy_inputBadge:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-label-tertiary);color:var(--dsw-alias-label-primary)}',
    }
    const cssText = Object.values(CSS).join('')
    const tagId = 'dsh-llm-agy/plugin-card.css'
    if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-llm-agy'
      tag.dataset.pluginCss = tagId
      tag.textContent = cssText
      document.head.appendChild(tag)
    }
    const C = {
      card: 'dshAgy_card', cardOpen: 'dshAgy_cardOpen', header: 'dshAgy_header',
      headText: 'dshAgy_headText', name: 'dshAgy_name', description: 'dshAgy_description',
      chevron: 'dshAgy_chevron', chevronOpen: 'dshAgy_chevronOpen', body: 'dshAgy_body',
      field: 'dshAgy_field', fieldHead: 'dshAgy_fieldHead', label: 'dshAgy_label',
      hint: 'dshAgy_hint', badge: 'dshAgy_badge', code: 'dshAgy_code',
      pre: 'dshAgy_pre', row: 'dshAgy_row', modelField: 'dshAgy_modelField',
      pickerList: 'dshAgy_pickerList', pickerItem: 'dshAgy_pickerItem',
      pickerLabel: 'dshAgy_pickerLabel', pickerCheck: 'dshAgy_pickerCheck',
      quotaBox: 'dshAgy_quotaBox', quotaGroup: 'dshAgy_quotaGroup',
      quotaGroupName: 'dshAgy_quotaGroupName', quotaBarWrap: 'dshAgy_quotaBarWrap',
      quotaBarHead: 'dshAgy_quotaBarHead', quotaBarTrack: 'dshAgy_quotaBarTrack',
      quotaBarFill: 'dshAgy_quotaBarFill', quotaBarDesc: 'dshAgy_quotaBarDesc',
      quotaCredits: 'dshAgy_quotaCredits',
      inputBadge: 'dshAgy_inputBadge',
    }

    // ── 全局配额数据与响应式共享 Store ──
    let rootCtx = null

    /**
     * 用量入口只在**当前对话**的模型 provider 是 Antigravity(AGY)时显示。
     *
     * provider 必须跟"当前会话的模型选择"走:否则在不同 provider 的历史对话
     * 之间切换时徽标不会跟着变。数据源是 slot 注入的 `useProjection`(会话作用域
     * 官方钩子),读 dsh 的 `modelSelection` 投影 —— 与模型选择器同一份实时状态。
     */
    const AGY_PROVIDER_ID = 'agy'

/** 读取设置作用域的当前值(兼容 subscribe/getSnapshot 两种形态)。 */
    function readScopeValue(scope) {
      try {
        if (scope && typeof scope.getSnapshot === 'function') {
          const snapshot = scope.getSnapshot()
          if (snapshot && typeof snapshot === 'object' && 'value' in snapshot) return snapshot.value
          return snapshot
        }
        if (scope && typeof scope.get === 'function') return scope.get()
      } catch { /* 镜像未就绪/已释放 */ }
      return undefined
    }

    /** 全局默认模型 provider(投影不可用时的回退)。 */
    function readDefaultProvider(ctx) {
      try {
        const scope = ctx.settingsScope.bind({ namespace: 'agent-default-model' })
        const value = readScopeValue(scope)
        return value && typeof value.provider === 'string' ? value.provider : undefined
      } catch { return undefined }
    }

    /**
     * 当前会话的模型 provider。
     *
     * 数据源是 slot 注入的 `useProjection`(会话作用域的官方钩子),读 dsh 的
     * `modelSelection` 投影 —— 与模型选择器同一份实时状态。该投影的形状是
     * `{ lastUsed, next }`(见 dsh-client-connection 的 modelSelectionProjectionOf):
     *   · lastUsed —— 该会话真正发过请求的模型(历史对话就是它);
     *   · next     —— 已选但尚未发出的模型(新建会话/刚切换时为它)。
     * 因此按 lastUsed → next → 全局默认取值:既跟得上"刚选的模型",也不会被
     * 全局默认设置干扰(上一版用 current 字段读取,该字段并不存在,于是永远
     * 回退到全局默认,表现为切会话不更新)。
     * @returns provider id,或 undefined(尚未就绪)
     */
    function useCurrentProvider(props) {
      const explicitCtx = props && (props.ctx || props.scope)
      const c = explicitCtx || rootCtx
      const useProjection = props && props.useProjection

      let provider
      if (typeof useProjection === 'function') {
        try {
          // useProjection 自身是响应式 hook:投影变化会触发重渲染
          const projected = useProjection('modelSelection')
          const lastUsed = projected ? projected.lastUsed : undefined
          const next = projected ? projected.next : undefined
          provider = (lastUsed && lastUsed.provider) || (next && next.provider)
        } catch { /* 投影不可用时回退 */ }
      }
      if (typeof provider === 'string' && provider !== '') return provider
      return readDefaultProvider(c)
    }

    /** 是否展示 AGY 用量入口。 */
    function isAgyProvider(provider) {
      return typeof provider === 'string' && provider.toLowerCase() === AGY_PROVIDER_ID
    }

    const quotaState = {
      data: null,
      loading: false,
      error: '',
      lastFetched: 0,
    }
    const quotaListeners = new Set()

    function notifyQuotaListeners() {
      quotaListeners.forEach((fn) => {
        try { fn(quotaState) } catch (e) { /* ignore */ }
      })
    }

    function resolveRemote(explicitCtx) {
      try {
        const c = explicitCtx || rootCtx
        if (!c) return undefined
        let r
        if (typeof c.get === 'function') r = c.get('remote.llm')
        if (r === undefined && c.remote) r = c.remote.llm
        return r
      } catch { return undefined }
    }

    const unwrapDiscovery = (response) => {
      if (response !== null && typeof response === 'object' && response.ok === false) {
        const m = response.error && response.error.message
        throw new Error(m || '服务端拒绝了该探测')
      }
      const value = (response !== null && typeof response === 'object' && response.ok === true)
        ? response.value
        : response
      return Array.isArray(value) ? value : []
    }

    async function fetchAgyQuota(force = false, explicitCtx) {
      const now = Date.now()
      if (!force && quotaState.data && (now - quotaState.lastFetched < 20_000)) {
        return quotaState.data
      }
      if (quotaState.loading) return quotaState.data

      quotaState.loading = true
      quotaState.error = ''
      notifyQuotaListeners()

      let gotData = false

      // 通道 1: RPC discoverModels('agy', { provider: 'quota' })
      try {
        const remote = resolveRemote(explicitCtx)
        if (remote && typeof remote.discoverModels === 'function') {
          const res = unwrapDiscovery(await remote.discoverModels('agy', { provider: 'quota' }))
          const item = res && res[0]
          if (item && item.name) {
            try {
              const parsed = JSON.parse(item.name)
              if (parsed && (parsed.ok || Array.isArray(parsed.groups))) {
                quotaState.data = parsed
                quotaState.lastFetched = Date.now()
                gotData = true
              } else if (parsed && parsed.error) {
                quotaState.error = parsed.error
              }
            } catch { /* 可能是 status 文本,继续尝试通道 2 */ }
          }
        }
      } catch (e) {
        /* RPC 异常,继续尝试通道 2 */
      }

      // 通道 2: HTTP fetch /api/plugins/dsh-llm-agy/quota
      if (!gotData) {
        try {
          const resp = await fetch('/api/plugins/dsh-llm-agy/quota')
          if (resp.ok) {
            const parsed = await resp.json()
            if (parsed && (parsed.ok || Array.isArray(parsed.groups))) {
              quotaState.data = parsed
              quotaState.lastFetched = Date.now()
              gotData = true
            } else if (parsed && parsed.error) {
              quotaState.error = parsed.error
            }
          }
        } catch { /* 忽略 fetch 失败 */ }
      }

      if (!gotData && !quotaState.error) {
        quotaState.error = '未能获取配额数据，请确认 AGY 已登录并在插件设置中配置代理'
      }

      quotaState.loading = false
      notifyQuotaListeners()
      return quotaState.data
    }

    function useAgyQuota(autoFetch = true, explicitCtx) {
      const [state, setState] = react.useState(() => ({ ...quotaState }))
      react.useEffect(() => {
        const listener = (s) => setState({ ...s })
        quotaListeners.add(listener)
        if (autoFetch && !quotaState.data && !quotaState.loading) {
          fetchAgyQuota(false, explicitCtx)
        }
        return () => {
          quotaListeners.delete(listener)
        }
      }, [autoFetch, explicitCtx])

      return {
        ...state,
        refresh: () => fetchAgyQuota(true, explicitCtx),
      }
    }

    /** 提取配额核心指标(用于药丸与徽标展示)。 */
    function extractQuotaSummary(quota) {
      if (!quota || !quota.groups || quota.groups.length === 0) {
        return null
      }
      const gemini = quota.groups.find((g) => g.name && g.name.toLowerCase().includes('gemini')) || quota.groups[0]
      const b5h = gemini?.buckets?.find((b) => b.window === '5h' || b.name.toLowerCase().includes('5-hour') || b.name.toLowerCase().includes('five'))
      const bWeek = gemini?.buckets?.find((b) => b.window === 'weekly' || b.name.toLowerCase().includes('weekly'))

      const pct5h = b5h ? (typeof b5h.percentage === 'number' ? b5h.percentage : Math.round((b5h.remainingFraction ?? 1) * 100)) : null
      const pctWeek = bWeek ? (typeof bWeek.percentage === 'number' ? bWeek.percentage : Math.round((bWeek.remainingFraction ?? 1) * 100)) : null

      const mainPct = pct5h ?? pctWeek ?? 100

      let statusColor = '#10b981' // 正常绿
      if (mainPct < 20) statusColor = '#ef4444' // 警报红
      else if (mainPct < 50) statusColor = '#f59e0b' // 预警橙

      let labelText = ''
      if (pct5h !== null && pctWeek !== null) {
        labelText = `5h: ${pct5h}% · 周: ${pctWeek}%`
      } else if (pct5h !== null) {
        labelText = `5h: ${pct5h}%`
      } else if (pctWeek !== null) {
        labelText = `周: ${pctWeek}%`
      } else {
        labelText = `${mainPct}%`
      }

      return {
        geminiGroup: gemini,
        b5h,
        bWeek,
        pct5h,
        pctWeek,
        mainPct,
        statusColor,
        labelText,
        credits: quota.credits?.remainingCredits ?? 0,
        updatedAt: quota.updatedAt,
      }
    }

    // 多系统安装命令 + 工具说明
    const INSTALL_CMDS = [
      { label: 'Windows (winget)', cmd: 'winget install --id Google.Antigravity' },
      { label: 'macOS (Homebrew)', cmd: 'brew install --cask antigravity' },
      { label: 'Linux / macOS (curl)', cmd: 'curl -fsSL https://antigravity.google/install | bash' },
      { label: 'npm (global)', cmd: 'npm install -g @antigravity/cli' },
    ]
    const TOOLS = [
      { name: 'subagent_agy_ui', desc: '前端/UI 设计、样式、视觉实现、截图核验(continuable 可复用长线会话)' },
      { name: 'search_web_agy', desc: 'AGY 深度网络搜索:自动搜索、阅读全文、综合引用回答,无短超时限制' },
    ]

    /** 安装命令行:label + code + 复制按钮(带已复制状态)。 */
    function InstallCommandRow({ label, cmd }) {
      const [copied, setCopied] = react.useState(false)
      const copy = react.useCallback(async () => {
        try { await writeClipboard(cmd) } catch { /* 剪贴板失败静默 */ }
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }, [cmd])
      return react.createElement('div', { className: C.field },
        react.createElement('div', { className: C.fieldHead },
          react.createElement('span', { className: C.label }, label),
          react.createElement('span', { className: C.hint, style: { fontFamily: 'var(--dsw-font-family-code, monospace)' } }, cmd),
          react.createElement(Button, {
            size: 'sm', variant: 'ghost', onClick: copy,
            icon: copied
              ? react.createElement(IconCheckOutline16, { size: 12 })
              : react.createElement(IconCopyOutline16, { size: 12 }),
          }, copied ? '已复制' : '复制'),
        ),
      )
    }

    /** 单个用量窗口进度条项 */
    function QuotaBucketView({ bucket }) {
      const pct = typeof bucket.percentage === 'number'
        ? bucket.percentage
        : Math.round((bucket.remainingFraction ?? 1) * 100)
      let barColor = 'var(--dsw-alias-brand-primary, #10b981)'
      if (pct < 20) barColor = '#ef4444'
      else if (pct < 50) barColor = '#f59e0b'

      return react.createElement('div', { className: C.quotaBarWrap },
        react.createElement('div', { className: C.quotaBarHead },
          react.createElement('span', { style: { fontWeight: 500, color: 'var(--dsw-alias-label-primary)' } }, bucket.name),
          react.createElement('span', { style: { fontWeight: 600, color: barColor } }, `${pct}% 剩余`),
        ),
        react.createElement('div', { className: C.quotaBarTrack },
          react.createElement('div', {
            className: C.quotaBarFill,
            style: { width: `${Math.max(0, Math.min(100, pct))}%`, background: barColor },
          }),
        ),
        (bucket.description || bucket.resetTime) && react.createElement('div', { className: C.quotaBarDesc },
          bucket.description || (bucket.resetTime ? `完全恢复时间: ${bucket.resetTime}` : ''),
        ),
      )
    }

    /** 配额与用量面板组件 */
    function QuotaDisplay({ quota, loading, error, showHeader = true }) {
      if (loading && !quota) {
        return react.createElement('div', { className: C.quotaBox },
          react.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            react.createElement(IconLoadingOutline16, { size: 14 }),
            react.createElement('span', { className: C.hint }, '正在查询 AGY 账号配额与用量...'),
          ),
        )
      }
      if (error && !quota) {
        return react.createElement('div', { className: C.quotaBox },
          react.createElement('span', { className: C.hint, style: { color: '#ef4444' } }, error),
        )
      }
      if (!quota || !quota.groups || quota.groups.length === 0) {
        return null
      }

      return react.createElement('div', { className: C.quotaBox },
        showHeader && react.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--dsw-alias-border-l2)', paddingBottom: 6 } },
          react.createElement('span', { style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, '当前账号剩余配额与用量'),
          quota.updatedAt && react.createElement('span', { className: C.hint, style: { fontSize: 11 } },
            `更新于 ${new Date(quota.updatedAt).toLocaleTimeString()}`,
          ),
        ),
        quota.groups.map((group) => react.createElement('div', { key: group.name, className: C.quotaGroup },
          react.createElement('div', { className: C.quotaGroupName },
            react.createElement('span', null, group.name),
            group.description && react.createElement('span', { className: C.hint, style: { fontSize: 11, fontWeight: 'normal' } }, group.description),
          ),
          group.buckets.map((b) => react.createElement(QuotaBucketView, { key: b.id || b.name, bucket: b })),
        )),
        quota.credits !== undefined && react.createElement('div', { className: C.quotaCredits },
          react.createElement('span', { style: { fontWeight: 500, color: 'var(--dsw-alias-label-primary)' } }, 'AI Credits 积分'),
          react.createElement('span', { style: { fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' } }, `${quota.credits.remainingCredits} 点`),
        ),
      )
    }

    /** 配额详情弹窗 Modal:点击药丸/徽标时弹出,查看各模型组完整进度条与恢复倒计时 */
    function QuotaDetailModal({ open, onClose, quota, loading, error, onRefresh }) {
      return react.createElement(Modal, {
        open,
        onClose,
        title: 'AGY 账号配额与剩余用量',
        closeLabel: '关闭',
      },
        react.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 320, maxWidth: 460 } },
          // 头部操作行:更新时间 + 刷新按钮
          react.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 } },
            react.createElement('span', { className: C.hint, style: { fontSize: 12 } },
              quota?.updatedAt ? `更新于 ${new Date(quota.updatedAt).toLocaleTimeString()}` : (loading ? '正在查询...' : '尚未获取配额'),
            ),
            react.createElement(Button, {
              size: 'sm', variant: 'ghost', onClick: onRefresh, disabled: loading,
              icon: loading
                ? react.createElement(IconLoadingOutline16, { size: 12 })
                : react.createElement(IconRefreshOutline16, { size: 12 }),
            }, loading ? '刷新中...' : '刷新用量'),
          ),
          // 内容区
          loading && !quota
            ? react.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '24px 0', justifyContent: 'center' } },
                react.createElement(IconLoadingOutline16, { size: 16 }),
                react.createElement('span', { className: C.hint }, '正在查询 AGY 账号配额...'),
              )
            : error && !quota
              ? react.createElement('div', { style: { color: '#ef4444', fontSize: 13, padding: '12px 0' } }, error)
              : react.createElement(QuotaDisplay, { quota, loading, error, showHeader: false }),
          // 底部说明
          react.createElement('div', { style: { borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: 8, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.4 } },
            '💡 5小时限额随时间滚动恢复，每周限额按账号周期重置。可在系统终端执行 agy 确认登录状态。',
          ),
        ),
      )
    }

    /**
     * 2. 输入框内紧凑徽标:注册在 conversation.input.right
     * 紧靠在输入框底栏的模型选择器左侧,一眼可见。
     */
    function QuotaInputBadge(props) {
      const [modalOpen, setModalOpen] = react.useState(false)
      const provider = useCurrentProvider(props)
      const showQuota = isAgyProvider(provider)
      const { data: quota, loading, error, refresh } = useAgyQuota(showQuota, props && props.ctx)
      const summary = extractQuotaSummary(quota)

      // 只在主模型由 Antigravity(AGY)provider 提供时展示紧凑徽标。
      if (!showQuota) return null

      let badgeText = '⚡ AGY'
      let dotColor = '#10b981'
      let titleText = '点击查看 AGY 剩余用量'

      if (loading && !quota) {
        badgeText = '⚡ ...'
        dotColor = '#94a3b8'
        titleText = '正在查询 AGY 账号配额...'
      } else if (summary) {
        badgeText = `⚡ ${summary.mainPct}%`
        dotColor = summary.statusColor
        titleText = `AGY 剩余配额: 5小时 ${summary.pct5h ?? '-'}% / 每周 ${summary.pctWeek ?? '-'}% (点击查看详情)`
      } else if (error) {
        badgeText = '⚡ 失败'
        dotColor = '#ef4444'
        titleText = `查询配额失败: ${error} (点击重试)`
      }

      return react.createElement(react.Fragment, null,
        react.createElement('button', {
          type: 'button',
          className: C.inputBadge,
          title: titleText,
          onClick: () => {
            if (error && !quota) refresh()
            else setModalOpen(true)
          },
        },
          react.createElement('span', {
            style: {
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: dotColor,
              flex: 'none',
            },
          }),
          react.createElement('span', null, badgeText),
        ),
        react.createElement(QuotaDetailModal, {
          open: modalOpen,
          onClose: () => setModalOpen(false),
          quota,
          loading,
          error,
          onRefresh: refresh,
        }),
      )
    }

    /**
     * 4. 设置页卡片:注册在 settings.plugin.item
     */
    function AgyCard(props) {
      const [open, setOpen] = react.useState(false)
      const [checking, setChecking] = react.useState(false)
      const [testing, setTesting] = react.useState(false)
      const [statusText, setStatusText] = react.useState('')
      const [testText, setTestText] = react.useState('')
      const scope = props.scope

      const resolveRemoteCallback = react.useCallback(() => resolveRemote(props.ctx), [props.ctx])

      const runProbe = react.useCallback(async (provider, setOut, setBusy) => {
        setBusy(true)
        try {
          const remote = resolveRemoteCallback()
          if (remote === undefined || typeof remote.discoverModels !== 'function') {
            setOut('探测不可用:当前客户端上下文未提供 remote.llm 服务。')
          } else {
            const res = unwrapDiscovery(await remote.discoverModels('agy', { provider }))
            const lines = res
              .map((r) => (r && (r.name || r.id)) || '')
              .filter((s) => s !== '')
            setOut(lines.length > 0 ? lines.join('\n') : '(无返回内容)')
          }
        } catch (e) {
          setOut('探测失败:' + (e && e.message ? e.message : String(e)))
        }
        setBusy(false)
      }, [resolveRemoteCallback])

      const onStatus = react.useCallback(() => runProbe('status', setStatusText, setChecking), [runProbe])
      const onTest = react.useCallback(() => runProbe('test', setTestText, setTesting), [runProbe])

      const { data: quotaData, loading: quotaLoading, error: quotaError, refresh: loadQuota } = useAgyQuota(open, props.ctx)

      // 看图分工提示开关:读写 agy settings namespace 的 delegationGuide。
      const [guideOn, setGuideOn] = react.useState(true)
      react.useEffect(() => {
        try {
          const v = scope.getSnapshot().value
          if (v?.delegationGuide !== undefined) setGuideOn(Boolean(v.delegationGuide))
        } catch { /* 镜像未就绪 */ }
        return scope.subscribe(() => {
          const v2 = scope.getSnapshot().value
          if (v2?.delegationGuide !== undefined) setGuideOn(Boolean(v2.delegationGuide))
        })
      }, [scope])
      const toggleGuide = react.useCallback(async () => {
        const next = !guideOn
        setGuideOn(next)
        try {
          await scope.set('delegationGuide', next)
        } catch (e) {
          setGuideOn(!next)
        }
      }, [scope, guideOn])

      // 使用 AGY 读取图片开关:读写 agy settings namespace 的 readImageAgy。
      const [imageRelayOn, setImageRelayOn] = react.useState(true)
      react.useEffect(() => {
        try {
          const v = scope.getSnapshot().value
          if (v?.readImageAgy !== undefined) setImageRelayOn(Boolean(v.readImageAgy))
        } catch { /* 镜像未就绪 */ }
        return scope.subscribe(() => {
          const v2 = scope.getSnapshot().value
          if (v2?.readImageAgy !== undefined) setImageRelayOn(Boolean(v2.readImageAgy))
        })
      }, [scope])
      const toggleImageRelay = react.useCallback(async () => {
        const next = !imageRelayOn
        setImageRelayOn(next)
        try {
          await scope.set('readImageAgy', next)
        } catch (e) {
          setImageRelayOn(!next)
        }
      }, [scope, imageRelayOn])

      // AGY 搜索接管开关:读写 agy settings namespace 的 searchOverride。
      const [searchOverrideOn, setSearchOverrideOn] = react.useState(true)
      react.useEffect(() => {
        try {
          const v = scope.getSnapshot().value
          if (v?.searchOverride !== undefined) setSearchOverrideOn(Boolean(v.searchOverride))
        } catch { /* 镜像未就绪 */ }
        return scope.subscribe(() => {
          const v2 = scope.getSnapshot().value
          if (v2?.searchOverride !== undefined) setSearchOverrideOn(Boolean(v2.searchOverride))
        })
      }, [scope])
      const toggleSearchOverride = react.useCallback(async () => {
        const next = !searchOverrideOn
        setSearchOverrideOn(next)
        try {
          await scope.set('searchOverride', next)
        } catch (e) {
          setSearchOverrideOn(!next)
        }
      }, [scope, searchOverrideOn])

      // 默认模型 + 代理
      const [models, setModels] = react.useState([])
      const [currentModel, setCurrentModel] = react.useState('')
      const [savedModel, setSavedModel] = react.useState('')
      const [currentProxy, setCurrentProxy] = react.useState('')
      const [savedProxy, setSavedProxy] = react.useState('')
      const [detailText, setDetailText] = react.useState('')
      const [loadingModels, setLoadingModels] = react.useState(false)
      const [modelsError, setModelsError] = react.useState('')
      const [pickerOpen, setPickerOpen] = react.useState(false)

      const loadConfig = react.useCallback(async () => {
        try {
          const v = scope.getSnapshot().value ?? {}
          const model = v.model ?? ''
          const proxy = v.proxy ?? ''
          setCurrentModel(model)
          setSavedModel(model)
          setCurrentProxy(proxy)
          setSavedProxy(proxy)
          setDetailText(`命令:${v.command ?? 'agy'} | 强度:${v.effort ?? 'high'} | 代理:${proxy || '(空)'}`)
        } catch { /* 忽略 */ }
      }, [scope])

      const loadModels = react.useCallback(async () => {
        setLoadingModels(true)
        setModelsError('')
        try {
          const remote = resolveRemoteCallback()
          if (remote === undefined || typeof remote.discoverModels !== 'function') {
            setModels([])
            setModelsError('获取失败:当前客户端上下文未提供 remote.llm 服务。')
          } else {
            const res = unwrapDiscovery(await remote.discoverModels('agy', { provider: 'models' }))
            setModels(res.map((r) => r && r.id).filter((id) => typeof id === 'string' && id !== ''))
          }
        } catch (e) {
          setModels([])
          setModelsError('获取失败:' + (e && e.message ? e.message : String(e)))
        }
        setLoadingModels(false)
      }, [resolveRemoteCallback])

      react.useEffect(() => {
        if (!open) return
        loadConfig()
      }, [open, loadConfig])

      const writeModel = react.useCallback(async (value) => {
        try {
          if (value === '') await scope.unset('model')
          else await scope.set('model', value)
          if (value !== '') { setCurrentModel(value); setSavedModel(value) }
          loadConfig()
        } catch { loadConfig() }
      }, [scope, loadConfig])

      const onModelInput = react.useCallback((e) => setCurrentModel(e.target.value), [])
      const onModelBlur = react.useCallback(() => {
        const value = currentModel.trim()
        if (value === savedModel) return
        writeModel(value)
      }, [currentModel, savedModel, writeModel])

      const openPicker = react.useCallback(async () => {
        setPickerOpen(true)
        if (models.length === 0) loadModels()
      }, [models.length, loadModels])
      const pickFromList = react.useCallback((value) => {
        writeModel(value)
        setPickerOpen(false)
      }, [writeModel])

      const onProxyInput = react.useCallback((e) => setCurrentProxy(e.target.value), [])
      const onProxyBlur = react.useCallback(async () => {
        const value = currentProxy.trim()
        if (value === savedProxy) return
        try {
          if (value === '') await scope.unset('proxy')
          else await scope.set('proxy', value)
          setCurrentProxy(value)
          setSavedProxy(value)
        } catch { loadConfig() }
      }, [currentProxy, savedProxy, scope, loadConfig])

      return react.createElement('li', { className: `${C.card} ${open ? C.cardOpen : ''}` },
        react.createElement('button', {
          type: 'button', className: C.header, 'aria-expanded': open,
          'aria-label': `${open ? '收起' : '展开'}: AntiGravity`,
          onClick: () => setOpen(!open),
        },
          react.createElement('span', { className: C.headText },
            react.createElement('span', { className: C.name }, 'AntiGravity'),
            react.createElement('span', { className: C.description }, '检测安装/登录、实时配额与剩余用量、连通性测试、安装命令与工具说明'),
          ),
          react.createElement(IconChevronDownOutline14, { className: `${C.chevron} ${open ? C.chevronOpen : ''}` }),
        ),
        open && react.createElement('div', { className: C.body },
          // 操作按钮行
          react.createElement('div', { className: C.row },
            react.createElement(Button, {
              size: 'md', onClick: onStatus, disabled: checking,
              icon: checking
                ? react.createElement(IconLoadingOutline16, { size: 14 })
                : react.createElement(IconRefreshOutline16, { size: 14 }),
            }, checking ? '检测中...' : '检测安装/登录'),
            react.createElement(Button, {
              size: 'md', onClick: onTest, disabled: testing,
              icon: testing ? react.createElement(IconLoadingOutline16, { size: 14 }) : undefined,
            }, testing ? '测试中...' : '测试(回复 hi)'),
            react.createElement(Button, {
              size: 'md', onClick: loadQuota, disabled: quotaLoading,
              icon: quotaLoading
                ? react.createElement(IconLoadingOutline16, { size: 14 })
                : react.createElement(IconRefreshOutline16, { size: 14 }),
            }, quotaLoading ? '查询用量中...' : '查询用量/配额'),
          ),
          react.createElement('p', { className: C.hint }, '若已安装仍提示未安装,请重启 dsh 服务(PATH 生效后需重启)'),
          statusText !== '' && react.createElement('pre', { className: C.pre }, statusText),
          testText !== '' && react.createElement('pre', { className: C.pre }, testText),
          react.createElement(QuotaDisplay, { quota: quotaData, loading: quotaLoading, error: quotaError, showHeader: true }),

          // 默认模型
          react.createElement('div', { className: C.field },
            react.createElement('div', { className: C.fieldHead },
              react.createElement('span', { className: C.label }, '默认模型'),
              react.createElement(Button, {
                size: 'sm', variant: 'ghost', onClick: openPicker, disabled: loadingModels,
                icon: loadingModels
                  ? react.createElement(IconLoadingOutline16, { size: 12 })
                  : react.createElement(IconRefreshOutline16, { size: 12 }),
              }, loadingModels ? '获取中...' : '获取模型'),
            ),
            react.createElement(Input, {
              type: 'text', value: currentModel, onChange: onModelInput, onBlur: onModelBlur,
              placeholder: '输入模型 id',
              className: C.modelField,
            }),
            detailText !== '' && react.createElement('p', { className: C.hint, style: { fontFamily: 'var(--dsw-font-family-code, monospace)' } }, detailText),
            react.createElement('p', { className: C.hint }, '可直接输入模型 id(失焦保存),或点"获取模型"从弹窗选择;留空则使用 AGY 默认'),
          ),

          // 代理
          react.createElement('div', { className: C.field },
            react.createElement('div', { className: C.fieldHead },
              react.createElement('span', { className: C.label }, '代理'),
            ),
            react.createElement(Input, {
              type: 'text', value: currentProxy, onChange: onProxyInput, onBlur: onProxyBlur,
              placeholder: '例如 http://127.0.0.1:7897',
              className: C.modelField,
            }),
            react.createElement('p', { className: C.hint }, '例如 http://127.0.0.1:7897;留空则不设置代理(运行时未设置时回落到该地址)'),
          ),

          // 看图分工提示开关
          react.createElement('div', { className: C.field },
            react.createElement('div', { className: C.fieldHead },
              react.createElement('span', { className: C.label }, '注入工具使用提示词'),
              react.createElement('input', {
                type: 'checkbox',
                checked: guideOn,
                onChange: toggleGuide,
                style: { accentColor: 'var(--dsw-alias-brand-primary)', width: 16, height: 16, cursor: 'pointer' },
              }),
            ),
            react.createElement('p', { className: C.hint },
              guideOn ? '开启:注入工具使用提示词' : '关闭:不注入工具使用提示词',
            ),
          ),

          // 使用 AGY 读取图片开关
          react.createElement('div', { className: C.field },
            react.createElement('div', { className: C.fieldHead },
              react.createElement('span', { className: C.label }, '使用 AGY 读取图片'),
              react.createElement('input', {
                type: 'checkbox',
                checked: imageRelayOn,
                onChange: toggleImageRelay,
                style: { accentColor: 'var(--dsw-alias-brand-primary)', width: 16, height: 16, cursor: 'pointer' },
              }),
            ),
            react.createElement('p', { className: C.hint },
              imageRelayOn
                ? '开启:粘贴的图片由 AGY 读取为文字描述,文本模型也能看图(无需切换模型)'
                : '关闭:粘贴图片按原生流程处理(多模态模型可自己看图)',
            ),
          ),

          // AGY 搜索接管开关
          react.createElement('div', { className: C.field },
            react.createElement('div', { className: C.fieldHead },
              react.createElement('span', { className: C.label }, 'AGY 搜索接管 web_search'),
              react.createElement('input', {
                type: 'checkbox',
                checked: searchOverrideOn,
                onChange: toggleSearchOverride,
                style: { accentColor: 'var(--dsw-alias-brand-primary)', width: 16, height: 16, cursor: 'pointer' },
              }),
            ),
            react.createElement('p', { className: C.hint },
              searchOverrideOn
                ? '开启:全局 web_search 工具由 AGY 深度搜索提供'
                : '关闭:不占全局搜索(避免与其它搜索 provider 冲突),仅提供独立的 agy_web_search 工具',
            ),
          ),

          // 安装命令
          react.createElement('div', { className: C.field },
            react.createElement('div', { className: C.fieldHead },
              react.createElement('span', { className: C.label }, '安装命令'),
              react.createElement('span', { className: C.badge }, 'antigravity.google/docs/cli/install'),
            ),
            react.createElement('p', { className: C.hint }, '官方安装文档:https://antigravity.google/docs/cli/install'),
          ),
          ...INSTALL_CMDS.map((item) => react.createElement(InstallCommandRow, { key: item.label, label: item.label, cmd: item.cmd })),

          // 工具说明
          react.createElement('div', { className: C.field },
            react.createElement('div', { className: C.fieldHead },
              react.createElement('span', { className: C.label }, '工具说明'),
            ),
            react.createElement('ul', { style: { margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 } },
              TOOLS.map((t) => react.createElement('li', { key: t.name, className: C.hint },
                react.createElement('strong', { style: { color: 'var(--dsw-alias-label-secondary)' } }, t.name), ' — ', t.desc,
              )),
            ),
          ),

          // 获取模型弹窗
          react.createElement(Modal, {
            open: pickerOpen,
            onClose: () => setPickerOpen(false),
            title: '选择模型',
            closeLabel: '关闭',
          },
            loadingModels && models.length === 0
              ? react.createElement('p', { className: C.hint }, '加载中...')
              : models.length === 0
                ? react.createElement('p', { className: C.hint }, modelsError || '未获取到模型列表,请确认 AGY CLI 已安装')
                : react.createElement('div', { className: C.pickerList },
                    models.map((m) => react.createElement('button', {
                      key: m,
                      type: 'button',
                      className: C.pickerItem,
                      onClick: () => pickFromList(m),
                    },
                      react.createElement('span', { className: C.pickerLabel }, m),
                      m === currentModel && react.createElement(IconCheckOutline16, { className: C.pickerCheck, size: 14 }),
                    )),
                  ),
          ),
        ),
      )
    }

    function apply(ctx) {
      rootCtx = ctx
      const agyScope = ctx.settingsScope.bind({ namespace: 'agy' })
      const sectionInject = () => ({
        scope: agyScope,
        ctx,
      })

      // 1. 设置页插件卡片
      ctx.effect(() => {
        return ctx.slots.inject('settings.plugin.item', () => {
          return ctx.slots.register({
            name: 'settings.plugin.item',
            id: 'agy',
            key: 'agy',
            order: 30,
            label: () => 'AntiGravity',
            inject: sectionInject,
          }, AgyCard)
        })
      }, 'llm-agy-client: settings.plugin.item')

      // 2. 输入框底栏模型选择器旁紧凑徽标 (conversation.input.right)
      ctx.effect(() => {
        return ctx.slots.inject('conversation.input.right', () => {
          return ctx.slots.register({
            name: 'conversation.input.right',
            id: 'agy-quota-badge',
            order: 10,
            label: () => 'AGY 配额',
          }, QuotaInputBadge)
        })
      }, 'llm-agy-client: conversation.input.right')
    }

    exports.apply = apply
    // 会话模型不再需要自己解析:session 作用域的 slot 会把 `useProjection`
    // 直接注入组件 props,因此这里不需要额外声明会话/目录服务。
    exports.inject = ['slots', 'settingsScope', 'remote', 'remote.llm']
    exports.name = 'llm-agy-client'
    return module.exports
  },
})
