"""The approved moodboard direction, with existing landing-page photography."""
from pathlib import Path
import json, base64, html

# Reuse the exact-font outlining helpers, without executing the rejected compositions.
source = Path(__file__).with_name('build_figma_artwork.py')
exec(source.read_text().split('# 01 —')[0])
OUT = ROOT / 'moodboard-revision'
OUT.mkdir(exist_ok=True)

def group(name,body):
    return f'<g id="{html.escape(name,quote=True)}">{body}</g>'

def action(label,y,w=352):
    return group('Action / '+label,rect(24,y,w,58,GREEN)+t(label,42,y+37,19)+arrow(342,y+20,19,BLACK,1.6))

def back(label='',dark=False):
    c='white' if dark else BLACK
    return f'<path d="M42 101H24m0 0 8-8m-8 8 8 8" stroke="{c}" fill="none" stroke-width="1.6"/>'+(t(label,55,107,14,c) if label else '')

def tabs(labels,y):
    z='';x=24
    for i,l in enumerate(labels):
        w=outline(l,0,0,14)[1]+24
        z+=rect(x,y,w,34,BLACK if i==0 else '#EEE')+t(l,x+12,y+22,14,'white' if i==0 else BLACK)
        x+=w+9
    return group('Document or signature tabs',z)

def document(y,h=308,title='Certificate of Trust'):
    z=rect(39,y,322,h,'white',0,'#D1D1D1',.7)
    z+=t(title,61,y+40,20)+t('Alex Morgan · Demo package',61,y+64,12,'#666')
    for ii,sub in enumerate(['Trust information','Trustee authority']):
        yy=y+102+ii*100
        z+=t(sub,61,yy,14)
        for k in range(5):z+=rect(61,yy+16+k*10,265 if k%3!=2 else 218,3,'#DDD')
    return group('Demo document preview',z)

def pdf(y,h=376):
    return group('PDF viewer',rect(24,y,352,h,'#E2E2E2',18)+t('1 / 2',40,y+31,13,'#666')+t('+   −   ↓',263,y+31,19)+document(y+47,h-65))

def bars(x,y,w,n=8):
    return ''.join(rect(x+i*(w/n+1),y,w/n-4,4,GREEN,1) for i in range(n))

def demo_signature(x,y,w):
    return f'<g id="Moodboard demo signature" transform="translate({x} {y}) scale({w/220})"><path d="M14 61 48 10 40 66M19 44 69 43M57 52q19-24 25-6t17-8q-3 24 13 9l17-16-4 27 24-39-8 38 14-14q9 22 32-4m-91 28 99-5" stroke="black" fill="none" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></g>'

