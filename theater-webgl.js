/**
 * مسرح 3D بـ WebGL2 فقط — بدون Three.js.
 * @file theater-webgl.js
 */
(function (global) {
  "use strict";

  /** @param {WebGL2RenderingContext} gl */
  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  /** @param {WebGL2RenderingContext} gl */
  function link(gl, vsSrc, fsSrc) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    if (!p) return null;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(p));
      gl.deleteProgram(p);
      return null;
    }
    return p;
  }

  function mat4Identity(out) {
    out.fill(0);
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
  }

  function mat4Multiply(out, a, b) {
    const a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
    const a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
    const a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];
    const a30 = a[12],
      a31 = a[13],
      a32 = a[14],
      a33 = a[15];
    let b0 = b[0],
      b1 = b[1],
      b2 = b[2],
      b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[4];
    b1 = b[5];
    b2 = b[6];
    b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[8];
    b1 = b[9];
    b2 = b[10];
    b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[12];
    b1 = b[13];
    b2 = b[14];
    b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
  }

  function mat4Perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    out[0] = f / aspect;
    out[1] = out[2] = out[3] = out[4] = 0;
    out[5] = f;
    out[6] = out[7] = out[8] = out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = out[13] = 0;
    out[14] = 2 * far * near * nf;
    out[15] = 0;
    return out;
  }

  function mat4LookAt(out, eyeX, eyeY, eyeZ, tx, ty, tz, ux, uy, uz) {
    let fx = tx - eyeX,
      fy = ty - eyeY,
      fz = tz - eyeZ;
    let len = Math.hypot(fx, fy, fz) || 1;
    fx /= len;
    fy /= len;
    fz /= len;
    let sx = fy * uz - fz * uy;
    let sy = fz * ux - fx * uz;
    let sz = fx * uy - fy * ux;
    len = Math.hypot(sx, sy, sz) || 1;
    sx /= len;
    sy /= len;
    sz /= len;
    const uux = sy * fz - sz * fy;
    const uuy = sz * fx - sx * fz;
    const uuz = sx * fy - sy * fx;
    out[0] = sx;
    out[4] = sy;
    out[8] = sz;
    out[12] = -(sx * eyeX + sy * eyeY + sz * eyeZ);
    out[1] = uux;
    out[5] = uuy;
    out[9] = uuz;
    out[13] = -(uux * eyeX + uuy * eyeY + uuz * eyeZ);
    out[2] = -fx;
    out[6] = -fy;
    out[10] = -fz;
    out[14] = -(-fx * eyeX - fy * eyeY - fz * eyeZ);
    out[3] = 0;
    out[7] = 0;
    out[11] = 0;
    out[15] = 1;
    return out;
  }

  const cubeVerts = new Float32Array([
    -0.5, -0.5, 0.5, 0, 0, 1, 0.5, -0.5, 0.5, 0, 0, 1, 0.5, 0.5, 0.5, 0, 0, 1, -0.5, -0.5, 0.5, 0, 0, 1, 0.5, 0.5, 0.5, 0, 0, 1, -0.5, 0.5, 0.5, 0, 0, 1,
    0.5, -0.5, -0.5, 0, 0, -1, -0.5, -0.5, -0.5, 0, 0, -1, -0.5, 0.5, -0.5, 0, 0, -1, 0.5, -0.5, -0.5, 0, 0, -1, -0.5, 0.5, -0.5, 0, 0, -1, 0.5, 0.5, -0.5, 0, 0, -1,
    0.5, -0.5, 0.5, 1, 0, 0, 0.5, -0.5, -0.5, 1, 0, 0, 0.5, 0.5, -0.5, 1, 0, 0, 0.5, -0.5, 0.5, 1, 0, 0, 0.5, 0.5, -0.5, 1, 0, 0, 0.5, 0.5, 0.5, 1, 0, 0,
    -0.5, -0.5, -0.5, -1, 0, 0, -0.5, -0.5, 0.5, -1, 0, 0, -0.5, 0.5, 0.5, -1, 0, 0, -0.5, -0.5, -0.5, -1, 0, 0, -0.5, 0.5, 0.5, -1, 0, 0, -0.5, 0.5, -0.5, -1, 0, 0,
    -0.5, 0.5, 0.5, 0, 1, 0, 0.5, 0.5, 0.5, 0, 1, 0, 0.5, 0.5, -0.5, 0, 1, 0, -0.5, 0.5, 0.5, 0, 1, 0, 0.5, 0.5, -0.5, 0, 1, 0, -0.5, 0.5, -0.5, 0, 1, 0,
    -0.5, -0.5, -0.5, 0, -1, 0, 0.5, -0.5, -0.5, 0, -1, 0, 0.5, -0.5, 0.5, 0, -1, 0, -0.5, -0.5, -0.5, 0, -1, 0, 0.5, -0.5, 0.5, 0, -1, 0, -0.5, -0.5, 0.5, 0, -1, 0,
  ]);

  const VS_INST = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec4 iM0;
