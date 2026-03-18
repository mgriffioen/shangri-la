#!/usr/bin/env python3
"""Generate a pixel-art animated GIF of a raft scene."""

from PIL import Image, ImageDraw
import math

W, H = 250, 210

# ── Palette ──────────────────────────────────────────────────────────────────
WATER_DEEP   = (18,  72, 148)
WATER_MID    = (28,  98, 175)
WATER_LIGHT  = (55, 135, 200)
WATER_FOAM   = (120, 185, 235)
RIPPLE_LT    = (75, 155, 218)
RIPPLE_DK    = (18,  65, 130)

PLANK_LIGHT  = (192, 128,  52)
PLANK_MID    = (155,  98,  36)
PLANK_DARK   = (108,  65,  22)
PLANK_SHADOW = ( 68,  40,  10)

BARREL_BODY  = ( 42,  95, 178)
BARREL_BAND  = ( 25,  58, 110)
BARREL_DARK  = ( 18,  45,  95)
BARREL_HIGH  = ( 95, 160, 225)

LADDER_ALU   = (188, 198, 205)
LADDER_DARK  = (118, 128, 135)
LADDER_HIGH  = (225, 232, 236)

SLIDE_YELL   = (255, 210,  15)
SLIDE_DARK   = (195, 148,   0)
SLIDE_HIGH   = (255, 242,  95)
SLIDE_SHINE  = (255, 255, 180)
POLE_COL     = (205, 208, 215)
POLE_DK      = (135, 138, 148)

SHADOW_WTR   = (12,  52, 112)

def hline(draw, x0, x1, y, color):
    if x1 >= x0: draw.line([(x0, y), (x1, y)], fill=color)

def vline(draw, x, y0, y1, color):
    if y1 >= y0: draw.line([(x, y0), (x, y1)], fill=color)

def rect_fill(draw, x0, y0, x1, y1, color):
    if x1 >= x0 and y1 >= y0:
        draw.rectangle([x0, y0, x1, y1], fill=color)

# ── Vertical anchors ─────────────────────────────────────────────────────────
# dy is bob offset per frame
WATERLINE   = 130      # sea surface y
RAFT_TOP    = 113      # top of deck planks
RAFT_BOT    = 129      # bottom of deck / top of barrel zone
BARREL_MID  = 148      # center-y of barrels (below raft)

# ── Water background ─────────────────────────────────────────────────────────
def draw_water(draw):
    for y in range(H):
        t = y / H
        r = int(WATER_DEEP[0] * (1 - t) + WATER_MID[0] * t)
        g = int(WATER_DEEP[1] * (1 - t) + WATER_MID[1] * t)
        b = int(WATER_DEEP[2] * (1 - t) + WATER_MID[2] * t)
        hline(draw, 0, W - 1, y, (r, g, b))
    # shimmer rows
    for y in range(6, H, 12):
        for x in range(0, W):
            if (x + y * 3) % 9 < 2:
                draw.point((x, y), fill=WATER_LIGHT)
    for y in range(2, H, 7):
        for x in range(0, W):
            if (x * 2 + y) % 13 < 1:
                draw.point((x, y), fill=WATER_FOAM)

