/*!
 * FurinaMini 2.0 — 从 moc3 提取的轻量 Live2D 模型（零 Cubism Core 依赖，零运行时依赖）
 *
 * 数据：furina-mesh.bin（1.32 MB，int16 量化，含裁剪掩码表）+ furina-atlas.webp（724 KB）
 * 渲染：按原始绘制顺序烘焙成非索引三角流；模板缓冲实现裁剪掩码，还原眼睛/衣摆遮挡
 * 动画：呼吸 / 视线跟随 / 头部倾转 / 发丝摆动，全部在顶点着色器内完成
 */
(function (global) {
  'use strict';

  var VS = [
    'attribute vec2 aPos;',
    'attribute vec2 aUv;',
    'attribute float aA;',
    'uniform float uTime, uTilt, uBreath, uScale, uAspect;',
    'uniform vec2 uCenter, uNeck, uOff, uSway;',
    'varying vec2 vUv;',
    'varying float vA;',
    'void main(){',
    '  vUv = aUv;',
    '  vA = aA;',
    '  vec2 p = aPos - uCenter;',
    // clip 空间是非等比的：x 方向要先乘 h/w，才能让两个轴的像素密度一致
    '  p.x *= uAspect;',
    '  p *= uScale;',
    // 呼吸：纵向缩放，横向轻微反向补偿
    '  float br = uBreath;',
    '  p.x *= 1.0 + (br - 1.0) * 0.55;',
    '  p.y *= br;',
    // 头部权重：脖子以上逐渐接管
    '  float w = smoothstep(uNeck.x, uNeck.y, aPos.y);',
    '  float neckY = (uNeck.x - uCenter.y) * uScale;',
    // 以脖子为轴倾转头部
    '  float a = uTilt * w;',
    '  float s = sin(a), c = cos(a);',
    '  vec2 d = vec2(p.x, p.y - neckY);',
    '  p = vec2(d.x * c - d.y * s, neckY + d.x * s + d.y * c);',
    // 发丝 / 裙摆摆动
    '  float lag = sin(uTime * 1.7 - aPos.y * 2.6) * 0.5 + sin(uTime * 0.9 + aPos.x * 3.1) * 0.5;',
    '  p.x += lag * uSway.x * (0.35 + 0.65 * w) * (0.5 + 0.5 * abs(p.x));',
    '  p.y += lag * uSway.y * 0.4;',
    // 鼠标跟随
    '  p += uOff * (0.35 + 0.65 * w);',
    '  gl_Position = vec4(p, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'varying float vA;',
    'uniform sampler2D uTex;',
    'uniform float uPremul;',
    'void main(){',
    '  vec4 c = texture2D(uTex, vUv);',
    '  float a = c.a * vA;',
    '  if (a < 0.004) discard;',
    '  gl_FragColor = vec4(c.rgb * mix(1.0, a, uPremul), a);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }

  /* ---------------- FUR1 解析 ---------------- */
  function parse(buf) {
    var dv = new DataView(buf);
    var magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== 'FUR1' && magic !== 'FUR2') throw new Error('bad magic ' + magic);
    var hasFlags = magic === 'FUR2';
    var o = 4;
    var N = dv.getUint32(o, true); o += 4;
    var vTot = dv.getUint32(o, true); o += 4;
    var iTot = dv.getUint32(o, true); o += 4;
    var cw = dv.getFloat32(o, true); o += 4;
    var ch = dv.getFloat32(o, true); o += 4;
    var sy = dv.getFloat32(o, true); o += 4;
    o += 4;

    var vc = new Uint16Array(N), ic = new Uint16Array(N), ro = new Uint16Array(N);
    var op = new Uint8Array(N), flags = new Uint8Array(N);
    var vOff = new Uint32Array(N), iOff = new Uint32Array(N);
    var maskTarget = new Uint8Array(N);
    var masks = new Array(N);
    var vo = 0, io = 0, i, k;

    for (i = 0; i < N; i++) {
      vc[i] = dv.getUint16(o, true); o += 2;
      ic[i] = dv.getUint16(o, true); o += 2;
      ro[i] = dv.getUint16(o, true); o += 2;
      o += 2;                                     // textureIndex（本模型单图集）
      op[i] = dv.getUint8(o); o += 1;
      if (hasFlags) { flags[i] = dv.getUint8(o); o += 1; }
      var mc = dv.getUint8(o); o += 1;
      var arr = new Array(mc);
      for (k = 0; k < mc; k++) {
        var mt = dv.getUint16(o, true); o += 2;
        arr[k] = mt;
        if (mt < N) maskTarget[mt] = 1;            // 被引用为掩码 → 本体不直接绘制
      }
      masks[i] = arr;
      vOff[i] = vo; iOff[i] = io;
      vo += vc[i]; io += ic[i];
    }
    o = (o + 3) & ~3;              // 4 字节对齐
    var posOff = o; o += vTot * 4;
    var uvOff = o; o += vTot * 4;
    var idxOff = o;

    return {
      N: N, vTot: vTot, iTot: iTot, cw: cw, ch: ch, sy: sy,
      vc: vc, ic: ic, ro: ro, op: op, flags: flags, vOff: vOff, iOff: iOff,
      masks: masks, maskTarget: maskTarget,
      pos: new Int16Array(buf, posOff, vTot * 2),
      uv: new Uint16Array(buf, uvOff, vTot * 2),
      idx: new Uint16Array(buf, idxOff, iTot)
    };
  }

  function mkBuf(gl, arr) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    return b;
  }

  function Furina(opts) {
    var o = this.o = Object.assign({
      size: 320,
      follow: true,
      idle: true,
      dpr: Math.min(global.devicePixelRatio || 1, 2),
      mesh: 'furina-mesh.bin',
      atlas: 'furina-atlas.webp',
      base: '',            // 资源前缀，例如 './dist/'
      hide: null,          // 额外隐藏的 drawable 下标
      minAlpha: 0.999,     // 低于该不透明度的部件视为过渡态残留，不绘制
      clip: true,          // 是否启用模板缓冲裁剪（还原眼睛/贴片的遮罩）
      flat: false,         // true = 忽略 moc 里遗留的半透明度，一律按不透明绘制
      useBlend: 3,         // 位掩码：1=启用加算 2=启用正片叠底
      drawMaskTargets: true, // 遮罩体本身也要绘制（Cubism 的 mask 是"被谁裁剪"，不是"不画"）
      hidePlate: true,     // 隐藏作者在胸口贴的声明牌（drawable 984/985），设 false 可还原
      maxOrder: null       // 调试：只绘制 renderOrder <= 该值的部件
    }, opts || {});

    var el = this.el = document.createElement('div');
    el.className = 'fmini';
    el.style.cssText = 'position:relative;line-height:0;';

    var cv = this.cv = document.createElement('canvas');
    cv.style.cssText = 'display:block;width:100%;height:auto;';
    el.appendChild(cv);

    if (o.container) {
      var c = typeof o.container === 'string' ? document.querySelector(o.container) : o.container;
      if (c) c.appendChild(el);
    }

    this.target = { x: 0, y: 0 };
    this.cur = { x: 0, y: 0 };
    this.t0 = performance.now();
    this.visible = true;
    this.pageVisible = true;
    this.ready = false;
    this.aspect = 3000 / 4500;
  }

  Furina.prototype.load = function () {
    var self = this;
    return Promise.all([
      fetch(self.o.base + self.o.mesh).then(function (r) {
        if (!r.ok) throw new Error('mesh ' + r.status);
        return r.arrayBuffer();
      }),
      new Promise(function (res, rej) {
        var im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = function () { res(im); };
        im.onerror = function () { rej(new Error('atlas load failed')); };
        im.src = self.o.base + self.o.atlas;
      })
    ]).then(function (res) {
      self.data = parse(res[0]);
      self.img = res[1];
      self.init();
      self.ready = true;
      if (self.o.idle) self.start();
      return self;
    });
  };

  Furina.prototype.init = function () {
    var d = this.data, o = this.o, cv = this.cv;
    this.aspect = d.cw / d.ch;

    var cssW = o.size || cv.clientWidth || 320;
    cv.width = Math.round(cssW * o.dpr);
    cv.height = Math.round(cssW / this.aspect * o.dpr);

    var gl = this.gl = cv.getContext('webgl', {
      alpha: true, premultipliedAlpha: false, antialias: true,
      depth: false, stencil: true
    });
    if (!gl) throw new Error('no webgl');

    var pr = this.pr = gl.createProgram();
    gl.attachShader(pr, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(pr));
    }
    gl.useProgram(pr);

    this.aPos = gl.getAttribLocation(pr, 'aPos');
    this.aUv = gl.getAttribLocation(pr, 'aUv');
    this.aA = gl.getAttribLocation(pr, 'aA');
    gl.enableVertexAttribArray(this.aPos);
    gl.enableVertexAttribArray(this.aUv);
    gl.enableVertexAttribArray(this.aA);

    var uu = this.u = {};
    ['uTime', 'uTilt', 'uBreath', 'uScale', 'uAspect', 'uCenter', 'uNeck', 'uOff', 'uSway', 'uPremul']
      .forEach(function (nm) { uu[nm] = gl.getUniformLocation(pr, nm); });

    /* ---------- 1. 掩码几何：每个掩码体只烘焙一次，交错 [x,y,u,v,a] ---------- */
    var pos = d.pos, uv = d.uv, idx = d.idx, KQ = 32767 / 1.5;
    var mStart = new Int32Array(d.N), mCount = new Int32Array(d.N), mTotal = 0;
    var i, k, io2, c, vi, q = 0, g5;
    for (i = 0; i < d.N; i++) {
      if (!d.maskTarget[i] || d.ic[i] === 0) continue;
      mStart[i] = mTotal; mCount[i] = d.ic[i]; mTotal += d.ic[i];
    }
    var gV = new Float32Array(mTotal * 5);
    for (i = 0; i < d.N; i++) {
      if (!d.maskTarget[i] || d.ic[i] === 0) continue;
      io2 = d.iOff[i]; c = d.ic[i];
      for (k = 0; k < c; k++) {
        vi = (idx[io2 + k] + d.vOff[i]) * 2;
        g5 = q * 5;
        gV[g5] = pos[vi] / KQ;
        gV[g5 + 1] = pos[vi + 1] / KQ;
        gV[g5 + 2] = uv[vi] / 65535;
        gV[g5 + 3] = uv[vi + 1] / 65535;
        gV[g5 + 4] = 1;
        q++;
      }
    }
    this.maskVerts = mTotal;
    this.mStart = mStart;
    this.mCount = mCount;
    this.gv = mkBuf(gl, gV);

    /* ---------- 2. 可见几何 + run 表（rebuild() 时重算这一段） ---------- */
    this.build();

    /* ---------- 5.5 拾取用程序 ---------- */
    var pvs = 'attribute vec2 aPos;uniform float uScale;uniform float uAspect;uniform vec2 uCenter;void main(){vec2 p=aPos-uCenter;p.x*=uAspect;gl_Position=vec4(p*uScale,0.,1.);}';
    var pfs = 'precision mediump float;uniform vec3 uColor;void main(){gl_FragColor=vec4(uColor,1.);}';
    var pp = this.pp = gl.createProgram();
    gl.attachShader(pp, compile(gl, gl.VERTEX_SHADER, pvs));
    gl.attachShader(pp, compile(gl, gl.FRAGMENT_SHADER, pfs));
    gl.linkProgram(pp);
    this.pu = {
      uScale: gl.getUniformLocation(pp, 'uScale'),
      uAspect: gl.getUniformLocation(pp, 'uAspect'),
      uCenter: gl.getUniformLocation(pp, 'uCenter'),
      uColor: gl.getUniformLocation(pp, 'uColor'),
      aPos: gl.getAttribLocation(pp, 'aPos')
    };

    /* ---------- 6. 纹理 ---------- */
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(pr, 'uTex'), 0);

    /* ---------- 7. 取景（边界框由 build() 顺带算出） ---------- */
    var box = this.box, bh = box.h, y0 = box.y0;
    this.base = {
      cx: (box.x0 + box.x1) / 2,
      cy: (box.y0 + box.y1) / 2,
      scale: this.fitScale(box),
      neck: y0 + bh * 0.655,
      neckTop: y0 + bh * 0.735
    };
    this.bbox = box;

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.STENCIL_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clearStencil(0);
    gl.stencilMask(0xFF);

    this.bindFollow();   // onMove 内部自己判断 o.follow，开关随时生效
    this.bindVisibility();
    this.resize();
  };

  /* 重建可见几何：部件筛选 → run 合并 → 交错顶点烘焙 → 边界框。
     重建成本约 30 ms，只在切换 hidePlate 这类结构性选项时调用。 */
  Furina.prototype.build = function () {
    var d = this.data, o = this.o, gl = this.gl;
    var mStart = this.mStart, mCount = this.mCount;
    var n, j, i, k, io2, c, m;

    /* 1. 筛选可见部件 */
    var minA = o.minAlpha == null ? 0.999 : o.minAlpha;
    var hide = new Uint8Array(d.N);
    if (Array.isArray(o.hide)) o.hide.forEach(function (v) { if (v >= 0 && v < d.N) hide[v] = 1; });
    if (o.hidePlate !== false) {
      /* 作者贴在胸口的"仅供娱乐，禁止盈利"告示牌，占住衣物。drawable 984 / 985。 */
      [984, 985].forEach(function (v) { if (v < d.N) hide[v] = 1; });
    }

    var order = [];
    for (k = 0; k < d.N; k++) {
      if (d.ic[k] > 0 && d.op[k] / 255 >= minA && (o.drawMaskTargets || !d.maskTarget[k]) && !hide[k] &&
          (o.maxOrder == null || d.ro[k] <= o.maxOrder)) order.push([d.ro[k], k]);
    }
    var rev = !!o.reverseOrder;
    if (o.sortBy === 'index') {
      order.sort(function (a, b) { return (rev ? -1 : 1) * (a[1] - b[1]); });
    } else {
      order.sort(function (a, b) { return rev ? b[0] - a[0] : a[0] - b[0]; });
    }

    /* 2. 相邻且混合模式 + 掩码集合都相同的部件并成一个 run */
    var runs = [];
    var useB = o.useBlend == null ? 3 : o.useBlend;
    for (n = 0; n < order.length; n++) {
      i = order[n][1];
      var bl = 0;
      if ((useB & 1) && (d.flags[i] & 1)) bl = 1;
      else if ((useB & 2) && (d.flags[i] & 2)) bl = 2;
      var key = bl + '|' + d.masks[i].join(',');
      var last = runs[runs.length - 1];
      if (last && last.key === key) last.items.push(i);
      else runs.push({ key: key, blend: bl, masks: d.masks[i].slice(), items: [i] });
    }

    /* 3. 展开成非索引三角流，交错 [x, y, u, v, a] / 20 字节 */
    var pos = d.pos, uv = d.uv, idx = d.idx, KQ = 32767 / 1.5;
    var total = 0, p = 0;
    for (n = 0; n < runs.length; n++) {
      for (j = 0; j < runs[n].items.length; j++) total += d.ic[runs[n].items[j]];
    }
    var bV = new Float32Array(total * 5);
    var itemStart = [], itemCount = [], itemId = [];

    for (n = 0; n < runs.length; n++) {
      var run = runs[n];
      run.v0 = p; run.itemPos = [];
      for (j = 0; j < run.items.length; j++) {
        i = run.items[j];
        run.itemPos.push(p); itemStart.push(p); itemId.push(i);
        io2 = d.iOff[i]; c = d.ic[i];
        var av = o.flat ? 1 : d.op[i] / 255;
        for (k = 0; k < c; k++) {
          var vi = (idx[io2 + k] + d.vOff[i]) * 2, b5 = p * 5;
          bV[b5] = pos[vi] / KQ;
          bV[b5 + 1] = pos[vi + 1] / KQ;
          bV[b5 + 2] = uv[vi] / 65535;
          bV[b5 + 3] = uv[vi + 1] / 65535;
          bV[b5 + 4] = av;
          p++;
        }
      }
      run.vn = p - run.v0;
      for (j = 0; j < run.itemPos.length; j++) {
        itemCount.push((j + 1 < run.itemPos.length ? run.itemPos[j + 1] : (run.v0 + run.vn)) - run.itemPos[j]);
      }
    }

    this.itemStart = new Int32Array(itemStart);
    this.itemCount = new Int32Array(itemCount);
    this.itemId = new Int32Array(itemId);
    this.vertCount = total;

    if (this.bv) gl.deleteBuffer(this.bv);
    this.bv = mkBuf(gl, bV);

    /* 4. run 表 */
    var rc = runs.length;
    this.runV0 = new Int32Array(rc);
    this.runVN = new Int32Array(rc);
    this.runMaskOff = new Int32Array(rc + 1);
    this.runBlend = new Uint8Array(rc);
    var maskRef = [], maskCnt = 0;
    for (n = 0; n < rc; n++) {
      this.runV0[n] = runs[n].v0;
      this.runVN[n] = runs[n].vn;
      this.runMaskOff[n] = maskCnt;
      this.runBlend[n] = runs[n].blend;
      for (j = 0; j < runs[n].masks.length; j++) {
        m = runs[n].masks[j];
        if (m < d.N && mCount[m] > 0) { maskRef.push(mStart[m], mCount[m]); maskCnt++; }
      }
    }
    this.runMaskOff[rc] = maskCnt;
    this.maskRef = new Int32Array(maskRef);

    /* 5. 可见几何的边界框（取景用） */
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (n = 0; n < total; n++) {
      var x = bV[n * 5], y = bV[n * 5 + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (total === 0) { x0 = y0 = 0; x1 = 3000; y1 = 4500; }
    this.box = { x0: x0, x1: x1, y0: y0, y1: y1, w: x1 - x0, h: y1 - y0 };
    return this;
  };

  /* 让 bbox 在长、宽两个方向都装进画布 92%，取更紧的那个。
     注意 x 轴乘过 uAspect（= h/w），所以宽度的画布占用要按 bw * h / w 算。 */
  Furina.prototype.fitScale = function (box) {
    var uA = 1 / (this.aspect || 0.6667);
    return Math.min(1.84 / box.h, 1.84 / (box.w * uA));
  };

  Furina.prototype.rebuild = function () {
    this.build();
    var box = this.box;
    this.base.scale = this.fitScale(box);
    this.base.cx = (box.x0 + box.x1) / 2;
    this.base.cy = (box.y0 + box.y1) / 2;
    if (this.o.idle) this.draw(performance.now());
    return this;
  };

  Furina.prototype.resize = function () {
    var r = this.el.getBoundingClientRect();
    var dpr = this.o.dpr;
    var w = Math.max(1, Math.round((r.width || this.o.size) * dpr));
    var h = Math.max(1, Math.round(w / this.aspect));
    if (this.cv.width !== w || this.cv.height !== h) {
      this.cv.width = w;
      this.cv.height = h;
    }
    this.cv.style.aspectRatio = String(this.aspect);
  };

  Furina.prototype.bindFollow = function () {
    var self = this;
    this.onMove = function (e) {
      if (!self.o.follow) return;
      var r = self.el.getBoundingClientRect();
      if (!r.width) return;
      var cx = r.left + r.width / 2, cy = r.top + r.height * 0.30;
      var dx = (e.clientX - cx) / Math.max(260, global.innerWidth * 0.45);
      var dy = (e.clientY - cy) / Math.max(260, global.innerHeight * 0.45);
      self.target.x = Math.max(-1, Math.min(1, dx));
      self.target.y = Math.max(-1, Math.min(1, dy));
    };
    this.onLeave = function () { self.target.x = 0; self.target.y = 0; };
    global.addEventListener('mousemove', this.onMove, { passive: true });
    document.addEventListener('mouseleave', this.onLeave);
  };

  Furina.prototype.bindVisibility = function () {
    var self = this;
    if ('IntersectionObserver' in global) {
      this.io = new IntersectionObserver(function (es) {
        self.visible = es[0].isIntersecting;
      }, { threshold: 0 });
      this.io.observe(this.el);
    }
    document.addEventListener('visibilitychange', function () {
      self.pageVisible = !document.hidden;
    });
    var rt;
    global.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { self.resize(); }, 150);
    });
  };

  Furina.prototype.start = function () {
    var self = this;
    function frame(t) {
      self.raf = requestAnimationFrame(frame);
      if (self.visible === false || self.pageVisible === false) return;
      self.draw(t);
    }
    this.raf = requestAnimationFrame(frame);
  };

  Furina.prototype.drawPick = function () {
    var gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    gl.useProgram(this.pp);
    var b = this.base;
    gl.uniform1f(this.pu.uScale, b.scale);
    gl.uniform1f(this.pu.uAspect, this.cv.height / this.cv.width);
    gl.uniform2f(this.pu.uCenter, b.cx, b.cy);
    gl.disableVertexAttribArray(this.aUv);
    gl.disableVertexAttribArray(this.aA);
    gl.enableVertexAttribArray(this.pu.aPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bv);
    gl.vertexAttribPointer(this.pu.aPos, 2, gl.FLOAT, false, 20, 0);
    for (var n = 0; n < this.itemId.length; n++) {
      var id = this.itemId[n];
      gl.uniform3f(this.pu.uColor, ((id % 32) + 0.5) / 32, (Math.floor(id / 32) % 32 + 0.5) / 32, 1);
      gl.drawArrays(gl.TRIANGLES, this.itemStart[n], this.itemCount[n]);
    }
  };

  Furina.prototype.draw = function (t) {
    var gl = this.gl, u = this.u, b = this.base;
    if (!gl || gl.isContextLost()) return;

    var dt = Math.min(0.05, (t - (this.last || t)) / 1000);
    this.last = t;
    var time = (t - this.t0) / 1000;
    var e = 1 - Math.exp(-dt * 5);
    this.cur.x += (this.target.x - this.cur.x) * e;
    this.cur.y += (this.target.y - this.cur.y) * e;

    if (this.cv.width !== Math.round((this.cv.clientWidth || this.o.size) * this.o.dpr)) this.resize();
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    var idle = this.o.idle !== false;
    var breath = idle ? 1 + Math.sin(time * 1.35) * 0.007 : 1;

    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uTilt, -this.cur.x * 0.105);
    gl.uniform1f(u.uBreath, breath);
    gl.uniform1f(u.uScale, b.scale * breath);
    gl.uniform1f(u.uAspect, this.cv.height / this.cv.width);
    gl.uniform2f(u.uCenter, b.cx, b.cy);
    gl.uniform2f(u.uNeck, b.neck, b.neckTop);
    gl.uniform2f(u.uOff, this.cur.x * 0.015, -this.cur.y * 0.010);
    gl.uniform2f(u.uSway, idle ? 0.0035 : 0, idle ? 0.0018 : 0);

    var AP = this.aPos, AU = this.aUv, AA = this.aA, BUF = this.bv;
    var rc = this.runV0.length;

    /* 主几何只有一个 ARRAY_BUFFER，属性指针在这里设一次就够；
       掩码阶段会临时切到 gv，切换后调用 bindMain() 复位。 */
    function bindMain() {
      gl.enableVertexAttribArray(AP);
      gl.enableVertexAttribArray(AU);
      gl.enableVertexAttribArray(AA);
      gl.bindBuffer(gl.ARRAY_BUFFER, BUF);
      gl.vertexAttribPointer(AP, 2, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(AU, 2, gl.FLOAT, false, 20, 8);
      gl.vertexAttribPointer(AA, 1, gl.FLOAT, false, 20, 16);
    }
    bindMain();

    for (var n = 0; n < rc; n++) {
      var m0 = this.runMaskOff[n], m1 = this.runMaskOff[n + 1], r;
      var masked = !!(this.o.clip && m1 > m0);
      if (!masked) { m0 = m1 = 0; }
      if (masked) {
        /* 掩码阶段：只写模板，不写颜色 */
        gl.clear(gl.STENCIL_BUFFER_BIT);
        gl.colorMask(false, false, false, false);
        gl.stencilFunc(gl.ALWAYS, 0, 0xFF);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
      gl.disableVertexAttribArray(AA);
      gl.vertexAttrib1f(AA, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gv);
      gl.vertexAttribPointer(AP, 2, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(AU, 2, gl.FLOAT, false, 20, 8);
      if (this.o.debugMask) {
        gl.colorMask(true, true, true, true);
        for (r = 0; r < this.maskRef.length / 2; r++) {
          gl.drawArrays(gl.TRIANGLES, this.maskRef[r * 2], this.maskRef[r * 2 + 1]);
        }
        bindMain();
        continue;
      }
      for (r = m0; r < m1; r++) {
          gl.drawArrays(gl.TRIANGLES, this.maskRef[r * 2], this.maskRef[r * 2 + 1]);
        }
        gl.colorMask(true, true, true, true);
        gl.stencilFunc(gl.NOTEQUAL, 0, 0xFF);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      } else {
        gl.stencilFunc(gl.ALWAYS, 0, 0xFF);
      }

      /* 可见几何 */
      var bl2 = this.runBlend[n];
      if (bl2 !== this._bl) {
        if (bl2 === 0) {
          gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          gl.uniform1f(u.uPremul, 0);
        } else if (bl2 === 1) {
          gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
          gl.uniform1f(u.uPremul, 1);
        } else {
          gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
          gl.uniform1f(u.uPremul, 1);
        }
        this._bl = bl2;
      }
      if (masked) bindMain();
      gl.drawArrays(gl.TRIANGLES, this.runV0[n], this.runVN[n]);
    }
  };

  Furina.prototype.destroy = function () {
    cancelAnimationFrame(this.raf);
    if (this.io) this.io.disconnect();
    if (this.onMove) global.removeEventListener('mousemove', this.onMove);
    if (this.onLeave) document.removeEventListener('mouseleave', this.onLeave);
    var gl = this.gl;
    if (gl) {
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  };

  function mount(container, opts) {
    return new Furina(Object.assign({ container: container }, opts || {})).load();
  }

  global.FurinaMini = { mount: mount, version: '2.0.0' };
})(window);
