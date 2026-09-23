import * as THREE from 'three'

// Procedural CanvasTextures. Nothing here is loaded from disk (PLAN.md rail 4).

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return [canvas, canvas.getContext('2d')]
}

function toTexture(canvas, { srgb = false, wrap = THREE.RepeatWrapping } = {}) {
  const texture = new THREE.CanvasTexture(canvas)
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = wrap
  texture.wrapT = wrap
  texture.anisotropy = 8
  return texture
}

/** Soft dark blotches for weathering. */
function paintGrime(g, width, height, count, alpha) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * width
    const y = Math.random() * height
    const r = 4 + Math.random() * 26
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, `rgba(0,0,0,${alpha})`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
}

/** Fill the same rect on the colour and bump canvases at once. */
function fillBoth(g, bg, colour, bump, x, y, w, h) {
  g.fillStyle = colour
  g.fillRect(x, y, w, h)
  bg.fillStyle = bump
  bg.fillRect(x, y, w, h)
}

// One plate = 256 x 512 texels, wrapped along the wall so the seams/bolts tile.
export function createConduitTextures() {
  const W = 256
  const H = 512
  const [canvas, g] = createCanvas(W, H)
  const [bumpCanvas, bg] = createCanvas(W, H)
  const [emissiveCanvas, eg] = createCanvas(W, H)
  const [roughCanvas, rg] = createCanvas(W, H)

  g.fillStyle = '#3a4252'
  g.fillRect(0, 0, W, H)
  bg.fillStyle = '#808080'
  bg.fillRect(0, 0, W, H)
  eg.fillStyle = '#000'
  eg.fillRect(0, 0, W, H)
  // Base metal roughness (~0.42 smooth brushed alloy)
  rg.fillStyle = '#686868'
  rg.fillRect(0, 0, W, H)

  // brushed streaks
  for (let i = 0; i < 900; i++) {
    const y = Math.random() * H
    const l = 20 + Math.random() * 140
    g.fillStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.03})`
    g.fillRect(Math.random() * W, y, l, 1)
    rg.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'
    rg.fillRect(Math.random() * W, y, l, 1)
  }
  paintGrime(g, W, H, 60, 0.18)
  // Grime patches are matte and rough
  paintGrime(rg, W, H, 45, 0.25)

  // recessed side channels
  fillBoth(g, bg, '#232a35', '#404040', 0, 0, 20, H)
  fillBoth(g, bg, '#232a35', '#404040', W - 20, 0, 20, H)
  rg.fillStyle = '#8e8e8e'
  rg.fillRect(0, 0, 20, H)
  rg.fillRect(W - 20, 0, 20, H)

  g.fillStyle = 'rgba(0,0,0,0.5)'
  g.fillRect(20, 0, 2, H)
  g.fillRect(W - 22, 0, 2, H)
  g.fillStyle = 'rgba(255,255,255,0.08)'
  g.fillRect(23, 0, 1, H)
  g.fillRect(W - 24, 0, 1, H)

  // ice trim lines running the length (polished glass/conduit)
  g.fillStyle = 'rgba(61,224,255,0.22)'
  g.fillRect(26, 0, 2, H)
  g.fillRect(W - 28, 0, 2, H)
  eg.fillStyle = 'rgba(61,224,255,0.55)'
  eg.fillRect(26, 0, 2, H)
  eg.fillRect(W - 28, 0, 2, H)
  rg.fillStyle = '#303030'
  rg.fillRect(26, 0, 2, H)
  rg.fillRect(W - 28, 0, 2, H)

  for (let y = 0; y < H; y += 64) {
    const row = y / 64

    // panel seam
    g.fillStyle = 'rgba(0,0,0,0.45)'
    g.fillRect(30, y + 50, W - 60, 3)
    g.fillStyle = 'rgba(255,255,255,0.07)'
    g.fillRect(30, y + 53, W - 60, 1)
    bg.fillStyle = '#303030'
    bg.fillRect(30, y + 49, W - 60, 4)
    rg.fillStyle = '#a8a8a8'
    rg.fillRect(30, y + 49, W - 60, 4)

    // bolts (polished chrome heads with dark sockets)
    for (const bx of [40, W - 50]) {
      fillBoth(g, bg, '#5a6574', '#c0c0c0', bx, y + 12, 10, 10)
      fillBoth(g, bg, '#1a1f28', '#303030', bx + 3, y + 15, 4, 4)
      rg.fillStyle = '#222222'
      rg.fillRect(bx, y + 12, 10, 10)
      rg.fillStyle = '#b0b0b0'
      rg.fillRect(bx + 3, y + 15, 4, 4)
    }

    // sodium indicator slit
    const lit = row % 3 !== 1
    g.fillStyle = lit ? '#e8a030' : '#3a2a14'
    g.fillRect(124, y + 8, 3, 40)
    if (lit) {
      eg.fillStyle = 'rgba(232,160,48,0.9)'
      eg.fillRect(124, y + 8, 3, 40)
    }
    rg.fillStyle = lit ? '#2c2c2c' : '#777777'
    rg.fillRect(124, y + 8, 3, 40)

    // vent grille
    if (row % 2 === 0) {
      for (let k = 0; k < 6; k++) {
        fillBoth(g, bg, 'rgba(0,0,0,0.55)', '#404040', 70, y + 18 + k * 5, 40, 2)
        rg.fillStyle = '#9e9e9e'
        rg.fillRect(70, y + 18 + k * 5, 40, 2)
      }
      g.fillStyle = 'rgba(0,0,0,0.55)'
      for (let k = 0; k < 6; k++) {
        g.fillRect(W - 110, y + 18 + k * 5, 40, 2)
        rg.fillStyle = '#9e9e9e'
        rg.fillRect(W - 110, y + 18 + k * 5, 40, 2)
      }
    }

    // tiny status LEDs
    const ledOn = Math.random() > 0.3
    g.fillStyle = ledOn ? '#3de0ff' : '#1a3a44'
    g.fillRect(W - 62, y + 40, 4, 4)
    if (ledOn) {
      eg.fillStyle = '#3de0ff'
      eg.fillRect(W - 62, y + 40, 4, 4)
    }
    rg.fillStyle = ledOn ? '#282828' : '#606060'
    rg.fillRect(W - 62, y + 40, 4, 4)
  }

  return {
    map: toTexture(canvas, { srgb: true }),
    bump: toTexture(bumpCanvas),
    roughness: toTexture(roughCanvas),
    emissive: toTexture(emissiveCanvas, { srgb: true }),
  }
}

// Square plate used on bulkheads / pylons. 1 tile = 2 world units.
export function createPlateTextures() {
  const S = 256
  const [canvas, g] = createCanvas(S, S)
  const [bumpCanvas, bg] = createCanvas(S, S)
  g.fillStyle = '#4a5364'
  g.fillRect(0, 0, S, S)
  bg.fillStyle = '#808080'
  bg.fillRect(0, 0, S, S)
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(255,255,255,${0.01 + Math.random() * 0.03})`
    g.fillRect(Math.random() * S, Math.random() * S, 1, 10 + Math.random() * 40)
  }
  paintGrime(g, S, S, 40, 0.16)

  // seams into 2x2 sub-plates
  fillBoth(g, bg, 'rgba(0,0,0,0.5)', '#303030', 0, S / 2 - 2, S, 4)
  fillBoth(g, bg, 'rgba(0,0,0,0.5)', '#303030', S / 2 - 2, 0, 4, S)

  // hazard chevrons in one sub-plate
  g.save()
  g.beginPath()
  g.rect(8, 8, S / 2 - 16, S / 2 - 16)
  g.clip()
  for (let k = -S; k < S; k += 28) {
    g.fillStyle = '#c98a26'
    g.beginPath()
    g.moveTo(k, 0)
    g.lineTo(k + 14, 0)
    g.lineTo(k + 14 + S, S)
    g.lineTo(k + S, S)
    g.closePath()
    g.fill()
  }
  paintGrime(g, S / 2, S / 2, 20, 0.3)
  g.restore()

  // rivets
  const inset = 12
  const rivets = []
  for (const [ox, oy] of [
    [0, 0],
    [S / 2, S / 2],
  ]) {
    rivets.push(
      [ox + inset, oy + inset],
      [ox + S / 2 - inset, oy + inset],
      [ox + inset, oy + S / 2 - inset],
      [ox + S / 2 - inset, oy + S / 2 - inset],
    )
  }
  for (const [x, y] of rivets) {
    g.fillStyle = '#6a7585'
    g.beginPath()
    g.arc(x, y, 4, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#20262f'
    g.beginPath()
    g.arc(x + 1, y + 1, 1.6, 0, Math.PI * 2)
    g.fill()
    bg.fillStyle = '#d0d0d0'
    bg.beginPath()
    bg.arc(x, y, 4, 0, Math.PI * 2)
    bg.fill()
  }
  const map = toTexture(canvas, { srgb: true })
  const bump = toTexture(bumpCanvas)
  map.repeat.set(0.5, 0.5)
  bump.repeat.set(0.5, 0.5)
  return { map, bump }
}

