"""Rebuild the outlined App Store campaign. All people/documents are demo content."""
from pathlib import Path
from xml.etree import ElementTree as ET
import re
import json
import html
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).parent
OUT = ROOT / 'screenshot-drafts'
OUT.mkdir(exist_ok=True)
FONTS = ROOT.parents[2] / 'apps/mobile/DARCiMobile/Resources/Fonts'
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
GREEN, BLACK, PAPER = '#0AFF4A', '#080808', '#F4F3EE'
fonts = {}
copy_manifest = []
for key, file in {
    'book': 'Maison/MaisonNeue-Book.ttf',
    'light': 'Maison/MaisonNeue-Light.ttf',
    'medium': 'Maison/MaisonNeue-Medium.ttf',
    'mono': 'ABC/FavoritMono-Regular.otf',
}.items():
    p = FONTS / file
    tt = TTFont(p)
    face = hb.Face(p.read_bytes())
    font = hb.Font(face)
    font.scale = (face.upem, face.upem)
    fonts[key] = (tt, font, face.upem)

def outline(text, x, y, size, fill=BLACK, face='book', name=None):
    text = text.strip('\n')
    tt, font, upem = fonts[face]
    b = hb.Buffer()
    b.add_str(text)
    b.guess_segment_properties()
    hb.shape(font, b)
    gs = tt.getGlyphSet()
    pen = SVGPathPen(gs)
    scale, cursor = size / upem, 0
    for info, pos in zip(b.glyph_infos, b.glyph_positions):
        trans = (scale, 0, 0, -scale, x + (cursor + pos.x_offset) * scale, y - pos.y_offset * scale)
        gs[tt.getGlyphName(info.codepoint)].draw(TransformPen(pen, trans))
        cursor += pos.x_advance
    label = name or text
    return f'<path id="{html.escape(label, quote=True)}" fill="{fill}" d="{pen.getCommands()}"/>', cursor * scale

def t(text, x, y, size, fill=BLACK, face='book', name=None):
    return outline(text, x, y, size, fill, face, name)[0]

def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{s}/>'

def line(x1,y1,x2,y2,color,width=1):
    return f'<path d="M{x1} {y1}H{x2}" stroke="{color}" stroke-width="{width}"/>' if y1==y2 else f'<path d="M{x1} {y1}L{x2} {y2}" stroke="{color}" stroke-width="{width}"/>'

def arrow(x,y,size,color=BLACK,width=5):
    return f'<path d="M{x} {y+size}L{x+size} {y}M{x} {y}H{x+size}V{y+size}" stroke="{color}" stroke-width="{width}" fill="none"/>'

def check(x,y,r=20):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{GREEN}"/><path d="M{x-r*.4} {y}l{r*.28} {r*.3}l{r*.54} {-r*.65}" fill="none" stroke="black" stroke-width="{r*.13}"/>'

def signature(x,y,s=1,color=BLACK):
    return f'<g id="Fictional demo signature" transform="translate({x} {y}) scale({s})"><path d="M0 99C30 43 60 -35 72 6C84 45 73 103 67 117M18 70C57 69 115 52 104 71C96 89 101 97 120 65C135 41 119 111 144 86C160 68 160 41 167 49C176 60 159 120 177 99C202 69 217 9 230 18C244 29 218 102 222 112C232 116 263 39 270 49C279 60 253 117 270 111C285 105 317 70 325 83M3 127C77 124 219 131 322 112" fill="none" stroke="{color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>'

def demo_pdf(x,y,w,h,title='Certificate of Trust'):
    z = rect(x,y,w,h,'white')
    z += t('DARCi',x+26,y+36,14) + t('DEMONSTRATION COPY',x+26,y+57,6,'#777','mono')
    z += line(x+26,y+72,x+w-26,y+72,'#D4D4D4')
    z += t(title,x+26,y+108,17,BLACK,'medium')
    z += t('Prepared for Alex Morgan',x+26,y+134,9,'#666')
    for row, heading in enumerate(['Document overview','Review and acknowledgment','Signature']):
        yy=y+175+row*75
        if yy+42 > y+h-30: break
        z += t(heading,x+26,yy,10)
        for k, shrink in enumerate([0,20,55]):
            z += rect(x+26, yy+13+k*9, w-52-shrink,2,'#DDD')
    z += t('SAMPLE — NOT A LEGAL DOCUMENT',x+26,y+h-20,7,'#999','mono')
    return f'<g id="Fictional document preview">{z}</g>'

