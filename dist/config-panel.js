/*!
 * 芙宁娜 Live2D 看板娘 - 参数设置面板
 * 附带说明：
 *  - 可调参数都写入 window.__live2dConfig，由 dist/chunk/index2.js 运行时读取，拖动即时生效。
 *  - 数值自动保存到 localStorage('live2dConfig')，刷新后保持。
 *  - 如需内联预设（不依赖 localStorage），在 autoload.js 顶部设置 const LIVE2D_PRESET = {...}。
 *    注意：localStorage 中的值优先级高于 LIVE2D_PRESET；清空 localStorage 或点“重置”可回到内置默认。
 */
(function () {
  if (window.__live2dPanelLoaded) return; // 防重复
  window.__live2dPanelLoaded = true;

  // 内置默认值（与 index2.js 中 ?? 回退值一致）
  var DEFAULTS = {
    angleX: 30,      // 头部水平跟手灵敏度
    angleY: 30,      // 头部垂直跟手灵敏度
    angleZ: 30,      // 头部倾斜跟手灵敏度
    bodyAngleX: 10,  // 身体跟手灵敏度
    deadZone: 0.06   // 垂直软死区（仰角越小越抑制抖动）
  };

  // 读取当前配置（可能被 autoload 预置过），merged：内置默认 + LIVE2D_PRESET + localStorage
  function ensureConfig() {
    var base = JSON.parse(JSON.stringify(window.__live2dConfig || DEFAULTS));
    window.__live2dConfig = base;
    return base;
  }
  var config = ensureConfig();

  // 字段定义驱动 UI
  var FIELDS = [
    { key: 'angleX', label: '头部水平灵敏度',  min: 0, max: 60, step: 1,  unit: '', desc: '鼠标水平移动时头部跟随幅度' },
    { key: 'angleY', label: '头部垂直灵敏度',  min: 0, max: 60, step: 1,  unit: '', desc: '鼠标垂直移动时头部跟随幅度' },
    { key: 'angleZ', label: '头部倾斜灵敏度',  min: 0, max: 60, step: 1,  unit: '', desc: '头部左右倾斜幅度' },
    { key: 'bodyAngleX', label: '身体灵敏度',  min: 0, max: 30, step: 1,  unit: '', desc: '鼠标水平移动时身体跟随幅度' },
    { key: 'deadZone', label: '仰角软死区',    min: 0, max: 0.3, step: 0.005, unit: '', desc: '鼠标接近模型水平线时抑制抖动；调大更稳、调小更灵敏' }
  ];

  // ---- DOM 构建 ----
  var wrap = document.createElement('div');
  wrap.id = 'live2d-panel';
  wrap.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:2147480000;width:280px;background:rgba(28,26,38,.96);' +
    'color:#e8e6f0;border:1px solid rgba(255,255,255,.14);border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.45);' +
    'font:13px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;' +
    'transform:translateX(calc(100% + 24px));transition:transform .28s ease;user-select:none;';

  // 头部（拖动 + 标题）
  var head = document.createElement('div');
  head.id = 'live2d-panel-head';
  head.style.cssText =
    'padding:10px 12px;cursor:move;display:flex;justify-content:space-between;align-items:center;' +
    'border-bottom:1px solid rgba(255,255,255,.10);';
  head.innerHTML =
    '<span style="font-weight:600;font-size:14px;">芙宁娜参数调校</span>' +
    '<span id="live2d-panel-collapse" style="cursor:pointer;opacity:.75;font-size:16px;">×</span>';
  wrap.appendChild(head);

  // 说明
  var tip = document.createElement('div');
  tip.textContent = '拖动滑块即实时生效，自动保存到本机，刷新后保持。';
  tip.style.cssText = 'padding:6px 12px;font-size:12px;opacity:.75;';
  wrap.appendChild(tip);

  // 字段区
  var body = document.createElement('div');
  body.id = 'live2d-panel-body';
  body.style.cssText = 'padding:4px 12px 8px;max-height:60vh;overflow:auto;';

  function buildSlider(f) {
    var row = document.createElement('div');
    row.style.cssText = 'padding:6px 0;';
    var label = document.createElement('div');
    label.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;';
    var name = document.createElement('span');
    name.textContent = f.label;
    var val = document.createElement('span');
    val.id = 'live2d-panel-val-' + f.key;
    val.style.cssText = 'color:#8fb0ff;font-variant-numeric:tabular-nums;';
    label.appendChild(name); label.appendChild(val);
    row.appendChild(label);

    var input = document.createElement('input');
    input.type = 'range';
    input.id = 'live2d-panel-in-' + f.key;
    input.min = f.min; input.max = f.max; input.step = f.step;
    input.value = config[f.key];
    input.style.cssText = 'width:100%;accent-color:#5a8cff;margin-top:2px;';
    input.addEventListener('input', function () {
      var v = parseFloat(input.value);
      config[f.key] = v;
      try { localStorage.setItem('live2dConfig', JSON.stringify(config)); } catch (e) {}
      val.textContent = formatVal(f, v);
    });
    row.appendChild(input);

    var desc = document.createElement('div');
    desc.textContent = f.desc;
    desc.style.cssText = 'font-size:11px;opacity:.6;margin-top:2px;';
    row.appendChild(desc);
    return { row: row, val: val, input: input };
  }

  function formatVal(f, v) {
    return (f.unit === '' && f.step < 1 ? v.toFixed(f.step < 0.05 ? 3 : 2) : v) + (f.key === 'deadZone' ? '' : '');
  }

  var sliders = {};
  FIELDS.forEach(function (f) {
    var b = buildSlider(f);
    b.val.textContent = formatVal(f, b.input.value);
    sliders[f.key] = b;
    body.appendChild(b.row);
  });

  // 操作区
  var actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;padding:4px 0 8px;';
  function mkBtn(text, fn, accent) {
    var b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = 'flex:1;padding:5px 0;border:0;border-radius:6px;cursor:pointer;font-size:12px;' +
      (accent ? 'background:#5a8cff;color:#fff;' : 'background:rgba(255,255,255,.12);color:#e8e6f0;');
    b.addEventListener('click', fn);
    return b;
  }
  actions.appendChild(mkBtn('重置', function () {
    Object.keys(DEFAULTS).forEach(function (k) { config[k] = DEFAULTS[k]; });
    try { localStorage.removeItem('live2dConfig'); } catch (e) {}
    FIELDS.forEach(function (f) {
      var b = sliders[f.key]; b.input.value = DEFAULTS[f.key]; b.val.textContent = formatVal(f, DEFAULTS[f.key]);
    });
  }));
  actions.appendChild(mkBtn('导出配置', function () {
    var json = JSON.stringify(config, null, 2);
    var txt = 'const LIVE2D_PRESET = ' + json + ';';
    function copy(s) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(s).then(function () { flash('已复制'); }, function () { fallback(s); });
      } else { fallback(s); }
    }
    function fallback(s) {
      var ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); flash('已复制'); } catch (e) { flash('复制失败，请手动复制'); }
      document.body.removeChild(ta);
    }
    function flash(msg) {
      var old = body.querySelector('.lp-ok');
      if (old) old.remove();
      var ok = document.createElement('div'); ok.className = 'lp-ok'; ok.textContent = msg;
      ok.style.cssText = 'font-size:11px;color:#7be88e;padding:2px 0 4px;';
      body.appendChild(ok); setTimeout(function () { ok.remove(); }, 1500);
    }
    copy(txt);
  }));
  body.appendChild(actions);

  // 折叠提示
  var note = document.createElement('div');
  note.textContent = '顶部“×”可收起/再开（左下角齿轮按钮唤出）。刷新页面生效最新参数。';
  note.style.cssText = 'font-size:11px;opacity:.55;padding:2px 0 4px;';
  body.appendChild(note);

  wrap.appendChild(body);
  document.documentElement.appendChild(wrap);

  // ---- 拖拽 ----
  var dragging = false, ox = 0, oy = 0;
  head.addEventListener('mousedown', function (e) {
    dragging = true; ox = e.clientX - wrap.offsetLeft; oy = e.clientY - wrap.offsetTop;
    head.style.cursor = 'grabbing';
  });
  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var x = e.clientX - ox, y = e.clientY - oy;
    if (y < 0) y = 0;
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
    wrap.style.left = x + 'px';
    wrap.style.top = y + 'px';
  });
  document.addEventListener('mouseup', function () { dragging = false; head.style.cursor = 'move'; });

  // ---- 收起/唤出 ----
  var collapsed = false;
  document.getElementById('live2d-panel-collapse').addEventListener('click', function () { toggle(); });
  function toggle() {
    collapsed = !collapsed;
    if (collapsed) { wrap.style.transform = 'translateX(calc(100% + 24px))'; wrap.style.visibility = 'hidden'; }
    else { wrap.style.transform = 'none'; }
    toggleBtn.style.display = collapsed ? 'block' : 'none';
  }
  var toggleBtn = document.createElement('div');
  toggleBtn.id = 'live2d-panel-toggle';
  toggleBtn.textContent = '⚙';
  toggleBtn.title = '打开芙宁娜参数调校';
  toggleBtn.style.cssText =
    'position:fixed;right:12px;bottom:12px;z-index:2147481000;display:none;width:38px;height:38px;' +
    'background:#5a8cff;color:#fff;border-radius:50%;text-align:center;line-height:38px;font-size:20px;' +
    'cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);';
  toggleBtn.addEventListener('click', function () { toggle(); });
  document.documentElement.appendChild(toggleBtn);

  // 初始展开
  setTimeout(function () { wrap.style.transform = 'none'; }, 50);
})();