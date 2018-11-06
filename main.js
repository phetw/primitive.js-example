;(function() {
  'use strict'

  const SVGNS = 'http://www.w3.org/2000/svg'

  function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x))
  }

  function clampColor(x) {
    return clamp(x, 0, 255)
  }

  function distanceToDifference(distance, pixels) {
    return Math.pow(distance * 255, 2) * (3 * pixels)
  }

  function differenceToDistance(difference, pixels) {
    return Math.sqrt(difference / (3 * pixels)) / 255
  }

  function difference(data, dataOther) {
    let sum = 0,
      diff
    for (let i = 0; i < data.data.length; i++) {
      if (i % 4 == 3) {
        continue
      }
      diff = dataOther.data[i] - data.data[i]
      sum = sum + diff * diff
    }

    return sum
  }

  function computeColor(offset, imageData, alpha) {
    let color = [0, 0, 0]
    let { shape, current, target } = imageData
    let shapeData = shape.data
    let currentData = current.data
    let targetData = target.data

    let si, sx, sy, fi, fx, fy
    let sw = shape.width
    let sh = shape.height
    let fw = current.width
    let fh = current.height
    let count = 0

    for (sy = 0; sy < sh; sy++) {
      fy = sy + offset.top
      if (fy < 0 || fy >= fh) {
        continue
      }

      for (sx = 0; sx < sw; sx++) {
        fx = offset.left + sx
        if (fx < 0 || fx >= fw) {
          continue
        }

        si = 4 * (sx + sy * sw)
        if (shapeData[si + 3] == 0) {
          continue
        }

        fi = 4 * (fx + fy * fw)
        color[0] += (targetData[fi] - currentData[fi]) / alpha + currentData[fi]
        color[1] += (targetData[fi + 1] - currentData[fi + 1]) / alpha + currentData[fi + 1]
        color[2] += (targetData[fi + 2] - currentData[fi + 2]) / alpha + currentData[fi + 2]
        count++
      }
    }
    return color.map(x => ~~(x / count)).map(clampColor)
  }

  function computeDifferenceChange(offset, imageData, color) {
    let { shape, current, target } = imageData
    let shapeData = shape.data
    let currentData = current.data
    let targetData = target.data

    let a, b, d1r, d1g, d1b, d2r, d2b, d2g
    let si, sx, sy, fi, fx, fy /* shape-index, shape-x, shape-y, full-index */
    let sw = shape.width
    let sh = shape.height
    let fw = current.width
    let fh = current.height

    var sum = 0

    for (sy = 0; sy < sh; sy++) {
      fy = sy + offset.top
      if (fy < 0 || fy >= fh) {
        continue
      }

      for (sx = 0; sx < sw; sx++) {
        fx = offset.left + sx
        if (fx < 0 || fx >= fw) {
          continue
        }

        si = 4 * (sx + sy * sw)
        a = shapeData[si + 3]
        if (a == 0) {
          continue
        }

        fi = 4 * (fx + fy * fw)

        a = a / 255
        b = 1 - a
        d1r = targetData[fi] - currentData[fi]
        d1g = targetData[fi + 1] - currentData[fi + 1]
        d1b = targetData[fi + 2] - currentData[fi + 2]

        d2r = targetData[fi] - (color[0] * a + currentData[fi] * b)
        d2g = targetData[fi + 1] - (color[1] * a + currentData[fi + 1] * b)
        d2b = targetData[fi + 2] - (color[2] * a + currentData[fi + 2] * b)

        sum -= d1r * d1r + d1g * d1g + d1b * d1b
        sum += d2r * d2r + d2g * d2g + d2b * d2b
      }
    }

    return sum
  }

  function computeColorAndDifferenceChange(offset, imageData, alpha) {
    let rgb = computeColor(offset, imageData, alpha)
    let differenceChange = computeDifferenceChange(offset, imageData, rgb)

    let color = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`

    return { color, differenceChange }
  }

  function getScale(width, height, limit) {
    return Math.max(width / limit, height / limit, 1)
  }

  function getFill(canvas) {
    let data = canvas.getImageData()
    let w = data.width
    let h = data.height
    let d = data.data
    let rgb = [0, 0, 0]
    let count = 0
    let i

    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
          continue
        }
        count++
        i = 4 * (x + y * w)
        rgb[0] += d[i]
        rgb[1] += d[i + 1]
        rgb[2] += d[i + 2]
      }
    }

    rgb = rgb.map(x => ~~(x / count)).map(clampColor)
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
  }

  function svgRect(w, h) {
    let node = document.createElementNS(SVGNS, 'rect')
    node.setAttribute('x', 0)
    node.setAttribute('y', 0)
    node.setAttribute('width', w)
    node.setAttribute('height', h)

    return node
  }

  class Canvas {
    static empty(cfg, svg) {
      if (svg) {
        let node = document.createElementNS(SVGNS, 'svg')
        node.setAttribute('viewBox', `0 0 ${cfg.width} ${cfg.height}`)
        node.setAttribute('clip-path', 'url(#clip)')

        let defs = document.createElementNS(SVGNS, 'defs')
        node.appendChild(defs)

        let cp = document.createElementNS(SVGNS, 'clipPath')
        defs.appendChild(cp)
        cp.setAttribute('id', 'clip')
        cp.setAttribute('clipPathUnits', 'objectBoundingBox')

        let rect = svgRect(cfg.width, cfg.height)
        cp.appendChild(rect)

        rect = svgRect(cfg.width, cfg.height)
        rect.setAttribute('fill', cfg.fill)
        node.appendChild(rect)

        return node
      } else {
        return new this(cfg.width, cfg.height).fill(cfg.fill)
      }
    }

    static toCanvas(cfg) {
      /* parse image to canvas */
      return new Promise(resolve => {
        let img = document.getElementById('raw')
        img.crossOrigin = false
        // img.src = 'https://picsum.photos/275/275'
        img.onload = () => {
          let w = img.naturalWidth
          let h = img.naturalHeight

          let computeScale = getScale(w, h, cfg.computeSize)
          cfg.width = w / computeScale
          cfg.height = h / computeScale

          let viewScale = getScale(w, h, cfg.viewSize)

          cfg.scale = computeScale / viewScale

          let canvas = this.empty(cfg)
          canvas.ctx.drawImage(img, 0, 0, cfg.width, cfg.height)

          cfg.fill = getFill(canvas)

          resolve(canvas)
        }
      })
    }

    constructor(width, height) {
      this.node = document.createElement('canvas')
      this.node.width = width
      this.node.height = height
      this.ctx = this.node.getContext('2d')
      this._imageData = null
    }

    clone() {
      let otherCanvas = new this.constructor(this.node.width, this.node.height)
      otherCanvas.ctx.drawImage(this.node, 0, 0)
      return otherCanvas
    }

    fill(color) {
      this.ctx.fillStyle = color
      this.ctx.fillRect(0, 0, this.node.width, this.node.height)
      return this
    }

    getImageData() {
      if (!this._imageData) {
        this._imageData = this.ctx.getImageData(0, 0, this.node.width, this.node.height)
      }
      return this._imageData
    }

    difference(otherCanvas) {
      let data = this.getImageData()
      let dataOther = otherCanvas.getImageData()

      return difference(data, dataOther)
    }

    distance(otherCanvas) {
      let difference$$1 = this.difference(otherCanvas)
      return differenceToDistance(difference$$1, this.node.width * this.node.height)
    }

    drawStep(step) {
      this.ctx.globalAlpha = step.alpha
      this.ctx.fillStyle = step.color
      step.shape.render(this.ctx)
      return this
    }
  }

  class Shape {
    static randomPoint(width, height) {
      return [~~(Math.random() * width), ~~(Math.random() * height)]
    }

    static create(cfg) {
      let ctors = cfg.shapeTypes
      let index = Math.floor(Math.random() * ctors.length)
      let ctor = ctors[index]
      return new ctor(cfg.width, cfg.height)
    }

    constructor() {
      this.bbox = {}
    }

    mutate() {
      return this
    }

    toSVG() {}

    rasterize(alpha) {
      const canvas = new Canvas(this.bbox.width, this.bbox.height)
      const ctx = canvas.ctx
      ctx.fillStyle = '#000'
      ctx.globalAlpha = alpha
      ctx.translate(-this.bbox.left, -this.bbox.top)

      this.render(ctx)
      return canvas
    }
  }

  class Polygon extends Shape {
    constructor(w, h, count) {
      super(w, h)
      this.points = this._createPoints(w, h, count)
      this.computeBbox()
    }

    render(ctx) {
      ctx.beginPath()
      this.points.forEach(([x, y], index) => {
        if (index) {
          ctx.lineTo(x, y)
        } else {
          ctx.moveTo(x, y)
        }
      })
      ctx.closePath()
      ctx.fill()
    }

    toSVG() {
      let path = document.createElementNS(SVGNS, 'path')
      let d = this.points
        .map((point, index) => {
          let cmd = index ? 'L' : 'M'
          return `${cmd}${point.join(',')}`
        })
        .join('')
      path.setAttribute('d', `${d}Z`)
      return path
    }

    mutate() {
      const clone = new this.constructor(0, 0)
      clone.points = this.points.map(point => point.slice())

      const index = Math.floor(Math.random() * this.points.length)
      const point = clone.points[index]

      const angle = Math.random() * 2 * Math.PI
      let radius = Math.random() * 20
      point[0] += ~~(radius * Math.cos(angle))
      point[1] += ~~(radius * Math.sin(angle))

      return clone.computeBbox()
    }

    computeBbox() {
      let min = [this.points.reduce((v, p) => Math.min(v, p[0]), Infinity), this.points.reduce((v, p) => Math.min(v, p[1]), Infinity)]
      let max = [this.points.reduce((v, p) => Math.max(v, p[0]), -Infinity), this.points.reduce((v, p) => Math.max(v, p[1]), -Infinity)]

      this.bbox = {
        left: min[0],
        top: min[1],
        width: max[0] - min[0] || 1,
        height: max[1] - min[1] || 1
      }
      return this
    }

    _createPoints(w, h, count) {
      let first = Shape.randomPoint(w, h)
      let points = [first]

      for (let i = 1; i < count; i++) {
        let angle = Math.random() * 2 * Math.PI
        let radius = Math.random() * 20
        points.push([first[0] + ~~(radius * Math.cos(angle)), first[1] + ~~(radius * Math.sin(angle))])
      }
      return points
    }
  }

  class Triangle extends Polygon {
    constructor(w, h) {
      super(w, h, 3)
    }
  }

  /* State: target canvas, current canvas and a distance value */
  class State {
    constructor(target, canvas, distance = Infinity) {
      this.target = target
      this.canvas = canvas
      this.distance = distance == Infinity ? target.distance(canvas) : distance
    }
  }

  class Step {
    constructor(shape, cfg) {
      this.shape = shape
      this.cfg = cfg
      this.alpha = cfg.alpha
      this.color = '#000'
      this.distance = Infinity
    }

    toSVG() {
      let node = this.shape.toSVG()
      node.setAttribute('fill', this.color)
      node.setAttribute('fill-opacity', this.alpha.toFixed(2))
      return node
    }

    /* apply this step to a state to get a new state. call only after .compute */
    apply(state) {
      let newCanvas = state.canvas.clone().drawStep(this)
      return new State(state.target, newCanvas, this.distance)
    }

    /* find optimal color and compute the resulting distance */
    compute(state) {
      let pixels = state.canvas.node.width * state.canvas.node.height
      let offset = this.shape.bbox

      let imageData = {
        shape: this.shape.rasterize(this.alpha).getImageData(),
        current: state.canvas.getImageData(),
        target: state.target.getImageData()
      }

      let { color, differenceChange } = computeColorAndDifferenceChange(offset, imageData, this.alpha)
      this.color = color
      let currentDifference = distanceToDifference(state.distance, pixels)
      if (-differenceChange > currentDifference) debugger
      this.distance = differenceToDistance(currentDifference + differenceChange, pixels)

      return Promise.resolve(this)
    }

    mutate() {
      const newShape = this.shape.mutate(this.cfg)
      const mutated = new this.constructor(newShape, this.cfg)
      if (this.cfg.mutateAlpha) {
        let mutatedAlpha = this.alpha + (Math.random() - 0.5) * 0.08
        mutated.alpha = clamp(mutatedAlpha, 0.1, 1)
      }
      return mutated
    }
  }

  class Optimizer {
    constructor(canvas, cfg) {
      this.cfg = cfg
      this.state = new State(canvas, Canvas.empty(cfg))
      this._steps = 0
      this.onStep = () => {}
    }

    start() {
      this._addShape()
    }

    _addShape() {
      this._findBestStep()
        .then(step => this._optimizeStep(step))
        .then(step => {
          this._steps++
          if (step.distance < this.state.distance) {
            this.state = step.apply(this.state)
            this.onStep(step)
          } else {
            this.onStep(null)
          }
          this._continue()
        })
    }

    _continue() {
      if (this._steps < this.cfg.steps) {
        setTimeout(() => this._addShape(), 0.001)
      }

      const completedPercentage = this._steps / this.cfg.steps * 100
      if (completedPercentage > 55) {
        document.getElementById('raw').style.opacity = '1'
        document.getElementById('vector').style.opacity = '0'
      }
    }

    _findBestStep() {
      const LIMIT = this.cfg.shapes
      const promises = []

      let bestStep = null

      for (let i = 0; i < LIMIT; i++) {
        let shape = Shape.create(this.cfg)

        let promise = new Step(shape, this.cfg).compute(this.state).then(step => {
          if (!bestStep || step.distance < bestStep.distance) {
            bestStep = step
          }
        })
        promises.push(promise)
      }

      return Promise.all(promises).then(() => bestStep)
    }

    _optimizeStep(step) {
      const LIMIT = this.cfg.mutations

      let failedAttempts = 0
      let resolve = null
      let bestStep = step
      let promise = new Promise(r => (resolve = r))

      let tryMutation = () => {
        if (failedAttempts >= LIMIT) {
          return resolve(bestStep)
        }

        bestStep
          .mutate()
          .compute(this.state)
          .then(mutatedStep => {
            if (mutatedStep.distance < bestStep.distance) {
              failedAttempts = 0
              bestStep = mutatedStep
            } else {
              failedAttempts++
            }
            tryMutation()
          })
      }

      tryMutation()
      return promise
    }
  }

  const nodes = {
    vector: document.querySelector('#vector')
  }

  function go(canvas, config) {
    nodes.vector.innerHTML = ''

    const optimizer = new Optimizer(canvas, config)

    const result = Canvas.empty(config, false)
    result.ctx.scale(config.scale, config.scale)

    const svg = Canvas.empty(config, true)

    svg.setAttribute('width', config.scale * config.width)
    svg.setAttribute('height', config.scale * config.height)
    nodes.vector.appendChild(svg)

    optimizer.onStep = step => {
      if (step) {
        result.drawStep(step)
        svg.appendChild(step.toSVG())
      }
    }

    optimizer.start()
  }

  function init() {
    const config = {
      computeSize: 100,
      viewSize: 275,
      steps: 600,
      shapes: 150,
      alpha: 0.5,
      mutations: 25,
      mutateAlpha: false,
      shapeTypes: [Triangle],
      fill: 'auto'
    }

    Canvas.toCanvas(config).then(canvas => go(canvas, config))
  }

  init()
})()