def source(screen):
    raw=(ROOT/'figma-source'/f'{screen}.svg').read_text()
    for old,new in [('JORGE LUIS LOPEZ','ALEX MORGAN'),('JORGE L LOPEZ','ALEX MORGAN'),('Jorge Luis Lopez','Alex Morgan'),('Adam Eberts','Jordan Lee'),('DOC-19E64789','DEMO-001'),('6/5/2026','10/1/2026')]:
        raw=raw.replace(old,new)
    root=ET.fromstring(raw)
    for parent in list(root.iter()):
        for child in list(parent):
            tag=child.tag.split('}')[-1]
            if tag=='pattern':
                parent.remove(child)
            elif tag=='rect' and child.get('fill','').startswith('url(#pattern'):
                index=list(parent).index(child)
                title='Certificate of Trust' if screen=='256-617' else 'Power of Attorney'
                graphic=ET.fromstring(f'<svg xmlns="{NS}">{demo_pdf(float(child.get("x")),float(child.get("y")),float(child.get("width")),float(child.get("height")),title)}</svg>')[0]
                parent.remove(child)
                parent.insert(index,graphic)
            elif tag=='text':
                g=ET.Element(f'{{{NS}}}g',{'id':child.get('id','Outlined UI copy')})
                size=float(child.get('font-size','12'))
                fill=child.get('fill','black')
                for span in child:
                    value=''.join(span.itertext()).strip('\n')
                    if value=='JL':value='AM'
                    if value=='Clear signature':value='Save to drafts'
                    if value=='Complete signing':value='Continue to sign'
                    if value=='Add signature':
                        span.set('x','210')
                        size=20
                    if value=='POA – JORGE L LOPEZ':value='POA – ALEX MORGAN'
                    if screen=='256-617' and value=='POA – US/CA':value='TRUST – US/CA'
                    xx=float(span.get('x',child.get('x','0')))
                    yy=float(span.get('y',child.get('y','0')))
                    shape=t(value,xx,yy,size,fill)
                    g.append(ET.fromstring(shape))
                index=list(parent).index(child)
                parent.remove(child)
                parent.insert(index,g)
            elif screen=='256-617' and tag=='rect' and child.get('height')=='2' and child.get('y')=='183':
                child.set('fill',GREEN)
    if screen=='5-658':
        extra=''.join(t(v,36,y,16,'#EAEAEA') for v,y in [('Alex Morgan',326),('120 Example Street',424),('Columbus, Ohio',522),('alex@example.com',620),('+1',718),('(555) 010-0123',718)])
        # Phone number follows its separate country-code field.
        extra=extra.replace('id="(555) 010-0123"','id="Demo phone" transform="translate(113 0)"')
        root.append(ET.fromstring(f'<g xmlns="{NS}" id="Demo input values">{extra}</g>'))
    if screen=='8-1049':
        root.append(ET.fromstring(signature(78,510,.88)))
    serialized=ET.tostring(root,encoding='unicode')
    # Prefix every source ID/reference to keep nested clips collision-free.
    ids=re.findall(r'\bid="([^"]+)"',serialized)
    for i,old in enumerate(dict.fromkeys(ids)):
        new=f's{screen}-{i}'
        serialized=serialized.replace(f'id="{old}"',f'id="{new}"').replace(f'url(#{old})',f'url(#{new})')
    return '<g fill="none">'+re.sub(r'^<svg[^>]*>|</svg>$','',serialized)+'</g>'

def phone(screen,x,y,w,rotate=0):
    s=w/472
    h=988*s
    ident=f'phone-{screen}-{int(x)}-{int(y)}'
    content=source(screen)
    z=f'<g id="Device - Figma source {screen}" transform="translate({x} {y}) rotate({rotate} {w/2} {h/2}) scale({s})">'
    z+=rect(0,0,472,988,'#121212',70,'#777',2)
    z+=rect(5,5,462,978,'#080808',66,'#292929',2)
    z+=f'<defs><clipPath id="{ident}"><rect x="16" y="16" width="440" height="956" rx="54"/></clipPath></defs>'
    z+=f'<g clip-path="url(#{ident})"><g transform="translate(16 16)">{content}</g></g>'
    statusfill='white' if screen=='5-658' else 'black'
    z+=t('9:41',48,53,13,statusfill,'medium')
    z+=rect(166,29,139,33,'black',17)
    z+=rect(384,41,23,11,'none',3,statusfill,1)+rect(386,43,18,7,statusfill,1)+rect(409,45,2,3,statusfill,1)
    for i in range(4):z+=rect(350+i*5,49-i*2,3,4+i*2,statusfill,1)
    z+=rect(169,958,134,4,statusfill,2)
    return z+'</g>'

