#!/usr/bin/env python3
"""
Polish logo cline-copilot-chat:
- Remove grey background -> transparent
- Black outline (#000000) = main body -> main gradient, FULL opacity
- White shapes (#FEFEFE/#FBFBFB) = inner details -> keep white for contrast
- Dark blue (#2A5085) = accent details -> accent gradient
- Add subtle drop shadow for depth
- Export PNG with transparency
"""
import subprocess
from lxml import etree

SVG_IN = "/Users/ltmoerdani/Startup/cline-copilot-chat/media/logo-cline-copilot-chat.svg"
SVG_OUT = "/Users/ltmoerdani/Startup/cline-copilot-chat/media/logo-cline-copilot-chat-polished.svg"
PNG_OUT = "/Users/ltmoerdani/Startup/cline-copilot-chat/media/logo-cline-copilot-chat.png"
PNG_TMP = "/Users/ltmoerdani/Startup/cline-copilot-chat/media/logo-tmp.png"

with open(SVG_IN, "r", encoding="utf-8") as f:
    tree = etree.parse(f)
root = tree.getroot()

NS = {"svg": "http://www.w3.org/2000/svg"}

width = root.get("width", "1184")
height = root.get("height", "1186")
new_root = etree.Element("svg", {
    "version": "1.1",
    "xmlns": "http://www.w3.org/2000/svg",
    "width": width,
    "height": height,
    "viewBox": f"0 0 {width} {height}",
})

# Defs: gradients + shadow filter
defs = etree.SubElement(new_root, "defs")

# Main gradient for the body/outline: deep blue -> indigo
grad1 = etree.SubElement(defs, "linearGradient", {
    "id": "mainGrad",
    "x1": "0%", "y1": "0%",
    "x2": "100%", "y2": "100%",
})
etree.SubElement(grad1, "stop", {"offset": "0%", "stop-color": "#1E40AF"})   # blue-800
etree.SubElement(grad1, "stop", {"offset": "50%", "stop-color": "#3730A3"})   # indigo-800
etree.SubElement(grad1, "stop", {"offset": "100%", "stop-color": "#1E1B4B"})  # indigo-950

# Accent gradient for dark-blue details: cyan -> blue
grad2 = etree.SubElement(defs, "linearGradient", {
    "id": "accentGrad",
    "x1": "0%", "y1": "0%",
    "x2": "100%", "y2": "0%",
})
etree.SubElement(grad2, "stop", {"offset": "0%", "stop-color": "#0EA5E9"})   # sky-500
etree.SubElement(grad2, "stop", {"offset": "100%", "stop-color": "#3B82F6"})  # blue-500

# Drop shadow filter
filt = etree.SubElement(defs, "filter", {
    "id": "softShadow",
    "x": "-20%", "y": "-20%",
    "width": "140%", "height": "140%",
})
blur = etree.SubElement(filt, "feGaussianBlur", {
    "in": "SourceAlpha",
    "stdDeviation": "8",
    "result": "blur",
})
offset = etree.SubElement(filt, "feOffset", {
    "in": "blur",
    "dx": "0", "dy": "4",
    "result": "offsetBlur",
})
merge = etree.SubElement(filt, "feMerge")
etree.SubElement(merge, "feMergeNode", {"in": "offsetBlur"})
etree.SubElement(merge, "feMergeNode", {"in": "SourceGraphic"})

# Collect all path elements
paths = root.findall(".//svg:path", NS) if root.nsmap else root.findall(".//{http://www.w3.org/2000/svg}path")
if not paths:
    paths = root.findall(".//path")

# Layer 1: main body (black outline) with shadow — FULL OPACITY
layer_body = etree.SubElement(new_root, "g", {
    "filter": "url(#softShadow)",
})

# Layer 2: inner details (white + dark blue) on top, no shadow
layer_details = etree.SubElement(new_root, "g")

for i, p in enumerate(paths):
    fill = p.get("fill", "").upper()
    d = p.get("d", "")
    transform = p.get("transform", "")
    if not d:
        continue

    # Skip grey background
    if fill == "#6A6A6A" and i == 0:
        continue

    if fill == "#000000":
        # Main body/outline -> main gradient, FULL opacity, with shadow
        new_p = etree.SubElement(layer_body, "path", {
            "d": d,
            "fill": "url(#mainGrad)",
        })
        if transform:
            new_p.set("transform", transform)
    elif fill == "#2A5085":
        # Dark blue details -> accent gradient
        new_p = etree.SubElement(layer_details, "path", {
            "d": d,
            "fill": "url(#accentGrad)",
        })
        if transform:
            new_p.set("transform", transform)
    elif fill in ("#FEFEFE", "#FBFBFB"):
        # White inner details -> keep white for contrast against dark body
        new_p = etree.SubElement(layer_details, "path", {
            "d": d,
            "fill": "#F8FAFC",  # slate-50 (slightly off-white, softer)
        })
        if transform:
            new_p.set("transform", transform)
    else:
        # Fallback
        new_p = etree.SubElement(layer_details, "path", {
            "d": d,
            "fill": "#F8FAFC",
        })
        if transform:
            new_p.set("transform", transform)

# Write polished SVG
with open(SVG_OUT, "wb") as f:
    f.write(etree.tostring(new_root, pretty_print=True, xml_declaration=True, encoding="UTF-8"))

# Export PNG transparent
subprocess.run([
    "rsvg-convert",
    "--background-color", "none",
    "--width", "1024",
    "--height", "1024",
    "--keep-aspect-ratio",
    "--output", PNG_TMP,
    SVG_OUT,
], check=True)

subprocess.run(["mv", PNG_TMP, PNG_OUT], check=True)

print(f"Saved polished SVG: {SVG_OUT}")
print(f"Saved transparent PNG: {PNG_OUT}")