def screen(kind):
    dark=kind=='form'; bg=BLACK if dark else '#E6E6E6' if kind=='notary' else 'white'
    z=rect(0,0,400,780,bg)
    if kind=='home':
        z+=f'<circle cx="48" cy="112" r="24" fill="{GREEN}"/>'+t('AM',30,120,20)
        z+='<g id="Search" fill="none" stroke="black" stroke-width="1.7"><circle cx="111" cy="109" r="8"/><path d="m117 115 6 6"/></g>'+rect(294,98,80,27,'none',14,'#DDD')+t('Member',308,116,12,BLACK,'mono')
        z+=t('Welcome to DARCi.',24,183,28)
        z+=rect(24,211,352,106,GREEN)+t('DARCi MEMBERSHIP',43,245,12,BLACK,'mono')+t('Make it official.',43,286,25)+arrow(335,259,22,BLACK,1.8)
        for x,label in [(24,'Power of'),(207,'Trust')]:
            z+=rect(x,337,169,171,'#E1E1E1')+t(label,x+17,374,21)+t('Attorney' if x==24 else 'Registration',x+17,400,21)+arrow(x+17,463,18,BLACK,1.5)
        z+=rect(24,523,352,111,'#E1E1E1')+t('Document Notarization',42,563,22)+arrow(43,594,18,BLACK,1.5)
        z+=line(24,668,376,668,'#DDD')+f'<g id="Home" fill="none" stroke="{GREEN}" stroke-width="1.8"><path d="m48 697 11-9 11 9v18H48Zm8 18v-12h6v12"/></g><g id="Documents and inbox" fill="none" stroke="black" stroke-width="1.8"><path d="M188 688h14l7 7v20h-21Zm14 0v7h7"/><rect x="325" y="692" width="26" height="20" rx="2"/><path d="m325 694 13 9 13-9"/></g>'
    elif kind=='form':
        z+=back(dark=True)+t('Principal’s',24,162,28,'white')+t('information',24,194,28,'white')
        z+=rect(24,222,224,4,GREEN)+rect(255,222,121,4,'#444')
        for y,label,value in [(270,'Principal full legal name','Alex Morgan'),(372,'Principal address','Enter your address'),(474,'Principal’s email','alex@example.com'),(576,'Special instructions','Add your instructions')]:
            z+=t(label,24,y,15,'white')+rect(24,y+15,352,62 if y!=576 else 90,'#202020')+t(value,43,y+53,19,'#DDD')
        z+=action('Continue',706)
    elif kind=='review':
        z+=back('Trust package')+t('Review documents',24,162,28)+t('Review each PDF before signing.',24,193,15,'#666')
        z+=tabs(['Certificate','Trust','POA'],219)+pdf(275,370)+action('Continue to sign',670)
    elif kind=='sign':
        z+=back('Sign documents')+t('Your signature.',24,162,28)+t('Choose how you want to sign.',24,193,15,'#666')
        z+=tabs(['Draw','Type','Saved'],219)+rect(24,277,352,149,'white',0,'#BBB')+demo_signature(42,306,313)+t('Clear',24,452,14,'#666')+action('Save signature',475)
        z+=rect(24,557,352,192,'#E2E2E2',16)+t('Power of Attorney',41,590,17)+rect(40,609,320,124,'white')+t('Signature',60,638,19)+demo_signature(70,650,235)
    elif kind=='notary':
        z+=back('Review documents')+t('Choose a notary',24,162,28)+t('In your document’s jurisdiction.',24,193,15,'#666')
        for i,name in enumerate(['Jordan Lee','Casey Rivera']):
            y=224+i*103
            z+=rect(24,y,352,87,'white',22)+t(name,43,y+34,20)+t('California · Demo notary',43,y+60,13,'#777')
            if i==0:z+=check(342,y+42,12)
            else:z+=f'<circle cx="342" cy="{y+42}" r="11" stroke="#AAA" fill="none"/>'
        z+=action('Send to selected notary',448)
        z+=rect(24,534,352,191,BLACK,18)+t('IN-PERSON SESSION',43,566,12,'#AAA','mono')+t('Meet in person.',43,613,27,'white')+t('Coordinate with your notary',43,655,16,'white')+t('for the next step.',43,680,16,'white')
    elif kind=='complete':
        z+=back('In-person session')+t('All together.',24,161,28)+t('All complete.',24,194,28)
        z+=rect(24,221,352,126,BLACK,17)+t('TRUST PACKAGE',43,255,16,'white')+check(343,249,12)+bars(43,277,307)+t('Completed',43,320,18,'white')
        for i,label in enumerate(['Certificate of Trust','Trust Registration','Power of Attorney']):
            y=380+i*71
            z+=t(label,24,y+12,19)+t('↓',352,y+12,20)+line(24,y+40,376,y+40,'#DDD')
        z+=rect(24,583,352,275,'#E2E2E2',16)+t('Your completed documents',42,618,16)+document(643)
    else:
        z+=back('Document verification')+check(200,162,30)+t('Verified document',80,230,28)+t('Certificate of Trust',142,259,13,'#666')
        z+=rect(24,286,352,147,BLACK,17)+t('VERIFICATION METHOD',43,321,12,'#BBB','mono')+t('SHA-256',43,365,28,'white')+t('Document integrity verified',43,401,17,'white')
        for y,label,value in [(469,'Status','Completed'),(534,'Document','Trust')]:
            z+=t(label,24,y,18)+t(value,270,y,18)+line(24,y+24,376,y+24,'#DDD')
        z+=action('Share verification',581)+rect(24,662,352,265,'#E2E2E2',16)+t('Document preview',42,697,16)+document(719)
    return group('Moodboard UI / '+kind,z)

def device(kind,x,y,w):
    sc=w/440
    z=rect(0,0,440,814,'#242424',58)+rect(7,7,426,800,BLACK if kind=='form' else 'white',52)
    z+=f'<defs><clipPath id="screen-{kind}"><rect x="20" y="20" width="400" height="774" rx="42"/></clipPath></defs>'
    z+=f'<g clip-path="url(#screen-{kind})"><g transform="translate(20 20)">{screen(kind)}</g></g>'
    fg='white' if kind=='form' else BLACK
    z+=t('9:41',43,49,13,fg)+rect(150,26,140,24,BLACK,13)+rect(367,37,27,12,'none',3,fg)+rect(370,40,20,6,fg,1)
    z+=rect(155,790,130,4,fg,2)
    return f'<g id="Upright phone / {kind}" transform="translate({x} {y}) scale({sc})">{z}</g>'

