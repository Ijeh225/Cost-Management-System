"""Build the reviewed application manual. Requires reportlab and pypdf.

Run from any directory. Optional --render requires pymupdf and Pillow.
The source is deliberately simple Markdown, with SCREEN and DIAGRAM directives.
"""
from pathlib import Path
import argparse
import html
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle, Image, Flowable, KeepTogether,
)
from reportlab.platypus.tableofcontents import TableOfContents

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "output/pdf/Cost_Management_Blueprint_and_User_Manual.pdf"
NAVY = colors.HexColor("#122C45")
TEAL = colors.HexColor("#007F83")
INK = colors.HexColor("#20364A")
MUTED = colors.HexColor("#52677B")
PALE = colors.HexColor("#EDF5F7")
W, H = 595.276, 841.89
LEFT, RIGHT = 48, 48
CW = W - LEFT - RIGHT


def fonts():
    paths = [Path("C:/Windows/Fonts"), Path("/usr/share/fonts/truetype/dejavu")]
    choices = [("calibri.ttf", "calibrib.ttf", "calibrii.ttf"),
               ("DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans-Oblique.ttf")]
    for root in paths:
        for regular, bold, italic in choices:
            if all((root / n).exists() for n in (regular, bold, italic)):
                for name, filename in zip(("Manual", "ManualBold", "ManualItalic"), (regular, bold, italic)):
                    pdfmetrics.registerFont(TTFont(name, str(root / filename)))
                pdfmetrics.registerFontFamily("Manual", normal="Manual", bold="ManualBold", italic="ManualItalic", boldItalic="ManualBold")
                return
    raise RuntimeError("Install Calibri or DejaVu Sans before building.")


fonts()
ST = getSampleStyleSheet()
ST.add(ParagraphStyle("BodyM", fontName="Manual", fontSize=10.3, leading=14.3, textColor=INK, spaceAfter=7))
ST.add(ParagraphStyle("H1M", fontName="ManualBold", fontSize=24, leading=28, textColor=NAVY, spaceAfter=18, keepWithNext=True))
ST.add(ParagraphStyle("H2M", fontName="ManualBold", fontSize=12.2, leading=16, textColor=TEAL, spaceBefore=9, spaceAfter=6, keepWithNext=True))
ST.add(ParagraphStyle("CellM", parent=ST["BodyM"], fontSize=9.2, leading=12.2, spaceAfter=0))
ST.add(ParagraphStyle("CellHeadM", parent=ST["CellM"], fontName="ManualBold", textColor=colors.white))
ST.add(ParagraphStyle("CaptionM", parent=ST["BodyM"], fontSize=8.6, leading=11.5, textColor=MUTED, spaceBefore=6, spaceAfter=12))
ST.add(ParagraphStyle("CallM", parent=ST["BodyM"], fontSize=10, leading=14, backColor=PALE, borderPadding=10, spaceBefore=7, spaceAfter=12))
ST.add(ParagraphStyle("ListM", parent=ST["BodyM"], leftIndent=15, firstLineIndent=-13, spaceAfter=6))
ST.add(ParagraphStyle("TOCM", parent=ST["BodyM"], fontSize=10, leading=12, spaceBefore=0, spaceAfter=0))


def inline(text):
    text = html.escape(text)
    text = re.sub(r"\*\*(.*?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`(.*?)`", r'<font color="#00696E">\1</font>', text)
    return text


