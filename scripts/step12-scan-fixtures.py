"""Two bounded fictional scan inputs; never real company documents."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader

out = Path('tmp/step12-live')
out.mkdir(parents=True, exist_ok=True)
image = Image.new('RGB', (1654, 2339), 'white')
draw = ImageDraw.Draw(image)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 42)
heading = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 58)
draw.text((120, 140), 'TEST ONLY - FICTIONAL BILL OF LADING', font=heading, fill='black')
lines = [
    'STEP12-GAPS-20261015 SCANNED QA - NO ACTUAL CARGO',
    'Bill of Lading No: STEP12-GAPS-20261015-BL',
    'Container No: GAPU2610151',
    'Consignee: STEP12 FICTIONAL SCAN CONSIGNEE',
    'Vessel Name: TEST SCAN VESSEL',
    'Port of Loading: TEST PORT ALPHA',
    'Port of Discharge: LAGOS',
    'Arrival Date: 15 October 2026',
    'Container Size: 20 FT',
    'Description: FICTIONAL OFFICE TEST MATERIALS',
    'Search phrase: cobalt scan lantern',
    'This document is a software test fixture, not a customs document.',
]
for i, line in enumerate(lines):
    draw.text((120, 320 + i * 125), line, font=font, fill='black')
png = out / 'step12-fictional-scan-upright.png'
image.save(png)
pdf = out / 'step12-fictional-image-only.pdf'
c = canvas.Canvas(str(pdf), pagesize=(595.28, 841.89))
c.drawImage(ImageReader(image), 0, 0, width=595.28, height=841.89)
c.save()
assert not PdfReader(str(pdf)).pages[0].extract_text().strip(), 'Must truly require OCR'
rotated = out / 'step12-fictional-scan-rotated.png'
image.rotate(90, expand=True).save(rotated)
print(json.dumps([{'path': str(p.resolve()), 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in [pdf, rotated]]))