spec=[
 ('home',GREEN,['Make it','official.'],['Prepare, sign and notarize.','With a real notary, in person.'],'advantages/a1.webp'),
 ('form',BLACK,['Start with','what matters.'],['Trusts, powers of attorney','and uploaded documents.'],None),
 ('review','#E3E3DE',['Know what','you’re signing.'],['Review the documents.','Then take the next step.'],'advantages/a2.webp'),
 ('sign','white',['Your signature.','Your choice.'],['Draw it. Type it.','Use a saved signature.'],None),
 ('notary',BLACK,['A real notary.','In person.'],['Choose a notary.','Complete the human step.'],'cta/cta3.webp'),
 ('complete',GREEN,['Your documents.','All together.'],['Keep the completed package','close at hand.'],None),
 ('verify','white',['Proof you','can share.'],['A verification link.','A clearer way to check.'],'cta/cta2.webp'),
]
manifest=[]
for i,(kind,bg,heads,subs,photo) in enumerate(spec,1):
    fg='white' if bg==BLACK else BLACK
    z=rect(0,0,1320,2868,bg)
    z+=t('DARCi',106,153,42,fg,'mono')+t(f'{i:02d} / 07',1025,153,35,fg,'mono')
    z+=t(heads[0],106,403,155,fg,'light')+t(heads[1],106,555,155,fg,'light')
    z+=t(subs[0],106,672,55,fg)+t(subs[1],106,742,55,fg)
    slot=None
    if photo:
        # Discrete content photography, not a flattened UI screenshot.
        slot={'x':0,'y':820,'width':1320,'height':705,'asset':photo}
        z+=f'<rect id="Landing-page photo" x="0" y="820" width="1320" height="705" fill="#555"/>'
        z+=device(kind,170,1310,980)
    else:
        z+=device(kind,106,926,1108)
    if i==1:
        z+=rect(80,2587,1160,198,GREEN)+t('DARCi MEMBERSHIP',116,2634,25,BLACK,'mono')+t('Membership required. Notary fees separate.',116,2705,44)
    if i==7:
        z+=rect(0,2760,1320,108,'white')+t('Anyone with the link can view the document.',106,2815,31,BLACK)
    svg=f'<svg xmlns="{NS}" width="1320" height="2868" viewBox="0 0 1320 2868">{z}</svg>'
    path=OUT/f'{i:02d}-{kind}.svg';path.write_text(svg)
    preview=svg
    if photo:
        data=base64.b64encode((ROOT.parents[2]/'apps/web/public/images'/photo).read_bytes()).decode()
        preview=preview.replace('<rect id="Landing-page photo" x="0" y="820" width="1320" height="705" fill="#555"/>',f'<image x="0" y="820" width="1320" height="705" href="data:image/webp;base64,{data}" preserveAspectRatio="xMidYMid slice"/>')
    (OUT/f'{i:02d}-{kind}-preview.svg').write_text(preview)
    manifest.append({'number':i,'kind':kind,'file':str(path),'headline':' '.join(heads),'photo':slot,'phone_rotation':0})
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
guide=rect(0,0,5640,360,'#191919')+t('DARCi / MOODBOARD DIRECTION',55,78,35,GREEN,'mono')+t('The original seven frames. Now with landing-page photography.',55,169,71,'white','light')+t('Straight-on devices · Original moodboard copy and illustrative UI · Exact-font outlines · 1320 × 2868',55,248,32,'#BBB')+t('Design drafts: compare illustrative screens with the release build before App Store submission. Photos are existing landing-page assets.',55,309,31,'#BBB')
(OUT/'guide.svg').write_text(f'<svg xmlns="{NS}" width="5640" height="360" viewBox="0 0 5640 360">{guide}</svg>')
(OUT/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>DARCi — moodboard revision</title><style>body{margin:0;padding:24px;background:#222;color:#fff;font:16px Arial}main{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}img{width:100%}h1{font-size:22px;font-weight:400}</style><h1>DARCi — original moodboard direction + landing-page photography</h1><main>'+''.join(f'<img alt="{m["headline"]}" src="{m["number"]:02d}-{m["kind"]}-preview.svg">' for m in manifest)+'</main>')
print(json.dumps(manifest))