class Diagram(Flowable):
    def __init__(self, kind):
        super().__init__()
        self.kind = kind
        self.width = CW
        self.height = {"architecture": 335, "workflow": 425, "money": 320, "invoice": 260}[kind]

    def draw(self):
        c = self.canv
        def box(x, y, w, h, title, text="", fill=PALE):
            c.setFillColor(fill)
            c.setStrokeColor(colors.HexColor("#B7D4DD"))
            c.roundRect(x, y, w, h, 7, fill=1, stroke=1)
            p = Paragraph(inline(title), ParagraphStyle("DT", fontName="ManualBold", fontSize=10, leading=12, textColor=NAVY, alignment=TA_CENTER))
            _, ph = p.wrap(w-14, h)
            p.drawOn(c, x+7, y+h-12-ph)
            if text:
                p = Paragraph(inline(text), ParagraphStyle("DB", fontName="Manual", fontSize=8.7, leading=11, textColor=MUTED, alignment=TA_CENTER))
                _, ph = p.wrap(w-16, h)
                p.drawOn(c, x+8, y+9)
        def arrow(x1,y1,x2,y2):
            import math
            c.setStrokeColor(TEAL)
            c.setLineWidth(1.2)
            c.line(x1,y1,x2,y2)
            a = math.atan2(y2-y1, x2-x1)
            for d in (-0.5,0.5):
                c.line(x2,y2,x2-6*math.cos(a+d),y2-6*math.sin(a+d))
        if self.kind == "architecture":
            box(90,270,320,58,"People and browser","Authority + job function + workspace + branch")
            box(90,177,320,63,"Web application and authenticated API","Forms, validation, branch scope and action permissions")
            arrow(250,270,250,240)
            for x,t,s in [(0,"PostgreSQL","Jobs, finance, workflow, audit"),(172,"Private files","Documents and retrieval links"),(344,"External services","AI, email and WhatsApp")]:
                box(x,61,155,72,t,s)
                arrow(250,177,x+77.5,133)
            box(90,0,320,35,"Reports read source records; they do not create payments")
        elif self.kind == "workflow":
            box(103,368,294,51,"Register, assign officers, verify","Keep ETA separate from actual berthing")
            arrow(250,368,250,345)
            box(100,310,300,35,"Early departmental work can run in parallel")
            for x,t,s in [(0,"Documentation","PAAR + assessment"),(128,"Transire","Actual release"),(256,"Shipping","DO release"),(384,"Terminal / TDO","TDO release")]:
                box(x,225,115,64,t,s)
                arrow(250,310,x+57,289)
            box(338,149,161,50,"Pull-Out release","Requires TDO release")
            arrow(441,225,418,199)
            box(35,67,430,53,"Readiness check -> Gate-In -> Examination -> Final Release","PAAR number/date + Transire + DO + TDO + Pull-Out evidence")
            for x in (57,185,313):
                arrow(x,225,x,120)
            arrow(418,149,418,120)
            box(18,0,463,43,"Loaded Gate-Out -> Delivery -> Empty Return -> Close-out","Physical events and financial settlement stay distinct")
            arrow(250,67,250,43)
        elif self.kind == "money":
            box(0,253,225,60,"Budgeted job charges / costs","Planning and operational profitability")
            box(274,253,225,60,"Issued active invoices","Accrual revenue and receivables")
            box(0,142,225,69,"Dated payment and reversal rows","Collections, duty, disbursement, overhead, schedules")
            box(274,142,225,69,"Bank account and payment method","Same-branch source; unique references where enforced")
            arrow(386,253,112,211)
            arrow(386,142,250,92)
            arrow(112,142,250,92)
            box(37,36,425,56,"Financial Ledger + Bank + Cash Flow","Actual money movements; transfers eliminated in consolidation")
            box(37,0,425,29,"P&L uses recognition rules, not cash-flow date rules")
        else:
            labels = [(0,200,"Draft","Editable; not revenue"),(180,200,"Sent / issued","Positive total; locked fields"),(360,200,"Partial","Net payment below balance"),(360,96,"Paid","No further collection"),(0,96,"Cancelled","No outstanding contribution"),(180,0,"Written off / credit note","Controlled correction; preserve history")]
            for x,y,t,s in labels: box(x,y,139,52,t,s)
            arrow(139,226,180,226); arrow(319,226,360,226); arrow(429,200,429,148)
            arrow(180,213,139,135); arrow(250,200,250,52)
            box(0,0,139,52,"Overdue","Date-derived; unpaid only")


