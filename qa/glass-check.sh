#!/bin/bash
# 毛玻璃验证台：构建→部署→启动→量窗口 alpha（0=透明 255=不透明）
# 用法: bash qa/glass-check.sh [跳过构建=1]
set -u
BASE=/Users/russospencer/Documents/trae_projects/ShipScheduleHub
SKIP_BUILD=${1:-0}

if [ "$SKIP_BUILD" != "1" ]; then
  cd "$BASE" || exit 1
  npm run build > /tmp/gc-build.log 2>&1 && npm run tauri build -- --bundles app >> /tmp/gc-build.log 2>&1
  if ! grep -q "Finished 1 bundle" /tmp/gc-build.log; then
    echo "❌ 构建失败："; tail -6 /tmp/gc-build.log; exit 1
  fi
  echo "✅ 构建 OK"
fi

pkill -f "ShipScheduleHub.app/Contents/MacOS" 2>/dev/null; sleep 1
rm -rf /Applications/ShipScheduleHub.app
cp -R "$BASE/src-tauri/target/release/bundle/macos/ShipScheduleHub.app" /Applications/
rsync -a --delete "$BASE/engine/" /Applications/ShipScheduleHub.app/Contents/Resources/engine/ 2>/dev/null
cp "$BASE/db/ports.db" /Applications/ShipScheduleHub.app/Contents/Resources/db/ports.db 2>/dev/null
open -a /Applications/ShipScheduleHub.app
sleep 6

cat > /tmp/wid2.swift <<'EOF'
import Cocoa
let list = CGWindowListCopyWindowInfo(CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements), kCGNullWindowID) as? [[String: Any]] ?? []
for w in list {
  let owner = (w[kCGWindowOwnerName as String] as? String) ?? ""
  if owner == "ShipScheduleHub" { print(w[kCGWindowNumber as String] as? Int ?? 0); break }
}
EOF
swiftc -O /tmp/wid2.swift -o /tmp/wid2 2>/dev/null
WID=$(/tmp/wid2)
[ -z "$WID" ] && { echo "❌ 没找到窗口"; exit 1; }
screencapture -x -o -l "$WID" /tmp/gc-win.png

python3 - <<'PY'
import struct, zlib
data = open('/tmp/gc-win.png','rb').read()
pos, idat, w, h, ctype = 8, b'', 0, 0, 0
while pos < len(data):
    ln = struct.unpack('>I', data[pos:pos+4])[0]; typ = data[pos+4:pos+8]
    ch = data[pos+8:pos+8+ln]
    if typ == b'IHDR': w, h, bit, ctype = struct.unpack('>IIBB', ch[:10])
    elif typ == b'IDAT': idat += ch
    pos += 12 + ln
if ctype != 6:
    print(f"  ⚠️ 截图无 alpha 通道（ctype={ctype}）→ 视为不透明")
    raise SystemExit
raw = zlib.decompress(idat); bpp = 4; stride = w*bpp + 1
alphas = []
prev = bytearray(w*bpp)
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
    if y in (2, 6, h//2):
        alphas.append((y, min(line[3::4]), sum(line[3::4])//w))
mins = [a[1] for a in alphas]
print("  窗口 alpha 采样（y, 本行最小, 本行均值）:", alphas)
if max(mins) == 255:
    print("  ❌ 整窗不透明 → 毛玻璃没生效")
else:
    print(f"  ✅ 存在透明像素（最小 alpha={min(mins)}）→ 毛玻璃生效")
PY
