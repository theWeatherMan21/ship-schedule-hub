
import Cocoa
// 列出当前屏幕上的可见窗口（供"静默红线"取证：跑自动化前后比对窗口数）
let opts = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
guard let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else {
    print("[]"); exit(0)
}
var out: [[String: Any]] = []
for w in list {
    let layer = (w[kCGWindowLayer as String] as? Int) ?? 0
    if layer != 0 { continue }                                  // 只算普通应用窗口
    let alpha = (w[kCGWindowAlpha as String] as? Double) ?? 1
    if alpha <= 0.01 { continue }
    let name = (w[kCGWindowName as String] as? String) ?? ""
    let owner = (w[kCGWindowOwnerName as String] as? String) ?? ""
    let b = (w[kCGWindowBounds as String] as? [String: Any]) ?? [:]
    let h = (b["Height"] as? Double) ?? 0
    if h < 40 { continue }                                      // 过滤状态栏类小条
    out.append(["owner": owner, "name": name, "h": Int(h),
                "w": Int((b["Width"] as? Double) ?? 0),
                "x": Int((b["X"] as? Double) ?? 0), "y": Int((b["Y"] as? Double) ?? 0)])
}
// --ours：只列 Chrome/Chromium 系窗口（自动化自己的），避免把爹地自己开的 Safari 等算成"我们弹窗了"
if CommandLine.arguments.contains("--ours") {
    let browserOwners = ["Google Chrome", "Chromium", "chrome", "Google Chrome Helper"]
    out = out.filter { w in
        let o = (w["owner"] as? String) ?? ""
        return browserOwners.contains(where: { o.contains($0) })
    }
}
let data = try! JSONSerialization.data(withJSONObject: out, options: [])
print(String(data: data, encoding: .utf8)!)
