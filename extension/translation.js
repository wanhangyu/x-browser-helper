(() => {
  'use strict';
  const entries = new Map();
  const translators = new Map();
  const TTL = 30 * 60 * 1000;
  let detectorPromise;
  let needsActivation = false;
  let running = 0;
  let provider = 'local';
  let loadingProvider = false;
  let providerRevision;
  let loadProvider;
  let generation = 0;

  const notify = () => window.dispatchEvent(new Event('xpandmax:translation'));
  const supported = () => !loadingProvider && (provider !== 'local' || (typeof Translator !== 'undefined' && typeof Translator.create === 'function'
    && typeof LanguageDetector !== 'undefined' && typeof LanguageDetector.create === 'function'));
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    let refresh = 0;
    loadProvider = async () => {
      const id = ++refresh;
      // Invalidate old work before awaiting status: cancelled replies can arrive first.
      loadingProvider = true;
      generation++;
      running = 0;
      entries.clear();
      needsActivation = false;
      try {
        const config = await chrome.runtime.sendMessage({ type: 'translation-status' });
        if (id !== refresh) return;
        provider = ['custom', 'google', 'gemini', 'anthropic'].includes(config?.provider) ? config.provider : 'local';
        providerRevision = config?.revision;
      } catch {
        if (id === refresh) provider = 'local';
      } finally {
        if (id === refresh) { loadingProvider = false; notify(); }
      }
    };
    loadProvider();
    chrome.storage?.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.translationConfig) loadProvider();
    });
  }
  // 已有中文的简介保留原文；日语、韩语仍交给语言检测器。
  const needsTranslation = text => text && !(/[\u3400-\u9fff]/u.test(text) && !(/[\u3040-\u30ff\uac00-\ud7af]/u.test(text)));

  function protectNames(text) {
    const terms = new Set(text.match(/https?:\/\/\S+|@[a-zA-Z0-9_]+|\b[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}(?:\/[^\s]*)?/g) || []);
    // 品牌合作列表里的名称不应被机器翻译成普通名词。
    for (const section of text.split('|')) {
      const list = section.trim().match(/^(?:Ambassador(?: for)?|Partner(?: with| of)?)\s*:?\s+(.+)$/i);
      if (list && /[•·]/.test(list[1])) {
        for (const name of list[1].split(/[•·,]/).map(value => value.trim()).filter(Boolean)) terms.add(name);
      }
    }
    for (const name of text.match(/\b(?:OpenAI|ChatGPT|Claude|Gemini|Elevenlabs|Higgsfield|Openart)\b/gi) || []) terms.add(name);
    const values = [...terms].sort((a, b) => b.length - a.length);
    if (!values.length) return { text, restore: value => value };
    const pattern = new RegExp(values.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
    const replacements = [];
    const masked = text.replace(pattern, value => {
      let index = replacements.indexOf(value);
      if (index < 0) { index = replacements.length; replacements.push(value); }
      return `⟦XP${index}⟧`;
    });
    return {
      text: masked,
      restore(value) {
        let result = value;
        for (let index = 0; index < replacements.length; index++) {
          const token = new RegExp(`⟦\\s*XP\\s*${index}\\s*⟧`, 'g');
          if (!token.test(result)) throw new Error('Translation lost a protected name');
          token.lastIndex = 0;
          result = result.replace(token, () => replacements[index]);
        }
        return result;
      }
    };
  }

  function rememberPromise(map, key, create) {
    if (!map.has(key)) {
      const pending = create().catch(error => { map.delete(key); throw error; });
      pending.catch(() => {});
      map.set(key, pending);
    }
    return map.get(key);
  }

  function detector() {
    if (!detectorPromise) {
      detectorPromise = LanguageDetector.create().catch(error => { detectorPromise = null; throw error; });
      detectorPromise.catch(() => {});
    }
    return detectorPromise;
  }

  function translator(language) {
    return rememberPromise(translators, language, () => Translator.create({ sourceLanguage: language, targetLanguage: 'zh' }));
  }

  async function translate(entry) {
    const currentGeneration = generation;
    const online = provider !== 'local';
    entry.state = 'translating';
    try {
      if (!online && !entry.language) {
        const results = await (await detector()).detect(entry.original);
        entry.language = results[0]?.detectedLanguage?.split('-')[0] || 'und';
      }
      if (!online && (entry.language === 'zh' || entry.language === 'und')) {
        entry.state = 'original';
        return;
      }
      const protectedText = protectNames(entry.original);
      let translated;
      if (online) {
        const result = await chrome.runtime.sendMessage({ type: 'translate-bio', text: protectedText.text, revision: providerRevision });
        if (currentGeneration !== generation) return;
        if (result?.code === 'cancelled') { loadProvider(); return; }
        if (result?.error) {
          const error = new Error('API translation failed');
          error.userMessage = String(result.error).slice(0, 200);
          throw error;
        }
        translated = result?.text;
      } else translated = await (await translator(entry.language)).translate(protectedText.text);
      if (generation !== currentGeneration) return;
      if (typeof translated !== 'string') throw new Error('Invalid translation');
      const text = protectedText.restore(translated.trim());
      if (!text || text.length > 6000) throw new Error('Invalid translation');
      entry.text = text;
      entry.state = 'ready';
    } catch (error) {
      if (generation !== currentGeneration) return;
      entry.error = online ? (error.userMessage || '在线翻译失败，请在插件翻译设置中测试连接') : '本地翻译不可用，可在插件翻译设置中接入 API';
      if (!online && error.name === 'NotAllowedError') {
        needsActivation = true;
        entry.state = 'activate';
      } else entry.state = 'failed';
    } finally {
      entry.at = Date.now();
      notify();
    }
  }

  function pump() {
    for (const entry of entries.values()) {
      if (running >= 2) break;
      if (entry.state !== 'queued') continue;
      if (needsActivation) { entry.state = 'activate'; notify(); continue; }
      running++;
      const currentGeneration = generation;
      translate(entry).finally(() => {
        if (currentGeneration === generation) { running--; pump(); }
      });
    }
  }

  function inspect(text) {
    if (!supported() || !needsTranslation(text)) return null;
    const entry = entries.get(text);
    if (entry && !['queued', 'translating'].includes(entry.state) && Date.now() - entry.at >= TTL) {
      entries.delete(text);
      return null;
    }
    return entry || null;
  }

  function request(text) {
    if (!supported() || !needsTranslation(text)) return null;
    let entry = inspect(text);
    if (!entry) {
      if (entries.size >= 500) {
        const evictable = [...entries].find(([, cached]) => !['queued', 'translating'].includes(cached.state));
        if (!evictable) return null;
        entries.delete(evictable[0]);
      }
      entry = { original: text, state: needsActivation ? 'activate' : 'queued', at: Date.now() };
      entries.set(text, entry);
      Promise.resolve().then(pump);
    }
    return entry;
  }

  function enable() {
    if (!supported()) return;
    needsActivation = false;
    // 在真实点击事件内启动模型创建，以满足浏览器首次下载的用户手势要求。
    if (provider === 'local') {
      detector();
      const languages = new Set(['en']);
      for (const entry of entries.values()) {
        if (entry.language && !['zh', 'und'].includes(entry.language)) languages.add(entry.language);
      }
      for (const language of languages) translator(language);
    }
    for (const entry of entries.values()) {
      if (['activate', 'failed'].includes(entry.state)) entry.state = 'queued';
    }
    notify();
    pump();
  }

  window.xpandmaxTranslations = Object.freeze({ inspect, request, enable });
})();