class ManualDoc(BaseDocTemplate):
    def __init__(self, path):
        super().__init__(str(path), pagesize=(W,H), leftMargin=LEFT, rightMargin=RIGHT,
                         topMargin=62, bottomMargin=51, title="COST | Application Blueprint and User Manual",
                         author="Don Climax | Project Documentation", subject="Application baseline 8d62f2c, 5 September 2026")
        self.addPageTemplates(PageTemplate(id="manual", frames=[Frame(LEFT,51,CW,H-113,id="body",leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)], onPage=self.decorate))
        self.section = "Application blueprint and user manual"
    def decorate(self,c,doc):
        c.saveState()
        if doc.page == 1:
            c.setFillColor(NAVY); c.rect(0,0,W,H,fill=1,stroke=0)
            c.setFillColor(TEAL); c.rect(0,0,16,H,fill=1,stroke=0)
        else:
            c.setStrokeColor(colors.HexColor("#D7E4E9")); c.line(LEFT,H-42,W-RIGHT,H-42)
            c.setFont("ManualBold",8); c.setFillColor(TEAL); c.drawString(LEFT,H-32,"COST  /  BLUEPRINT + USER MANUAL")
            c.setFont("Manual",8); c.setFillColor(MUTED); c.drawRightString(W-RIGHT,H-32,"EDITION 1.0  |  05 SEP 2026")
            c.line(LEFT,38,W-RIGHT,38)
            c.drawString(LEFT,25,"Controlled reference  |  Source baseline 8d62f2c")
            c.drawRightString(W-RIGHT,25,str(doc.page))
        c.restoreState()
    def afterFlowable(self, f):
        if isinstance(f,Paragraph) and getattr(f,"chapter",None):
            title,key=f.chapter
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(title,key,level=0,closed=False)
            self.notify("TOCEntry",(0,title,self.page,key))


def table(lines):
    rows = [[v.strip() for v in line.strip().strip("|").split("|")] for line in lines]
    rows = [r for r in rows if not all(re.fullmatch(r"[:\- ]+",v) for v in r)]
    n=len(rows[0])
    widths={2:[CW*.27,CW*.73],3:[CW*.23,CW*.38,CW*.39],4:[CW*.20,CW*.26,CW*.27,CW*.27]}.get(n,[CW/n]*n)
    data=[[Paragraph(inline(v),ST["CellHeadM"] if i==0 else ST["CellM"]) for v in r] for i,r in enumerate(rows)]
    t=Table(data,colWidths=widths,repeatRows=1,hAlign="LEFT")
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),NAVY),("VALIGN",(0,0),(-1,-1),"TOP"),
                           ("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8),
                           ("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7),
                           ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,PALE]),
                           ("LINEBELOW",(0,0),(-1,0),.5,NAVY),("LINEBELOW",(0,1),(-1,-1),.3,colors.HexColor("#DCE7EC"))]))
    return [t,Spacer(1,10)]