def header(n,kicker,lines,sub,bg,light=False,size=160):
    fg='white' if light else BLACK
    muted='#ABABA6' if light else '#40423D'
    z=rect(0,0,1320,2868,bg)
    z+=t('DARCi',88,124,54,fg)+t(f'{n:02d} / {kicker}',88,215,26,fg,'mono')
    z+=arrow(1153,77,70,GREEN if light else BLACK,4)
    y=395
    for txt in lines:
        z+=t(txt,80,y,size,fg,'light')
        y+=size*.98
    y+=43
    for txt in sub:
        z+=t(txt,88,y,46,muted)
        y+=60
    copy_manifest.append({'frame':n,'headline':' '.join(lines),'subtitle':' '.join(sub),'font':'Maison Neue Light / Book; ABC Favorit Mono Regular','letter_spacing':0})
    return z

def chip(label,x,y,w,fill=BLACK,color='white'):
    return rect(x,y,w,88,fill,44)+t(label,x+30,y+58,30,color)

def save(n,name,svg):
    content=f'<svg xmlns="{NS}" width="1320" height="2868" viewBox="0 0 1320 2868"><title>{html.escape(name)}</title>{svg}</svg>'
    (OUT/f'{n:02d}-{name.lower().replace(" ","-")}.svg').write_text(content)

# 01 — immediate brand recognition; generous typography; source app at a useful scale.
z=header(1,'PREPARE · SIGN · NOTARIZE',['Make it','official.'],['Important documents. A clear next step.'],GREEN,size=202)
z+=f'<circle cx="1110" cy="1800" r="755" fill="none" stroke="#06DC3D" stroke-width="2"/>'
z+=phone('2-155',191,960,940,-3)
z+=rect(78,2574,1164,194,BLACK,34)
z+=t('Digital preparation. Real human notarization.',116,2654,43,'white')
z+=t('Membership required. Notary fees are separate.',116,2720,30,'#A5A5A5')
save(1,'Make it official',z)

# 02 — black-on-black form, floating product navigation with open space at left.
z=header(2,'01 — PREPARE',['Start with','what matters.'],['Trusts, powers of attorney,','and documents you upload.'],BLACK,True,size=164)
z+=f'<path d="M0 1400L1320 850M0 2150L1320 1600M0 2900L1320 2350" stroke="#232323" stroke-width="2"/>'
z+=phone('5-658',359,925,886,5)
z+=chip('Trusts',62,1170,250,GREEN,BLACK)+chip('Power of attorney',62,1277,440,'#F4F3EE',BLACK)+chip('Upload a PDF',62,1384,340,'#333','white')
save(2,'Start with what matters',z)

# 03 — readable document detail escapes the device to foreground review.
z=header(3,'02 — REVIEW',['Know what','you’re signing.'],['See your documents before','you add your signature.'],PAPER,size=158)
z+=phone('257-777',74,900,928,-4)
z+=rect(504,1750,744,903,'#D5D5CF',30)
z+=rect(480,1726,744,903,'white',30,'#DADAD4',2)
z+=t('A CLOSER LOOK',528,1798,24,'#777','mono')+t('Certificate',528,1892,68,BLACK,'light')+t('of Trust',528,1968,68,BLACK,'light')
z+=t('Prepared for Alex Morgan',528,2034,30,'#777')+line(528,2078,1174,2078,'#DDD',2)
for i,(label,value) in enumerate([('DOCUMENT','Trust package'),('STEP','Review before signing'),('COPY','Demonstration only')]):
    yy=2146+i*140
    z+=t(label,528,yy,21,'#777','mono')+t(value,528,yy+49,37)
z+=check(1158,1817,28)
save(3,'Know what you are signing',z)

# 04 — the signature itself is a brand-scale graphic, not a photo.
z=header(4,'03 — SIGN',['Your signature.','Your choice.'],['Draw, type or use a saved signature.'],BLACK,True,size=152)
z+=signature(-90,820,4.25,GREEN)
z+=phone('8-1049',265,1055,976,4)
z+=rect(68,2359,644,236,GREEN,34)
z+=t('Make your mark.',108,2440,48,BLACK,'light')
z+=t('Keep it for next time.',108,2507,36)
z+=arrow(606,2518,43,BLACK,3)
save(4,'Your signature your choice',z)

# 05 — human presence, without implying remote/video notarization.
z=header(5,'04 — MEET YOUR NOTARY',['A real notary.','In person.'],['Choose a notary and complete','your in-person session.'],PAPER,size=158)
z+=f'<circle cx="1170" cy="1820" r="590" fill="{GREEN}"/>'
z+=phone('264-11',63,945,948,-3)
z+=rect(343,2240,877,373,BLACK,40)
z+=check(411,2315,28)+t('THE HUMAN STEP',467,2325,26,'white','mono')
z+=t('Together,',393,2440,78,'white','light')+t('when it matters.',393,2525,78,'white','light')
save(5,'A real notary in person',z)

