/*! FontLoader + TextGeometry for THREE global (r160 classic build) */
(function (THREE) {
  'use strict';
  if (!THREE) return;

  function Font(data) {
    this.isFont = true;
    this.type = 'Font';
    this.data = data;
  }

  Font.prototype.generateShapes = function (text, size) {
    size = size === undefined ? 100 : size;
    var shapes = [];
    var paths = createPaths(text, size, this.data);
    for (var p = 0; p < paths.length; p++) {
      var s = paths[p].toShapes(false);
      for (var i = 0; i < s.length; i++) shapes.push(s[i]);
    }
    return shapes;
  };

  function createPaths(text, size, data) {
    var chars = Array.from(text);
    var scale = size / data.resolution;
    var line_height = (data.boundingBox.yMax - data.boundingBox.yMin + data.underlineThickness) * scale;
    var paths = [];
    var offsetX = 0, offsetY = 0;
    for (var i = 0; i < chars.length; i++) {
      var char = chars[i];
      if (char === '\n') {
        offsetX = 0;
        offsetY -= line_height;
      } else {
        var ret = createPath(char, scale, offsetX, offsetY, data);
        if (ret) {
          offsetX += ret.offsetX;
          paths.push(ret.path);
        }
      }
    }
    return paths;
  }

  function createPath(char, scale, offsetX, offsetY, data) {
    var glyph = data.glyphs[char] || data.glyphs['?'];
    if (!glyph) return null;
    var path = new THREE.ShapePath();
    var x, y, cpx, cpy, cpx1, cpy1, cpx2, cpy2;
    if (glyph.o) {
      var outline = glyph._cachedOutline || (glyph._cachedOutline = glyph.o.split(' '));
      for (var i = 0, l = outline.length; i < l; ) {
        var action = outline[i++];
        switch (action) {
          case 'm':
            x = outline[i++] * scale + offsetX;
            y = outline[i++] * scale + offsetY;
            path.moveTo(x, y);
            break;
          case 'l':
            x = outline[i++] * scale + offsetX;
            y = outline[i++] * scale + offsetY;
            path.lineTo(x, y);
            break;
          case 'q':
            cpx = outline[i++] * scale + offsetX;
            cpy = outline[i++] * scale + offsetY;
            cpx1 = outline[i++] * scale + offsetX;
            cpy1 = outline[i++] * scale + offsetY;
            path.quadraticCurveTo(cpx1, cpy1, cpx, cpy);
            break;
          case 'b':
            cpx = outline[i++] * scale + offsetX;
            cpy = outline[i++] * scale + offsetY;
            cpx1 = outline[i++] * scale + offsetX;
            cpy1 = outline[i++] * scale + offsetY;
            cpx2 = outline[i++] * scale + offsetX;
            cpy2 = outline[i++] * scale + offsetY;
            path.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, cpx, cpy);
            break;
        }
      }
    }
    return { offsetX: glyph.ha * scale, path: path };
  }

  function FontLoader() {
    this.path = '';
  }
  FontLoader.prototype.setPath = function (path) {
    this.path = path;
    return this;
  };
  FontLoader.prototype.load = function (url, onLoad, onProgress, onError) {
    var scope = this;
    var loader = new THREE.FileLoader();
    if (this.path) loader.setPath(this.path);
    loader.load(url, function (text) {
      try {
        var font = scope.parse(JSON.parse(text));
        if (onLoad) onLoad(font);
      } catch (err) {
        if (onError) onError(err);
      }
    }, onProgress, onError);
  };
  FontLoader.prototype.parse = function (json) {
    return new Font(json);
  };

  function TextGeometry(text, parameters) {
    parameters = parameters || {};
    var font = parameters.font;
    if (!font) {
      return new THREE.ExtrudeGeometry([], parameters);
    }
    var shapes = font.generateShapes(text, parameters.size);
    var opts = {
      depth: parameters.height !== undefined ? parameters.height : 50,
      bevelEnabled: parameters.bevelEnabled !== undefined ? parameters.bevelEnabled : false,
      bevelThickness: parameters.bevelThickness !== undefined ? parameters.bevelThickness : 10,
      bevelSize: parameters.bevelSize !== undefined ? parameters.bevelSize : 8,
      bevelOffset: parameters.bevelOffset !== undefined ? parameters.bevelOffset : 0,
      bevelSegments: parameters.bevelSegments !== undefined ? parameters.bevelSegments : 3,
      curveSegments: parameters.curveSegments !== undefined ? parameters.curveSegments : 12
    };
    var geo = new THREE.ExtrudeGeometry(shapes, opts);
    geo.type = 'TextGeometry';
    return geo;
  }

  THREE.FontLoader = FontLoader;
  THREE.Font = Font;
  THREE.TextGeometry = TextGeometry;
})(typeof THREE !== 'undefined' ? THREE : undefined);
