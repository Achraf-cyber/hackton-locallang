"""Add a fade slide-transition to every slide of a .pptx (pptxgenjs can't).
Rewrites the archive with proper deflate compression, so no separate rezip
is needed."""
import sys, re, zipfile, shutil, os

src = sys.argv[1]
tmp = src + ".tmp"

# A p:transition is a direct child of p:sld, valid after p:cSld/p:clrMapOvr and
# before p:timing (which pptxgenjs never emits). "med" speed ~ smooth fade.
TRANSITION = '<p:transition spd="med"><p:fade/></p:transition>'

with zipfile.ZipFile(src, "r") as zin:
    names = zin.namelist()
    items = {n: zin.read(n) for n in names}

count = 0
for n in list(items):
    if re.match(r"ppt/slides/slide\d+\.xml$", n):
        xml = items[n].decode("utf-8")
        if "<p:transition" in xml:
            continue
        new = xml.replace("</p:sld>", TRANSITION + "</p:sld>", 1)
        if new != xml:
            items[n] = new.encode("utf-8")
            count += 1

with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    # keep [Content_Types].xml first (harmless if not, but tidy)
    order = sorted(items, key=lambda x: (x != "[Content_Types].xml", x))
    for n in order:
        zout.writestr(n, items[n])

shutil.move(tmp, src)
print(f"added fade transition to {count} slides -> {os.path.basename(src)}")