# ── Ripples ───────────────────────────────────────────────────────────────────
def draw_ripples(draw, dy, frame):
    wl = WATERLINE + dy
    centers = [(50, wl + 10), (125, wl + 14), (200, wl + 10)]
    phase_offset = frame * 6

    for cx, cy in centers:
        for ring in range(4):
            r_px = 14 + ((ring * 10 + phase_offset) % 38)
            r_py = max(2, r_px // 5)
            col = RIPPLE_LT if ring % 2 == 0 else RIPPLE_DK
            for deg in range(0, 181, 4):   # bottom half arc only
                rad = math.radians(deg)
                px = cx + int(r_px * math.cos(rad))
                py = cy + int(r_py * math.sin(rad))
                if 0 <= px < W and 0 <= py < H:
                    draw.point((px, py), fill=col)

# ── Barrels ───────────────────────────────────────────────────────────────────
def draw_barrels(draw, dy):
    barrel_cy = BARREL_MID + dy
    positions = [50, 125, 200]
    bw, bh = 34, 40

    for cx in positions:
        x0, x1 = cx - bw // 2, cx + bw // 2
        y0, y1 = barrel_cy - bh // 2, barrel_cy + bh // 2
        # body
        rect_fill(draw, x0 + 3, y0, x1 - 3, y1, BARREL_BODY)
        rect_fill(draw, x0, y0 + 4, x1, y1 - 4, BARREL_BODY)
        # dark sides
        rect_fill(draw, x0, y0 + 4, x0 + 3, y1 - 4, BARREL_DARK)
        rect_fill(draw, x1 - 3, y0 + 4, x1, y1 - 4, BARREL_DARK)
        # highlight stripe
        vline(draw, x0 + 5, y0 + 3, y1 - 3, BARREL_HIGH)
        vline(draw, x0 + 6, y0 + 3, y0 + 8, BARREL_HIGH)
        # metal bands
        for band in [y0 + bh // 5, y0 + 4 * bh // 5]:
            rect_fill(draw, x0 + 2, band, x1 - 2, band + 2, BARREL_BAND)
        # top cap
        rect_fill(draw, x0 + 2, y0, x1 - 2, y0 + 4, BARREL_HIGH)
        hline(draw, x0 + 3, x1 - 3, y0 + 2, BARREL_BODY)
        # bottom shadow
        rect_fill(draw, x0 + 2, y1 - 3, x1 - 2, y1, BARREL_DARK)

# ── Raft deck ─────────────────────────────────────────────────────────────────
def draw_raft(draw, dy):
    rt = RAFT_TOP + dy
    rb = RAFT_BOT + dy
    rx0, rx1 = 14, 236
    plank_h = 4
    plank_patterns = [
        [PLANK_LIGHT, PLANK_MID,   PLANK_LIGHT, PLANK_DARK,  PLANK_MID  ],
        [PLANK_MID,   PLANK_LIGHT, PLANK_DARK,  PLANK_LIGHT, PLANK_DARK ],
        [PLANK_DARK,  PLANK_MID,   PLANK_LIGHT, PLANK_MID,   PLANK_LIGHT],
        [PLANK_MID,   PLANK_DARK,  PLANK_MID,   PLANK_LIGHT, PLANK_MID  ],
    ]
    n_rows = (rb - rt) // plank_h
    for row in range(n_rows):
        y = rt + row * plank_h
        pattern = plank_patterns[row % len(plank_patterns)]
        seg_w = (rx1 - rx0) // len(pattern)
        for ci, col in enumerate(pattern):
            sx0 = rx0 + ci * seg_w
            sx1 = rx0 + (ci + 1) * seg_w - 1
            rect_fill(draw, sx0, y, sx1, y + plank_h - 1, col)
        hline(draw, rx0, rx1, y + plank_h - 1, PLANK_SHADOW)

    # Deck top edge highlight
    hline(draw, rx0 + 1, rx1 - 1, rt, PLANK_LIGHT)
    # Side rails
    rect_fill(draw, rx0, rt, rx0 + 3, rb, PLANK_DARK)
    rect_fill(draw, rx1 - 3, rt, rx1, rb, PLANK_DARK)
    vline(draw, rx0 + 1, rt + 1, rb - 1, PLANK_MID)
    vline(draw, rx1 - 1, rt + 1, rb - 1, PLANK_DARK)
    # Drop shadow
    hline(draw, rx0 + 4, rx1 - 4, rb + 1, SHADOW_WTR)
    hline(draw, rx0 + 8, rx1 - 8, rb + 2, SHADOW_WTR)

# ── Ladder (right side, goes into water) ─────────────────────────────────────
def draw_ladder(draw, dy):
    rt = RAFT_TOP + dy
    lx = 218
    rail_top = rt - 52
    rail_bot = WATERLINE + dy + 12
    gap = 11

    lx0, lx1 = lx - gap // 2, lx + gap // 2

    for rx in (lx0, lx1):
        vline(draw, rx, rail_top, rail_bot, LADDER_ALU)
        vline(draw, rx + 1, rail_top, rail_bot, LADDER_HIGH)

    # Rungs
    rung_count = 7
    for i in range(rung_count):
        ry = rail_top + i * (rail_bot - rail_top) // (rung_count - 1)
        rect_fill(draw, lx0, ry, lx1 + 1, ry + 1, LADDER_ALU)
        hline(draw, lx0, lx1 + 1, ry + 2, LADDER_DARK)

    # Feet curve hint
    for rx in (lx0, lx1):
        draw.point((rx - 1, rail_bot + 1), fill=LADDER_DARK)
        draw.point((rx + 2, rail_bot + 1), fill=LADDER_DARK)

# ── Slide ─────────────────────────────────────────────────────────────────────
def draw_slide(draw, dy):
    rt = RAFT_TOP + dy

    # Platform: upper-right area
    plat_x0, plat_y  = 145, rt - 52
    plat_w, plat_h   = 32, 10

    # Support poles under platform
    for px in (plat_x0 + 4, plat_x0 + plat_w - 6):
        vline(draw, px,     plat_y + plat_h, rt, POLE_COL)
        vline(draw, px + 1, plat_y + plat_h, rt, POLE_DK)
        # Cross-brace pixel
        draw.point((px, plat_y + plat_h + (rt - plat_y - plat_h) // 2), fill=POLE_COL)

    # Platform surface
    rect_fill(draw, plat_x0, plat_y, plat_x0 + plat_w, plat_y + plat_h, POLE_COL)
    rect_fill(draw, plat_x0 + 1, plat_y + 1, plat_x0 + plat_w - 1, plat_y + plat_h - 2, LADDER_HIGH)
    hline(draw, plat_x0, plat_x0 + plat_w, plat_y + plat_h, LADDER_DARK)
    # Platform railing nub
    vline(draw, plat_x0 + plat_w, plat_y - 8, plat_y, POLE_COL)
    vline(draw, plat_x0 + plat_w + 1, plat_y - 8, plat_y, POLE_DK)
    hline(draw, plat_x0 + plat_w - 4, plat_x0 + plat_w + 2, plat_y - 8, POLE_COL)

    # Slide chute: from platform top-left down to raft level
    slide_tx, slide_ty = plat_x0 + 1, plat_y
    slide_bx, slide_by = plat_x0 - 82, rt - 1
    steps = 60
    for i in range(steps + 1):
        t = i / steps
        sx = int(slide_tx + t * (slide_bx - slide_tx))
        sy = int(slide_ty + t * (slide_by - slide_ty))
        # 5-pixel wide chute
        offsets = [(-2, SLIDE_HIGH), (-1, SLIDE_YELL), (0, SLIDE_YELL),
                   (1, SLIDE_DARK),  (2, SLIDE_DARK)]
        for off, col in offsets:
            px_, py_ = sx, sy + off
            if 0 <= px_ < W and 0 <= py_ < H:
                draw.point((px_, py_), fill=col)
        # Shine pixel
        if i % 8 < 2:
            if 0 <= sx < W and 0 <= sy - 2 < H:
                draw.point((sx, sy - 2), fill=SLIDE_SHINE)

    # Side rails of slide
    for i in range(steps + 1):
        t = i / steps
        sx = int(slide_tx + t * (slide_bx - slide_tx))
        sy = int(slide_ty + t * (slide_by - slide_ty))
        for off, col in [(-3, POLE_COL), (3, POLE_DK)]:
            px_, py_ = sx, sy + off
            if 0 <= px_ < W and 0 <= py_ < H:
                draw.point((px_, py_), fill=col)

    # Access ladder up to platform (left edge of platform)
    lad_x = plat_x0 + 3
    vline(draw, lad_x,     plat_y + plat_h, rt, LADDER_ALU)
    vline(draw, lad_x + 1, plat_y + plat_h, rt, LADDER_HIGH)
    vline(draw, lad_x + 8, plat_y + plat_h, rt, LADDER_ALU)
    vline(draw, lad_x + 9, plat_y + plat_h, rt, LADDER_HIGH)
    step_count = (rt - plat_y - plat_h) // 8
    for si in range(step_count + 1):
        ry = plat_y + plat_h + si * 8
        rect_fill(draw, lad_x, ry, lad_x + 9, ry + 1, LADDER_ALU)
        hline(draw, lad_x, lad_x + 9, ry + 2, LADDER_DARK)

# ── Water surface glints ──────────────────────────────────────────────────────
def draw_surface_glints(draw, dy, frame):
    wl = WATERLINE + dy
    hline(draw, 10, W - 10, wl, WATER_LIGHT)
    shift = frame * 7
    for sx in range(0, W, 16):
        gx = (sx + shift) % W
        draw.point((gx,     wl - 1), fill=WATER_FOAM)
        draw.point((gx + 1, wl - 1), fill=WATER_FOAM)

# ── Frame assembly ────────────────────────────────────────────────────────────
def make_frame(idx, bob):
    rgb = Image.new('RGB', (W, H))
    draw = ImageDraw.Draw(rgb)
    draw_water(draw)
    draw_ripples(draw, bob, idx)
    draw_surface_glints(draw, bob, idx)
    draw_barrels(draw, bob)
    draw_raft(draw, bob)
    draw_ladder(draw, bob)
    draw_slide(draw, bob)
    return rgb

bob_offsets   = [0, -1, 1]
frame_duration = 420   # ms per frame → ~2.4 fps gentle bob

frames = [make_frame(i, b) for i, b in enumerate(bob_offsets)]

# Quantize with shared palette
combined = Image.new('RGB', (W, H * len(frames)))
for i, f in enumerate(frames): combined.paste(f, (0, i * H))
palette = combined.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
pal_frames = [f.quantize(colors=128, palette=palette, dither=0) for f in frames]

out = '/home/user/shangri-la/public/raft.gif'
pal_frames[0].save(out, save_all=True, append_images=pal_frames[1:],
                   loop=0, duration=frame_duration, optimize=False)
print(f"Saved {out}  ({W}x{H}, {len(frames)} frames)")
