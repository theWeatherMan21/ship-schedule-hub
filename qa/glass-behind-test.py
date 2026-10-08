#!/usr/bin/env python3
"""差分法验证毛玻璃：换背景色（红/蓝），看 App 窗口内像素是否跟着变。
变了 = 真透（玻璃生效）；不变 = 不透明。"""
import struct, subprocess, sys, time, zlib, os

def solid_png(path, rgb, w=1700, h=1150):
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 6))
           + chunk(b'IEND', b''))
    open(path, 'wb').write(png)

def sample_png(path, pts):
    data = open(path, 'rb').read()
    pos, idat, w, h, ctype = 8, b'', 0, 0, 0
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos+4])[0]; typ = data[pos+4:pos+8]
        ch = data[pos+8:pos+8+ln]
        if typ == b'IHDR': w, h, bit, ctype = struct.unpack('>IIBB', ch[:10])
        elif typ == b'IDAT': idat += ch
        pos += 12 + ln
    bpp = {2: 3, 6: 4}[ctype]
    raw = zlib.decompress(idat); stride = w * bpp + 1
    prev = bytearray(w * bpp); rows = {}
    want = {y for y, _ in pts}
    for y in range(h):
        f = raw[y*stride]; line = bytearray(raw[y*stride+1:(y+1)*stride])
        if f == 1:
            for i in range(bpp, len(line)): line[i] = (line[i] + line[i-bpp]) & 255
        elif f == 2:
            for i in range(len(line)): line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(len(line)):
                a = line[i-bpp] if i >= bpp else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(len(line)):
                a = line[i-bpp] if i >= bpp else 0; b = prev[i]; c = prev[i-bpp] if i >= bpp else 0
                pa, pb, pc = abs(b-c), abs(a-c), abs(a+b-2*c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        prev = line
        if y in want:
            rows[y] = line
    out = []
    for y, x in pts:
        line = rows.get(y)
        out.append(tuple(line[x*bpp:x*bpp+3]) if line else None)
    return out

BASE = '/Users/russospencer/Documents/trae_projects/ShipScheduleHub'
solid_png('/tmp/bg-red.png', (220, 30, 30))
solid_png('/tmp/bg-blue.png', (30, 60, 220))

def app_region():
    out = subprocess.run(['/Users/russospencer/.hermes/cache/scratch/onscreen'], capture_output=True, text=True).stdout
    import json as J
    for w in J.loads(out):
        if 'ShipSchedule' in w['owner']:
            return int(w['x']), int(w['y']), int(w['w']), int(w['h'])
    return None

def measure(color, tag):
    subprocess.run(['open', '-a', 'Preview', f'/tmp/bg-{color}.png'])
    time.sleep(3)
    reg = app_region()
    if not reg:
        print("  ❌ 找不到 App 窗口"); return None
    x, y, w, h = reg
    subprocess.run(['osascript', '-e', f'tell application "Preview" to set bounds of front window to {{0, 0, {x+w+40}, {y+h+40}}}'])
    time.sleep(1)
    subprocess.run(['open', '-a', '/Applications/ShipScheduleHub.app'])
    time.sleep(2)
    subprocess.run(['osascript', '-e', 'tell application "System Events" to set frontmost of process "ShipScheduleHub" to true'])
    time.sleep(2)
    shot = f'/tmp/behind-{tag}.png'
    subprocess.run(['screencapture', '-x', '-R', f'{x},{y},{w},{h}', shot], check=True)
    # 采样点：App 内的空白区（右侧状态区中部）与顶栏
    pts = [(h//2, int(w*0.62)), (int(h*0.72), int(w*0.62)), (42, int(w*0.55)), (int(h*0.18), 40)]
    return sample_png(shot, pts), pts, reg

r1 = measure('red', 'red')
r2 = measure('blue', 'blue')
if not r1 or not r2:
    sys.exit(1)
(px1, pts, reg) = r1
(px2, _, _) = r2
print(f"  窗口区域: {reg}")
print("  采样点像素（红底 vs 蓝底）:")
diff = 0
for (y, x), a, b in zip(pts, px1, px2):
    d = sum(abs(i - j) for i, j in zip(a, b))
    diff += d
    print(f"    ({x:4},{y:3})  红底={a}  蓝底={b}  差值={d}")
print()
print(f"  ✅ 背景色影响窗口像素（总差 {diff}）→ 毛玻璃真的透了" if diff > 30 else f"  ❌ 背景色不影响窗口（总差 {diff}）→ 窗口不透明")
