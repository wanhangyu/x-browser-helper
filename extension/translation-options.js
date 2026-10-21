(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const status = $('status');
  let savedProvider = 'local';
  let dirty = false;
  const customProvider = provider => ['custom', 'gemini', 'anthropic'].includes(provider);
  const fields = ['endpoint', 'api-key', 'model'];
  function render() {
    const custom = customProvider($('provider').value);
    $('endpoint-hint').textContent = '可填服务根地址、协议前缀或完整请求地址。根地址会自动补 /v1（Gemini 为 /v1beta）；有特殊代理路径时请按服务商文档填写完整路径。';
    $('custom-fields').hidden = !custom;
    $('local-note').hidden = $('provider').value !== 'local';
    $('google-note').hidden = $('provider').value !== 'google';
    $('test-note').hidden = $('provider').value === 'local';
    for (const id of fields) $(id).disabled = !custom;
    $('endpoint').required = custom;
    $('model').required = custom;
    $('test').disabled = dirty || savedProvider === 'local';
  }
  async function send(message) {
    const result = await chrome.runtime.sendMessage(message);
    if (!result || result.error) throw new Error(result?.error || '扩展未响应，请重新打开设置');
    return result;
  }
  $('translation-form').addEventListener('input', () => { dirty = true; render(); });
  $('provider').addEventListener('change', () => { dirty = true; render(); });
  $('translation-form').addEventListener('submit', async event => {
    event.preventDefault();
    const config = { provider: $('provider').value };
    if (customProvider(config.provider)) {
      config.endpoint = $('endpoint').value.trim();
      config.apiKey = $('api-key').value.trim();
      config.model = $('model').value.trim();
    }
    try {
      $('settings').disabled = true;
      if (config.provider !== 'local') {
        const url = new URL(config.provider === 'google' ? 'https://translate.googleapis.com' : config.endpoint);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (customProvider(config.provider) && !config.model)) {
          status.textContent = '请填写 HTTPS 接口地址和模型名称；地址不能包含密码、查询参数或片段';
          return;
        }
        // Called directly from the user's save gesture, before any async work.
        const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
        if (!granted) { status.textContent = '未获站点访问权限，设置未保存'; return; }
      }
      $('settings').disabled = true;
      await send({ type: 'translation-save', config });
      savedProvider = config.provider;
      dirty = false;
      if (!customProvider(savedProvider)) for (const id of fields) $(id).value = '';
      status.textContent = '已保存；已打开的 X 页面会使用新设置';
    } catch (error) {
      status.textContent = error instanceof TypeError ? '接口地址无效，设置未保存' : error.message;
    } finally { $('settings').disabled = false; render(); }
  });
  $('test').addEventListener('click', async () => {
    $('settings').disabled = true;
    status.textContent = '正在测试接口…';
    try {
      const result = await send({ type: 'translation-test' });
      status.textContent = `接口已返回，请检查译文：${result.text}`;
    } catch (error) { status.textContent = error.message; }
    finally { $('settings').disabled = false; render(); }
  });
  send({ type: 'translation-config' }).then(config => {
    savedProvider = ['custom', 'google', 'gemini', 'anthropic'].includes(config.provider) ? config.provider : 'local';
    $('provider').value = savedProvider;
    $('endpoint').value = config.endpoint || '';
    $('api-key').value = config.apiKey || '';
    $('model').value = config.model || '';
    $('settings').disabled = false;
    status.textContent = '修改后请保存；测试仅使用已保存的配置';
    render();
  }).catch(() => { status.textContent = '读取设置失败，请重新打开插件设置'; });
})();

