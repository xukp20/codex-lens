/* Model Context Protocol Apps postMessage transport. */
(() => {
  let nextID = 0;
  let config = null;
  let theme = null;
  const pending = new Map();
  const activeThread = {value:''};
  const send = (payload) => window.parent.postMessage({jsonrpc:'2.0',...payload}, '*');
  function request(method,params) {
    const id = ++nextID;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('MCP host did not respond'));
      },14000);
      pending.set(id, {resolve, reject, timer});
      send({id,method,params});
    });
  }
  window.addEventListener('message',(event) => {
    if (event.source !== window.parent || event.data?.jsonrpc !== '2.0') return;
    const message = event.data;
    const waiter = pending.get(message.id);
    if (waiter && ('result' in message || 'error' in message)) {
      clearTimeout(waiter.timer);
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    }
    if (message.method === 'ui/notifications/host-context-changed') {
      const next = message.params?.theme;
      if (next === 'dark' || next === 'light') {
        theme = next;
        document.documentElement.dataset.theme = next;
      }
    }
  });
  const ready = request('ui/initialize',{
    appInfo:{name:'Codex Lens',version:'1.3.0'}, appCapabilities:{}, protocolVersion:'2026-01-26'
  }).then((result) => {
    theme = result.hostContext?.theme;
    if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
    send({method:'ui/notifications/initialized'});
  });
  window.sidecar = {
    get conversationId() { return activeThread.value; },
    setConversationId(value) { activeThread.value = value; },
    async fetch(path,options) {
      await ready;
      if (path === '/api/config' && options?.method === 'POST') {
        const patch = JSON.parse(options.body);
        const previous = config.config;
        const next = {...previous,...patch};
        for (const key of ['modules','expanded']) {
          if (patch[key]) next[key] = {...previous[key],...patch[key]};
        }
        config = {...config,config:next};
        return new Response(JSON.stringify(config));
      }
      if (path === '/api/config' && config) return new Response(JSON.stringify(config));
      const data = await request('tools/call',{name:'codex_lens_read',arguments:{path}});
      if (data.isError || !data.structuredContent) {
        return new Response(JSON.stringify({error:'Local dashboard unavailable'}),{status:502});
      }
      if (path === '/api/config') config = data.structuredContent;
      return new Response(JSON.stringify(data.structuredContent));
    }
  };
})();