layout(location=3) in vec4 iM1;
layout(location=4) in vec4 iM2;
layout(location=5) in vec4 iM3;
uniform mat4 uVP;
flat out int vId;
out vec3 vNor;
void main() {
  mat4 M = mat4(iM0, iM1, iM2, iM3);
  vec4 wp = M * vec4(aPos, 1.0);
  gl_Position = uVP * wp;
  vNor = mat3(M) * aNor;
  vId = gl_InstanceID;
}
`;

  const FS_INST = `#version 300 es
precision highp float;
flat in int vId;
in vec3 vNor;
uniform vec3 uLight;
uniform int uHi0;
uniform int uHi1;
uniform int uHi2;
uniform vec3 uBase;
uniform vec3 uHi;
out vec4 oCol;
void main() {
  vec3 n = normalize(vNor);
  float nd = max(dot(n, normalize(uLight)), 0.0);
  vec3 amb = uBase * 0.38;
  vec3 dif = uBase * nd * 0.72;
  vec3 c = amb + dif;
  bool isHi = (uHi0 >= 0 && vId == uHi0) || (uHi1 >= 0 && vId == uHi1) || (uHi2 >= 0 && vId == uHi2);
  if (isHi) {
    c = mix(c, uHi, 0.88);
    c += vec3(0.28, 0.06, 0.06);
  }
  oCol = vec4(c, 1.0);
}
`;

  const VS_SIMPLE = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
uniform mat4 uModel;
uniform mat4 uVP;
out vec3 vNor;
out vec3 vWorld;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorld = wp.xyz;
  gl_Position = uVP * wp;
  vNor = mat3(uModel) * aNor;
}
`;

  const FS_SIMPLE = `#version 300 es
precision highp float;
in vec3 vNor;
in vec3 vWorld;
uniform vec3 uColor;
uniform vec3 uLight;
uniform vec3 uEye;
uniform float uFloorY;
uniform float uRim;
out vec4 oCol;
void main() {
  vec3 n = normalize(vNor);
  vec3 L = normalize(uLight);
  float nd = max(dot(n, L), 0.0);
  float amb = 0.42;
  vec3 base = uColor * (amb + 0.58 * nd);
  vec3 V = normalize(uEye - vWorld);
  float rim = pow(1.0 - max(dot(n, V), 0.0), 2.2) * uRim;
  base += rim * vec3(0.22, 0.28, 0.38);
  float h = clamp((vWorld.y - uFloorY) / 12.0, 0.0, 1.0);
  base *= 0.72 + 0.28 * h;
  oCol = vec4(base, 1.0);
}
`;

  function mat4ScaleTranslate(out, sx, sy, sz, tx, ty, tz) {
    out[0] = sx;
    out[1] = out[2] = out[3] = out[4] = 0;
    out[5] = sy;
    out[6] = out[7] = out[8] = out[9] = 0;
    out[10] = sz;
    out[11] = 0;
    out[12] = tx;
    out[13] = ty;
    out[14] = tz;
    out[15] = 1;
    return out;
  }

  const _tmpA = new Float32Array(16);
  const _tmpB = new Float32Array(16);

  /** Y-axis rotation (right-handed). */
  function mat4RotationY(out, rad) {
    const c = Math.cos(rad),
      s = Math.sin(rad);
    out[0] = c;
    out[1] = 0;
    out[2] = -s;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = s;
    out[9] = 0;
    out[10] = c;
    out[11] = 0;
    out[12] = out[13] = out[14] = 0;
    out[15] = 1;
    return out;
  }

  /** X-axis rotation. */
  function mat4RotationX(out, rad) {
    const c = Math.cos(rad),
      s = Math.sin(rad);
    out[0] = 1;
    out[1] = out[2] = out[3] = 0;
    out[4] = 0;
    out[5] = c;
    out[6] = s;
    out[7] = 0;
    out[8] = 0;
    out[9] = -s;
    out[10] = c;
    out[11] = 0;
    out[12] = out[13] = out[14] = 0;
    out[15] = 1;
    return out;
  }

  function mat4Translate(out, tx, ty, tz) {
    mat4Identity(out);
    out[12] = tx;
    out[13] = ty;
    out[14] = tz;
    return out;
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ x: number, y: number, z: number }[]} seats
   */
  function createTheater(canvas, seats) {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) {
      console.error("WebGL2 غير متاح");
      return null;
    }

    const progI = link(gl, VS_INST, FS_INST);
    const progS = link(gl, VS_SIMPLE, FS_SIMPLE);
    if (!progI || !progS) return null;

    const vaoCube = gl.createVertexArray();
    gl.bindVertexArray(vaoCube);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, cubeVerts, gl.STATIC_DRAW);
    const stride = 24;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);

    const N = seats.length;
    const inst = new Float32Array(N * 16);
    const sx = 0.52,
      sy = 0.42,
      sz = 0.48;
    const tmp = new Float32Array(16);
    for (let i = 0; i < N; i++) {
      const s = seats[i];
      mat4ScaleTranslate(tmp, sx, sy, sz, s.x, s.y, s.z);
      inst.set(tmp, i * 16);
    }
    const vboInst = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vboInst);
    gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
    const row = 4;
    for (let k = 0; k < 4; k++) {
      const loc = 2 + k;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 64, k * 16);
      gl.vertexAttribDivisor(loc, 1);
    }

    const floorY = -3.55;
    const floorHalf = 52;
    const floorVerts = new Float32Array([
      -floorHalf,
      floorY,
      -floorHalf,
      0,
      1,
      0,
      floorHalf,
      floorY,
      -floorHalf,
      0,
      1,
      0,
      floorHalf,
      floorY,
      floorHalf,
      0,
      1,
      0,
      -floorHalf,
      floorY,
      -floorHalf,
      0,
      1,
      0,
      floorHalf,
      floorY,
      floorHalf,
      0,
      1,
      0,
      -floorHalf,
      floorY,
      floorHalf,
      0,
      1,
      0,
    ]);
    const vaoFloor = gl.createVertexArray();
    gl.bindVertexArray(vaoFloor);
    const vboF = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vboF);
    gl.bufferData(gl.ARRAY_BUFFER, floorVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

    const stZ0 = 5.2;
    const stW = 22;
    const stH = 1.1;
    const stD = 6.5;
    const stageVerts = new Float32Array(cubeVerts.length);
    for (let i = 0; i < cubeVerts.length / 6; i++) {
      const o = i * 6;
      stageVerts[o] = cubeVerts[o] * stW;
      stageVerts[o + 1] = cubeVerts[o + 1] * stH + floorY + stH * 0.5 + 0.05;
      stageVerts[o + 2] = cubeVerts[o + 2] * stD + stZ0;
      stageVerts[o + 3] = cubeVerts[o + 3];
      stageVerts[o + 4] = cubeVerts[o + 4];
      stageVerts[o + 5] = cubeVerts[o + 5];
    }
    const vaoStage = gl.createVertexArray();
    gl.bindVertexArray(vaoStage);
    const vboSt = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vboSt);
    gl.bufferData(gl.ARRAY_BUFFER, stageVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

    /* جدار خلفي للقاعة — يوضّح «المسرح» خصوصاً على الشاشات الطويلة */
    const backZ = -58;
    const backX = 46;
    const backY0 = -11;
    const backY1 = 8;
    const backWallVerts = new Float32Array([
      -backX,
      backY0,
      backZ,
      0,
      0,
      1,
      backX,
      backY0,
      backZ,
      0,
      0,
      1,
      backX,
      backY1,
      backZ,
      0,
      0,
      1,
      -backX,
      backY0,
      backZ,
      0,
      0,
      1,
      backX,
      backY1,
      backZ,
      0,
      0,
      1,
      -backX,
      backY1,
      backZ,
      0,
      0,
      1,
    ]);
    const vaoBackWall = gl.createVertexArray();
    gl.bindVertexArray(vaoBackWall);
    const vboBw = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vboBw);
    gl.bufferData(gl.ARRAY_BUFFER, backWallVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

    gl.useProgram(progS);
    const locModelS = gl.getUniformLocation(progS, "uModel");
    const locVpS = gl.getUniformLocation(progS, "uVP");
    const locColS = gl.getUniformLocation(progS, "uColor");
    const locLiS = gl.getUniformLocation(progS, "uLight");
    const locEyeS = gl.getUniformLocation(progS, "uEye");
    const locFloorYS = gl.getUniformLocation(progS, "uFloorY");
    const locRimS = gl.getUniformLocation(progS, "uRim");

    gl.useProgram(progI);
    const locVpI = gl.getUniformLocation(progI, "uVP");
    const locLiI = gl.getUniformLocation(progI, "uLight");
    const locHi0I = gl.getUniformLocation(progI, "uHi0");
    const locHi1I = gl.getUniformLocation(progI, "uHi1");
    const locHi2I = gl.getUniformLocation(progI, "uHi2");
    const locBaseI = gl.getUniformLocation(progI, "uBase");
    const locHiCI = gl.getUniformLocation(progI, "uHi");

    const proj = new Float32Array(16);
    const view = new Float32Array(16);
    const vp = new Float32Array(16);
    const modelStage = new Float32Array(16);
    mat4Identity(modelStage);

    const orbit = { x: 0, y: -1.2, z: -14 };
    let lookTx = orbit.x,
      lookTy = orbit.y,
      lookTz = orbit.z;

    const uLight = new Float32Array([0.45, 0.85, 0.55]);
    let orbitEnabled = false;

    let aspect = 1;
    let highlight0 = -1;
    let highlight1 = -1;
    let highlight2 = -1;
    let yaw = 0.55;
    let pitch = 0.38;
    let dist = 46;

    function eyeFromOrbit() {
      const cp = Math.cos(pitch),
        sp = Math.sin(pitch);
      const cy = Math.cos(yaw),
        sy = Math.sin(yaw);
      return {
        x: orbit.x + dist * cp * sy,
        y: orbit.y + dist * sp,
        z: orbit.z + dist * cp * cy,
      };
    }

    function draw() {
      aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      let fovyDeg = 50;
      if (aspect < 0.72) {
        fovyDeg = Math.min(70, 50 + (0.72 - aspect) * 34);
      }
      mat4Perspective(proj, (fovyDeg * Math.PI) / 180, aspect, 0.1, 220);
      const e = eyeFromOrbit();
      mat4LookAt(view, e.x, e.y, e.z, lookTx, lookTy, lookTz, 0, 1, 0);
      mat4Multiply(vp, proj, view);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.04, 0.045, 0.07, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);

      gl.useProgram(progS);
      gl.uniform3fv(locLiS, uLight);
      gl.uniform3f(locEyeS, e.x, e.y, e.z);
      gl.uniform1f(locFloorYS, floorY);
      gl.uniform1f(locRimS, 0.42);
      gl.uniformMatrix4fv(locModelS, false, modelStage);
      gl.uniformMatrix4fv(locVpS, false, vp);

      gl.uniform3f(locColS, 0.055, 0.06, 0.09);
      gl.bindVertexArray(vaoBackWall);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.uniform3f(locColS, 0.16, 0.17, 0.22);
      gl.bindVertexArray(vaoFloor);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.uniform3f(locColS, 0.3, 0.28, 0.34);
      gl.bindVertexArray(vaoStage);
      gl.drawArrays(gl.TRIANGLES, 0, 36);

      gl.useProgram(progI);
      gl.uniformMatrix4fv(locVpI, false, vp);
      gl.uniform3fv(locLiI, uLight);
      gl.uniform1i(locHi0I, highlight0);
      gl.uniform1i(locHi1I, highlight1);
      gl.uniform1i(locHi2I, highlight2);
      gl.uniform3f(locBaseI, 0.22, 0.38, 0.62);
      gl.uniform3f(locHiCI, 0.92, 0.2, 0.22);

      gl.bindVertexArray(vaoCube);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, N);
    }

    function resize() {
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    let raf = 0;
    function loop() {
      resize();
      draw();
      raf = global.requestAnimationFrame(loop);
    }

    function start() {
      if (!raf) loop();
    }

    function stop() {
      if (raf) {
        global.cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    function setHighlightIndex(i) {
      highlight0 = i;
      highlight1 = -1;
      highlight2 = -1;
    }

    function setHighlightIndices(indices) {
      highlight0 = indices[0] != null ? indices[0] : -1;
      highlight1 = indices[1] != null ? indices[1] : -1;
      highlight2 = indices[2] != null ? indices[2] : -1;
    }

    function setOrbit(y, p, d) {
      yaw = y;
      pitch = p;
      dist = d;
    }

    function getOrbit() {
      return { yaw, pitch, dist, orbit: { x: orbit.x, y: orbit.y, z: orbit.z } };
    }

    function setLookAt(tx, ty, tz) {
      lookTx = tx;
      lookTy = ty;
      lookTz = tz;
    }

    function setOrbitEnabled(v) {
      orbitEnabled = v;
    }

    function clamp(v, a, b) {
      return Math.max(a, Math.min(b, v));
    }

    let drag = false;
    let lx = 0;
    let ly = 0;

    function onPointerDown(e) {
      if (!orbitEnabled) return;
      drag = true;
      lx = e.clientX;
      ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    }
    function onPointerUp(e) {
      drag = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
    function onPointerMove(e) {
      if (!orbitEnabled || !drag) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      yaw += dx * 0.0065;
      pitch += dy * 0.0045;
      pitch = clamp(pitch, -0.55, 0.72);
    }
    function onWheel(e) {
      if (!orbitEnabled) return;
      e.preventDefault();
      dist *= 1 + Math.sign(e.deltaY) * 0.08;
      dist = clamp(dist, 10, 95);
    }

    const wheelOpts = { passive: false };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("wheel", onWheel, wheelOpts);

    const vv = global.visualViewport;
    function onVisualViewportChange() {
      resize();
    }
    if (vv) {
      vv.addEventListener("resize", onVisualViewportChange);
      vv.addEventListener("scroll", onVisualViewportChange);
    }

    function dispose() {
      stop();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("wheel", onWheel, wheelOpts);
      if (vv) {
        vv.removeEventListener("resize", onVisualViewportChange);
        vv.removeEventListener("scroll", onVisualViewportChange);
      }
      gl.deleteProgram(progI);
      gl.deleteProgram(progS);
    }

    return {
      gl,
      start,
      stop,
      resize,
      draw,
      setHighlightIndex,
      setHighlightIndices,
      setOrbit,
      getOrbit,
      setLookAt,
      setOrbitEnabled,
      dispose,
    };
  }

  global.TheaterWebGL = { create: createTheater };
})(typeof window !== "undefined" ? window : globalThis);
