/*!
 * 刻律德菈 Live2D - 参数设置面板
 * 复刻自 dist/config-panel.js（芙宁娜看板娘同款面板），交互、存储、导出行为保持一致。
 * 附带说明：
 *  - 可调参数都写入 window.__kelvdelaConfig，由 kelvdela.html 运行时读取，拖动即时生效。
 *  - 数值自动保存到 localStorage('kelvdelaConfig')，刷新后保持。
 *  - 与芙宁娜面板互不干扰：键名、DOM id、全局变量各自独立。
 */
(function () {
  if (window.__kelvdelaPanelLoaded) return; // 防重复
  window.__kelvdelaPanelLoaded = true;

  // 内置默认值（与 kelvdela.html 中 ?? 回退值一致）
  // 幅度按立绘网格变形安全区标定：全幅 ±30° 会把 psd2live 变形器拉变形
  var DEFAULTS = {
    angleX: 26,      // 头部水平跟手灵敏度
    pitch: 100,      // 头部俯仰幅度（百分比，100 = 下巴升降 0.02 模型单位）
    angleZ: 20,      // 头部倾斜跟手灵敏度（实际峰值再乘 0.4）
    bodyAngleX: 6,   // 身体伴随刚体位移（像素 = 值 × 0.6）
    deadZone: 0.06   // 垂直软死区（仰角越小越抑制抖动）
  };

  // 读取当前配置：localStorage(v4) > 页面预置 > 内置默认（刷新后保持）
  function ensureConfig() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('kelvdelaConfigV4') || 'null'); } catch (e) {}
    var base = JSON.parse(JSON.stringify(saved || window.__kelvdelaConfig || DEFAULTS));
    for (var k in DEFAULTS) if (!(k in base) || typeof base[k] !== 'number') base[k] = DEFAULTS[k];
    window.__kelvdelaConfig = base;
    return base;
  }
  var config = ensureConfig();

  // 字段定义驱动 UI
  var FIELDS = [
    { key: 'angleX', label: '头部水平灵敏度',  min: 0, max: 60, step: 1,  unit: '', desc: '鼠标水平移动时头部跟随幅度' },
    { key: 'pitch', label: '头部俯仰幅度',    min: 0, max: 200, step: 5, unit: '%', desc: '鼠标上下移动时抬头/低头幅度（在原模型上合成了俯仰变形）；0 = 不跟随垂直' },
    { key: 'angleZ', label: '头部倾斜灵敏度',  min: 0, max: 60, step: 1,  unit: '', desc: '头部左右倾斜幅度' },
    { key: 'bodyAngleX', label: '身体伴随位移',  min: 0, max: 30, step: 1,  unit: '', desc: '整只模型随视线的刚体微位移（像素级，不改网格，慢速跟随头部）' },
    { key: 'deadZone', label: '仰角软死区',    min: 0, max: 0.3, step: 0.005, unit: '', desc: '鼠标接近模型水平线时抑制抖动；调大更稳、调小更灵敏' }
  ];

  // ---- DOM 构建 ----
  var wrap = document.createElement('div');
  wrap.id = 'kelvdela-panel';
  wrap.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:2147480000;width:280px;background:rgba(20,26,42,.96);' +
    'color:#e8eef8;border:1px solid rgba(150,190,255,.16);border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.45);' +
    'font:13px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;' +
    'transform:translateX(calc(100% + 24px));transition:transform .28s ease;user-select:none;';

  // 头部（拖动 + 标题）
  var head = document.createElement('div');
  head.id = 'kelvdela-panel-head';
  head.style.cssText =
    'padding:10px 12px;cursor:move;display:flex;justify-content:space-between;align-items:center;' +
    'border-bottom:1px solid rgba(150,190,255,.12);';
  head.innerHTML =
    '<span style="font-weight:600;font-size:14px;">刻律德菈参数调校</span>' +
    '<span id="kelvdela-panel-collapse" style="cursor:pointer;opacity:.75;font-size:16px;">×</span>';
  wrap.appendChild(head);

  // 说明
  var tip = document.createElement('div');
  tip.textContent = '拖动滑块即实时生效，自动保存到本机，刷新后保持。角度由参数直接驱动，不会再被运行时覆盖。';
  tip.style.cssText = 'padding:6px 12px;font-size:12px;opacity:.75;';
  wrap.appendChild(tip);

  // 字段区
  var body = document.createElement('div');
  body.id = 'kelvdela-panel-body';
  body.style.cssText = 'padding:4px 12px 8px;max-height:60vh;overflow:auto;';

  function buildSlider(f) {
    var row = document.createElement('div');
    row.style.cssText = 'padding:6px 0;';
    var label = document.createElement('div');
    label.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;';
    var name = document.createElement('span');
    name.textContent = f.label;
    var val = document.createElement('span');
    val.id = 'kelvdela-panel-val-' + f.key;
    val.style.cssText = 'color:#8fb0ff;font-variant-numeric:tabular-nums;';
    label.appendChild(name); label.appendChild(val);
    row.appendChild(label);

    var input = document.createElement('input');
    input.type = 'range';
    input.id = 'kelvdela-panel-in-' + f.key;
    input.min = f.min; input.max = f.max; input.step = f.step;
    input.value = config[f.key];
    input.style.cssText = 'width:100%;accent-color:#5a8cff;margin-top:2px;';
    input.addEventListener('input', function () {
      var v = parseFloat(input.value);
      config[f.key] = v;
      try { localStorage.setItem('kelvdelaConfigV4', JSON.stringify(config)); } catch (e) {}
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
    var n = parseFloat(v);
    if (!isNaN(n)) v = n;
    return (f.unit === '' && f.step < 1 ? v.toFixed(f.step < 0.05 ? 3 : 2) : v);
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
      (accent ? 'background:#5a8cff;color:#fff;' : 'background:rgba(255,255,255,.12);color:#e8eef8;');
    b.addEventListener('click', fn);
    return b;
  }
  actions.appendChild(mkBtn('重置', function () {
    Object.keys(DEFAULTS).forEach(function (k) { config[k] = DEFAULTS[k]; });
    try { ['kelvdelaConfig','kelvdelaConfigV2','kelvdelaConfigV3','kelvdelaConfigV4'].forEach(function(k){ localStorage.removeItem(k); }); } catch (e) {}
    FIELDS.forEach(function (f) {
      var b = sliders[f.key]; b.input.value = DEFAULTS[f.key]; b.val.textContent = formatVal(f, DEFAULTS[f.key]);
    });
  }));
  actions.appendChild(mkBtn('导出配置', function () {
    var json = JSON.stringify(config, null, 2);
    var txt = 'const KELVDELA_PRESET = ' + json + ';';
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
  note.textContent = '顶部“×”可收起/再开（右下角齿轮按钮唤出）。参数即时生效，无需刷新。';
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
  document.getElementById('kelvdela-panel-collapse').addEventListener('click', function () { toggle(); });
  function toggle() {
    collapsed = !collapsed;
    if (collapsed) { wrap.style.transform = 'translateX(calc(100% + 24px))'; wrap.style.visibility = 'hidden'; }
    else { wrap.style.transform = 'none'; wrap.style.visibility = 'visible'; }
    toggleBtn.style.display = collapsed ? 'block' : 'none';
  }
  var toggleBtn = document.createElement('div');
  toggleBtn.id = 'kelvdela-panel-toggle';
  toggleBtn.textContent = '⚙';
  toggleBtn.title = '打开刻律德菈参数调校';
  toggleBtn.style.cssText =
    'position:fixed;right:12px;bottom:12px;z-index:2147481000;display:none;width:38px;height:38px;' +
    'background:#5a8cff;color:#fff;border-radius:50%;text-align:center;line-height:38px;font-size:20px;' +
    'cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);';
  toggleBtn.addEventListener('click', function () { toggle(); });
  document.documentElement.appendChild(toggleBtn);

  // 初始展开
  setTimeout(function () { wrap.style.transform = 'none'; }, 50);

  window.KelvdelaPanel = { config: config, toggle: toggle, defaults: DEFAULTS };
})();