def build():
    OUT.parent.mkdir(parents=True,exist_ok=True)
    cover = lambda text,size,leading,color: Paragraph(text,ParagraphStyle("Cover",fontName="ManualBold",fontSize=size,leading=leading,textColor=color,spaceAfter=18))
    story=[Spacer(1,65),cover("DON CLIMAX  /  COST",14,18,colors.HexColor("#69DDCF")),
           Spacer(1,24),cover("Application<br/>Blueprint &amp;<br/>User Manual",38,44,colors.white),
           cover("Container clearing. Operational control.<br/>Connected financial records.",17,23,colors.HexColor("#CBDFE9")),
           Spacer(1,48),cover("SET UP  /  OPERATE  /  RECONCILE  /  MANAGE",10,14,colors.HexColor("#69DDCF")),
           Paragraph("Edition 1.0<br/>5 September 2026<br/><br/>Prepared from the current application source, three continuity records, and authenticated read-only live screen capture.<br/><br/>An internal training and operating reference. Screenshots contain test data. Recommendations and verification limits are identified explicitly.",ParagraphStyle("CV",fontName="Manual",fontSize=11,leading=17,textColor=colors.HexColor("#CBDFE9"))),PageBreak(),
           Paragraph("Contents",ST["H1M"])]
    toc=TableOfContents(); toc.levelStyles=[ST["TOCM"]]; toc.dotsMinLevel=0
    story += [toc]
    lines=(HERE/"APPLICATION_MANUAL.md").read_text(encoding="utf-8").splitlines()
    i=0; chapter=0
    while i<len(lines):
        line=lines[i].strip(); i+=1
        if not line: continue
        if line.startswith("# "):
            story.append(PageBreak()); chapter+=1
            title=line[2:]; p=Paragraph(inline(title),ST["H1M"]); p.chapter=(title,f"chapter-{chapter}")
            story.append(p)
        elif line.startswith("## "): story.append(Paragraph(inline(line[3:]),ST["H2M"]))
        elif line.startswith("!SCREEN("):
            name,caption=line[8:-1].split("|",1)
            path=HERE/"assets"/f"{name}.png"
            iw,ih=ImageReader(str(path)).getSize(); h=CW*ih/iw
            story.append(KeepTogether([Image(str(path),width=CW,height=h),Paragraph(inline(caption),ST["CaptionM"])]))
        elif line.startswith("!DIAGRAM("):
            story.extend([Diagram(line[9:-1]),Spacer(1,10)])
        elif line.startswith("|"):
            block=[line]
            while i<len(lines) and lines[i].strip().startswith("|"):
                block.append(lines[i].strip());i+=1
            story.extend(table(block))
        elif line.startswith("> "): story.append(Paragraph(inline(line[2:]),ST["CallM"]))
        elif line.startswith("- "): story.append(Paragraph("&#8226;  "+inline(line[2:]),ST["ListM"]))
        elif re.match(r"\d+\. ",line): story.append(Paragraph(inline(line),ST["ListM"]))
        else:
            parts=[line]
            while i<len(lines) and lines[i].strip() and not re.match(r"(#|\||>|!|- |\d+\. )",lines[i].strip()):
                parts.append(lines[i].strip());i+=1
            story.append(Paragraph(inline(" ".join(parts)),ST["BodyM"]))
    ManualDoc(OUT).multiBuild(story)
    from pypdf import PdfReader
    reader=PdfReader(OUT)
    text="\n".join(p.extract_text() or "" for p in reader.pages)
    temp=ROOT/"tmp/pdfs";temp.mkdir(parents=True,exist_ok=True)
    (temp/"manual-extracted.txt").write_text(text,encoding="utf-8")
    print(f"PDF: {OUT}\nPages: {len(reader.pages)}\nSource chapters: {chapter}\nExtracted words: {len(text.split())}")
    if ARGS.render:
        import pymupdf
        from PIL import Image as PILImage, ImageDraw
        pdf=pymupdf.open(OUT); thumbs=[]
        for idx,page in enumerate(pdf):
            pix=page.get_pixmap(matrix=pymupdf.Matrix(1.2,1.2),alpha=False)
            path=temp/f"manual-page-{idx+1:03}.png";pix.save(path)
            im=PILImage.open(path);im.thumbnail((238,337))
            cell=PILImage.new("RGB",(258,365),"#e5ebef");cell.paste(im,((258-im.width)//2,8))
            ImageDraw.Draw(cell).text((10,347),str(idx+1),fill="#122c45")
            thumbs.append(cell)
        for start in range(0,len(thumbs),12):
            sheet=PILImage.new("RGB",(258*4,365*3),"white")
            for k,im in enumerate(thumbs[start:start+12]):sheet.paste(im,((k%4)*258,(k//4)*365))
            sheet.save(temp/f"manual-contact-{start//12+1}.png")
        print("Rendered all pages and contact sheets under tmp/pdfs.")


if __name__ == "__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--render",action="store_true");ARGS=parser.parse_args()
    build()