/**
 * A glowing stroked glyph on a transparent 128px square: a wide blurred pass in
 * the tint colour under a thin bright core. `trace` draws the path(s).
 */
function createGlyphTexture({ glow, core, glowWidth, coreWidth, trace }) {
  const S = 128
  const [canvas, g] = createCanvas(S, S)
  g.clearRect(0, 0, S, S)
  g.lineJoin = 'round'
  g.lineCap = 'round'

  g.shadowColor = glow.shadow
  g.shadowBlur = 14
  g.strokeStyle = glow.stroke
  g.lineWidth = glowWidth
  trace(g)
  g.stroke()

  g.shadowBlur = 0
  g.strokeStyle = core
  g.lineWidth = coreWidth
  trace(g)
  g.stroke()

  const texture = toTexture(canvas, { srgb: true, wrap: THREE.ClampToEdgeWrapping })
  texture.needsUpdate = true
  return texture
}

/** Damper orb icon: double chevron. */
export function createChevronTexture() {
  return createGlyphTexture({
    glow: { shadow: 'rgba(255, 209, 102, 0.95)', stroke: '#ffd166' },
    core: '#fff6d8',
    glowWidth: 14,
    coreWidth: 6,
    trace(g) {
      g.beginPath()
      for (const ox of [52, 84]) {
        g.moveTo(ox - 18, 28)
        g.lineTo(ox + 14, 64)
        g.lineTo(ox - 18, 100)
      }
    },
  })
}

/** Spare-life orb icon: plus. */
export function createPlusTexture() {
  return createGlyphTexture({
    glow: { shadow: 'rgba(61, 255, 138, 0.95)', stroke: '#3dff8a' },
    core: '#e8fff0',
    glowWidth: 18,
    coreWidth: 8,
    trace(g) {
      g.beginPath()
      g.moveTo(64, 22)
      g.lineTo(64, 106)
      g.moveTo(22, 64)
      g.lineTo(106, 64)
    },
  })
}

/** Shunt orb icon: lightning bolt. */
export function createBoltTexture() {
  return createGlyphTexture({
    glow: { shadow: 'rgba(61, 224, 255, 0.95)', stroke: '#3de0ff' },
    core: '#e8fbff',
    glowWidth: 12,
    coreWidth: 5,
    trace(g) {
      g.beginPath()
      g.moveTo(76, 20)
      g.lineTo(44, 70)
      g.lineTo(62, 70)
      g.lineTo(52, 108)
      g.lineTo(84, 56)
      g.lineTo(66, 56)
      g.closePath()
    },
  })
}