# 06 — completed-package view with visual document organization.
z=header(6,'05 — KEEP',['Your documents.','All together.'],['Find your completed package','without the paper chase.'],GREEN,size=151)
z+=phone('256-617',432,894,845,5)
for offset,col in [(54,'#94C99F'),(27,'#D5E1D2'),(0,PAPER)]:
    z+=rect(76+offset,1590-offset,702,963,col,28,'#A3B8A2',1)
z+=t('YOUR COMPLETED PACKAGE',124,1680,23,'#5E675C','mono')
z+=t('One place.',124,1787,89,BLACK,'light')+t('Every page.',124,1880,89,BLACK,'light')
for i,label in enumerate(['Certificate of Trust','Trust Registration','Power of Attorney']):
    yy=1990+i*141
    z+=line(124,yy,727,yy,'#C8CEC5',2)+check(147,yy+67,23)+t(label,189,yy+79,34)
z+=t('Ready when you need them.',88,2758,42)
save(6,'Your documents all together',z)

# 07 — public verification is a browser experience, explicitly represented as such.
z=header(7,'06 — SHARE',['Proof you','can share.'],['A public verification link','for your completed document.'],BLACK,True,size=177)
z+=f'<circle cx="160" cy="2130" r="675" fill="none" stroke="#333" stroke-width="2"/>'
z+=phone('256-617',-110,1260,828,-7)
z+=rect(389,960,841,1414,'#242424',40)
z+=rect(371,942,841,1414,PAPER,40)
z+=rect(397,968,789,79,'#E5E4DF',25)
z+=t('illuminotary.com',588,1022,29,'#555','mono')
z+=t('DARCi',426,1145,51)+arrow(1082,1097,61,BLACK,4)
z+=check(478,1283,52)
z+=t('Document',426,1431,78,BLACK,'light')+t('verification',426,1520,78,BLACK,'light')
z+=t('A link to the record.',426,1601,38,'#676761')
z+=line(426,1656,1155,1656,'#D6D6CF',2)
for i,(a,b) in enumerate([('DOCUMENT','Trust package'),('STATUS','Completed'),('VERIFICATION','SHA-256 file integrity')]):
    yy=1722+i*153
    z+=t(a,426,yy,22,'#777','mono')+t(b,426,yy+55,40)
z+=rect(426,2170,729,113,GREEN,13)+t('View document',469,2245,42)+arrow(1084,2207,38,BLACK,3)
z+=rect(0,2520,1320,348,BLACK)
z+=t('Share the link. View without signing in.',88,2605,42,'white')
z+=t('Anyone with the link can view its document.',88,2673,31,'#A5A5A5')
save(7,'Proof you can share',z)

(OUT/'copy-manifest.json').write_text(json.dumps({'status':'Figma-source concept drafts; validate against shipping build before submission','dimensions':[1320,2868],'font_outline_approval':True,'screens':copy_manifest},indent=2))
(OUT/'index.html').write_text('<!doctype html><html><head><meta charset="utf-8"><title>DARCi screenshot drafts</title><style>body{margin:0;padding:36px;background:#222;font:16px system-ui;color:white}h1{font-weight:400}main{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}img{width:100%;display:block}figure{margin:0}figcaption{padding:12px 0;color:#aaa;font-size:12px}</style></head><body><h1>DARCi / App Store — vector screenshot drafts</h1><p>Exact-font outlines · 1320 × 2868 · fictional demonstration data</p><main>'+''.join(f'<figure><img src="{p.name}"><figcaption>{p.stem}</figcaption></figure>' for p in sorted(OUT.glob('*.svg')) )+'</main></body></html>')
print(json.dumps({'files':[{'file':str(p),'bytes':p.stat().st_size} for p in sorted(OUT.glob('*.svg'))]}))

guide=rect(0,0,5640,500,'#191919',24)
guide+=t('DARCi / APP STORE',58,92,37,'#0AFF4A','mono')
guide+=t('Seven screenshot drafts. One complete story.',58,189,79,'white','light')
guide+=t('1320 × 2868 px  •  Native vectors  •  Exact Maison Neue + ABC Favorit Mono outlines  •  No added tracking',58,268,35,'#BBB')
guide+=t('DRAFT ARTWORK — based on the existing Figma screens, with fictional names, signatures and document previews.',58,353,33,'#BBB')
guide+=t('Before submission: reconcile UI with the shipping build. Verification browser panel is a concept. Lettering is outlined; source copy is saved locally.',58,413,33,'#BBB')
(ROOT/'campaign-guide.svg').write_text(f'<svg xmlns="{NS}" width="5640" height="500" viewBox="0 0 5640 500">{guide}</svg>')
