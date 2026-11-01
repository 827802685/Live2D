/*!
 * FurinaMini 2.0 — 从 moc3 提取的轻量 Live2D 模型（零 Cubism Core 依赖，零运行时依赖）
 *
 * 数据：furina-mesh.bin（1.32 MB，int16 量化，含裁剪掩码表）+ furina-atlas.webp（724 KB）
 * 渲染：按原始绘制顺序烘焙成非索引三角流；模板缓冲实现裁剪掩码，还原眼睛/衣摆遮挡
 * 动画：呼吸 / 视线跟随 / 头部倾转 / 发丝摆动 / 裙摆飘动 / 体态摇曳 / 呆毛弹簧物理，
 *       全部在顶点着色器内完成
 */
(function (global) {
  'use strict';

  var VS = [
    'attribute vec2 aPos;',
    'attribute vec2 aUv;',
    'attribute float aA;',
    // 多帧以「相对基准姿势的位移」存储：aBlink 是闭眼位移，aExpr 是表情位移。
    // 位移相加即可叠加（眨眼只动眼睛、表情只动嘴眉），不会互相覆盖。
    'attribute vec2 aBlink;',
    'attribute vec2 aExpr;',
    'uniform float uTime, uTilt, uBreath, uScale, uAspect, uBlink, uExpr, uAMul, uAhoA, uBody, uHip;',
    'uniform vec2 uCenter, uNeck, uOff, uSway, uSkirt, uSkirtAmp, uHalf, uAhoP, uGaze;',
    'uniform vec4 uAho, uEye;',
    'varying vec2 vUv;',
    'varying float vA;',
    'void main(){',
    '  vUv = aUv;',
    '  vA = aA * uAMul;',
    // 1. 先叠加表情位移
    '  vec2 p = aPos + aBlink * uBlink + aExpr * uExpr;',
    '  p -= uCenter;',
    // clip 空间是非等比的：x 方向要先乘 h/w，才能让两个轴的像素密度一致
    '  p.x *= uAspect;',
    '  p *= uScale;',
    // 头部权重：脖子以上逐渐接管（体态旋转和呆毛都要用到，提前算）
    '  float w = smoothstep(uNeck.x, uNeck.y, aPos.y);',
    // 呆毛弹簧：帽子左上那撮悬浮卷发绕根部小幅摆动（模型空间，之后整体跟随头/身运动）
    '  float ah = smoothstep(uAho.x - 0.006, uAho.x + 0.006, aPos.x) * smoothstep(uAho.z + 0.006, uAho.z - 0.006, aPos.x)',
    '           * smoothstep(uAho.y - 0.006, uAho.y + 0.006, aPos.y) * smoothstep(uAho.w + 0.006, uAho.w - 0.006, aPos.y);',
    '  vec2 ad = p - uAhoP;',
    '  float aa = uAhoA * ah;',
    '  p = uAhoP + vec2(ad.x * cos(aa) - ad.y * sin(aa), ad.x * sin(aa) + ad.y * cos(aa));',
    // 体态摇曳：髋部以上整体缓慢倾斜，腿保持 planted
    '  float hipY = (uHip - uCenter.y) * uScale;',
    '  float wb = smoothstep(uHip - 0.08, uHip + 0.08, aPos.y);',
    '  float ab = uBody * wb;',
    '  vec2 hd = vec2(p.x, p.y - hipY);',
    '  p = vec2(hd.x * cos(ab) - hd.y * sin(ab), hipY + hd.x * sin(ab) + hd.y * cos(ab));',
    // 呼吸：只在胸腔做局部起伏，不动整体尺寸（否则整只模型会「一胀一缩」）
    '  float chest = smoothstep(uNeck.x - 0.42, uNeck.x - 0.06, aPos.y)',
    '              * (1.0 - smoothstep(uNeck.x - 0.04, uNeck.x + 0.10, aPos.y));',
    '  float br = uBreath - 1.0;',
    '  p.x *= 1.0 + br * 1.5 * chest;',
    '  p.y += br * 0.55 * (0.35 + 0.65 * chest);',
    // 呼吸相位 -1..1（idle 关闭时 uBreath 恒 1 → 相位恒 0）
    '  float bph = clamp(br / 0.007, -1.0, 1.0);',
    // 头部以脖子为轴倾转（w 已在前面算好）
    '  float neckY = (uNeck.x - uCenter.y) * uScale;',
    // 以脖子为轴倾转头部
    '  float a = uTilt * w;',
    '  float s = sin(a), c = cos(a);',
    '  vec2 d = vec2(p.x, p.y - neckY);',
    '  p = vec2(d.x * c - d.y * s, neckY + d.x * s + d.y * c);',
    // 眼球看向：眼部区域的顶点随视线方向整体小幅平移（边缘 smoothstep 羽化不撕裂脸）
    '  float ew = smoothstep(uEye.x - 0.05, uEye.x + 0.06, aPos.x) * smoothstep(uEye.z + 0.05, uEye.z - 0.06, aPos.x)',
    '           * smoothstep(uEye.y - 0.03, uEye.y + 0.05, aPos.y) * smoothstep(uEye.w + 0.03, uEye.w - 0.05, aPos.y);',
    '  p += uGaze * 0.013 * ew;',
    // 发丝摆动：越靠上越明显
    '  float lag = sin(uTime * 1.7 - aPos.y * 2.6) * 0.5 + sin(uTime * 0.9 + aPos.x * 3.1) * 0.5;',
    '  p.x += lag * uSway.x * (0.35 + 0.65 * w) * (0.5 + 0.5 * abs(p.x));',
    '  p.y += lag * uSway.y * 0.4;',
    // 裙摆飘动：只作用在腰线以下的「裙幅」上。
    // 腿在中间（|x-中线| < 1.3×halfW）完全不动；裙幅/大衣下摆在两侧才飘，
    // 并且只对裙摆下摆以上的中带做渐隐（大衣垂摆延伸更低，不受下摆限制）。
    '  float skY = clamp((uSkirt.x - aPos.y) / (uSkirt.x - uSkirt.y), 0.0, 1.0);',
    '  float sideF = abs(aPos.x - uCenter.x) / uHalf.x;',
    '  float drape = smoothstep(1.30, 1.90, sideF);',
    '  float hem = mix(smoothstep(uSkirt.y - 0.045, uSkirt.y + 0.025, aPos.y), 1.0, drape);',
    '  float sk = skY * hem * drape;',
    '  float ph = uTime * 1.35;',
    '  float s1 = sin(ph - aPos.y * 7.0 + aPos.x * 2.0);',
    '  float s2 = sin(ph * 0.53 + 2.1 - aPos.y * 3.5);',
    '  p.x += (s1 * 0.72 + s2 * 0.28) * uSkirtAmp.x * sk;',
    '  p.y += sin(ph - aPos.y * 7.0 + 2.2) * uSkirtAmp.y * sk;',
    // 裙尾随呼吸轻摆：吸气（bph>0）向观众左侧偏，呼气回来
    '  p.x += bph * 0.012 * sk;',
    // 右臂（画面左侧）随呼吸轻抬：胸口扩张 → 肩带手臂微微上浮
    '  float armW = (1.0 - smoothstep(uNeck.x - 0.02, uNeck.y, aPos.y))',
    '             * smoothstep(uHip - 0.05, uHip + 0.06, aPos.y)',
    '             * smoothstep(0.55, 0.85, (uCenter.x - aPos.x) / uHalf.x);',
    '  p.y += bph * 0.009 * armW;',
    '  p.x -= bph * 0.005 * armW;',
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

  /* 精简版顶点着色器：低性能档（L≥3）切换用。
     每帧约 35 万顶点跑 VS，full 版每顶点 8 个 sin + 8 个 smoothstep，
     低端 GPU 顶点着色器是最大 ALU 开销；精简版砍掉裙摆/发丝摆动/呆毛弹簧/
     眼球位移/胸腔呼吸，保留眨眼、表情、头部倾转、体态摇曳、整体呼吸。
     attribute 位置用 bindAttribLocation 固定，与 full 版完全同布局，切换零成本。 */
  var VS_LITE = [
    'attribute vec2 aPos;',
    'attribute vec2 aUv;',
    'attribute float aA;',
    'attribute vec2 aBlink;',
    'attribute vec2 aExpr;',
    'uniform float uTilt, uBreath, uScale, uAspect, uBlink, uExpr, uAMul, uBody, uHip;',
    'uniform vec2 uCenter, uNeck, uOff;',
    'varying vec2 vUv;',
    'varying float vA;',
    'void main(){',
    '  vUv = aUv;',
    '  vA = aA * uAMul;',
    '  vec2 p = aPos + aBlink * uBlink + aExpr * uExpr;',
    '  p -= uCenter;',
    '  p.x *= uAspect;',
    '  p *= uScale;',
    // 体态摇曳（保留：这是「像真人」的最低限动作）
    '  float hipY = (uHip - uCenter.y) * uScale;',
    '  float wb = smoothstep(uHip - 0.08, uHip + 0.08, aPos.y);',
    '  float ab = uBody * wb;',
    '  vec2 hd = vec2(p.x, p.y - hipY);',
    '  p = vec2(hd.x * cos(ab) - hd.y * sin(ab), hipY + hd.x * sin(ab) + hd.y * cos(ab));',
    // 呼吸：只保留整体小幅升降（胸腔扩张与裙尾摆动省略）
    '  p.y += (uBreath - 1.0) * 0.19;',
    // 头部倾转
    '  float w = smoothstep(uNeck.x, uNeck.y, aPos.y);',
    '  float a = uTilt * w;',
    '  float s = sin(a), c = cos(a);',
    '  vec2 d = vec2(p.x, p.y - (uNeck.x - uCenter.y) * uScale);',
    '  p = vec2(d.x * c - d.y * s, (uNeck.x - uCenter.y) * uScale + d.x * s + d.y * c);',
    // 鼠标跟随
    '  p += uOff * (0.35 + 0.65 * w);',
    '  gl_Position = vec4(p, 0.0, 1.0);',
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
    if (magic !== 'FUR1' && magic !== 'FUR2' && magic !== 'FUR3' && magic !== 'FUR4') throw new Error('bad magic ' + magic);
    var hasFlags = magic !== 'FUR1';
    var o = 4;
    var N = dv.getUint32(o, true); o += 4;
    var vTot = dv.getUint32(o, true); o += 4;
    var iTot = dv.getUint32(o, true); o += 4;
    var cw = dv.getFloat32(o, true); o += 4;
    var ch = dv.getFloat32(o, true); o += 4;
    var sy = dv.getFloat32(o, true); o += 4;
    var frameCount = dv.getUint32(o, true); o += 4;     // FUR3 才有值

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

    /* FUR3 动画扩展：K 帧 × M 个动态 drawable 的顶点绝对位置（int16） */
    var dynSet = null, anim = null, dynSrcOff = null, K = 0;
    if (frameCount > 0) {
      var o2 = idxOff + iTot * 2;
      K = dv.getUint8(o2); o2 += 1;
      var M = dv.getUint16(o2, true); o2 += 2;
      dynSet = new Uint8Array(N);
      dynSrcOff = new Uint32Array(N);
      var dynVerts = 0, di;
      for (i = 0; i < M; i++) {
        di = dv.getUint16(o2, true); o2 += 2;
        dynSet[di] = 1;
        dynSrcOff[di] = dynVerts;
        dynVerts += vc[di];
      }
      /* 源数据可能起始于奇数字节，逐项读，避免 Int16Array 对齐限制 */
      anim = new Int16Array(K * dynVerts * 2);
      for (var q2 = 0; q2 < anim.length; q2++) anim[q2] = dv.getInt16(o2 + q2 * 2, true);
      dynSet.dynVerts = dynVerts;
      o2 += anim.length * 2;
    }

    /* FUR4 尾块：每帧的部件不透明度覆盖（腮红/嘴型贴图这类「靠透明度切换」的表情） */
    var opOver = null;
    if (frameCount > 0 && magic === 'FUR4' && o2 + 1 <= buf.byteLength && dv.getUint8(o2) === 1) {
      o2 += 1;
      opOver = new Array(K);
      for (var f9 = 0; f9 < K; f9++) {
        var cnt9 = dv.getUint16(o2, true); o2 += 2;
        if (cnt9) {
          var mm9 = new Map();
          for (var k15 = 0; k15 < cnt9; k15++) {
            var di9 = dv.getUint16(o2, true); o2 += 2;
            mm9.set(di9, dv.getUint8(o2)); o2 += 1;
          }
          opOver[f9] = mm9;
        }
      }
    }

    return {
      N: N, vTot: vTot, iTot: iTot, cw: cw, ch: ch, sy: sy,
      vc: vc, ic: ic, ro: ro, op: op, flags: flags, vOff: vOff, iOff: iOff,
      masks: masks, maskTarget: maskTarget,
      pos: new Int16Array(buf, posOff, vTot * 2),
      uv: new Uint16Array(buf, uvOff, vTot * 2),
      idx: new Uint16Array(buf, idxOff, iTot),
      frames: K, dynSet: dynSet, dynSrcOff: dynSrcOff, anim: anim, opOver: opOver
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
      dpr: Math.min(global.devicePixelRatio || 1, 2),   // 上限 2：retina 已够清晰，3 的像素量贵 44%
      maxPixels: 3200000,  // 画布总像素上限，超了自动降 dpr，避免手机 GPU 吃力
      draggable: true,     // 可以按住拖动，双击回到原位
      mesh: 'furina-mesh.bin',
      atlas: 'furina-atlas.webp',
      base: '',            // 资源前缀，例如 './dist/'
      hide: null,          // 额外隐藏的 drawable 下标
      minAlpha: 0.999,     // 低于该不透明度的部件视为过渡态残留，不绘制
      clip: true,          // 是否启用模板缓冲裁剪（还原眼睛/贴片的遮罩）
      flat: false,         // true = 忽略 moc 里遗留的半透明度，一律按不透明绘制
      useBlend: 3,         // 位掩码：1=启用加算 2=启用正片叠底
      drawMaskTargets: true, // 遮罩体本身也要绘制（Cubism 的 mask 是"被谁裁剪"，不是"不画"）
      frames: null,        // 帧名表，用于 setExpression('smile') 这类字符串调用
      hidePlate: true,     // 隐藏作者在胸口贴的声明牌（drawable 984/985），设 false 可还原
      autoExpr: true,      // 空闲时自动换表情/瞟视线
      autoExprList: null,  // 自动表情的帧索引池，默认 [5,6,10,1,2,3,4,5,8]
      wand: true,          // 权杖贴图层（原模型没有权杖网格，用官方立绘抠图叠加）
      wandTex: 'furina-wand.webp',
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
    var self = this, o = self.o;
    self._p = {};

    /* 进度汇总：mesh / atlas / wand 三个文件的 (received, total) 累加后回调 */
    function prog(name, total, got) {
      self._p[name] = [Math.min(got, total || got), total || got];
      if (!o.progress) return;
      var g = 0, t = 0, k;
      for (k in self._p) { g += self._p[k][0]; t += self._p[k][1]; }
      try { o.progress(g, t); } catch (e) {}
    }
    /* 流式 fetch：边收边报进度（content-length 是 gzip 传输大小，
       reader 读到的是解压后字节，用 min 钳制保证百分比不超 100） */
    function fetchBuf(url, name) {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error(name + ' ' + r.status);
        var len = +(r.headers.get('content-length') || 0);
        if (!r.body || !r.body.getReader || !len) {
          return r.arrayBuffer().then(function (b) { prog(name, b.byteLength, b.byteLength); return b; });
        }
        var rd = r.body.getReader(), parts = [], got = 0;
        function pump() {
          return rd.read().then(function (x) {
            if (x.done) {
              var b = new Uint8Array(got), off = 0;
              for (var i = 0; i < parts.length; i++) { b.set(parts[i], off); off += parts[i].length; }
              prog(name, len, got);
              return b.buffer;
            }
            parts.push(x.value); got += x.value.length; prog(name, len, got);
            return pump();
          });
        }
        return pump();
      });
    }
    function fetchImg(url, name) {
      return fetchBuf(url, name).then(function (buf) {
        return new Promise(function (res, rej) {
          var im = new Image();
          im.onload = function () { res(im); };
          im.onerror = function () { rej(new Error(name + ' decode failed')); };
          im.src = URL.createObjectURL(new Blob([buf]));
        });
      });
    }

    /* 资源 URL 缓存穿透：o.ver 存在时附加版本参数，
       让 CDN（jsDelivr @master 有 ~12h 边缘缓存）在新版本发布后立即回源 */
    function u2(p) {
      return o.ver ? p + (p.indexOf('?') < 0 ? '?' : '&') + 'v=' + o.ver : p;
    }

    return Promise.all([
      fetchBuf(u2(o.base + o.mesh), 'mesh'),
      fetchImg(u2(o.base + o.atlas), 'atlas'),
      /* 权杖贴图：加载失败不阻塞主模型（wand 图层只是可选叠加） */
      o.wand === false
        ? Promise.resolve(null)
        : fetchImg(u2(o.base + (o.wandTex || 'furina-wand.webp')), 'wand').catch(function () { return null; })
    ]).then(function (res) {
      self.data = parse(res[0]);
      self.img = res[1];
      self.wandImg = res[2];
      self.init();
      self.ready = true;
      if (self.o.idle) self.start();
      return self;
    });
  };

  /* 画布像素尺寸：按 CSS 宽 × dpr，超过 maxPixels 就整体等比缩小，
     保证高分屏够锐、低端机也不至于被填充率拖死。 */
  Furina.prototype.pixelSize = function (cssW) {
    var dpr = this.o.dpr || 1;
    var w = Math.max(1, cssW * dpr * (this.q || 1)), h = w / (this.aspect || 0.6667);
    var cap = this.o.maxPixels || 3200000;
    if (w * h > cap) {
      var k = Math.sqrt(cap / (w * h));
      w *= k; h *= k;
    }
    return [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))];
  };

  Furina.prototype.init = function () {
    var d = this.data, o = this.o, cv = this.cv;
    this.aspect = d.cw / d.ch;

    var cssW = o.size || cv.clientWidth || 320;
    var px = this.pixelSize(cssW);
    cv.width = px[0];
    cv.height = px[1];

    var gl = this.gl = cv.getContext('webgl', {
      alpha: true, premultipliedAlpha: false,
      /* MSAA 关闭：模型边缘走纹理 alpha+预乘混合抗锯齿，MSAA 对 discard 边缘无效，
         白白多吃一次全屏多重采样（低端 GPU 上是每帧最大的固定开销之一） */
      antialias: false, depth: false, stencil: true,
      powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('no webgl');

    var pr = this.pr = gl.createProgram();
    gl.attachShader(pr, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, compile(gl, gl.FRAGMENT_SHADER, FS));
    /* attribute 位置固定 0-4：精简版 shader 与 full 版同布局，切换 program 后
       顶点指针无需重设；pick/wand 两个小 program 各自独立绑定 */
    gl.bindAttribLocation(pr, 0, 'aPos');
    gl.bindAttribLocation(pr, 1, 'aUv');
    gl.bindAttribLocation(pr, 2, 'aA');
    gl.bindAttribLocation(pr, 3, 'aBlink');
    gl.bindAttribLocation(pr, 4, 'aExpr');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(pr));
    }
    gl.useProgram(pr);

    this.aPos = gl.getAttribLocation(pr, 'aPos');
    this.aUv = gl.getAttribLocation(pr, 'aUv');
    this.aA = gl.getAttribLocation(pr, 'aA');
    this.aBlink = gl.getAttribLocation(pr, 'aBlink');
    this.aExpr = gl.getAttribLocation(pr, 'aExpr');
    gl.enableVertexAttribArray(this.aPos);
    gl.enableVertexAttribArray(this.aUv);
    gl.enableVertexAttribArray(this.aA);

    var uu = this.u = {};
    ['uTime', 'uTilt', 'uBreath', 'uScale', 'uAspect', 'uCenter', 'uNeck', 'uOff', 'uSway',
     'uSkirt', 'uSkirtAmp', 'uHalf', 'uPremul', 'uBlink', 'uExpr', 'uAMul',
     'uAho', 'uAhoP', 'uAhoA', 'uBody', 'uHip', 'uEye', 'uGaze']
      .forEach(function (nm) { uu[nm] = gl.getUniformLocation(pr, nm); });
    this.uFull = uu;   // full 版 uniform 表（切精简版后切回时要还原）
    this._curMain = pr;  // 当前主渲染 program（full 或精简版）
    /* 精简版 program 懒编译：applyPerf 首次降到 L≥3 才创建，正常机器零开销 */
    this._litePr = null;

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
    /* 每个掩码体的静态包围盒（模型空间）——渲染时用它把模板清屏/遮罩绘制
       裁剪到屏幕上的小块，代替全屏 stencil clear（低端 GPU 省一大截带宽） */
    var mBox = new Float32Array(d.N * 4);
    for (i = 0; i < d.N; i++) {
      if (!d.maskTarget[i] || d.ic[i] === 0) continue;
      var bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      for (k = 0; k < d.ic[i]; k++) {
        var qx = gV[(mStart[i] + k) * 5], qy = gV[(mStart[i] + k) * 5 + 1];
        if (qx < bx0) bx0 = qx; if (qx > bx1) bx1 = qx;
        if (qy < by0) by0 = qy; if (qy > by1) by1 = qy;
      }
      mBox[i * 4] = bx0; mBox[i * 4 + 1] = by0; mBox[i * 4 + 2] = bx1; mBox[i * 4 + 3] = by1;
    }
    this.maskBox = mBox;
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
    var tex = this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); if (o.nearest) { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(pr, 'uTex'), 0);

    /* 低清图集（1024²）：低性能档切换用。
       2048² RGBA 在 GPU 上占 16MB 显存、每次采样带宽也是它的 4 倍，
       低端 GPU 上纹理带宽是填充率之外的第二大开支；1024² 只要 4MB。
       画质损失在半分辨率渲染下基本不可见。 */
    if (o.lowresAtlas !== false) {
      try {
        var lc = document.createElement('canvas');
        lc.width = lc.height = 1024;
        lc.getContext('2d').drawImage(this.img, 0, 0, 1024, 1024);
        this.imgLow = lc;
      } catch (e) { this.imgLow = null; }
    }
    this._texLow = false;

    /* ---------- 6.5 权杖贴图层：独立小 program + 一个 quad ---------- */
    if (this.wandImg && o.wand !== false) {
      var wvs = 'attribute vec2 aPos;attribute vec2 aUv;'
        + 'uniform vec2 uCenter,uOff,uWPos,uPiv;'
        + 'uniform float uScale,uAspect,uRot,uWH;'
        + 'varying vec2 vUv;'
        + 'void main(){vUv=aUv;'
        + 'vec2 p=aPos*vec2(uWH*0.0758,uWH*0.5)-uPiv;'   // 半宽按图 97:640 比例
        + 'float c=cos(uRot),s=sin(uRot);'
        + 'p=vec2(p.x*c-p.y*s,p.x*s+p.y*c)+uWPos;'
        + 'p-=uCenter;p.x*=uAspect;p*=uScale;p+=uOff;'
        + 'gl_Position=vec4(p,0.,1.);}';
      var wfs = 'precision mediump float;varying vec2 vUv;'
        + 'uniform sampler2D uTex;uniform float uAlpha;'
        + 'void main(){vec4 c=texture2D(uTex,vUv);gl_FragColor=vec4(c.rgb,c.a*uAlpha);}';
      var wpr = gl.createProgram();
      gl.attachShader(wpr, compile(gl, gl.VERTEX_SHADER, wvs));
      gl.attachShader(wpr, compile(gl, gl.FRAGMENT_SHADER, wfs));
      gl.linkProgram(wpr);
      this.wp = wpr;
      var wu = this.wu = {};
      ['uCenter', 'uOff', 'uWPos', 'uPiv', 'uScale', 'uAspect', 'uRot', 'uWH', 'uTex', 'uAlpha']
        .forEach(function (nm) { wu[nm] = gl.getUniformLocation(wpr, nm); });
      wu.aPos = gl.getAttribLocation(wpr, 'aPos');
      wu.aUv = gl.getAttribLocation(wpr, 'aUv');
      var wb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, wb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 0, 0, 1, -1, 1, 0, 1, 1, 1, 1,
        -1, -1, 0, 0, 1, 1, 1, 1, -1, 1, 0, 1
      ]), gl.STATIC_DRAW);
      this.wbuf = wb;
      var wt = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, wt);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.wandImg);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);   // 必须还原，否则 resize 重传图集会上下颠倒
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.wtex = wt;
      this.wandA = 0; this.wandV = 0;
      this.wandBase = 0.41;   /* 基础倾角 23.5°，与旧版立绘抠图一致 */
    }

    /* ---------- 7. 取景（边界框由 build() 顺带算出） ---------- */
    var box = this.box, bh = box.h, y0 = box.y0;
    var x0c = (box.x0 + box.x1) / 2, yc0 = (box.y0 + box.y1) / 2, bw = box.w;
    this.base = {
      cx: (box.x0 + box.x1) / 2,
      cy: (box.y0 + box.y1) / 2,
      scale: this.fitScale(box),
      neck: y0 + bh * 0.655,
      neckTop: y0 + bh * 0.735,
      /* 裙摆飘动的作用区间：腰线 → 裙摆下摆（腿从下摆以下露出，不再参与摆动） */
      skirtTop: y0 + bh * 0.58,
      skirtBottom: y0 + bh * 0.33,
      /* 体态摇曳的旋转轴：髋部 */
      hip: y0 + bh * 0.37,
      halfW: Math.max(0.08, box.w * 0.30),
      /* 眼部区域（眼球看向位移的作用范围）：脖子以上、头部中段 */
      eyeX0: x0c - bw * 0.17, eyeX1: x0c + bw * 0.17,
      eyeY0: y0 + bh * 0.735, eyeY1: y0 + bh * 0.86
    };
    this.bbox = box;

    /* 权杖默认落位：背在模型身后，杖头从左肩后露出，杖高约为模型高的 58% */
    if (this.wp) {
      this.wandWH = bh * 0.58;
      this.wandPos = [x0c - bw * 0.10, yc0];
      this.wandPos0 = this.wandPos.slice();
      this.wandPiv = [0, -0.72];
    }

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.STENCIL_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clearStencil(0);
    gl.stencilMask(0xFF);

    this.bindFollow();   // onMove 内部自己判断 o.follow，开关随时生效
    this.bindDrag();
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

    /* 被「不透明度覆盖」命中的部件集合：含默认透明、仅表情时显示的贴片（腮红/眼泪等） */
    var covered = null;
    if (d.opOver) {
      covered = new Set();
      d.opOver.forEach(function (mm) { if (mm) mm.forEach(function (v, k) { covered.add(k); }); });
    }
    this.coveredSet = covered;

    var order = [];
    var visMark = new Uint8Array(d.N);
    for (k = 0; k < d.N; k++) {
      var vis = d.ic[k] > 0 && (d.op[k] / 255 >= minA || (covered && covered.has(k)))
        && (o.drawMaskTargets || !d.maskTarget[k]) && !hide[k]
        && (o.maxOrder == null || d.ro[k] <= o.maxOrder);
      if (vis) { order.push([d.ro[k], k]); visMark[k] = 1; }
    }
    var rev = !!o.reverseOrder;
    if (o.sortBy === 'index') {
      order.sort(function (a, b) { return (rev ? -1 : 1) * (a[1] - b[1]); });
    } else {
      order.sort(function (a, b) { return rev ? b[0] - a[0] : a[0] - b[0]; });
    }

    /* 1.5 呆毛识别：头顶左侧的独立卷发小部件。
          原模型里它的 7 段网格全被 ArtMesh159 遮罩裁剪，根部被剪掉悬在半空；
          这里解除遮罩让整条卷发完整显示（根部搭在头发上，看起来是长出来的）。 */
    var ahoSet = null, ahoBox = null;
    if (o.ahoFree !== false) {
      var pos0 = d.pos, KQ2 = 32767 / 1.5;
      var gb = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
      var cands = [];
      for (k = 0; k < d.N; k++) {
        if (!visMark[k] || d.vc[k] > 160) continue;
        var ax0 = 1e9, ax1 = -1e9, ay0 = 1e9, ay1 = -1e9;
        for (j = 0; j < d.vc[k]; j++) {
          var wi = (d.vOff[k] + j) * 2;
          var wx = pos0[wi] / KQ2, wy = pos0[wi + 1] / KQ2;
          if (wx < ax0) ax0 = wx; if (wx > ax1) ax1 = wx;
          if (wy < ay0) ay0 = wy; if (wy > ay1) ay1 = wy;
        }
        if (ax0 < gb.x0) gb.x0 = ax0; if (ax1 > gb.x1) gb.x1 = ax1;
        if (ay0 < gb.y0) gb.y0 = ay0; if (ay1 > gb.y1) gb.y1 = ay1;
        cands.push([ax0, ay0, ax1, ay1, k]);
      }
      var gcx = (gb.x0 + gb.x1) / 2, gyGate = gb.y0 + (gb.y1 - gb.y0) * 0.88;
      for (k = 0; k < cands.length; k++) {
        var cb = cands[k];
        if (cb[1] > gyGate && cb[2] < gcx + 0.05) {
          if (!ahoBox) ahoBox = { x0: cb[0], y0: cb[1], x1: cb[2], y1: cb[3] };
          else {
            if (cb[0] < ahoBox.x0) ahoBox.x0 = cb[0];
            if (cb[1] < ahoBox.y0) ahoBox.y0 = cb[1];
            if (cb[2] > ahoBox.x1) ahoBox.x1 = cb[2];
            if (cb[3] > ahoBox.y1) ahoBox.y1 = cb[3];
          }
          if (!ahoSet) ahoSet = new Uint8Array(d.N);
          ahoSet[cb[4]] = 1;
        }
      }
    }
    this.ahoBox = ahoBox;
    /* 根部在卷发靠近头的一侧（右下角），弹簧绕它摆 */
    this.ahoPivot = ahoBox ? [ahoBox.x1 - 0.006, ahoBox.y0 + 0.010] : null;

    /* 2. 相邻且混合模式 + 掩码集合 + 动态性都相同的部件并成一个 run；
          被「不透明度覆盖」命中的部件单独成 run（绘制时要单独调 alpha） */
    var runs = [];
    var useB = o.useBlend == null ? 3 : o.useBlend;
    for (n = 0; n < order.length; n++) {
      i = order[n][1];
      var bl = 0;
      if ((useB & 1) && (d.flags[i] & 1)) bl = 1;
      else if ((useB & 2) && (d.flags[i] & 2)) bl = 2;
      var dyn = (d.dynSet && d.dynSet[i]) ? 1 : 0;
      var cov = covered && covered.has(i) ? i : -1;
      var msk = (ahoSet && ahoSet[i]) ? [] : d.masks[i];
      var key = bl + '|' + dyn + '|' + cov + '|' + msk.join(',');
      var last = runs[runs.length - 1];
      if (last && last.key === key) last.items.push(i);
      else runs.push({ key: key, blend: bl, dyn: dyn, masks: msk.slice(), items: [i] });
    }

    /* 2.5 二次合并：相邻的「静态 + 无掩码 + 同混合模式 + 都不被 opacity 覆盖」的 run
          直接并成一个 draw call（动态 run 的帧位移缓冲不连续，不能并）。
          draw call 数≈run 数，低端机器上驱动开销是大头，这里能砍一半以上 */
    (function mergeRuns() {
      var out = [];
      for (var a = 0; a < runs.length; a++) {
        var rr = runs[a], L = out[out.length - 1];
        var covR = covered && covered.has(rr.items[0]);
        var covL = L && covered && covered.has(L.items[0]);
        if (L && !rr.dyn && !L.dyn && !rr.masks.length && !L.masks.length &&
            rr.blend === L.blend && !covR && !covL) {
          for (var z = 0; z < rr.items.length; z++) L.items.push(rr.items[z]);
        } else out.push(rr);
      }
      runs = out;
    })();

    /* 3. 展开成非索引三角流，交错 [x, y, u, v, a] / 20 字节，全部从缓冲 0 偏移开始。
          动态 drawable 的每一帧另存一份「位移」到独立缓冲，布局 [dx, dy] × K 帧。 */
    var pos = d.pos, uv = d.uv, idx = d.idx, KQ = 32767 / 1.5;
    var K = d.frames || 0, dynVerts = d.dynSet ? d.dynSet.dynVerts : 0;
    var total = 0, p = 0;
    for (n = 0; n < runs.length; n++) {
      for (j = 0; j < runs[n].items.length; j++) total += d.ic[runs[n].items[j]];
    }

    var DVT = 0;                       // 动态 drawable 展开后的顶点总数
    for (n = 0; n < runs.length; n++) {
      if (!runs[n].dyn) continue;
      for (j = 0; j < runs[n].items.length; j++) DVT += d.ic[runs[n].items[j]];
    }
    var hasAnim = !!(K && DVT);
    var dq = 0;

    var bV = new Float32Array(total * 5);
    var fV = hasAnim ? new Float32Array(K * DVT * 2) : null;
    var itemStart = [], itemCount = [], itemId = [];

    for (n = 0; n < runs.length; n++) {
      var run = runs[n];
      run.v0 = p; run.itemPos = []; run.dyn0 = dq;
      for (j = 0; j < run.items.length; j++) {
        i = run.items[j];
        run.itemPos.push(p); itemStart.push(p); itemId.push(i);
        io2 = d.iOff[i]; c = d.ic[i];
        /* 被 opacity 覆盖的部件：alpha 烘 1，实际透明度由 uAMul 统一给出
           （这些部件基准透明度可能是 0，比如默认隐藏的腮红/眼泪贴片） */
        var av = (covered && covered.has(i)) ? 1 : (o.flat ? 1 : d.op[i] / 255);
        var dOff = d.dynSet ? d.dynSrcOff[i] : 0;
        for (k = 0; k < c; k++) {
          var lv = idx[io2 + k];
          var vi = (lv + d.vOff[i]) * 2, b5 = p * 5;
          var bx = pos[vi] / KQ, by = pos[vi + 1] / KQ;
          bV[b5] = bx;
          bV[b5 + 1] = by;
          bV[b5 + 2] = uv[vi] / 65535;
          bV[b5 + 3] = uv[vi + 1] / 65535;
          bV[b5 + 4] = av;
          if (run.dyn && hasAnim) {
            var q = dq + k;
            for (var f = 0; f < K; f++) {
              var s0 = (f * dynVerts + dOff + lv) * 2;
              var t2 = (f * DVT + q) * 2;
              fV[t2] = d.anim[s0] / 32767 * 1.5 - bx;
              fV[t2 + 1] = d.anim[s0 + 1] / 32767 * 1.5 - by;
            }
          }
          p++;
        }
        if (run.dyn) dq += c;
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
    if (this.fv) { gl.deleteBuffer(this.fv); this.fv = null; }
    if (hasAnim) this.fv = mkBuf(gl, fV);

    this.dynTotal = DVT;
    this.frameCount = K;

    /* 4. run 表 */
    var rc = runs.length;
    this.runV0 = new Int32Array(rc);
    this.runVN = new Int32Array(rc);
    this.runMaskOff = new Int32Array(rc + 1);
    this.runBlend = new Uint8Array(rc);
    this.runDyn0 = new Int32Array(rc);
    this.runItemId = new Int32Array(rc);
    var maskRef = [], maskCnt = 0;
    this.runBox = new Float32Array(rc * 4);   // 掩码联合包围盒（无掩码 run 填 -1e9）
    for (n = 0; n < rc; n++) {
      this.runV0[n] = runs[n].v0;
      this.runVN[n] = runs[n].vn;
      this.runMaskOff[n] = maskCnt;
      this.runBlend[n] = runs[n].blend;
      this.runDyn0[n] = runs[n].dyn ? runs[n].dyn0 : -1;
      this.runItemId[n] = covered && covered.has(runs[n].items[0]) ? runs[n].items[0] : -1;
      var ub0 = 1e9, ub1 = 1e9, ub2 = -1e9, ub3 = -1e9;
      for (j = 0; j < runs[n].masks.length; j++) {
        m = runs[n].masks[j];
        if (m < d.N && mCount[m] > 0) {
          maskRef.push(mStart[m], mCount[m]); maskCnt++;
          if (this.maskBox[m * 4] < ub0) ub0 = this.maskBox[m * 4];
          if (this.maskBox[m * 4 + 1] < ub1) ub1 = this.maskBox[m * 4 + 1];
          if (this.maskBox[m * 4 + 2] > ub2) ub2 = this.maskBox[m * 4 + 2];
          if (this.maskBox[m * 4 + 3] > ub3) ub3 = this.maskBox[m * 4 + 3];
        }
      }
      if (ub0 > ub2) { ub0 = ub1 = ub2 = ub3 = -1e9; }
      this.runBox[n * 4] = ub0; this.runBox[n * 4 + 1] = ub1;
      this.runBox[n * 4 + 2] = ub2; this.runBox[n * 4 + 3] = ub3;
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
    var px = this.pixelSize(r.width || this.o.size);
    if (this.cv.width !== px[0] || this.cv.height !== px[1]) {
      this.cv.width = px[0];
      this.cv.height = px[1];
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
      self._ptrT = performance.now();
    };
    this.onLeave = function () { self.target.x = 0; self.target.y = 0; };
    global.addEventListener('mousemove', this.onMove, { passive: true });
    document.addEventListener('mouseleave', this.onLeave);
  };

  /* 按住拖动：跟手移动，松手停在原地，双击回到原位。
     用 CSS transform 而不是顶点偏移，所以拖动不额外消耗 GPU。 */
  Furina.prototype.bindDrag = function () {
    var self = this, el = this.el, cv = this.cv;
    var drag = this.drag = { x: 0, y: 0 };
    if (this.o.draggable === false) return;

    var on = false, sx = 0, sy = 0, ox = 0, oy = 0, moved = 0, pid = null;
    var wdrag = false, wpt0 = null, wref = null;
    cv.style.touchAction = 'none';
    cv.style.cursor = 'grab';
    cv.style.userSelect = 'none';
    cv.style.webkitUserSelect = 'none';
    cv.style.webkitTapHighlightColor = 'transparent';

    function apply() {
      el.style.transform = 'translate3d(' + drag.x.toFixed(1) + 'px,' +
        drag.y.toFixed(1) + 'px,0)';
    }

    /* 屏幕坐标 → 模型归一化世界坐标（与顶点着色器同一套变换） */
    function toWorld(e) {
      var r = cv.getBoundingClientRect();
      if (!r.width) return null;
      var ndx = ((e.clientX - r.left) / r.width) * 2 - 1;
      var ndy = 1 - ((e.clientY - r.top) / r.height) * 2;
      var sc = self.base.scale, a = self.cv.height / self.cv.width;
      return [ndx / (sc * a) + self.base.cx, ndy / sc + self.base.cy];
    }

    cv.addEventListener('pointerdown', function (e) {
      on = true; pid = e.pointerId; moved = 0;
      sx = e.clientX; sy = e.clientY; ox = drag.x; oy = drag.y;
      /* 命中杖头（露出身体的水晶段）→ 拖杖；否则拖模型（杖跟随）。
         命中区只取杖上半段，避免身后杖身拦截点在人物身上的点击 */
      wdrag = false;
      var wpt = toWorld(e);
      if (wpt && self.wp && self.o.wand !== false) {
        var wh = self.wandWH;
        var hx = self.wandPos[0] - wh * 0.115, hy = self.wandPos[1] + wh * 0.24;
        var hw = wh * 0.10 + 0.04, hh = wh * 0.26 + 0.04;
        if (Math.abs(wpt[0] - hx) < hw && Math.abs(wpt[1] - hy) < hh) {
          wdrag = true;
          wpt0 = [self.wandPos[0], self.wandPos[1]];
          wref = wpt;
        }
      }
      try { cv.setPointerCapture(pid); } catch (x) {}
      cv.style.cursor = 'grabbing';
      self._wasWdrag = wdrag;
      self.target.x = self.target.y = 0;
    });

    cv.addEventListener('pointermove', function (e) {
      if (!on) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      if (wdrag) {
        var wpt = toWorld(e);
        if (wpt) {
          self.wandPos[0] = Math.max(-1.5, Math.min(2.5, wpt0[0] + wpt[0] - wref[0]));
          self.wandPos[1] = Math.max(-1.5, Math.min(2.5, wpt0[1] + wpt[1] - wref[1]));
        }
        e.preventDefault();
        return;
      }
      var lx = Math.max(120, global.innerWidth * 0.3);
      var ly = Math.max(120, global.innerHeight * 0.3);
      drag.x = Math.max(-lx, Math.min(lx, ox + dx));
      drag.y = Math.max(-ly, Math.min(ly, oy + dy));
      apply();
      /* 模型拖动时权杖跟着走（CSS 位移对 WebGL 内容无效，直接补世界坐标） */
      var wpt2 = toWorld(e);
      if (wpt2 && wref) {
        self.wandPos[0] += wpt2[0] - wref[0];
        self.wandPos[1] += wpt2[1] - wref[1];
        wref = wpt2;
      }
      if (moved > 3) e.preventDefault();
    });

    function end() {
      if (!on) return;
      on = false; wdrag = false; wref = null;
      cv.style.cursor = 'grab';
      try { cv.releasePointerCapture(pid); } catch (x) {}
      /* 点一下模型（非拖动、非权杖）→ 随机互动反应动作+表情 */
      if (moved < 6 && !self._wasWdrag) {
        var pool = ['happy', 'wink', 'shyAct', 'surprise', 'happy', 'angry'];
        self.react(pool[(Math.random() * pool.length) | 0]);
      }
      self._wasWdrag = false;
    }
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);

    cv.addEventListener('dblclick', function () {
      drag.x = drag.y = 0;
      if (self.wandPos0) self.wandPos = self.wandPos0.slice();
      el.style.transition = 'transform .45s cubic-bezier(.22,1,.36,1)';
      apply();
      setTimeout(function () { el.style.transition = ''; }, 480);
    });
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
    var lastT = 0, acc = 0, cnt = 0, winT = 0;
    function frame(t) {
      self.raf = requestAnimationFrame(frame);
      if (self.visible === false || self.pageVisible === false) { lastT = t; return; }
      /* 帧间隔采样：按时间窗口（每秒）评估平均帧时间，
         低帧率机器上窗口也只占 1 秒，降档不会拖很久 */
      var dt = t - lastT; lastT = t;
      if (!winT) winT = t;
      if (dt > 0.5) { acc += Math.min(dt, 250); cnt++; }
      if (t - winT >= 1000) {
        if (cnt >= 3) self.autoPerf(acc / cnt);
        acc = 0; cnt = 0; winT = t;
      }
      /* 帧率上限（降档后省电省 GPU；0 = 不限制） */
      var iv = self._fiv || 0;
      if (iv && t - (self._lastDraw || 0) < iv - 1.5) return;
      self._lastDraw = t;
      self.draw(t);
    }
    this.raf = requestAnimationFrame(frame);
  };

  /* ---------- 自适应性能：帧时间超标就降档（分辨率+帧率），稳定后缓慢升回 ----------
     L0: 100%/60fps  L1: 85%/30  L2: 70%/30  L3: 60%/30  L4: 50%/30  L5: 40%/24
     降档快（严重卡顿立即降，轻微卡顿连续 2 个坏窗口），升档慢（6 个好窗口 + 10 秒冷却） */
  Furina.prototype.autoPerf = function (avgMs) {
    var L = this._perfL || 0;
    if (avgMs > 26) {
      this._badN = (this._badN || 0) + 1; this._goodN = 0;
      if (L < 5 && (this._badN >= 2 || avgMs > 45)) { this._perfL = L + 1; this._badN = 0; this.applyPerf(); }
    } else if (avgMs < 15) {
      this._goodN = (this._goodN || 0) + 1; this._badN = 0;
      var now = performance.now();
      if (this._goodN >= 6 && L > 0 && now > (this._cool || 0)) {
        this._perfL = L - 1; this._goodN = 0; this._cool = now + 10000; this.applyPerf();
      }
    } else { this._badN = 0; this._goodN = 0; }
  };
  Furina.prototype.applyPerf = function () {
    var L = this._perfL;
    this.q = [1, 0.85, 0.7, 0.6, 0.5, 0.4][L];
    this._fiv = L === 0 ? 0 : (L >= 5 ? 42 : 33);
    this.resize();
    /* 跨档动作：L≥3 换精简 shader，L≥2 换低清图集（各自只在跨阈值时动作一次） */
    this.switchPerf(L >= 3, L >= 2);
  };

  /* 低档降级执行器：精简顶点着色器 + 低清图集。
     正常机器两样都永不触发（保持 full shader + 原图集），零开销。 */
  Furina.prototype.switchPerf = function (lite, lowTex) {
    var gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    /* 1. 精简 program 懒编译 */
    if (lite && !this._litePr) {
      try {
        var lp = gl.createProgram();
        gl.attachShader(lp, compile(gl, gl.VERTEX_SHADER, VS_LITE));
        gl.attachShader(lp, compile(gl, gl.FRAGMENT_SHADER, FS));
        gl.bindAttribLocation(lp, 0, 'aPos');
        gl.bindAttribLocation(lp, 1, 'aUv');
        gl.bindAttribLocation(lp, 2, 'aA');
        gl.bindAttribLocation(lp, 3, 'aBlink');
        gl.bindAttribLocation(lp, 4, 'aExpr');
        gl.linkProgram(lp);
        if (!gl.getProgramParameter(lp, gl.LINK_STATUS)) throw new Error('lite link');
        var ul = {};
        ['uTime', 'uTilt', 'uBreath', 'uScale', 'uAspect', 'uCenter', 'uNeck', 'uOff', 'uSway',
         'uSkirt', 'uSkirtAmp', 'uHalf', 'uPremul', 'uBlink', 'uExpr', 'uAMul',
         'uAho', 'uAhoP', 'uAhoA', 'uBody', 'uHip', 'uEye', 'uGaze']
          .forEach(function (nm) { ul[nm] = gl.getUniformLocation(lp, nm); });
        this._litePr = lp;
        this._uLite = ul;
        gl.useProgram(lp);
        gl.uniform1i(ul.uTex, 0);
        this._bl = null;             // program 换了，uPremul 等 uniform 状态作废
      } catch (e) { this._litePr = null; }
    }
    var cur = (lite && this._litePr) ? this._litePr : this.pr;
    if (cur !== this._curMain) {
      this._curMain = cur;
      this.u = (cur === this.pr) ? this.uFull : this._uLite;
      gl.useProgram(cur);
      this._bl = null;
    }
    /* 2. 低清图集：重传一次纹理（约 1ms），之后每帧省 12MB 显存占用与 3/4 采样带宽 */
    if (this.imgLow && lowTex !== this._texLow) {
      this._texLow = lowTex;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lowTex ? this.imgLow : this.img);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
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

  /* ---------- 自然动作系统：像真人的不规律小动作 ----------
     真人不会匀速循环：呼吸深浅不一、偶尔歪头、重心左右移、深吸一口气。
     这里用一个随机调度器在 4~9s 间隔触发小动作，正弦包络起落，
     叠加到 tilt/off/body/breath 四个通道上，全部走平滑不跳变。
     部分动作带配套表情（expr），开始时经同一表情通道淡入。 */
  /* 动作池提为常量：避免触发时分配数组 */
  var ACT_POOL = [
    { n: 'tiltL', w: 3 }, { n: 'tiltR', w: 3 },
    { n: 'shiftL', w: 2 }, { n: 'shiftR', w: 2 },
    { n: 'nod', w: 1.5 }, { n: 'sigh', w: 1.5 },
    { n: 'swayBig', w: 1.5 },
    { n: 'stretch', w: 1.2, expr: 0 },
    { n: 'shake', w: 1.2 },
    { n: 'bounce', w: 1.0, expr: 5 },
    { n: 'shy', w: 0.8, expr: 10 },
    { n: 'lookL', w: 1.2, expr: 1 },
    { n: 'lookR', w: 1.2, expr: 2 }
  ];
  var ACT_TOT = (function () { var t = 0, i; for (i = 0; i < ACT_POOL.length; i++) t += ACT_POOL[i].w; return t; })();

  Furina.prototype.natural = function (time, idle) {
    /* 输出对象复用：每帧 new 一个小对象会让 GC 在低端机上周期性卡顿 */
    var out = this._nat || (this._nat = { tilt: 0, offX: 0, offY: 0, body: 0, breath: 0 });
    out.tilt = 0; out.offX = 0; out.offY = 0; out.body = 0; out.breath = 0;
    if (!idle) { this._act = null; return out; }
    if (this._actT == null) this._actT = time + 2.0 + Math.random() * 3.0;
    if (time > this._actT) {
      var pick = Math.random() * ACT_TOT, act = ACT_POOL[0], i;
      for (i = 0; i < ACT_POOL.length; i++) { pick -= ACT_POOL[i].w; if (pick <= 0) { act = ACT_POOL[i]; break; } }
      this._act = {
        name: act.n,
        expr: act.expr || 0,
        t0: time,
        dur: 1.1 + Math.random() * 1.5,
        amp: 0.65 + Math.random() * 0.5
      };
      if (act.n === 'stretch') this._act.dur = 2.4 + Math.random() * 1.2;
      if (act.n === 'shake' || act.n === 'shy') this._act.dur = 1.3 + Math.random() * 0.7;
      if (act.n === 'bounce') this._act.dur = 0.9 + Math.random() * 0.4;
      if (this._act.expr && this.frameCount > this._act.expr) {
        this.exprWant = this._act.expr;
        this._holdUntil = performance.now() + this._act.dur * 1000;
      }
      this._actT = time + this._act.dur + 2.0 + Math.random() * 4.2;
    }
    var a = this._act;
    if (a) {
      var u = (time - a.t0) / a.dur;
      if (u >= 1) this._act = null;
      else if (u >= 0) {
        var env = Math.sin(Math.PI * u);
        env = env * env * (3 - 2 * env);            // 更圆润的起落
        var s = a.amp;
        switch (a.name) {
          case 'tiltL':  out.tilt  = 0.075 * s * env; break;
          case 'tiltR':  out.tilt  = -0.075 * s * env; break;
          case 'shiftL': out.offX  = 0.011 * s * env; out.body = 0.009 * s * env; break;
          case 'shiftR': out.offX  = -0.011 * s * env; out.body = -0.009 * s * env; break;
          case 'nod':    out.offY  = 0.009 * s * Math.sin(Math.PI * Math.min(1, u * 1.6)); break;
          case 'sigh':   out.breath = 0.011 * env; out.body = 0.004 * env; break;
          case 'swayBig': out.body = 0.011 * s * env; out.tilt = 0.032 * s * env; break;
          case 'stretch': out.breath = 0.020 * env; out.body = 0.007 * env; out.offY = 0.004 * env; out.tilt = 0.02 * env; break;
          case 'shake':   out.tilt = 0.045 * s * Math.sin(u * Math.PI * 4) * env; break;
          case 'bounce':  out.offY = 0.012 * s * Math.sin(Math.PI * Math.min(1, u * 2)); out.body = 0.005 * s * env; break;
          case 'shy':     out.body = 0.007 * s * Math.sin(u * Math.PI * 3) * env; out.tilt = 0.028 * s * env; break;
          case 'lookL':   out.tilt = 0.02 * s * env; break;
          case 'lookR':   out.tilt = -0.02 * s * env; break;
        }
      }
    }
    return out;
  };

  /* 点击互动反应：立即触发一个动作+配套表情，不受调度间隔限制 */
  Furina.prototype.react = function (name) {
    var map = {
      happy:    { n: 'bounce', expr: 5,  dur: 1.0 },
      surprise: { n: 'bounce', expr: 7,  dur: 1.1 },
      shyAct:   { n: 'shy',    expr: 10, dur: 1.5 },
      angry:    { n: 'shake',  expr: 8,  dur: 1.4 },
      wink:     { n: 'tiltL',  expr: 5,  dur: 1.2 }
    };
    var r = map[name] || map.happy;
    this._act = { name: r.n, expr: r.expr, t0: this._gtime || 0, dur: r.dur, amp: 1.0 };
    this._actT = (this._gtime || 0) + r.dur + 2.0 + Math.random() * 3.0;
    if (this.frameCount > r.expr) {
      this.exprWant = r.expr;
      this._holdUntil = performance.now() + r.dur * 1000;
    }
  };

  Furina.prototype.draw = function (t) {
    var gl = this.gl, u = this.u, b = this.base;
    if (!gl || gl.isContextLost()) return;

    var dt = Math.min(0.05, (t - (this.last || t)) / 1000);
    this.last = t;
    this._dt = dt;
    var time = (t - this.t0) / 1000;
    this._gtime = time;
    var e = 1 - Math.exp(-dt * 8);
    this.cur.x += (this.target.x - this.cur.x) * e;
    this.cur.y += (this.target.y - this.cur.y) * e;

    /* 视线游移：鼠标静止 4 秒后视线自动瞟向别处、偶尔回中，鼠标一动立即恢复跟随 */
    var idle0 = this.o.idle !== false;
    if (idle0 && this.o.gaze !== false && (this._ptrT == null || t - this._ptrT > 4000)) {
      if (this._gzT == null || t > this._gzT) {
        this._gz = Math.random() < 0.22
          ? { x: 0, y: 0 }
          : { x: (Math.random() * 2 - 1) * 0.55, y: (Math.random() * 2 - 1) * 0.45 };
        this._gzT = t + 1600 + Math.random() * 3400;
      }
      var ge = Math.min(1, dt * 1.5);
      this.target.x += (this._gz.x - this.target.x) * ge;
      this.target.y += (this._gz.y - this.target.y) * ge;
    } else if (this._gz) { this._gz = null; this._gzT = null; }

    var cssW = this.cv.clientWidth || this.o.size;
    if (cssW !== this._lastCssW) { this._lastCssW = cssW; this.resize(); }
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    /* 只清颜色。stencil 不需要全屏清：每个掩码 run 自己在 scissor 范围内清零，
       读取 stencil（NOTEQUAL）也只发生在 scissor 内，区域外残值永远读不到。
       省一次全屏 stencil 写带宽（低端 GPU 上每帧可观的固定开销）。 */
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.STENCIL_TEST);

    var idle = this.o.idle !== false;
    var nm = this.natural(time, idle);
    /* 呼吸：双频叠加 + 慢速深浅调制，不再是匀速循环 */
    var breath = idle
      ? 1 + (Math.sin(time * 1.35) * 0.0052 + Math.sin(time * 0.47 + 1.9) * 0.0019)
          * (1 + 0.35 * Math.sin(time * 0.093)) + nm.breath
      : 1;

    /* ---------- 眨眼：3–6 秒一次，90ms 闭合 / 40ms 停留 / 180ms 张开；
                  约 1/6 概率连眨两下，避免节拍过于规律 ---------- */
    this._now = t;
    var blinkW = 0;
    if (idle && this.frameCount > 0) {
      if (this._nextBlink == null) this._nextBlink = t + 1200 + Math.random() * 2400;
      if (t > this._nextBlink) {
        this._blinkT = t;
        this._nextBlink = t + (Math.random() < 0.17 ? 240 : 3000 + Math.random() * 3400);
      }
      var be = t - (this._blinkT || -1e9);
      if (be < 0) blinkW = 0;
      else if (be < 90) blinkW = be / 90;
      else if (be < 130) blinkW = 1;
      else if (be < 310) blinkW = 1 - (be - 130) / 180;
      else blinkW = 0;
    }

    /* ---------- 表情：自动"触发 → 保持 → 回落"，手动设置走同一条通道 ---------- */
    if (this._holdUntil && t > this._holdUntil) {
      this._holdUntil = 0;
      this.exprWant = 0;
    }
    if (idle && this.o.autoExpr !== false && this.frameCount > 1 && this.o.forceExpr == null && !this.exprWant) {
      if (this._nextExpr == null) this._nextExpr = t + 2000 + Math.random() * 2800;
      else if (t > this._nextExpr) {
        var pool = this.o.autoExprList || [5, 6, 10, 1, 2, 3, 4, 5, 8];
        var pick = pool[(Math.random() * pool.length) | 0] | 0;
        if (pick > 0 && pick < this.frameCount) {
          this.exprWant = pick;
          /* 视线瞟一眼很短，情绪停留久一些 */
          this._holdUntil = t + (pick <= 4 ? 650 + Math.random() * 550 : 1500 + Math.random() * 1700);
        }
        this._nextExpr = t + 2400 + Math.random() * 4200;
      }
    }

    /* 切换时先淡出再淡入，避免两帧之间直接跳变 */
    var want = this.exprWant || 0;
    if (this.exprFrame == null) this.exprFrame = 0;
    if (this.exprW == null) this.exprW = 0;
    if (this.exprFrame !== want) {
      this.exprW -= dt * 11;
      if (this.exprW <= 0) { this.exprW = 0; this.exprFrame = want; }
    } else {
      var et = want ? 1 : 0;
      this.exprW += (et - this.exprW) * Math.min(1, dt * 10);
    }
    var exprW = this.exprW;
    /* 调试钩子：强制某一帧，用来逐帧核验 */
    if (this.o.forceBlink != null) blinkW = +this.o.forceBlink;
    if (this.o.forceExpr != null) {
      this.exprFrame = +this.o.forceExpr | 0;
      exprW = this.o.forceExprW == null ? 1 : +this.o.forceExprW;
    }

    /* 呆毛弹簧摆动：跟随头部水平运动 + 慢速自摆，欠阻尼弹簧产生游戏里的回弹感 */
    if (this.ahoA == null) { this.ahoA = 0; this.ahoV = 0; this._px = this.cur.x; }
    var adt = Math.max(0.001, Math.min(0.05, dt));
    var hv = (this.cur.x - this._px) / adt;
    this._px = this.cur.x;
    var at = -hv * 0.09 + Math.sin(time * 2.2) * 0.09 + Math.sin(time * 3.4 + 1.4) * 0.045;
    if (!idle) at = 0;
    if (at > 0.5) at = 0.5; else if (at < -0.5) at = -0.5;
    this.ahoV += (-(this.ahoA - at) * 46 - this.ahoV * 10) * adt;
    this.ahoA += this.ahoV * adt;
    /* 体态摇曳：多频叠加 + 随机小动作偏移，绕髋部（腿不动，躯干/手臂/头一起摆） */
    this.bodyA = idle
      ? 0.0075 * Math.sin(time * 0.85) + 0.0042 * Math.sin(time * 0.33 + 2.1)
        + 0.0026 * Math.sin(time * 1.42 + 0.6) + nm.body
      : nm.body;

    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uTilt, -this.cur.x * 0.16 + nm.tilt);
    gl.uniform1f(u.uBreath, breath);
    gl.uniform1f(u.uScale, b.scale);
    gl.uniform1f(u.uAspect, this.cv.height / this.cv.width);
    gl.uniform2f(u.uCenter, b.cx, b.cy);
    gl.uniform2f(u.uNeck, b.neck, b.neckTop);
    gl.uniform2f(u.uOff, this.cur.x * 0.026 + nm.offX, -this.cur.y * 0.017 + nm.offY);
    /* 眼球看向：把视线向量传给 shader，只位移眼部区域 */
    gl.uniform2f(u.uGaze, this.cur.x * 0.85, this.cur.y * 0.6);
    gl.uniform4f(u.uEye, b.eyeX0, b.eyeY0, b.eyeX1, b.eyeY1);
    gl.uniform2f(u.uSway, idle ? 0.006 : 0, idle ? 0.0026 : 0);
    gl.uniform2f(u.uSkirt, b.skirtTop, b.skirtBottom);
    gl.uniform2f(u.uSkirtAmp, idle ? 0.095 : 0, idle ? 0.016 : 0);
    gl.uniform2f(u.uHalf, b.halfW, 1);
    if (this.ahoBox && this.ahoPivot) {
      var aA = this.cv.height / this.cv.width;
      gl.uniform4f(u.uAho, this.ahoBox.x0, this.ahoBox.y0, this.ahoBox.x1, this.ahoBox.y1);
      gl.uniform2f(u.uAhoP,
        (this.ahoPivot[0] - b.cx) * aA * b.scale,
        (this.ahoPivot[1] - b.cy) * b.scale);
      gl.uniform1f(u.uAhoA, this.ahoA);
    } else {
      gl.uniform4f(u.uAho, 10, 10, 10, 10);
      gl.uniform2f(u.uAhoP, 0, 0);
      gl.uniform1f(u.uAhoA, 0);
    }
    gl.uniform1f(u.uBody, this.bodyA || 0);
    gl.uniform1f(u.uHip, b.hip);
    gl.uniform1f(u.uBlink, 0);
    gl.uniform1f(u.uExpr, 0);

    var AP = this.aPos, AU = this.aUv, AA = this.aA, BUF = this.bv;
    var AB = this.aBlink, AE = this.aExpr, DYN = this.dynTotal, EF = this.exprFrame;
    var FV = this.fv, HAS = !!FV;
    var rc = this.runV0.length;

    /* 主几何在 BUF，帧位移在 FV。两组属性的顶点下标基准必须一致：
       drawArrays 的 first 会叠加到所有属性上，所以这里统一用 first=0，
       把 run 的起始顶点折进指针偏移里（v0*20）。否则帧属性会错位读到空白区。 */
    function bindMain(dyn0, v0) {
      var o20 = v0 * 20;
      gl.enableVertexAttribArray(AP);
      gl.enableVertexAttribArray(AU);
      gl.enableVertexAttribArray(AA);
      gl.bindBuffer(gl.ARRAY_BUFFER, BUF);
      gl.vertexAttribPointer(AP, 2, gl.FLOAT, false, 20, o20);
      gl.vertexAttribPointer(AU, 2, gl.FLOAT, false, 20, o20 + 8);
      gl.vertexAttribPointer(AA, 1, gl.FLOAT, false, 20, o20 + 16);
      if (HAS && dyn0 >= 0) {
        gl.enableVertexAttribArray(AB);
        gl.enableVertexAttribArray(AE);
        gl.bindBuffer(gl.ARRAY_BUFFER, FV);
        gl.vertexAttribPointer(AB, 2, gl.FLOAT, false, 8, dyn0 * 8);
        gl.vertexAttribPointer(AE, 2, gl.FLOAT, false, 8, (EF * DYN + dyn0) * 8);
      } else {
        gl.disableVertexAttribArray(AB);
        gl.disableVertexAttribArray(AE);
        gl.vertexAttrib2f(AB, 0, 0);
        gl.vertexAttrib2f(AE, 0, 0);
      }
    }
    bindMain(-1, 0);

    /* ---------- scissor 裁剪：掩码清屏/绘制裁到掩码包围盒的屏幕投影 ----------
       全屏 stencil clear 是低端 GPU 的带宽大头，而掩码只影响自己周围一小块。
       这里用 JS 复刻顶点变换链（体态/呼吸/头部倾转/发丝摆动/偏移，摆动取 ± 极值），
       把模型空间包围盒精确投影到当前帧的像素矩形。 */
    var SC = b.scale, ASP = this.cv.height / this.cv.width, CW = this.cv.width, CH = this.cv.height;
    var tiltV = -this.cur.x * 0.16 + nm.tilt;
    var offVX = this.cur.x * 0.026 + nm.offX, offVY = -this.cur.y * 0.017 + nm.offY;
    var swayVX = idle ? 0.006 : 0;
    var bodyV = this.bodyA || 0, brV = breath - 1;
    var RB = this.runBox;
    function ssN(e0, e1, x) {
      var t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    }
    function cornerPx(x, y, sg) {
      var px = (x - b.cx) * ASP * SC, py = (y - b.cy) * SC;
      var wb = ssN(b.hip - 0.08, b.hip + 0.08, y);
      var hipY = (b.hip - b.cy) * SC;
      var ab2 = bodyV * wb, c2 = Math.cos(ab2), s2 = Math.sin(ab2);
      var dx = px, dy = py - hipY;
      px = dx * c2 - dy * s2; py = hipY + dx * s2 + dy * c2;
      var chest = ssN(b.neck - 0.42, b.neck - 0.06, y) * (1 - ssN(b.neck - 0.04, b.neck + 0.10, y));
      px *= 1 + brV * 1.5 * chest;
      py += brV * 0.55 * (0.35 + 0.65 * chest);
      var w = ssN(b.neck, b.neckTop, y);
      var a2 = tiltV * w, ca = Math.cos(a2), sa = Math.sin(a2);
      var neckY = (b.neck - b.cy) * SC;
      dx = px; dy = py - neckY;
      px = dx * ca - dy * sa; py = neckY + dx * sa + dy * ca;
      px += sg * swayVX * (0.35 + 0.65 * w) * (0.5 + 0.5 * Math.abs(px));
      px += offVX * (0.35 + 0.65 * w);
      py += offVY * (0.35 + 0.65 * w);
      return [(px * 0.5 + 0.5) * CW, (py * 0.5 + 0.5) * CH];
    }
    function scissorFor(n) {
      var n4 = n * 4;
      if (!RB || RB[n4] > RB[n4 + 2]) return false;
      var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, pt;
      for (var xi = 0; xi < 2; xi++) for (var yi = 0; yi < 2; yi++) {
        for (var sg = -1; sg <= 1; sg += 2) {
          pt = cornerPx(xi ? RB[n4 + 2] : RB[n4], yi ? RB[n4 + 3] : RB[n4 + 1], sg);
          if (pt[0] < minX) minX = pt[0]; if (pt[0] > maxX) maxX = pt[0];
          if (pt[1] < minY) minY = pt[1]; if (pt[1] > maxY) maxY = pt[1];
        }
      }
      /* 余量随分辨率缩放：眼部位移是模型空间量（≈0.011 单位），
         高 DPR 下像素数会放大，固定像素余量会不够 */
      var pad = Math.max(10, 0.045 * SC * CH * 0.5);
      minX -= pad; minY -= pad; maxX += pad; maxY += pad;
      if (minX < 0) minX = 0; if (minY < 0) minY = 0;
      if (maxX > CW) maxX = CW; if (maxY > CH) maxY = CH;
      if (maxX - minX < 2 || maxY - minY < 2) return false;
      gl.scissor(minX, CH - maxY, maxX - minX, maxY - minY);
      return true;
    }

    /* 权杖画在模型身后（先画 = 被身体遮挡）；不关模板测试，
       只把 func/op 设成「处处通过、不写入」，后续 run 会各自重设 */
    this.drawWand(time);

    for (var n = 0; n < rc; n++) {
      var m0 = this.runMaskOff[n], m1 = this.runMaskOff[n + 1], r;
      var dyn0 = this.runDyn0[n];
      var masked = !!(this.o.clip && m1 > m0);
      if (!masked) { m0 = m1 = 0; }
      var scOn = masked && !this.o.debugMask && scissorFor(n);
      if (scOn) gl.enable(gl.SCISSOR_TEST);
      if (masked) {
        /* 掩码阶段：只写模板，不写颜色；帧权重必须归零 */
        gl.uniform1f(u.uBlink, 0);
        gl.uniform1f(u.uExpr, 0);
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
        bindMain(dyn0, this.runV0[n]);
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

      /* 可见几何：只有动态 run 才吃帧权重，静态 run 权重归零 */
      if (dyn0 >= 0) { gl.uniform1f(u.uBlink, blinkW); gl.uniform1f(u.uExpr, exprW); }
      else { gl.uniform1f(u.uBlink, 0); gl.uniform1f(u.uExpr, 0); }

      /* 不透明度覆盖：表情通过「部件显隐」实现的部分（腮红/嘴型贴图等）。
         covered 部件的 aA 烘的是 1，uAMul 直接给出目标透明度，随 exprW 插值。 */
      var am = 1;
      var di0 = this.runItemId[n];
      if (di0 >= 0) {
        var dd = this.data;
        var baseOp = dd.op[di0] / 255;
        var tgtOp = baseOp;
        if (exprW > 0.001) {
          var mmA = dd.opOver && dd.opOver[EF];
          if (mmA && mmA.has(di0)) tgtOp = mmA.get(di0) / 255;
        }
        am = baseOp + (tgtOp - baseOp) * exprW;
      }
      gl.uniform1f(u.uAMul, am);

      var bl2 = this.runBlend[n];
      if (bl2 !== this._bl) {
        if (bl2 === 0) {
          /* 图集是预乘 alpha 的：普通模式用 ONE 混合，边缘由预乘插值自然抗锯齿 */
          gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          gl.uniform1f(u.uPremul, 1);
        } else if (bl2 === 1) {
          gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
          gl.uniform1f(u.uPremul, 1);
        } else {
          gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
          gl.uniform1f(u.uPremul, 1);
        }
        this._bl = bl2;
      }
      /* 每个 run 的起始顶点不同，必须逐 run 重设指针（把 v0 折进偏移） */
      bindMain(dyn0, this.runV0[n]);
      gl.drawArrays(gl.TRIANGLES, 0, this.runVN[n]);
      if (scOn) gl.disable(gl.SCISSOR_TEST);
    }
  };

  /* 权杖图层：慢速摆动（弹簧跟随头部运动 + 自摆），画在模型身后 */
  Furina.prototype.drawWand = function (time) {
    if (!this.wp || this.o.wand === false) return;
    var gl = this.gl, w = this.wu, b = this.base;
    var idle = this.o.idle !== false;
    var adt = Math.max(0.001, Math.min(0.05, this._dt || 0.016));
    var tgt = (idle
      ? Math.sin(time * 0.8) * 0.030 + Math.sin(time * 1.9 + 1.1) * 0.012 + this.cur.x * 0.10
      : 0) + (this.wandBase || 0);
    this.wandV += ((tgt - this.wandA) * 26 - this.wandV * 6.5) * adt;
    this.wandA += this.wandV * adt;

    gl.useProgram(this.wp);
    /* 模板安全：处处通过、不写入（不 disable STENCIL_TEST，避免遮罩失效） */
    gl.stencilFunc(gl.ALWAYS, 0, 0xFF);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.disableVertexAttribArray(this.aBlink);
    gl.disableVertexAttribArray(this.aExpr);
    gl.enableVertexAttribArray(w.aPos);
    gl.enableVertexAttribArray(w.aUv);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.wbuf);
    gl.vertexAttribPointer(w.aPos, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(w.aUv, 2, gl.FLOAT, false, 16, 8);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.wtex);
    gl.uniform1i(w.uTex, 0);
    gl.uniform1f(w.uScale, b.scale);
    gl.uniform1f(w.uAspect, this.cv.height / this.cv.width);
    gl.uniform2f(w.uCenter, b.cx, b.cy);
    gl.uniform2f(w.uOff, this.cur.x * 0.026, -this.cur.y * 0.017);
    gl.uniform2f(w.uWPos, this.wandPos[0], this.wandPos[1]);
    gl.uniform2f(w.uPiv, this.wandPiv[0] * this.wandWH * 0.5, this.wandPiv[1] * this.wandWH * 0.5);
    gl.uniform1f(w.uRot, this.wandA);
    gl.uniform1f(w.uWH, this.wandWH);
    gl.uniform1f(w.uAlpha, 1);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    /* 恢复主渲染状态：混合每 run 会重设但缓存要作废；图集绑定也要还原 */
    this._bl = null;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.useProgram(this._curMain || this.pr);
  };

  /* 权杖开关：setWand(false) 隐藏贴图层 */
  Furina.prototype.setWand = function (on) {
    this.o.wand = !!on;
  };

  /* 表情切换：字符串按 o.frames 查表，数字直接当帧索引（0 = 无表情）。
     同时给一个保持时间，到点自动回到常态，避免表情一直挂着。 */
  Furina.prototype.setExpression = function (v, holdMs) {
    var want = 0;
    if (typeof v === 'string') {
      var i = (this.o.frames || []).indexOf(v);
      want = i > 0 ? i : 0;
    } else {
      want = (v > 0 && v < (this.frameCount || 0)) ? (v | 0) : 0;
    }
    this.exprWant = want;
    this._nextExpr = null;             // 让自动表情重新计时
    this._holdUntil = want ? (this._now || performance.now()) + (holdMs || 6000) : 0;
    return this;
  };

  Furina.prototype.expression = function () {
    return this.exprWant || 0;
  };

  Furina.prototype.blink = function () {
    this._nextBlink = 0;      // 下一次 draw 立即触发
    return this;
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

  global.FurinaMini = { mount: mount, version: '2.1.0' };
})(window);
